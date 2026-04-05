// shared.js — Constants shared between content.js and options.js

// Default DOM selectors for X's compose UI.
// Users can override via the Advanced section in options.
// eslint-disable-next-line no-unused-vars
const DEFAULT_SELECTORS = {
  postButton: '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
  tweetTextarea: '[data-testid="tweetTextarea_${n}"]',
  textSpan: '[data-text="true"]',
  fallbackEditor: '.DraftEditor-root [data-text="true"]',
};
