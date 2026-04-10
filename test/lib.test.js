import { describe, it, expect } from "vitest";
import {
  MAX_GRAPHEMES,
  FACET_LINK,
  FACET_MENTION,
  FACET_TAG,
  segmentGraphemes,
  countGraphemes,
  splitText,
  buildByteOffsetMap,
  parseFacets,
  extractFirstUrl,
  calcCoverRect,
} from "../lib.js";

// Helper: compute UTF-8 byte length of a string
function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

// ─── segmentGraphemes ───────────────────────────────────

describe("segmentGraphemes", () => {
  it("segments ASCII text", () => {
    expect(segmentGraphemes("abc")).toEqual(["a", "b", "c"]);
  });

  it("segments emoji as single graphemes", () => {
    const result = segmentGraphemes("👨‍👩‍👧‍👦");
    expect(result).toHaveLength(1);
  });

  it("segments CJK characters", () => {
    expect(segmentGraphemes("日本語")).toEqual(["日", "本", "語"]);
  });

  it("handles empty string", () => {
    expect(segmentGraphemes("")).toEqual([]);
  });

  it("handles combining characters", () => {
    // é = e + combining acute accent (U+0301)
    const result = segmentGraphemes("e\u0301");
    expect(result).toHaveLength(1);
  });
});

// ─── countGraphemes ─────────────────────────────────────

describe("countGraphemes", () => {
  it("counts ASCII characters", () => {
    expect(countGraphemes("hello")).toBe(5);
  });

  it("counts emoji correctly", () => {
    expect(countGraphemes("🎉🎊")).toBe(2);
  });

  it("counts family emoji as one grapheme", () => {
    expect(countGraphemes("👨‍👩‍👧‍👦")).toBe(1);
  });

  it("counts mixed ASCII and CJK", () => {
    expect(countGraphemes("Hello世界")).toBe(7);
  });

  it("returns 0 for empty string", () => {
    expect(countGraphemes("")).toBe(0);
  });

  it("counts flag emoji as one grapheme", () => {
    expect(countGraphemes("🇯🇵")).toBe(1);
  });
});

// ─── splitText ──────────────────────────────────────────

