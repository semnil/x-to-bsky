import { describe, it, expect } from "vitest";
import fs from "node:fs";

// Ink / ground pairs read from the stylesheets, held to WCAG 2.1 contrast ratios:
// 4.5:1 for text, 3:1 for the toggle knob against its track.

/** The value of `property` in the rule whose selector is exactly `selector`. */
function declared(file, selector, property) {
  const text = fs.readFileSync(file, "utf8");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!rule) throw new Error(`${file}: no rule for ${selector}`);
  const decl = rule[1].match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`));
  if (!decl) throw new Error(`${file}: ${selector} declares no ${property}`);
  return decl[1].trim();
}

/** WCAG 2.1 relative luminance of a #rgb / #rrggbb color. */
function luminance(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("contrast", () => {
  it("measures a known pair", () => {
    expect(ratio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(ratio("#ffffff", "#0085ff")).toBeCloseTo(3.62, 2);
  });

  it.each([
    [".xtobsky-toast--success"],
    [".xtobsky-toast--error"],
  ])("gives the %s toast text 4.5:1", (selector) => {
    const ink = declared("content.css", ".xtobsky-toast", "color");
    const ground = declared("content.css", selector, "background-color");
    expect(ratio(ink, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    [".btn-primary"],
    [".btn-primary:hover"],
  ])("gives the options page's %s text 4.5:1", (selector) => {
    const ink = declared("options.html", ".btn-primary", "color");
    const ground = declared("options.html", selector, "background");
    expect(ratio(ink, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([["popup.html"], ["options.html"]])("gives the %s toggle knob 3:1 against the ON track", (file) => {
    const knob = declared(file, ".toggle .slider::before", "background-color");
    const track = declared(file, ".toggle input:checked + .slider", "background-color");
    expect(ratio(knob, track)).toBeGreaterThanOrEqual(3);
  });
});
