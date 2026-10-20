import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const PAGES = [
  { html: "popup.html", script: "popup.js" },
  { html: "options.html", script: "options.js" },
];

// The `const <name> = { ja: {...}, en: {...} };` literal of a script, evaluated in an empty context.
function messagesOf(script, name = "i18n") {
  const src = fs.readFileSync(script, "utf8");
  const m = src.match(new RegExp(`^([ \\t]*)const ${name} = (\\{[\\s\\S]*?\\n\\1\\});$`, "m"));
  if (!m) throw new Error(`${script} has no "const ${name} = {...};"`);
  return vm.runInNewContext(`(${m[2]})`, {});
}

const placeholders = (text) => [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

function expectBothLanguages(messages, keys) {
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    expect(messages.ja, `ja.${key}`).toHaveProperty(key);
    expect(messages.en, `en.${key}`).toHaveProperty(key);
  }
  for (const [key, text] of Object.entries(messages.en)) {
    expect(text, `en.${key}`).not.toMatch(JAPANESE);
    expect(placeholders(messages.ja[key] ?? ""), `placeholders of ${key}`).toEqual(placeholders(text));
  }
}

function keysOf(html) {
  return [...html.matchAll(/data-i18n(?:-html|-placeholder)?="([^"]+)"/g)].map((m) => m[1]);
}

// The page with every element that carries a data-i18n / data-i18n-html attribute cut out.
function withoutTranslatedElements(html) {
  return html.replace(/<(\w+)\b[^>]*\sdata-i18n(?:-html)?="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, "");
}

describe.each(PAGES)("$html", ({ html: htmlFile, script }) => {
  const html = fs.readFileSync(htmlFile, "utf8");

  it("loads shared.js before its own script", () => {
    const shared = html.indexOf('<script src="shared.js"></script>');
    const own = html.indexOf(`<script src="${script}"></script>`);
    expect(shared).toBeGreaterThan(-1);
    expect(own).toBeGreaterThan(shared);
  });

  it("has every key it uses in both Japanese and English", () => {
    expectBothLanguages(messagesOf(script), keysOf(html));
  });

  it("has Japanese text only as the fallback of translated elements", () => {
    const rest = withoutTranslatedElements(html);
    expect(rest.match(new RegExp(`.{0,40}${JAPANESE.source}.{0,40}`))).toBeNull();
  });
});

describe("content.js", () => {
  const src = fs.readFileSync("content.js", "utf8");

  it("has every message it uses in both Japanese and English", () => {
    const keys = [...src.matchAll(/translate\(i18n, "(\w+)"\)/g)].map((m) => m[1]);
    expectBothLanguages(messagesOf("content.js"), keys);
  });

  it("passes no fixed text to the toast or the badge title", () => {
    expect(src).not.toMatch(/showToast\(\s*["']/);
    expect(src).not.toMatch(/\.title = ["'`]/);
    const inline = [...src.matchAll(/showToast\(\s*`([^`]*)`/g)].map((m) => m[1]);
    for (const literal of inline) {
      // Only the product name and interpolated values are written inline.
      expect(literal.replace(/\$\{[^}]*\}/g, "").replace(/^Bluesky: /, ""), literal).toBe("");
    }
  });
});

describe("errors reported by background.js", () => {
  const background = fs.readFileSync("background.js", "utf8");

  it("throws only CodedError, so every error the pages show has a message", () => {
    expect(background).not.toMatch(/new Error\(/);
  });

  it("has a Japanese and an English message for every code", () => {
    const codes = [...background.matchAll(/new CodedError\("(\w+)"/g)].map((m) => m[1]);
    expectBothLanguages(messagesOf("shared.js", "ERROR_MESSAGES"), codes);
  });
});
