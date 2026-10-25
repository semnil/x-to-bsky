import { describe, it, expect } from "vitest";
import fs from "node:fs";

// Every element of class "hint" on the extension pages gets a font size and a color declared in the
// page itself (its <style> rules or a style attribute), the same for all of them, rather than
// inheriting the page's text style. The thumbnail hint, in the row options.js dims while link cards
// are off, keeps 3:1 on the page background.

const PAGES = ["popup.html", "options.html"];
const VOID = new Set(["br", "hr", "img", "input", "link", "meta"]);

/** The declarations of a rule body or a style attribute, as { property: value }. */
function declarations(text) {
  return Object.fromEntries(
    text.split(";").map((d) => d.split(":")).filter((p) => p.length > 1)
      .map(([property, ...value]) => [property.trim(), value.join(":").trim()]),
  );
}

/**
 * The elements of a page, each as { tag, classes, style, key, ancestors } with the nearest ancestor
 * first. A closing tag that does not close the open element throws.
 */
function elementsOf(html) {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/g, "$1$3");
  const elements = [];
  const open = [];
  for (const [, slash, name, attributes] of source.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const tag = name.toLowerCase();
    if (slash) {
      const top = open.pop();
      if (top?.tag !== tag) throw new Error(`</${tag}> closes <${top?.tag}>`);
      continue;
    }
    const element = {
      tag,
      classes: (attributes.match(/\sclass="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean),
      style: declarations(attributes.match(/\sstyle="([^"]*)"/)?.[1] ?? ""),
      key: attributes.match(/\sdata-i18n(?:-html)?="([^"]*)"/)?.[1],
      ancestors: [...open].reverse(),
    };
    elements.push(element);
    if (!VOID.has(tag) && !attributes.endsWith("/")) open.push(element);
  }
  if (open.length) throw new Error(`<${open.at(-1).tag}> is not closed`);
  return elements;
}

/** The rules of a page's <style> elements in source order, as { selectors, values }. */
function rulesOf(html) {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  if (css.includes("@")) throw new Error("at-rules are not read");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(",").map((s) => s.trim()),
    values: declarations(body),
  }));
}

/** A compound selector as { tag, classes, pseudo }, or null when it is written in other syntax. */
function compound(text) {
  const m = text.match(/^(\*|[a-z][\w-]*)?((?:\.[\w-]+)*)((?::{1,2}[\w-]+)*)$/);
  if (!m || text === "") return null;
  return { tag: m[1] === "*" ? undefined : m[1], classes: m[2].split(".").filter(Boolean), pseudo: m[3] };
}

/** Whether `element` has the type and every class of the compound `c`. */
const matchesCompound = (element, c) =>
  (!c.tag || element.tag === c.tag) && c.classes.every((k) => element.classes.includes(k));

/**
 * The specificity of `selector` as [classes, types] when it matches `element`, or null when it does not.
 * A selector whose last compound fits the element but that uses anything beyond type, class and
 * descendant syntax throws, so a rule this reading cannot decide fails the test instead of being skipped.
 */
function specificity(selector, element) {
  const last = compound(selector.split(/\s*[>+~]\s*|\s+/).at(-1));
  if (!last) throw new Error(`selector not read: ${selector}`);
  if (last.pseudo.startsWith("::") || !matchesCompound(element, last)) return null;
  const parts = selector.split(/\s+/).map(compound);
  if (last.pseudo || parts.some((c) => !c || c.pseudo)) throw new Error(`selector not read: ${selector}`);
  let i = parts.length - 2;
  for (const ancestor of element.ancestors) if (i >= 0 && matchesCompound(ancestor, parts[i])) i--;
  if (i >= 0) return null;
  return [parts.reduce((n, c) => n + c.classes.length, 0), parts.filter((c) => c.tag).length];
}

/** The value the inline style or the winning stylesheet rule declares for `property` on `element`. */
function cascadedValue(element, rules, property) {
  if (property in element.style) return element.style[property];
  let best;
  for (const rule of rules) {
    if (!(property in rule.values)) continue;
    for (const selector of rule.selectors) {
      const weight = specificity(selector, element);
      if (weight && (!best || weight[0] > best.weight[0] || (weight[0] === best.weight[0] && weight[1] >= best.weight[1]))) {
        best = { weight, value: rule.values[property] };
      }
    }
  }
  return best?.value;
}

describe.each(PAGES)("%s", (file) => {
  const html = fs.readFileSync(file, "utf8");
  const rules = rulesOf(html);
  const hints = elementsOf(html).filter((e) => e.classes.includes("hint"));

  it("declares one font size and one color for every hint", () => {
    const styles = hints.map((e) => ({
      key: e.key,
      fontSize: cascadedValue(e, rules, "font-size"),
      color: cascadedValue(e, rules, "color"),
    }));
    for (const s of styles) {
      expect(s.fontSize, `font-size of ${s.key}`).toBeDefined();
      expect(s.color, `color of ${s.key}`).toBeDefined();
    }
    expect(styles).toEqual(styles.map((s) => ({ ...s, fontSize: styles[0].fontSize, color: styles[0].color })));
  });
});

/** The [r, g, b] of a #rgb / #rrggbb color. */
function rgbOf(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG 2.1 relative luminance of an [r, g, b] color. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("options.html", () => {
  it("keeps the thumbnail hint at 3:1 on the page while link cards are off and its row is dimmed", () => {
    const html = fs.readFileSync("options.html", "utf8");
    const rules = rulesOf(html);
    const hint = elementsOf(html).find((e) => e.key === "linkCardThumbnailHint");
    const ink = rgbOf(cascadedValue(hint, rules, "color"));
    const ground = rgbOf(rules.find((r) => r.selectors.includes("body")).values.background);
    const opacity = Number(fs.readFileSync("options.js", "utf8").match(
      /linkCardThumbnailToggle\.closest\("\.row"\)\.style\.opacity = includeLinkCardToggle\.checked \? "1" : "([\d.]+)";/,
    )?.[1]);
    expect(opacity, "opacity of the dimmed thumbnail row").toBeGreaterThan(0);
    const shown = ink.map((c, i) => c * opacity + ground[i] * (1 - opacity));
    const [lighter, darker] = [luminance(shown), luminance(ground)].sort((a, b) => b - a);
    expect((lighter + 0.05) / (darker + 0.05)).toBeGreaterThanOrEqual(3);
  });

  it("has hints both in the credential fields and in the toggle rows", () => {
    const hints = elementsOf(fs.readFileSync("options.html", "utf8")).filter((e) => e.classes.includes("hint"));
    const inside = (className) => hints.filter((e) => e.ancestors.some((a) => a.classes.includes(className)));
    expect(inside("field").length).toBeGreaterThan(0);
    expect(inside("row").length).toBeGreaterThan(0);
  });
});
