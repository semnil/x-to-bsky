// background.js — Bluesky AT Protocol API handler

import {
  splitText,
  parseFacets,
  FACET_MENTION,
  extractYouTubeUrl,
} from "./lib.js";

const BSKY_SERVICE = "https://bsky.social";
const MAX_IMAGES = 4;

// Session cache (lives as long as the service worker)
let session = null;

// ─── Authentication ──────────────────────────────────────

// Deduplicate concurrent createSession calls (V05)
let sessionPromise = null;

/**
 * Authenticate with Bluesky. Reuses cached session via refreshSession.
 * On failure, clears cache and performs fresh login with clear error messages.
 * Concurrent calls share the same in-flight promise.
 */
function createSession() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = _createSession().finally(() => { sessionPromise = null; });
  return sessionPromise;
}

async function _createSession() {
  const { bskyHandle, bskyAppPassword } = await chrome.storage.local.get([
    "bskyHandle",
    "bskyAppPassword",
  ]);

  if (!bskyHandle || !bskyAppPassword) {
    throw new Error("Bluesky credentials not configured. Open extension settings.");
  }

  // Try to refresh existing session
  if (session) {
    try {
      const res = await fetch(
        `${BSKY_SERVICE}/xrpc/com.atproto.server.refreshSession`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.refreshJwt}` },
        }
      );
      if (res.ok) {
        session = await res.json();
        return session;
      }
      // Refresh failed — token expired or revoked
      session = null;
    } catch {
      session = null;
    }
  }

  // Fresh login
  const res = await fetch(
    `${BSKY_SERVICE}/xrpc/com.atproto.server.createSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: bskyHandle,
        password: bskyAppPassword,
      }),
    }
  );

  if (!res.ok) {
    session = null;
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 || err.error === "AuthenticationRequired") {
      throw new Error(
        "Authentication failed: invalid handle or App Password. " +
        "Check your credentials in extension settings, or generate a new App Password."
      );
    }
    throw new Error(`Login failed: ${err.message || err.error || res.status}`);
  }

  session = await res.json();
  return session;
}

/**
 * Resolve a mention handle to a DID.
 */