describe("splitText", () => {
  it("returns single chunk for short text", () => {
    const text = "Hello, world!";
    expect(splitText(text)).toEqual([text]);
  });

  it("returns single chunk for exactly MAX_GRAPHEMES", () => {
    const text = "a".repeat(MAX_GRAPHEMES);
    expect(splitText(text)).toEqual([text]);
  });

  it("splits at 301 graphemes", () => {
    const text = "a".repeat(301);
    const chunks = splitText(text);
    expect(chunks.length).toBe(2);
    expect(countGraphemes(chunks[0])).toBeLessThanOrEqual(MAX_GRAPHEMES);
  });

  it("prefers splitting at newline", () => {
    const line1 = "a".repeat(250);
    const line2 = "b".repeat(100);
    const text = line1 + "\n" + line2;
    const chunks = splitText(text);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it("prefers splitting at space over hard cut", () => {
    const words = "word ".repeat(70).trim(); // ~350 chars
    const chunks = splitText(words);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(countGraphemes(chunk)).toBeLessThanOrEqual(MAX_GRAPHEMES);
    }
  });

  it("handles text with only emoji", () => {
    const text = "🎉".repeat(301);
    const chunks = splitText(text);
    expect(chunks.length).toBe(2);
    for (const chunk of chunks) {
      expect(countGraphemes(chunk)).toBeLessThanOrEqual(MAX_GRAPHEMES);
    }
  });

  it("skips leading whitespace in chunks", () => {
    const text = "a".repeat(299) + "  " + "b".repeat(10);
    const chunks = splitText(text);
    expect(chunks.every((c) => !c.startsWith(" "))).toBe(true);
  });

  it("returns empty array for empty string", () => {
    expect(splitText("")).toEqual([""]);
  });

  it("returns original for whitespace-only string (short text, no split)", () => {
    expect(splitText("   ")).toEqual(["   "]);
  });
});

// ─── buildByteOffsetMap ─────────────────────────────────

describe("buildByteOffsetMap", () => {
  it("maps ASCII correctly (1 byte per char)", () => {
    const map = buildByteOffsetMap("abc");
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(1);
    expect(map[2]).toBe(2);
    expect(map[3]).toBe(3); // end
  });

  it("maps 2-byte characters (Latin extended)", () => {
    // ñ = U+00F1 → 2 bytes in UTF-8
    const map = buildByteOffsetMap("ñ");
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(2); // end
  });

  it("maps 3-byte characters (CJK)", () => {
    // 日 = U+65E5 → 3 bytes in UTF-8
    const map = buildByteOffsetMap("日");
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(3); // end
  });

  it("maps 4-byte characters (emoji via surrogate pair)", () => {
    // 😀 = U+1F600 → 4 bytes in UTF-8, 2 JS char units (surrogate pair)
    const text = "😀";
    expect(text.length).toBe(2); // JS string length
    const map = buildByteOffsetMap(text);
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(0); // second surrogate maps to same byte offset
    expect(map[2]).toBe(4); // end
  });

  it("maps mixed content correctly", () => {
    const text = "a日😀";
    const map = buildByteOffsetMap(text);
    // a: 1 byte (offset 0)
    // 日: 3 bytes (offset 1)
    // 😀: 4 bytes (offset 4), JS chars at index 2 and 3
    expect(map[0]).toBe(0); // 'a'
    expect(map[1]).toBe(1); // '日'
    expect(map[2]).toBe(4); // '😀' first surrogate
    expect(map[3]).toBe(4); // '😀' second surrogate
    expect(map[4]).toBe(8); // end
  });

  it("end offset equals UTF-8 byte length", () => {
    const texts = ["hello", "日本語", "😀🎉", "añ日😀"];
    for (const text of texts) {
      const map = buildByteOffsetMap(text);
      expect(map[text.length]).toBe(utf8ByteLength(text));
    }
  });
});

// ─── parseFacets ────────────────────────────────────────

describe("parseFacets", () => {
  describe("URLs", () => {
    it("detects a simple URL", () => {
      const text = "Check https://example.com for details";
      const facets = parseFacets(text);
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].$type).toBe(FACET_LINK);
      expect(facets[0].features[0].uri).toBe("https://example.com");
    });

    it("detects http URL", () => {
      const facets = parseFacets("Visit http://example.com");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].uri).toBe("http://example.com");
    });

    it("strips trailing punctuation from URL", () => {
      const facets = parseFacets("See https://example.com.");
      expect(facets[0].features[0].uri).toBe("https://example.com");
    });

    it("strips multiple trailing punctuation", () => {
      const facets = parseFacets("Really? https://example.com!!");
      expect(facets[0].features[0].uri).toBe("https://example.com");
    });

    it("preserves URL path and query", () => {
      const url = "https://example.com/path?q=1&r=2#frag";
      const facets = parseFacets(`Link: ${url}`);
      expect(facets[0].features[0].uri).toBe(url);
    });

    it("detects multiple URLs", () => {
      const text = "https://a.com and https://b.com";
      const facets = parseFacets(text);
      expect(facets).toHaveLength(2);
      expect(facets[0].features[0].uri).toBe("https://a.com");
      expect(facets[1].features[0].uri).toBe("https://b.com");
    });

    it("computes correct byte offsets for URL", () => {
      const text = "See https://example.com";
      const facets = parseFacets(text);
      const start = facets[0].index.byteStart;
      const end = facets[0].index.byteEnd;
      expect(start).toBe(4); // "See " = 4 bytes
      expect(end).toBe(4 + utf8ByteLength("https://example.com"));
    });

    it("computes correct byte offsets after CJK text", () => {
      const text = "見て https://example.com";
      const facets = parseFacets(text);
      // 見 (3 bytes) + て (3 bytes) + ' ' (1 byte) = 7 bytes
      expect(facets[0].index.byteStart).toBe(7);
    });
  });

  describe("mentions", () => {
    it("detects a mention at start of text", () => {
      const facets = parseFacets("@alice.bsky.social hello");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].$type).toBe(FACET_MENTION);
      expect(facets[0].features[0].did).toBe("alice.bsky.social");
    });

    it("detects a mention after whitespace", () => {
      const facets = parseFacets("Hello @bob.bsky.social!");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].did).toBe("bob.bsky.social");
    });

    it("detects multiple mentions", () => {
      const facets = parseFacets("@alice.bsky.social @bob.bsky.social");
      const mentions = facets.filter(
        (f) => f.features[0].$type === FACET_MENTION
      );
      expect(mentions).toHaveLength(2);
    });

    it("detects mention without dot (resolved later by resolveMentionFacets)", () => {
      const facets = parseFacets("@alice hello");
      const mentions = facets.filter(
        (f) => f.features[0].$type === FACET_MENTION
      );
      // parseFacets accepts any @word; invalid handles are dropped during DID resolution
      expect(mentions).toHaveLength(1);
      expect(mentions[0].features[0].did).toBe("alice");
    });

    it("computes correct byte offsets for mention", () => {
      const text = "@alice.bsky.social";
      const facets = parseFacets(text);
      expect(facets[0].index.byteStart).toBe(0);
      expect(facets[0].index.byteEnd).toBe(utf8ByteLength(text));
    });
  });

  describe("hashtags", () => {
    it("detects a hashtag at start", () => {
      const facets = parseFacets("#bluesky is great");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].$type).toBe(FACET_TAG);
      expect(facets[0].features[0].tag).toBe("bluesky");
    });

    it("detects a hashtag after space", () => {
      const facets = parseFacets("Check this #bluesky");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].tag).toBe("bluesky");
    });

    it("detects CJK hashtag", () => {
      const facets = parseFacets("#日本語タグ test");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].tag).toBe("日本語タグ");
    });

    it("stops hashtag at space", () => {
      const facets = parseFacets("#hello world");
      expect(facets[0].features[0].tag).toBe("hello");
    });

    it("stops hashtag at fullwidth space (U+3000)", () => {
      const facets = parseFacets("#タグ\u3000次");
      expect(facets[0].features[0].tag).toBe("タグ");
    });

    it("detects multiple hashtags", () => {
      const facets = parseFacets("#one #two #three");
      const tags = facets.filter((f) => f.features[0].$type === FACET_TAG);
      expect(tags).toHaveLength(3);
    });

    it("computes correct byte offsets for CJK hashtag", () => {
      const text = "#日本";
      const facets = parseFacets(text);
      expect(facets[0].index.byteStart).toBe(0);
      // # (1 byte) + 日 (3 bytes) + 本 (3 bytes) = 7 bytes
      expect(facets[0].index.byteEnd).toBe(7);
    });
  });

  describe("mixed content", () => {
    it("detects URL, mention, and hashtag in same text", () => {
      const text = "@alice.bsky.social check https://example.com #cool";
      const facets = parseFacets(text);
      const types = facets.map((f) => f.features[0].$type).sort();
      expect(types).toEqual(
        [FACET_LINK, FACET_MENTION, FACET_TAG].sort()
      );
    });

    it("returns empty array for text with no facets", () => {
      expect(parseFacets("Just plain text")).toEqual([]);
    });

    it("returns empty array for empty text", () => {
      expect(parseFacets("")).toEqual([]);
    });

    it("handles emoji in text before facets", () => {
      const text = "🎉🎊 https://example.com";
      const facets = parseFacets(text);
      expect(facets).toHaveLength(1);
      // 🎉 (4 bytes) + 🎊 (4 bytes) + ' ' (1 byte) = 9 bytes
      expect(facets[0].index.byteStart).toBe(9);
    });

    it("handles URL at end of text without trailing space", () => {
      const facets = parseFacets("Visit https://example.com");
      expect(facets).toHaveLength(1);
      expect(facets[0].features[0].uri).toBe("https://example.com");
    });
  });

  describe("byte offset correctness", () => {
    it("extracted substring matches facet text for URL", () => {
      const text = "日本語 https://example.com テスト";
      const facets = parseFacets(text);
      const url = facets.find((f) => f.features[0].$type === FACET_LINK);
      const encoded = new TextEncoder().encode(text);
      const extracted = new TextDecoder().decode(
        encoded.slice(url.index.byteStart, url.index.byteEnd)
      );
      expect(extracted).toBe("https://example.com");
    });

    it("extracted substring matches facet text for mention", () => {
      const text = "日本語 @alice.bsky.social テスト";
      const facets = parseFacets(text);
      const mention = facets.find(
        (f) => f.features[0].$type === FACET_MENTION
      );
      const encoded = new TextEncoder().encode(text);
      const extracted = new TextDecoder().decode(
        encoded.slice(mention.index.byteStart, mention.index.byteEnd)
      );
      expect(extracted).toBe("@alice.bsky.social");
    });

    it("extracted substring matches facet text for hashtag", () => {
      const text = "😀 #ブルースカイ end";
      const facets = parseFacets(text);
      const tag = facets.find((f) => f.features[0].$type === FACET_TAG);
      const encoded = new TextEncoder().encode(text);
      const extracted = new TextDecoder().decode(
        encoded.slice(tag.index.byteStart, tag.index.byteEnd)
      );
      expect(extracted).toBe("#ブルースカイ");
    });
  });
});

