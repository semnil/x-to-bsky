// options.js

// ─── i18n ────────────────────────────────────────────────

const i18n = {
  ja: {
    title: "🦋 X to Bluesky — 設定",
    subtitle: 'Bluesky の認証情報を入力してください。<br>App Password を使用します（メインパスワードは使用しません）。',
    handleLabel: "Bluesky ハンドル",
    handlePlaceholder: "yourname.bsky.social",
    handleHint: "例: yourname.bsky.social",
    passwordLabel: "App Password",
    passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
    passwordHint: 'Bluesky → <strong>設定</strong> → <strong>プライバシーとセキュリティ</strong> → <strong>アプリパスワード</strong> で発行できます',
    saveBtn: "保存",
    testBtn: "接続テスト",
    securityNote: '<strong>セキュリティについて</strong><br>• 認証情報は chrome.storage.local に保存され、この拡張のみがアクセスします。<br>• 外部サーバーへの送信は一切行いません。通信先は bsky.social のみです。<br>• アプリパスワードは Bluesky の 設定 → プライバシーとセキュリティ → アプリパスワード からいつでも無効化できます。',
    msgEmpty: "ハンドルと App Password を入力してください。",
    msgSaved: "保存しました。",
    msgTesting: "接続テスト中...",
    msgExtError: "拡張エラー: ",
    msgSuccess: "接続成功 — ",
    msgFail: "接続失敗: ",
    msgUnknown: "不明なエラー",
    // Advanced
    advancedTitle: "⚙ 高度な設定 — DOM セレクタ",
    advancedDesc: "X の DOM 構造が変更された場合にセレクタを更新できます。",
    selPostButton: "投稿ボタン",
    selTextarea: "テキストエリア (${n} = インデックス)",
    selTextSpan: "テキストスパン",
    selFallback: "フォールバックエディタ",
    saveSelectorsBtn: "セレクタを保存",
    resetSelectorsBtn: "デフォルトに戻す",
    msgSelectorsSaved: "セレクタを保存しました。ページを再読み込みすると反映されます。",
    msgSelectorsReset: "デフォルトに戻しました。",
    selQuoteTweetLink: "引用ツイートリンク",
    // Behavior
    behaviorTitle: "投稿オプション",
    includeQuoteUrlLabel: "引用 RT のリンクを Bluesky に含める",
    includeQuoteUrlHint: "引用元ポストの X リンクをテキスト末尾に追加します",
    includeYouTubeCardLabel: "YouTube リンクカードを Bluesky に表示",
    includeYouTubeCardHint: "YouTube リンクを含むポストにサムネイル付きカードを自動添付します",
    youtubeCardThumbnailLabel: "サムネイル画像を含める",
    youtubeCardThumbnailHint: "無効にするとタイトルのみのリンクカードになります",
  },
  en: {
    title: "🦋 X to Bluesky — Settings",
    subtitle: 'Enter your Bluesky credentials below.<br>Uses an App Password (not your main password).',
    handleLabel: "Bluesky Handle",
    handlePlaceholder: "yourname.bsky.social",
    handleHint: "e.g. yourname.bsky.social",
    passwordLabel: "App Password",
    passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
    passwordHint: 'Bluesky → <strong>Settings</strong> → <strong>Privacy and security</strong> → <strong>App passwords</strong>',
    saveBtn: "Save",
    testBtn: "Test Connection",
    securityNote: '<strong>Security</strong><br>• Credentials are stored in chrome.storage.local, accessible only by this extension.<br>• No data is sent to external servers. Communication is only with bsky.social.<br>• You can revoke the App Password anytime in Bluesky under Settings → Privacy and security → App passwords.',
    msgEmpty: "Please enter your handle and App Password.",
    msgSaved: "Saved.",
    msgTesting: "Testing connection...",
    msgExtError: "Extension error: ",
    msgSuccess: "Connected — ",
    msgFail: "Connection failed: ",
    msgUnknown: "Unknown error",
    // Advanced
    advancedTitle: "⚙ Advanced — DOM Selectors",
    advancedDesc: "Update selectors if X changes its DOM structure.",
    selPostButton: "Post Button",
    selTextarea: "Textarea (${n} = index)",
    selTextSpan: "Text Span",
    selFallback: "Fallback Editor",
    saveSelectorsBtn: "Save Selectors",
    resetSelectorsBtn: "Reset to Defaults",
    msgSelectorsSaved: "Selectors saved. Reload the page to apply.",
    msgSelectorsReset: "Reset to defaults.",
    selQuoteTweetLink: "Quote Tweet Link",
    // Behavior
    behaviorTitle: "Post Options",
    includeQuoteUrlLabel: "Include quoted post URL on Bluesky",
    includeQuoteUrlHint: "Appends the X link of the quoted post to the end of your text",
    includeYouTubeCardLabel: "Show YouTube link cards on Bluesky",
    includeYouTubeCardHint: "Automatically attaches a thumbnail card when your post contains a YouTube link",
    youtubeCardThumbnailLabel: "Include thumbnail image",
    youtubeCardThumbnailHint: "When disabled, creates a title-only link card",
  },
};

// Detect browser language
const currentLang = navigator.language.startsWith("ja") ? "ja" : "en";

