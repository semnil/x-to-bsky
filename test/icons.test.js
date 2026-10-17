import { describe, it, expect } from "vitest";
import fs from "node:fs";

const UI_FILES = [
  "content.js",
  "content.css",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "shared.js",
  "_locales/ja/messages.json",
  "_locales/en/messages.json",
];

// Pictographs and the Dingbats block (which holds ✓ and ✔).
const PICTOGRAPH = /[\p{Extended_Pictographic}✀-➿]/u;

const shared = fs.readFileSync("shared.js", "utf8");
const iconBlock = shared.match(/const ICON_PATHS = \{([^}]*)\}/);
const iconNames = iconBlock ? [...iconBlock[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]) : [];

describe("UI icons", () => {
  it("draws icons as SVG, with no pictograph characters in UI files", () => {
    for (const file of UI_FILES) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const hits = lines
        .map((line, i) => (PICTOGRAPH.test(line) ? `${file}:${i + 1}: ${line.trim()}` : null))
        .filter(Boolean);
      expect(hits, file).toEqual([]);
    }
  });

  it("names only icons that shared.js defines", () => {
    expect(iconNames.length).toBeGreaterThan(0);
    for (const file of ["content.js", "popup.html", "options.html"]) {
      const text = fs.readFileSync(file, "utf8");
      const used = [
        ...[...text.matchAll(/createIcon\("(\w+)"\)/g)].map((m) => m[1]),
        ...[...text.matchAll(/data-icon="(\w+)"/g)].map((m) => m[1]),
      ];
      expect(used.length, file).toBeGreaterThan(0);
      for (const name of used) expect(iconNames, `${file}: ${name}`).toContain(name);
    }
  });
});
