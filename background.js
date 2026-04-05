// background.js — Bluesky AT Protocol API handler

const BSKY_SERVICE = "https://bsky.social";
const MAX_GRAPHEMES = 300;
const MAX_IMAGES = 4;
const MAX_HISTORY = 100;

// Session cache (lives as long as the service worker)
let session = null;

// ─── Utilities ───────────────────────────────────────────

/**
 * Segment text into graphemes via Intl.Segmenter.
 * Returns array of grapheme strings.
 */
function segmentGraphemes(text) {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/**
 * Count graphemes (accurate for emoji, CJK, combining chars).
 */
function countGraphemes(text) {
  return segmentGraphemes(text).length;
}

/**
 * Split text into chunks fitting within MAX_GRAPHEMES.
 * Prefers splitting at newlines, then spaces, falling back to hard cut.
 */
function splitText(text) {
  const graphemes = segmentGraphemes(text);
  if (graphemes.length <= MAX_GRAPHEMES) return [text];

  const chunks = [];
  let start = 0;

  while (start < graphemes.length) {
    // Skip leading whitespace
    while (start < graphemes.length && /^\s$/.test(graphemes[start])) start++;
    if (start >= graphemes.length) break;

    const remaining = graphemes.length - start;
    if (remaining <= MAX_GRAPHEMES) {
      chunks.push(graphemes.slice(start).join(""));
      break;
    }

    let end = start + MAX_GRAPHEMES;

    // Search backward for a good break point (newline preferred, then space)
    let breakIdx = -1;
    const minBreak = start + Math.floor(MAX_GRAPHEMES * 0.7);
    for (let i = end - 1; i >= minBreak; i--) {
      if (graphemes[i] === "\n") { breakIdx = i; break; }
      if (graphemes[i] === " " && breakIdx < 0) breakIdx = i;
    }
    if (breakIdx > start) end = breakIdx + 1;

    chunks.push(graphemes.slice(start, end).join("").trim());
    start = end;
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Build a character-index-to-UTF8-byte-offset map for facet byte offsets.
 * Avoids O(n*m) re-encoding per regex match.
 */
function buildByteOffsetMap(text) {
  const map = new Array(text.length + 1);
  let byteIdx = 0;
  let charIdx = 0;
  while (charIdx < text.length) {
    map[charIdx] = byteIdx;
    const cp = text.codePointAt(charIdx);
    if (cp > 0xFFFF) {
      map[charIdx + 1] = byteIdx; // fill gap for second surrogate unit
      charIdx += 2;
      byteIdx += 4;
    } else if (cp > 0x7FF) {
      charIdx += 1;
      byteIdx += 3;
    } else if (cp > 0x7F) {
      charIdx += 1;
      byteIdx += 2;
    } else {
      charIdx += 1;
      byteIdx += 1;
    }
  }
  map[text.length] = byteIdx;
  return map;
}

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

// ─── Facet Parsing (no lookbehind) ───────────────────────

const FACET_LINK = "app.bsky.richtext.facet#link";
const FACET_MENTION = "app.bsky.richtext.facet#mention";
const FACET_TAG = "app.bsky.richtext.facet#tag";

/**
 * Parse rich text facets (links, mentions, hashtags).
 * Uses boundary-aware matching without lookbehind assertions.
 * Byte offsets computed via a pre-built map (O(n) total).
 */
function parseFacets(text) {
  const facets = [];
  const byteMap = buildByteOffsetMap(text);

  // URL detection — strip trailing punctuation that is not part of the URL
  const urlRegex = /https?:\/\/[^\s\])<>]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    let url = match[0].replace(/[.,;:!?]+$/, "");
    const urlStart = match.index;
    facets.push({
      index: { byteStart: byteMap[urlStart], byteEnd: byteMap[urlStart + url.length] },
      features: [{ $type: FACET_LINK, uri: url }],
    });
  }

  // Mention detection: (start-of-string | whitespace) followed by @handle
  // The did field temporarily holds the handle; resolveMentionFacets replaces it with the actual DID
  const mentionRegex = /(^|\s)(@([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*))/gm;
  while ((match = mentionRegex.exec(text)) !== null) {
    const mentionStart = match.index + match[1].length;
    const mention = match[2]; // @handle
    facets.push({
      index: { byteStart: byteMap[mentionStart], byteEnd: byteMap[mentionStart + mention.length] },
      features: [{ $type: FACET_MENTION, did: match[3] }],
    });
  }

  // Hashtag detection: (start-of-string | whitespace) followed by #tag
  const hashtagRegex = /(^|\s)(#([^\s#\u3000]+))/gm;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const tagStart = match.index + match[1].length;
    const fullTag = match[2]; // #tag
    facets.push({
      index: { byteStart: byteMap[tagStart], byteEnd: byteMap[tagStart + fullTag.length] },
      features: [{ $type: FACET_TAG, tag: match[3] }],
    });
  }

  return facets;
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

// ─── Image Upload ────────────────────────────────────────

/**
 * Upload an image to Bluesky via uploadBlob.
 * @param {string} base64Data - data-URL or raw base64 string
 * @param {string} mimeType - e.g. "image/jpeg"
 * @param {string} accessJwt - session token (caller provides to avoid redundant createSession)
 */
async function uploadImage(base64Data, mimeType, accessJwt) {
  const raw = base64Data.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const res = await fetch(
    `${BSKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`,
    {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        Authorization: `Bearer ${accessJwt}`,
      },
      body: bytes,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Image upload failed: ${err.message || res.status}`);
  }

  return await res.json();
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

  let facets = parseFacets(text);
  if (facets.length > 0) {
    facets = await resolveMentionFacets(facets);
  }

  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };

  if (facets.length > 0) record.facets = facets;

  // Upload images in parallel
  if (images.length > 0) {
    const uploadResults = await Promise.all(
      images.slice(0, MAX_IMAGES).map((img) =>
        uploadImage(img.base64, img.mimeType, sess.accessJwt)
      )
    );
    record.embed = {
      $type: "app.bsky.embed.images",
      images: uploadResults.map((result, i) => ({
        alt: images[i].alt || "",
        image: result.blob,
      })),
    };
  }

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

// ─── Post History ────────────────────────────────────────

/**
 * Append an entry to the post history log in chrome.storage.local.
 */
async function addToHistory(entry) {
  const { postHistory = [] } = await chrome.storage.local.get("postHistory");
  postHistory.unshift({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (postHistory.length > MAX_HISTORY) postHistory.length = MAX_HISTORY;
  await chrome.storage.local.set({ postHistory });
}

// ─── Message Handler ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "POST_TO_BSKY") {
    // Support both legacy { text } and new { thread } format
    const thread = msg.thread || [{ text: msg.text, images: [] }];

    postThread(thread)
      .then((results) => {
        const summary = thread.map((p) => p.text).join("\n---\n").slice(0, 200);
        addToHistory({
          text: summary,
          success: true,
          postCount: results.length,
          imageCount: thread.reduce((n, p) => n + (p.images?.length || 0), 0),
          uri: results[0]?.uri,
        }).catch(() => {}); // V02: history write is non-critical
        sendResponse({ ok: true, uri: results[0]?.uri, postCount: results.length });
      })
      .catch((err) => {
        const summary = thread.map((p) => p.text).join("\n---\n").slice(0, 200);
        addToHistory({
          text: summary,
          success: false,
          error: err.message,
        }).catch(() => {}); // V02: history write is non-critical
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

  if (msg.type === "GET_HISTORY") {
    chrome.storage.local.get("postHistory", (data) => {
      sendResponse({ history: data.postHistory || [] });
    });
    return true;
  }

  if (msg.type === "CLEAR_HISTORY") {
    chrome.storage.local.set({ postHistory: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
