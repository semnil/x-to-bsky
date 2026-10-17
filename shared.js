// shared.js — Constants and icons shared between content.js, options.js and popup.js

// Default DOM selectors for X's compose UI.
// Users can override via the Advanced section in options.
// eslint-disable-next-line no-unused-vars
const DEFAULT_SELECTORS = {
  postButton: '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
  tweetTextarea: '[data-testid="tweetTextarea_${n}"]',
  textSpan: '[data-text="true"]',
  fallbackEditor: '.DraftEditor-root [data-text="true"]',
  quoteTweetLink: '[data-testid="quoteTweet"] a[role="link"][href*="/status/"]',
};

// Icon outlines in a 24x24 box, filled with the current text color.
const ICON_PATHS = {
  butterfly: "M11.3 11.2C10.2 7.4 6.8 3.6 3.9 3.4C2.3 3.3 1.7 4.6 2.1 6.6C2.6 9.2 4.6 11.5 8.2 11.9C9.4 12 10.5 11.8 11.3 11.2ZM11.3 12.6C8.8 12.6 5.4 13.6 5 16.3C4.7 18.4 6.5 20.4 8.6 19.4C10.3 18.6 11.2 15.8 11.3 12.6ZM12.7 11.2C13.8 7.4 17.2 3.6 20.1 3.4C21.7 3.3 22.3 4.6 21.9 6.6C21.4 9.2 19.4 11.5 15.8 11.9C14.6 12 13.5 11.8 12.7 11.2ZM12.7 12.6C15.2 12.6 18.6 13.6 19 16.3C19.3 18.4 17.5 20.4 15.4 19.4C13.7 18.6 12.8 15.8 12.7 12.6ZM12 7.6C12.6 7.6 12.9 8.1 12.9 8.8V17.4C12.9 18.1 12.6 18.6 12 18.6C11.4 18.6 11.1 18.1 11.1 17.4V8.8C11.1 8.1 11.4 7.6 12 7.6Z",
  gear: "M19.64 10.45 22.41 10.64 22.41 13.36 19.64 13.55 18.5 16.31 20.32 18.4 18.4 20.32 16.31 18.5 13.55 19.64 13.36 22.41 10.64 22.41 10.45 19.64 7.69 18.5 5.6 20.32 3.68 18.4 5.5 16.31 4.36 13.55 1.59 13.36 1.59 10.64 4.36 10.45 5.5 7.69 3.68 5.6 5.6 3.68 7.69 5.5 10.45 4.36 10.64 1.59 13.36 1.59 13.55 4.36 16.31 5.5 18.4 3.68 20.32 5.6 18.5 7.69ZM15.4 12A3.4 3.4 0 1 0 8.6 12A3.4 3.4 0 1 0 15.4 12Z",
  check: "M3.4 12.6 5.1 10.9 9.4 15.2 18.9 5.7 20.6 7.4 9.4 18.6Z",
};

/**
 * Create a decorative inline SVG icon (hidden from assistive technology).
 * Sized by the surrounding CSS via the `xtobsky-icon` class.
 */
function createIcon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "xtobsky-icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}

/**
 * Fill every `[data-icon]` element under root with the named icon.
 */
// eslint-disable-next-line no-unused-vars
function renderIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.replaceChildren(createIcon(el.dataset.icon));
  });
}
