// content.js — Runs on x.com / twitter.com
// Observes the post button click and sends text + images to background for Bluesky cross-posting.
// DEFAULT_SELECTORS is provided by shared.js (loaded before this file).

(() => {
  "use strict";

  const TOAST_DURATION = 4000;
  const MIN_IMAGE_PX = 80;       // skip images smaller than this (icons, emoji)
  const PARENT_WALK_DEPTH = 10;  // levels to walk up from textarea to find compose block
  const STATUS_URL_RE = /https?:\/\/(x\.com|twitter\.com)\/[^/]+\/status\/\d+/;

  let enabled = true;
  let configured = false;
  let includeQuoteUrl = false;
  let selectors = { ...DEFAULT_SELECTORS };

  // Load custom selectors and behavior settings from storage
  chrome.storage.local.get(["customSelectors", "includeQuoteUrl"], (data) => {
    if (data.customSelectors) {
      selectors = { ...DEFAULT_SELECTORS, ...data.customSelectors };
    }
    includeQuoteUrl = !!data.includeQuoteUrl;
  });

  // Listen for setting changes (e.g. user toggles includeQuoteUrl while x.com is open)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.includeQuoteUrl) {
      includeQuoteUrl = !!changes.includeQuoteUrl.newValue;
    }
  });

  // Fetch initial status with retry (V08: service worker may not be ready yet)
  function fetchStatus(retries) {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
      if (chrome.runtime.lastError && retries > 0) {
        setTimeout(() => fetchStatus(retries - 1), 500);
        return;
      }
      if (res) {
        enabled = res.enabled;
        configured = res.configured;
      }
    });
  }
  fetchStatus(3);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_CROSSPOST") {
      enabled = msg.enabled;
    }
  });

  // ─── Toast ───────────────────────────────────────────────

  function showToast(message, isError = false) {
    const existing = document.getElementById("xtobsky-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "xtobsky-toast";
    toast.className = `xtobsky-toast ${isError ? "xtobsky-toast--error" : "xtobsky-toast--success"}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("xtobsky-toast--visible"));

    setTimeout(() => {
      toast.classList.remove("xtobsky-toast--visible");
      setTimeout(() => toast.remove(), 300);
    }, TOAST_DURATION);
  }

  // ─── DOM Helpers ─────────────────────────────────────────

  /**
   * Walk up from an element to find the nearest compose container.
   */
  function findComposeContainer(el) {
    let container = el;
    for (let i = 0; i < PARENT_WALK_DEPTH; i++) {
      if (!container.parentElement || container.parentElement === document.body) break;
      container = container.parentElement;
    }
    return container;
  }

  // ─── Text Extraction ────────────────────────────────────

  function getTextareaEl(index) {
    const sel = selectors.tweetTextarea.replace("${n}", String(index));
    return document.querySelector(sel);
  }

  /**
   * Extract text from a single compose textarea by index.
   * Returns null if the textarea does not exist.
   */
  function extractTextAt(index) {
    const textarea = getTextareaEl(index);
    if (!textarea) return null;

    const spans = textarea.querySelectorAll(selectors.textSpan);
    if (spans.length > 0) {
      return Array.from(spans)
        .map((el) => el.textContent)
        .join("\n")
        .trim();
    }
    return "";
  }

  // ─── Image Extraction ───────────────────────────────────

  /**
   * Capture an <img> element to a base64 data-URL via canvas.
   * Returns null on failure (e.g. tainted canvas for cross-origin images).
   */
  const MAX_IMAGE_DIMENSION = 2048; // downscale large images to limit message size (V07)

  function captureImageToBase64(img) {
    try {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch {
      return null;
    }
  }

  /**
   * Synchronously extract attached images for a given compose index.
   * Walks up from the textarea to find nearby <img> elements,
   * filtering out avatars and icons by size.
   */
  function extractImagesAt(index) {
    const textarea = getTextareaEl(index);
    if (!textarea) return [];

    const container = findComposeContainer(textarea);
    const imgs = container.querySelectorAll("img");
    const results = [];

    for (const img of imgs) {
      if (img.naturalWidth < MIN_IMAGE_PX || img.naturalHeight < MIN_IMAGE_PX) continue;
      if (img.closest('[data-testid*="avatar" i]')) continue;

      const base64 = captureImageToBase64(img);
      if (base64) {
        results.push({ base64, mimeType: "image/jpeg", alt: img.alt || "" });
      }
      if (results.length >= 4) break;
    }

    return results;
  }

  // ─── Quote Tweet URL Extraction ─────────────────────────

  /**
   * Extract the URL of a quoted tweet from the compose area.
   * Returns the quoted post URL or null.
   */
  function extractQuoteUrl() {
    // Try the configurable selector first
    const link = document.querySelector(selectors.quoteTweetLink);
    if (link) {
      const match = link.href.match(STATUS_URL_RE);
      if (match) return match[0];
    }

    // Fallback: look for any status link near the compose area
    const textarea = getTextareaEl(0);
    if (!textarea) return null;

    const container = findComposeContainer(textarea);
    const links = container.querySelectorAll('a[href*="/status/"]');
    for (const a of links) {
      const m = a.href.match(STATUS_URL_RE);
      if (m) return m[0];
    }

    return null;
  }

  // ─── Thread Extraction ──────────────────────────────────

  /**
   * Extract the full compose thread: all textareas (thread posts) + their images.
   * Synchronous — must complete before X clears the compose area.
   */
  function extractComposeThread() {
    const posts = [];
    let index = 0;

    while (true) {
      const text = extractTextAt(index);
      if (text === null) break;
      const images = extractImagesAt(index);
      posts.push({ text, images });
      index++;
    }

    // Fallback: DraftJS editor (legacy X UI)
    if (posts.length === 0) {
      const spans = document.querySelectorAll(selectors.fallbackEditor);
      if (spans.length > 0) {
        const text = Array.from(spans)
          .map((el) => el.textContent)
          .join("\n")
          .trim();
        if (text) posts.push({ text, images: [] });
      }
    }

    const filtered = posts.filter((p) => p.text || p.images.length > 0);

    // Append quoted tweet URL to the first post if enabled
    if (includeQuoteUrl && filtered.length > 0) {
      const quoteUrl = extractQuoteUrl();
      if (quoteUrl) {
        filtered[0].text = filtered[0].text
          ? filtered[0].text + "\n" + quoteUrl
          : quoteUrl;
      }
    }

    return filtered;
  }

  // ─── Post Button Handler ────────────────────────────────

  function handlePostClick(event) {
    if (!enabled || !configured) return;

    const target = event.target.closest(selectors.postButton);
    if (!target) return;

    const thread = extractComposeThread();
    if (thread.length === 0) return;

    chrome.runtime.sendMessage({ type: "POST_TO_BSKY", thread }, (res) => {
      if (chrome.runtime.lastError) {
        showToast("Bluesky: extension error", true);
        return;
      }
      if (res && res.ok) {
        const msg =
          res.postCount > 1
            ? `Bluesky: posted thread (${res.postCount} posts) ✓`
            : "Bluesky: posted ✓";
        showToast(msg);
      } else {
        showToast(`Bluesky: ${res?.error || "unknown error"}`, true);
      }
    });
  }

  // Capture phase — runs before X's own handler
  document.addEventListener("click", handlePostClick, true);

  // ─── Badge Injection ────────────────────────────────────

  function injectBadge(button) {
    if (button.querySelector(".xtobsky-badge")) return;

    const badge = document.createElement("span");
    badge.className = "xtobsky-badge";
    badge.textContent = "🦋";
    badge.title = enabled
      ? "Bluesky crosspost: ON"
      : "Bluesky crosspost: OFF";
    if (!enabled) badge.classList.add("xtobsky-badge--off");

    button.style.position = "relative";
    button.appendChild(badge);
  }

  // Debounced MutationObserver — x.com mutates the DOM heavily,
  // so we coalesce via requestAnimationFrame to avoid thrashing.
  let badgeRafPending = false;

  const observer = new MutationObserver(() => {
    if (!configured || badgeRafPending) return;
    badgeRafPending = true;
    requestAnimationFrame(() => {
      badgeRafPending = false;
      const buttons = document.querySelectorAll(selectors.postButton);
      buttons.forEach(injectBadge);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