async function resolveHandle(handle) {
  try {
    const res = await fetch(
      `${BSKY_SERVICE}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.did;
  } catch {
    return null;
  }
}

/**
 * Resolve all mention facets in parallel: replace handle placeholder with actual DID.
 * Drops unresolvable mentions silently.
 */
async function resolveMentionFacets(facets) {
  const results = await Promise.all(
    facets.map(async (facet) => {
      const mf = facet.features.find((f) => f.$type === FACET_MENTION);
      if (!mf) return facet;
      const did = await resolveHandle(mf.did);
      if (!did) return null; // drop unresolvable
      return { ...facet, features: [{ $type: FACET_MENTION, did }] };
    })
  );
  return results.filter(Boolean);
}

// ─── Blob Upload ────────────────────────────────────────

/**
 * Upload raw bytes to Bluesky via uploadBlob.
 */
async function uploadBlob(bytes, contentType, accessJwt) {
  const res = await fetch(
    `${BSKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`,
    {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${accessJwt}`,
      },
      body: bytes,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Blob upload failed: ${err.message || res.status}`);
  }

  return await res.json();
}

/**
 * Upload a base64-encoded image to Bluesky.
 */
async function uploadImage(base64Data, mimeType, accessJwt) {
  const raw = base64Data.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return uploadBlob(bytes, mimeType, accessJwt);
}

/**
 * Download an image URL and upload it to Bluesky.
 * Returns the blob reference or null on failure.
 */
async function uploadThumbnail(imageUrl, accessJwt) {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const data = await uploadBlob(new Uint8Array(buf), contentType, accessJwt);
    return data.blob;
  } catch {
    return null;
  }
}

// ─── YouTube Link Card ──────────────────────────────────

/**
 * Fetch YouTube oEmbed metadata for a video URL.
 * Returns { title, thumbnail_url } or null on failure.
 */
async function fetchYouTubeOEmbed(videoUrl) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Build an app.bsky.embed.external for a YouTube link.
 * Tries oEmbed for metadata/thumbnail; falls back to a plain link card.
 */
async function buildYouTubeEmbed(videoUrl, accessJwt, includeThumbnail = true) {
  const meta = await fetchYouTubeOEmbed(videoUrl);

  let thumbBlob = null;
  if (includeThumbnail && meta?.thumbnail_url) {
    thumbBlob = await uploadThumbnail(meta.thumbnail_url, accessJwt);
  }

  const embed = {
    $type: "app.bsky.embed.external",
    external: {
      uri: videoUrl,
      title: meta?.title || "",
      description: meta?.author_name ? `by ${meta.author_name}` : "",
    },
  };
  if (thumbBlob) {
    embed.external.thumb = thumbBlob;
  }
  return embed;
}

// ─── Post Creation ───────────────────────────────────────

/**
 * Create a single post on Bluesky.
 * @param {string} text
 * @param {Array} images - [{ base64, mimeType, alt }]
 * @param {object|null} parent - { uri, cid } of parent post (for reply chain)
 * @param {object|null} root - { uri, cid } of root post (for reply chain)
 */
async function createPost(text, images = [], parent = null, root = null) {
  const sess = await createSession();

  // Start independent async work in parallel: facet resolution + embed construction
  const rawFacets = parseFacets(text);
  const facetsPromise = rawFacets.length > 0
    ? resolveMentionFacets(rawFacets)
    : Promise.resolve([]);

  let embedPromise = Promise.resolve(null);
  if (images.length > 0) {
    embedPromise = Promise.all(
      images.slice(0, MAX_IMAGES).map((img) =>
        uploadImage(img.base64, img.mimeType, sess.accessJwt)
      )
    ).then((uploadResults) => ({
      $type: "app.bsky.embed.images",
      images: uploadResults.map((result, i) => ({
        alt: images[i].alt || "",
        image: result.blob,
      })),
    }));
  } else {
    const yt = extractYouTubeUrl(text);
    if (yt) {
      embedPromise = chrome.storage.local.get(["includeYouTubeCard", "youtubeCardThumbnail"]).then(
        ({ includeYouTubeCard, youtubeCardThumbnail }) =>
          includeYouTubeCard !== false
            ? buildYouTubeEmbed(yt.url, sess.accessJwt, youtubeCardThumbnail !== false)
            : null
      ).catch(() => null);
    }
  }

  const [facets, embed] = await Promise.all([facetsPromise, embedPromise]);

  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };

  if (facets.length > 0) record.facets = facets;
  if (embed) record.embed = embed;

  // Reply chain
  if (parent) {
    record.reply = {
      root: { uri: root.uri, cid: root.cid },
      parent: { uri: parent.uri, cid: parent.cid },
    };
  }

  const res = await fetch(
    `${BSKY_SERVICE}/xrpc/com.atproto.repo.createRecord`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.accessJwt}`,
      },
      body: JSON.stringify({
        repo: sess.did,
        collection: "app.bsky.feed.post",
        record,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Post failed: ${err.message || res.status}`);
  }

  return await res.json();
}

/**
 * Post a thread to Bluesky.
 * Auto-splits posts exceeding MAX_GRAPHEMES and chains them as replies.
 * @param {Array} thread - [{ text, images }]
 */
async function postThread(thread) {
  // Expand: split any long posts into multiple chunks
  const expanded = [];
  for (const post of thread) {
    const chunks = splitText(post.text);
    chunks.forEach((chunk, i) => {
      expanded.push({
        text: chunk,
        images: i === 0 ? (post.images || []) : [],
      });
    });
  }

  // Posts must be sequential (each needs parent URI/CID for reply chain)
  const results = [];
  let root = null;
  let parent = null;

  for (const post of expanded) {
    const result = await createPost(post.text, post.images, parent, root);
    results.push(result);
    if (!root) root = result;
    parent = result;
  }

  return results;
}

// ─── Message Handler ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "POST_TO_BSKY") {
    // Support both legacy { text } and new { thread } format
    const thread = msg.thread || [{ text: msg.text, images: [] }];

    postThread(thread)
      .then((results) => {
        sendResponse({ ok: true, uri: results[0]?.uri, postCount: results.length });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (msg.type === "TEST_LOGIN") {
    createSession()
      .then((sess) =>
        sendResponse({ ok: true, handle: sess.handle, did: sess.did })
      )
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_STATUS") {
    chrome.storage.local.get(["bskyHandle", "crosspostEnabled"], (data) => {
      sendResponse({
        configured: !!data.bskyHandle,
        enabled: data.crosspostEnabled !== false,
        handle: data.bskyHandle || "",
      });
    });
    return true;
  }
});
