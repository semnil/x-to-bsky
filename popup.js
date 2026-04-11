// popup.js

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
