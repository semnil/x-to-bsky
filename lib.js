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

// ─── Exports ────────────────────────────────────────────

export {
  MAX_GRAPHEMES,
  FACET_LINK,
  FACET_MENTION,
  FACET_TAG,
  segmentGraphemes,
  countGraphemes,
  splitText,
  buildByteOffsetMap,
  parseFacets,
};