// ─── calcCoverRect ──────────────────────────────────────

describe("calcCoverRect", () => {
  describe("landscape image in landscape container (same ratio)", () => {
    it("returns full image when aspect ratios match", () => {
      // nw:nh = dw:dh = 2:1 — no crop needed
      const r = calcCoverRect(1000, 500, 500, 250, "50% 50%");
      expect(r.sx).toBe(0);
      expect(r.sy).toBe(0);
      expect(r.sw).toBe(1000);
      expect(r.sh).toBe(500);
    });
  });

  describe("portrait image in landscape container (letterbox avoidance)", () => {
    it("crops height to fill wide container", () => {
      // nw=480, nh=1080, dw=516, dh=215 — wide container needs horizontal fill
      const r = calcCoverRect(480, 1080, 516, 215, "50% 50%");
      expect(r.sw).toBe(480); // full width used
      expect(r.sh).toBeGreaterThan(0);
      expect(r.sh).toBeLessThan(1080);
      expect(r.sx).toBe(0);
      expect(r.sy).toBeGreaterThan(0); // cropped from top
    });
  });

  describe("landscape image in portrait container", () => {
    it("crops width to fill tall container", () => {
      // nw=1080, nh=480, dw=215, dh=516
      const r = calcCoverRect(1080, 480, 215, 516, "50% 50%");
      expect(r.sh).toBe(480); // full height used
      expect(r.sw).toBeGreaterThan(0);
      expect(r.sw).toBeLessThan(1080);
      expect(r.sy).toBe(0);
      expect(r.sx).toBeGreaterThan(0); // cropped from left
    });
  });

  describe("objectPosition", () => {
    it("0% 0% anchors to top-left", () => {
      const r = calcCoverRect(1000, 500, 200, 200, "0% 0%");
      expect(r.sx).toBe(0);
      expect(r.sy).toBe(0);
    });

    it("100% 100% anchors to bottom-right", () => {
      const { sx, sy, sw, sh } = calcCoverRect(1000, 500, 200, 200, "100% 100%");
      expect(sx).toBe(1000 - sw);
      expect(sy).toBe(500 - sh);
    });

    it("50% 50% centers the crop", () => {
      const { sx, sy, sw, sh } = calcCoverRect(1000, 500, 200, 200, "50% 50%");
      expect(sx).toBe(Math.round((1000 - sw) * 0.5));
      expect(sy).toBe(Math.round((500 - sh) * 0.5));
    });

    it("non-percentage keyword falls back to 50%", () => {
      const centered = calcCoverRect(1000, 500, 200, 200, "50% 50%");
      const keyword = calcCoverRect(1000, 500, 200, 200, "center center");
      expect(keyword.sx).toBe(centered.sx);
      expect(keyword.sy).toBe(centered.sy);
    });

    it("single percentage value applies to both axes", () => {
      const r = calcCoverRect(1000, 500, 200, 200, "0%");
      expect(r.sx).toBe(0);
      expect(r.sy).toBe(0);
    });
  });

  describe("AT Protocol constraint: sw and sh must be >= 1", () => {
    it("clamps sw to 1 for extreme aspect ratio (1xN image in wide container)", () => {
      // nw=1, nh=4097, dw=800, dh=1 — downscale would give sw < 1
      const r = calcCoverRect(1, 4097, 800, 1, "50% 50%");
      expect(r.sw).toBeGreaterThanOrEqual(1);
      expect(r.sh).toBeGreaterThanOrEqual(1);
    });

    it("clamps sh to 1 for extreme aspect ratio (Nx1 image in tall container)", () => {
      const r = calcCoverRect(4097, 1, 1, 800, "50% 50%");
      expect(r.sw).toBeGreaterThanOrEqual(1);
      expect(r.sh).toBeGreaterThanOrEqual(1);
    });

    it("never returns negative sx or sy", () => {
      const r = calcCoverRect(100, 100, 100, 100, "150% 150%");
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
    });
  });

  describe("aspect ratio preservation", () => {
    it("output sw/sh ratio matches container dw/dh ratio", () => {
      // container is 2:1, sw/sh should also be approximately 2:1
      const r = calcCoverRect(1153, 480, 516, 215, "50% 50%");
      const containerRatio = 516 / 215;
      const cropRatio = r.sw / r.sh;
      expect(Math.abs(cropRatio - containerRatio)).toBeLessThan(0.01);
    });
  });
});

