// options.js

// ─── i18n ────────────────────────────────────────────────

const i18n = {
  ja: {
    title: "X to Bluesky — 設定",
    subtitle: 'Bluesky の認証情報を入力してください。<br>App Password を使用します（メインパスワードは使用しません）。',
    handleLabel: "Bluesky ハンドル",
    handlePlaceholder: "yourname.bsky.social",
    handleHint: "例: yourname.bsky.social",
    passwordLabel: "App Password",
    passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
    passwordHint: 'Bluesky → <strong>設定</strong> → <strong>プライバシーとセキュリティ</strong> → <strong>アプリパスワード</strong> で発行できます',
    saveBtn: "保存",
    testBtn: "接続テスト",
    securityNote: '<strong>セキュリティについて</strong><br>• ハンドルと App Password はこのパソコンの chrome.storage.local に保存され、この拡張のみがアクセスします。<br>• その他の設定は chrome.storage.sync に保存されます。Chrome の同期がオンのとき、Chrome はこれらを Google の同期サービスへ送り、同じアカウントでログインしている他の Chrome と共有します。<br>• この拡張が認証情報を送る先は bsky.social のみです。リンクカード有効時は対象 URL のメタデータを取得しますが、認証情報やユーザーデータは送信しません。<br>• アプリパスワードは Bluesky の 設定 → プライバシーとセキュリティ → アプリパスワード からいつでも無効化できます。',
    msgEmpty: "ハンドルと App Password を入力してください。",
    msgSaved: "保存しました。",
    msgSaveFailed: "保存できませんでした: ",
    msgTesting: "接続テスト中...",
    msgExtError: "拡張エラー: ",
    msgSuccess: "接続成功 — ",
    msgFail: "接続失敗: ",
    msgUnknown: "不明なエラー",
    // Advanced
    advancedTitle: "高度な設定 — DOM セレクタ",
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
    postRepliesLabel: "リプライを Bluesky にポストする",
    postRepliesHint: "他のポストへの返信も Bluesky にクロスポストします",
    removeInvalidMentionsLabel: "存在しないメンションを削除する",
    removeInvalidMentionsHint: "Bluesky に存在しないハンドルへのメンション (@handle) を本文から取り除いて投稿します",
    includeLinkCardLabel: "リンクカードを Bluesky に表示",
    includeLinkCardHint: "URL を含むポストにサムネイル付きリンクカードを自動添付します",
    includeLinkCardPermNote: "有効化時にウェブサイトへのアクセス権限が求められます。無効化すると権限は自動で解除されます",
    linkCardThumbnailLabel: "サムネイル画像を含める",
    linkCardThumbnailHint: "無効にするとタイトルのみのリンクカードになります",
  },
  en: {
    title: "X to Bluesky — Settings",
    subtitle: 'Enter your Bluesky credentials below.<br>Uses an App Password (not your main password).',
    handleLabel: "Bluesky Handle",
    handlePlaceholder: "yourname.bsky.social",
    handleHint: "e.g. yourname.bsky.social",
    passwordLabel: "App Password",
    passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
    passwordHint: 'Bluesky → <strong>Settings</strong> → <strong>Privacy and security</strong> → <strong>App passwords</strong>',
    saveBtn: "Save",
    testBtn: "Test Connection",
    securityNote: '<strong>Security</strong><br>• The handle and the App Password are stored in chrome.storage.local on this computer, accessible only by this extension.<br>• The other settings are stored in chrome.storage.sync. With Chrome sync on, Chrome sends them to Google\'s sync service and shares them with the other Chromes signed in to the same account.<br>• This extension sends the credentials only to bsky.social. When link cards are enabled, metadata is fetched from linked URLs, but no credentials or user data are sent.<br>• You can revoke the App Password anytime in Bluesky under Settings → Privacy and security → App passwords.',
    msgEmpty: "Please enter your handle and App Password.",
    msgSaved: "Saved.",
    msgSaveFailed: "Could not save: ",
    msgTesting: "Testing connection...",
    msgExtError: "Extension error: ",
    msgSuccess: "Connected — ",
    msgFail: "Connection failed: ",
    msgUnknown: "Unknown error",
    // Advanced
    advancedTitle: "Advanced — DOM Selectors",
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
    postRepliesLabel: "Post replies to Bluesky",
    postRepliesHint: "Also cross-posts replies to other posts to Bluesky",
    removeInvalidMentionsLabel: "Remove mentions that do not exist",
    removeInvalidMentionsHint: "Removes @mentions of handles that do not exist on Bluesky from the text before posting",
    includeLinkCardLabel: "Show link cards on Bluesky",
    includeLinkCardHint: "Automatically attaches a thumbnail link card when your post contains a URL",
    includeLinkCardPermNote: "Enabling this will request web access permission. Disabling removes the permission automatically",
    linkCardThumbnailLabel: "Include thumbnail image",
    linkCardThumbnailHint: "When disabled, creates a title-only link card",
  },
};

