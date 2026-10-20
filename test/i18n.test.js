import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const PAGES = [
  { html: "popup.html", script: "popup.js" },
  { html: "options.html", script: "options.js" },
];

// The `const i18n = { ja: {...}, en: {...} };` literal of a page script, evaluated in an empty context.
function messagesOf(script) {
  const src = fs.readFileSync(script, "utf8");
  const m = src.match(/^const i18n = (\{[\s\S]*?\n\});$/m);
  if (!m) throw new Error(`${script} has no top-level "const i18n = {...};"`);
  return vm.runInNewContext(`(${m[1]})`, {});
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
    const messages = messagesOf(script);
    const keys = keysOf(html);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(messages.ja, `ja.${key}`).toHaveProperty(key);
      expect(messages.en, `en.${key}`).toHaveProperty(key);
    }
  });

  it("has no Japanese in the English messages", () => {
    const messages = messagesOf(script);
    for (const [key, text] of Object.entries(messages.en)) {
      expect(text, `en.${key}`).not.toMatch(JAPANESE);
    }
  });

  it("has Japanese text only as the fallback of translated elements", () => {
    const rest = withoutTranslatedElements(html);
    expect(rest.match(new RegExp(`.{0,40}${JAPANESE.source}.{0,40}`))).toBeNull();
  });
});
