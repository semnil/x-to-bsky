// lib.js — Pure utility functions for Bluesky AT Protocol text processing
// Used by background.js (service worker) and unit tests.

const MAX_GRAPHEMES = 300;

const FACET_LINK = "app.bsky.richtext.facet#link";
const FACET_MENTION = "app.bsky.richtext.facet#mention";
const FACET_TAG = "app.bsky.richtext.facet#tag";

// ─── Grapheme Utilities ─────────────────────────────────

const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Segment text into graphemes via Intl.Segmenter.
 * Returns array of grapheme strings.
 */
function segmentGraphemes(text) {
  return [...graphemeSegmenter.segment(text)].map((s) => s.segment);
}

/**
 * Count graphemes (accurate for emoji, CJK, combining chars).
 */
function countGraphemes(text) {
  return segmentGraphemes(text).length;
}

/**
 * Map character (UTF-16 code unit) indices to grapheme indices for URL range detection.
 */
function buildCharToGraphemeMap(text, graphemes) {
  const map = [];
  let ci = 0;
  for (let gi = 0; gi < graphemes.length; gi++) {
    for (let j = 0; j < graphemes[gi].length; j++) {
      map[ci++] = gi;
    }
  }
  map[ci] = graphemes.length;
  return map;
}

/**
 * Find URL positions in text as grapheme index ranges.
 */
function findUrlGraphemeRanges(text, graphemes) {
  const charToGrapheme = buildCharToGraphemeMap(text, graphemes);
  const ranges = [];
  URL_RE_GLOBAL.lastIndex = 0;
  let m;
  while ((m = URL_RE_GLOBAL.exec(text)) !== null) {
    const url = cleanUrlMatch(m[0]);
    ranges.push({
      start: charToGrapheme[m.index],
      end: charToGrapheme[m.index + url.length],
    });
  }
  return ranges;
}

/**
 * Split text into chunks fitting within MAX_GRAPHEMES.
 * Prefers splitting at newlines, then spaces, falling back to hard cut.
 * Never breaks inside a URL.
 */
function splitText(text) {
  const graphemes = segmentGraphemes(text);
  if (graphemes.length <= MAX_GRAPHEMES) return [text];

  const urlRanges = findUrlGraphemeRanges(text, graphemes);

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

    if (breakIdx > start) {
      end = breakIdx + 1;
    } else {
      const urlRange = urlRanges.find(r => end > r.start && end < r.end);
      if (urlRange && urlRange.start > start) {
        end = urlRange.start;
      }
    }

    chunks.push(graphemes.slice(start, end).join("").trim());
    start = end;
  }

  return chunks.filter((c) => c.length > 0);
}

// ─── Byte Offset Map ────────────────────────────────────

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

// ─── URL Patterns ──────────────────────────────────────

const URL_RE = /https?:\/\/[^\s\])<>]+/;
const URL_RE_GLOBAL = new RegExp(URL_RE.source, "g");
const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

function cleanUrlMatch(raw) {
  return raw.replace(TRAILING_PUNCT_RE, "");
}

// ─── Facet Parsing (no lookbehind) ──────────────────────

/**
 * Parse rich text facets (links, mentions, hashtags).
 * Uses boundary-aware matching without lookbehind assertions.
 * Byte offsets computed via a pre-built map (O(n) total).
 */
function parseFacets(text) {
  const facets = [];
  const byteMap = buildByteOffsetMap(text);

  // URL detection — strip trailing punctuation that is not part of the URL
  URL_RE_GLOBAL.lastIndex = 0;
  let match;
  while ((match = URL_RE_GLOBAL.exec(text)) !== null) {
    let url = cleanUrlMatch(match[0]);
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

// ─── URL Shortening ──────────────────────────────────

const URL_DISPLAY_LIMIT = 28;

/**
 * Shorten a URL for display: strip protocol, truncate with "..." if needed.
 */
function shortenUrlDisplay(url) {
  const display = url.replace(/^https?:\/\//, "");
  const graphemes = segmentGraphemes(display);
  if (graphemes.length <= URL_DISPLAY_LIMIT) return display;
  return graphemes.slice(0, URL_DISPLAY_LIMIT).join("") + "...";
}

/**
 * Shorten URLs in text when total graphemes exceed MAX_GRAPHEMES.
 * Returns { text, urlEntries } where urlEntries tracks original URLs
 * and their display positions for facet creation.
 */
function shortenUrlsInText(text) {
  if (countGraphemes(text) <= MAX_GRAPHEMES) return { text, urlEntries: [] };

  const urlEntries = [];
  let result = "";
  let lastIndex = 0;

  URL_RE_GLOBAL.lastIndex = 0;
  let m;
  while ((m = URL_RE_GLOBAL.exec(text)) !== null) {
    const url = cleanUrlMatch(m[0]);
    const trailing = m[0].slice(url.length);
    const display = shortenUrlDisplay(url);

    result += text.slice(lastIndex, m.index);
    const charStart = result.length;
    result += display;
    const charEnd = result.length;
    result += trailing;

    urlEntries.push({ charStart, charEnd, original: url, display });
    lastIndex = m.index + m[0].length;
  }
  result += text.slice(lastIndex);

  return { text: result, urlEntries };
}

/**
 * Build link facets for shortened URLs using tracked character positions.
 * The facet URI stores the original (full) URL.
 */
function buildShortenedUrlFacets(text, urlEntries) {
  if (urlEntries.length === 0) return [];
  const byteMap = buildByteOffsetMap(text);
  return urlEntries.map(({ charStart, charEnd, original }) => ({
    index: { byteStart: byteMap[charStart], byteEnd: byteMap[charEnd] },
    features: [{ $type: FACET_LINK, uri: original }],
  }));
}

// ─── URL Detection ─────────────────────────────────────

/**
 * Extract the first URL from text.
 * Returns the URL string or null.
 */
function extractFirstUrl(text) {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  return cleanUrlMatch(m[0]);
}

// ─── Fetch Destinations ─────────────────────────────────

// [network address, prefix length] of the IPv4 ranges on the user's own machine or local network:
// unspecified, private, shared (CGNAT), loopback, link-local.
const LOCAL_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

/**
 * Convert a dotted-quad IPv4 address to its 32-bit value.
 */
function ipv4ToNumber(ip) {
  return ip.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);
}

/**
 * Whether a dotted-quad IPv4 address is in one of LOCAL_IPV4_RANGES.
 */
function isLocalIpv4(ip) {
  const n = ipv4ToNumber(ip);
  return LOCAL_IPV4_RANGES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(n / size) === Math.floor(ipv4ToNumber(base) / size);
  });
}