// ─── extractFirstUrl ──────────────────────────────────

describe("extractFirstUrl", () => {
  it("extracts a simple URL", () => {
    expect(extractFirstUrl("Check https://example.com for details")).toBe("https://example.com");
  });

  it("extracts YouTube watch URL", () => {
    expect(extractFirstUrl("Check this https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
      .toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("extracts youtu.be short URL", () => {
    expect(extractFirstUrl("Watch https://youtu.be/dQw4w9WgXcQ"))
      .toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("extracts URL with path and query", () => {
    expect(extractFirstUrl("See https://example.com/page?q=1&r=2"))
      .toBe("https://example.com/page?q=1&r=2");
  });

  it("extracts YouTube playlist URL", () => {
    expect(extractFirstUrl("Check https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"))
      .toBe("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
  });

  it("extracts YouTube channel URL", () => {
    expect(extractFirstUrl("https://www.youtube.com/@RickAstleyYT"))
      .toBe("https://www.youtube.com/@RickAstleyYT");
  });

  it("returns null for text without URL", () => {
    expect(extractFirstUrl("Hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractFirstUrl("")).toBeNull();
  });

  it("extracts only the first URL from multiple", () => {
    expect(extractFirstUrl("https://a.com and https://b.com"))
      .toBe("https://a.com");
  });

  it("strips trailing period", () => {
    expect(extractFirstUrl("Visit https://example.com."))
      .toBe("https://example.com");
  });

  it("strips trailing punctuation", () => {
    expect(extractFirstUrl("Wow https://example.com!!"))
      .toBe("https://example.com");
  });

  it("strips trailing parenthesis", () => {
    expect(extractFirstUrl("(https://example.com)"))
      .toBe("https://example.com");
  });

  it("extracts http URL", () => {
    expect(extractFirstUrl("http://example.com"))
      .toBe("http://example.com");
  });

  it("does not match angle-bracketed URLs (excluded by regex)", () => {
    // The regex stops at > so the URL should still be extracted but < stops it
    expect(extractFirstUrl("Visit <https://example.com> please"))
      .toBe("https://example.com");
  });
});
