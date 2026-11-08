// popup.js

const i18n = {
  ja: {
    notConfigured: "未設定。設定画面で Bluesky 認証情報を入力してください。",
    connectedTo: "接続先:",
    crosspostLabel: "クロスポスト",
    openSettings: "設定を開く",
    saveFailed: "保存できませんでした: ",
  },
  en: {
    notConfigured: "Not set up. Enter your Bluesky credentials on the settings page.",
    connectedTo: "Connected as:",
    crosspostLabel: "Crosspost",
    openSettings: "Open settings",
    saveFailed: "Could not save: ",
  },
};

// renderIcons, translate and applyMessages are provided by shared.js, and readSettings, writeSettings and
// settingChanges by settings.js (both loaded before this file).
applyMessages(i18n);
renderIcons();

const toggle = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const handleEl = document.getElementById("handle");
const notConfigured = document.getElementById("not-configured");
const settingsLink = document.getElementById("settings-link");
const saveError = document.getElementById("save-error");
// How many crosspostEnabled changes have arrived: a read shows the setting only where none arrived while it was out
let crosspostChanges = 0;

/** Show the stored crosspostEnabled read with `data`, where no change arrived since the read started at `changes`. */
function showCrosspost(data, changes) {
  if (changes === crosspostChanges) toggle.checked = data.crosspostEnabled !== false;
}

// Load state directly from storage (avoids service worker wake-up issues)
const loadChanges = crosspostChanges;
readSettings(["bskyHandle", "crosspostEnabled"]).then((data) => {
  showCrosspost(data, loadChanges);

  if (data.bskyHandle) {
    statusEl.style.display = "block";
    handleEl.textContent = `@${data.bskyHandle}`;
  } else {
    notConfigured.style.display = "block";
  }
});

// Toggle handler — storage.onChanged in content.js picks up the change automatically. A write that
// sync refuses shows Chrome's reason, and the toggle shows the stored setting again.
toggle.addEventListener("change", () => {
  writeSettings({ crosspostEnabled: toggle.checked }).then(
    () => {
      saveError.style.display = "none";
    },
    async (err) => {
      saveError.textContent = translate(i18n, "saveFailed") + err.message;
      saveError.style.display = "block";
      const changes = crosspostChanges;
      showCrosspost(await readSettings(["crosspostEnabled"]), changes);
    }
  );
});

// Show the crosspost setting as stored when it changes on another page, or in another Chrome through
// Chrome sync.
chrome.storage.onChanged.addListener((changes, areaName) => {
  const change = settingChanges(changes, areaName).crosspostEnabled;
  if (!change) return;
  crosspostChanges++;
  toggle.checked = change.newValue !== false;
});

// Settings link
settingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
