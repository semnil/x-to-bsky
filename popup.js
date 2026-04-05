// popup.js

const toggle = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const handleEl = document.getElementById("handle");
const notConfigured = document.getElementById("not-configured");
const settingsLink = document.getElementById("settings-link");

// Load state
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
  if (!res) return;

  toggle.checked = res.enabled;

  if (res.configured) {
    statusEl.style.display = "block";
    handleEl.textContent = `@${res.handle}`;
  } else {
    notConfigured.style.display = "block";
  }
});

// Toggle handler
toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ crosspostEnabled: enabled });

  // Notify all x.com tabs
  chrome.tabs.query({ url: ["*://x.com/*", "*://twitter.com/*"] }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_CROSSPOST", enabled });
    }
  });
});

// Settings link
settingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