/**
 * Whether an IPv6 address, in the form the URL parser serializes it (hex groups, "::" compression),
 * is loopback, unspecified, link-local, site-local, unique-local, or an IPv4-mapped / IPv4-compatible
 * form of a local IPv4 address.
 */
function isLocalIpv6(ip) {
  const [head, tail] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail === undefined ? [] : (tail ? tail.split(":") : []);
  const groups = [...front, ...Array(8 - front.length - back.length).fill("0"), ...back].map((g) => parseInt(g, 16));
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((groups[0] & 0xffc0) === 0xfec0) return true; // fec0::/10
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0 || groups[5] === 0xffff)) {
    const embeddedIpv4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
    return isLocalIpv4(embeddedIpv4); // ::/96 (incl. :: and ::1) and ::ffff:0:0/96
  }
  return false;
}

/**
 * Whether a URL is an http(s) URL whose host, as written in the URL, is outside the user's own machine
 * and local network. Rejects other schemes, unparsable URLs, localhost and *.localhost, *.local,
 * single-label host names, and IP literals in the ranges of isLocalIpv4 / isLocalIpv6.
 */
function isPublicHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) return !isLocalIpv6(host.slice(1, -1));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !isLocalIpv4(host);
  if (!host.includes(".")) return false;
  return !host.endsWith(".localhost") && !host.endsWith(".local");
}

// Hosts of the Chrome Web Store. Chrome blocks extension requests to https URLs on these hosts and their
// subdomains, whatever host permissions the extension holds.
const WEB_STORE_HOSTS = ["chrome.google.com", "chromewebstore.google.com"];

/**
 * Whether a URL is an https URL on one of WEB_STORE_HOSTS or a subdomain of one.
 */
function isWebStoreUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return WEB_STORE_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
}

// ─── Image Utilities ────────────────────────────────────

/**
 * Calculate the source rectangle for drawImage when object-fit: cover is applied.
 * Pure function — does not access the DOM.
 * @param {number} nw - naturalWidth
 * @param {number} nh - naturalHeight
 * @param {number} dw - clientWidth (display width)
 * @param {number} dh - clientHeight (display height)
 * @param {string} objectPosition - CSS objectPosition value (e.g. "50% 50%")
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
function calcCoverRect(nw, nh, dw, dh, objectPosition = "50% 50%") {
  const scale = Math.max(dw / nw, dh / nh);
  const sw = Math.max(1, Math.round(dw / scale));
  const sh = Math.max(1, Math.round(dh / scale));

  const parts = objectPosition.split(/\s+/);
  let px = parseFloat(parts[0]) / 100;
  let py = parseFloat(parts[1] || parts[0]) / 100;
  if (isNaN(px)) px = 0.5;
  if (isNaN(py)) py = 0.5;

  const sx = Math.max(0, Math.round((nw - sw) * px));
  const sy = Math.max(0, Math.round((nh - sh) * py));
  return { sx, sy, sw, sh };
}

// ─── Exports ────────────────────────────────────────────

export {
  MAX_GRAPHEMES,
  FACET_LINK,
  FACET_MENTION,
  FACET_TAG,
  segmentGraphemes,
  countGraphemes,
  splitText,
  shortenUrlsInText,
  buildShortenedUrlFacets,
  buildByteOffsetMap,
  parseFacets,
  extractFirstUrl,
  calcCoverRect,
  isPublicHttpUrl,
  isWebStoreUrl,
};