function t(key) {
  return i18n[currentLang][key] || i18n.en[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

// DEFAULT_SELECTORS is provided by shared.js (loaded before this file).

const SELECTOR_KEYS = Object.keys(DEFAULT_SELECTORS);

// ─── DOM References ──────────────────────────────────────

const handleInput = document.getElementById("handle");
const passwordInput = document.getElementById("password");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const messageEl = document.getElementById("message");

const saveSelectorsBtn = document.getElementById("saveSelectors");
const resetSelectorsBtn = document.getElementById("resetSelectors");
const selectorMessageEl = document.getElementById("selectorMessage");

const includeQuoteUrlToggle = document.getElementById("includeQuoteUrl");
const includeYouTubeCardToggle = document.getElementById("includeYouTubeCard");
const youtubeCardThumbnailToggle = document.getElementById("youtubeCardThumbnail");


// ─── Load Settings ───────────────────────────────────────

chrome.storage.local.get(
  ["bskyHandle", "bskyAppPassword", "customSelectors", "includeQuoteUrl", "includeYouTubeCard", "youtubeCardThumbnail"],
  (data) => {
    if (data.bskyHandle) handleInput.value = data.bskyHandle;
    if (data.bskyAppPassword) passwordInput.value = data.bskyAppPassword;

    // Populate selector fields
    const custom = data.customSelectors || {};
    for (const key of SELECTOR_KEYS) {
      const el = document.getElementById(`sel-${key}`);
      if (el) el.value = custom[key] || DEFAULT_SELECTORS[key];
    }

    // Behavior toggles
    includeQuoteUrlToggle.checked = !!data.includeQuoteUrl;
    includeYouTubeCardToggle.checked = data.includeYouTubeCard !== false; // default ON
    youtubeCardThumbnailToggle.checked = data.youtubeCardThumbnail !== false; // default ON
    youtubeCardThumbnailToggle.closest(".row").style.opacity = includeYouTubeCardToggle.checked ? "1" : "0.4";
    youtubeCardThumbnailToggle.disabled = !includeYouTubeCardToggle.checked;

    applyLanguage();
  }
);

// ─── Credentials ─────────────────────────────────────────

function showMessage(el, text, isError = false) {
  el.textContent = text;
  el.className = `message ${isError ? "message--error" : "message--success"}`;
}

saveBtn.addEventListener("click", () => {
  const handle = handleInput.value.trim();
  const password = passwordInput.value.trim();

  if (!handle || !password) {
    showMessage(messageEl, t("msgEmpty"), true);
    return;
  }

  chrome.storage.local.set(
    { bskyHandle: handle, bskyAppPassword: password },
    () => showMessage(messageEl, t("msgSaved"))
  );
});

testBtn.addEventListener("click", () => {
  const handle = handleInput.value.trim();
  const password = passwordInput.value.trim();

  if (!handle || !password) {
    showMessage(messageEl, t("msgEmpty"), true);
    return;
  }

  chrome.storage.local.set({ bskyHandle: handle, bskyAppPassword: password }, () => {
    showMessage(messageEl, t("msgTesting"));
    chrome.runtime.sendMessage({ type: "TEST_LOGIN" }, (res) => {
      if (chrome.runtime.lastError) {
        showMessage(messageEl, t("msgExtError") + chrome.runtime.lastError.message, true);
        return;
      }
      if (res && res.ok) {
        showMessage(messageEl, `${t("msgSuccess")}${res.handle} (${res.did})`);
      } else {
        showMessage(messageEl, `${t("msgFail")}${res?.error || t("msgUnknown")}`, true);
      }
    });
  });
});

// ─── Selector Config ─────────────────────────────────────

saveSelectorsBtn.addEventListener("click", () => {
  const customSelectors = {};
  for (const key of SELECTOR_KEYS) {
    const el = document.getElementById(`sel-${key}`);
    if (el) customSelectors[key] = el.value.trim();
  }
  chrome.storage.local.set({ customSelectors }, () => {
    showMessage(selectorMessageEl,t("msgSelectorsSaved"));
  });
});

resetSelectorsBtn.addEventListener("click", () => {
  for (const key of SELECTOR_KEYS) {
    const el = document.getElementById(`sel-${key}`);
    if (el) el.value = DEFAULT_SELECTORS[key];
  }
  chrome.storage.local.remove("customSelectors", () => {
    showMessage(selectorMessageEl,t("msgSelectorsReset"));
  });
});

// ─── Behavior Toggles ───────────────────────────────────

includeQuoteUrlToggle.addEventListener("change", () => {
  chrome.storage.local.set({ includeQuoteUrl: includeQuoteUrlToggle.checked });
});

includeYouTubeCardToggle.addEventListener("change", () => {
  chrome.storage.local.set({ includeYouTubeCard: includeYouTubeCardToggle.checked });
  youtubeCardThumbnailToggle.closest(".row").style.opacity = includeYouTubeCardToggle.checked ? "1" : "0.4";
  youtubeCardThumbnailToggle.disabled = !includeYouTubeCardToggle.checked;
});

youtubeCardThumbnailToggle.addEventListener("change", () => {
  chrome.storage.local.set({ youtubeCardThumbnail: youtubeCardThumbnailToggle.checked });
});

