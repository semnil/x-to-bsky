// popup.js

const i18n = {
  ja: {
    notConfigured: "未設定。設定画面で Bluesky 認証情報を入力してください。",
    connectedTo: "接続先:",
    crosspostLabel: "クロスポスト",
    openSettings: "設定を開く",
  },
  en: {
    notConfigured: "Not set up. Enter your Bluesky credentials on the settings page.",
    connectedTo: "Connected as:",
    crosspostLabel: "Crosspost",
    openSettings: "Open settings",
  },
};

// renderIcons and applyMessages are provided by shared.js (loaded before this file).
applyMessages(i18n);
renderIcons();

const toggle = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const handleEl = document.getElementById("handle");
const notConfigured = document.getElementById("not-configured");
const settingsLink = document.getElementById("settings-link");

// Load state directly from storage (avoids service worker wake-up issues)
chrome.storage.local.get(["bskyHandle", "crosspostEnabled"], (data) => {
  toggle.checked = data.crosspostEnabled !== false;

  if (data.bskyHandle) {
    statusEl.style.display = "block";
    handleEl.textContent = `@${data.bskyHandle}`;
  } else {
    notConfigured.style.display = "block";
  }
});

// Toggle handler — storage.onChanged in content.js picks up the change automatically
toggle.addEventListener("change", () => {
  chrome.storage.local.set({ crosspostEnabled: toggle.checked });
});

// Settings link
settingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