function t(key) {
  return translate(i18n, key);
}

// DEFAULT_SELECTORS, renderIcons, translate, applyMessages and errorText are provided by shared.js, and
// readSettings, writeSettings, removeSettings, settingChanges, localCopyChanges, linkCardsOn and
// LINK_CARD_PERMISSION by settings.js (both loaded before this file).

const SELECTOR_KEYS = Object.keys(DEFAULT_SELECTORS);

renderIcons();

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
const postRepliesToggle = document.getElementById("postReplies");
const removeInvalidMentionsToggle = document.getElementById("removeInvalidMentions");
const includeLinkCardToggle = document.getElementById("includeLinkCard");
const linkCardThumbnailToggle = document.getElementById("linkCardThumbnail");
const behaviorMessageEl = document.getElementById("behaviorMessage");


// ─── Load Settings ───────────────────────────────────────

const TOGGLE_KEYS = ["includeQuoteUrl", "postReplies", "removeInvalidMentions", "includeLinkCard", "linkCardThumbnail"];
// The renderToggles calls made so far: a call shows what it read only while it is the latest
let renderCount = 0;

/**
 * Show the stored behavior settings on their toggles. The link card toggle is on only where link cards
 * are made in this Chrome (linkCardsOn): a stored includeLinkCard, which may come from another Chrome
 * through Chrome sync, shows off here while this Chrome does not hold the permission, and stays stored.
 */
async function renderToggles() {
  const render = ++renderCount;
  const data = await readSettings(TOGGLE_KEYS);
  const linkCards = await linkCardsOn(data);
  if (render !== renderCount) return;
  includeQuoteUrlToggle.checked = !!data.includeQuoteUrl;
  postRepliesToggle.checked = !!data.postReplies;
  removeInvalidMentionsToggle.checked = !!data.removeInvalidMentions;
  linkCardThumbnailToggle.checked = data.linkCardThumbnail !== false;
  includeLinkCardToggle.checked = linkCards;
  updateLinkCardSubToggle();
}

// Show the toggles as stored again when their settings change in another tab, or in another Chrome
// through Chrome sync. The text fields keep what is typed in them.
chrome.storage.onChanged.addListener((changes, areaName) => {
  const changed = [...Object.keys(settingChanges(changes, areaName)), ...localCopyChanges(changes, areaName)];
  if (changed.some((key) => TOGGLE_KEYS.includes(key))) renderToggles();
});

Promise.all([
  readSettings(["bskyHandle", "bskyAppPassword", "customSelectors"]).then((data) => {
    if (data.bskyHandle) handleInput.value = data.bskyHandle;
    if (data.bskyAppPassword) passwordInput.value = data.bskyAppPassword;

    // Populate selector fields
    const custom = data.customSelectors || {};
    for (const key of SELECTOR_KEYS) {
      const el = document.getElementById(`sel-${key}`);
      if (el) el.value = custom[key] || DEFAULT_SELECTORS[key];
    }
  }),
  renderToggles(),
]).finally(() => applyMessages(i18n));

function updateLinkCardSubToggle() {
  linkCardThumbnailToggle.closest(".row").style.opacity = includeLinkCardToggle.checked ? "1" : "0.8";
  linkCardThumbnailToggle.disabled = !includeLinkCardToggle.checked;
}

// ─── Credentials ─────────────────────────────────────────

function showMessage(el, text, isError = false) {
  el.textContent = text;
  el.className = `message ${isError ? "message--error" : "message--success"}`;
}

/** Empty `el` and hide it again. */
function hideMessage(el) {
  el.textContent = "";
  el.className = "message";
}

saveBtn.addEventListener("click", () => {
  const handle = handleInput.value.trim();
  const password = passwordInput.value.trim();

  if (!handle || !password) {
    showMessage(messageEl, t("msgEmpty"), true);
    return;
  }

  writeSettings({ bskyHandle: handle, bskyAppPassword: password }).then(
    () => showMessage(messageEl, t("msgSaved")),
    (err) => showMessage(messageEl, t("msgSaveFailed") + err.message, true)
  );
});

testBtn.addEventListener("click", () => {
  const handle = handleInput.value.trim();
  const password = passwordInput.value.trim();

  if (!handle || !password) {
    showMessage(messageEl, t("msgEmpty"), true);
    return;
  }

  writeSettings({ bskyHandle: handle, bskyAppPassword: password }).then(() => {
    showMessage(messageEl, t("msgTesting"));
    chrome.runtime.sendMessage({ type: "TEST_LOGIN" }, (res) => {
      if (chrome.runtime.lastError) {
        showMessage(messageEl, t("msgExtError") + chrome.runtime.lastError.message, true);
        return;
      }
      if (res && res.ok) {
        showMessage(messageEl, `${t("msgSuccess")}${res.handle} (${res.did})`);
      } else {
        showMessage(messageEl, `${t("msgFail")}${errorText(res) || t("msgUnknown")}`, true);
      }
    });
  }, (err) => showMessage(messageEl, t("msgSaveFailed") + err.message, true));
});

// ─── Selector Config ─────────────────────────────────────

saveSelectorsBtn.addEventListener("click", () => {
  const customSelectors = {};
  for (const key of SELECTOR_KEYS) {
    const el = document.getElementById(`sel-${key}`);
    if (el) customSelectors[key] = el.value.trim();
  }
  writeSettings({ customSelectors }).then(
    () => showMessage(selectorMessageEl, t("msgSelectorsSaved")),
    (err) => showMessage(selectorMessageEl, t("msgSaveFailed") + err.message, true)
  );
});

resetSelectorsBtn.addEventListener("click", () => {
  for (const key of SELECTOR_KEYS) {
    const el = document.getElementById(`sel-${key}`);
    if (el) el.value = DEFAULT_SELECTORS[key];
  }
  removeSettings(["customSelectors"]).then(
    () => showMessage(selectorMessageEl, t("msgSelectorsReset")),
    (err) => showMessage(selectorMessageEl, t("msgSaveFailed") + err.message, true)
  );
});

// ─── Behavior Toggles ───────────────────────────────────

/**
 * Store a toggle's setting. A write that sync refuses shows Chrome's reason under the toggles, which
 * then show the stored settings again.
 */
function saveToggle(items) {
  return writeSettings(items).then(
    () => hideMessage(behaviorMessageEl),
    (err) => {
      showMessage(behaviorMessageEl, t("msgSaveFailed") + err.message, true);
      return renderToggles();
    }
  );
}

includeQuoteUrlToggle.addEventListener("change", () => {
  saveToggle({ includeQuoteUrl: includeQuoteUrlToggle.checked });
});

postRepliesToggle.addEventListener("change", () => {
  saveToggle({ postReplies: postRepliesToggle.checked });
});

removeInvalidMentionsToggle.addEventListener("change", () => {
  saveToggle({ removeInvalidMentions: removeInvalidMentionsToggle.checked });
});

includeLinkCardToggle.addEventListener("change", () => {
  if (includeLinkCardToggle.checked) {
    // Request broad host permission so background.js can fetch OGP metadata
    chrome.permissions.request(LINK_CARD_PERMISSION, (granted) => {
      if (granted) {
        saveToggle({ includeLinkCard: true });
      } else {
        // User denied — revert the toggle, and leave the stored setting as it is
        includeLinkCardToggle.checked = false;
      }
      updateLinkCardSubToggle();
    });
  } else {
    saveToggle({ includeLinkCard: false });
    // Optionally remove the broad permission when disabled
    chrome.permissions.remove(LINK_CARD_PERMISSION);
    updateLinkCardSubToggle();
  }
});

linkCardThumbnailToggle.addEventListener("change", () => {
  saveToggle({ linkCardThumbnail: linkCardThumbnailToggle.checked });
});

