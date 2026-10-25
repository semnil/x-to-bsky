import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// content.js and content.css run in headless Chrome, driven over the DevTools protocol, on a stand-in
// for X's compose toolbar with the extension APIs stubbed (credentials set, crossposting on).
// Chrome is taken from CHROME_PATH or the platform's usual install path; without one, the cases are
// skipped under a name that says so.

const CHROME_PATHS = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  win32: [
    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
  ],
};
const chromePath = [process.env.CHROME_PATH, ...(CHROME_PATHS[process.platform] || [])].find((p) => p && fs.existsSync(p));

const STUB = `window.chrome = {
  runtime: { id: "test", lastError: undefined, sendMessage(msg, cb) { setTimeout(() => cb({}), 0); } },
  storage: { local: { get: (keys, cb) => cb({ bskyHandle: "alice.bsky.social" }) }, onChanged: { addListener() {} } },
};`;

const page = (dir) => {
  const url = (file) => pathToFileURL(path.resolve(file)).href;
  fs.writeFileSync(path.join(dir, "stub.js"), STUB);
  fs.writeFileSync(path.join(dir, "page.html"), `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${url("content.css")}"></head>
<body style="background: #ffffff; padding: 40px">
<div data-testid="tweetTextarea_0"></div>
<button data-testid="tweetButtonInline" type="button">Post</button>
<script src="stub.js"></script><script src="${url("shared.js")}"></script><script src="${url("content.js")}"></script>
</body></html>`);
  return pathToFileURL(path.join(dir, "page.html")).href;
};

/** Start headless Chrome on a DevTools pipe; returns `send(method, params, sessionId)` and `close()`. */
function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "xtobsky-chrome-"));
  const proc = spawn(chromePath, ["--headless=new", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check",
    "--allow-file-access-from-files", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let stderr = "";
  proc.stdio[2].on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  let nextId = 0;
  let buf = "";
  const pending = new Map();
  proc.stdio[4].on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\0")) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      const waiter = pending.get(msg.id);
      if (!waiter) continue;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`${waiter.method}: ${JSON.stringify(msg.error)}`));
      else waiter.resolve(msg.result);
    }
  });
  exited.then((code) => {
    for (const waiter of pending.values()) waiter.reject(new Error(`Chrome exited (${code}) before answering ${waiter.method}: ${stderr.slice(-2000)}`));
    pending.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, method });
    proc.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  const close = async () => {
    if (proc.exitCode === null) await send("Browser.close").catch(() => {});
    const timer = new Promise((resolve) => setTimeout(resolve, 5000, "timeout"));
    if ((await Promise.race([exited, timer])) === "timeout") {
      proc.kill("SIGKILL");
      await exited;
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return { send, close };
}

describe.skipIf(!chromePath)(chromePath ? "post button badge (headless Chrome)" : "post button badge (skipped: no Chrome at CHROME_PATH or the usual install path)", () => {
  let chrome;
  let sessionId;
  let dir;

  /** Evaluate `expression` in the page until `done(value)` holds or `ms` pass; returns the last value. */
  async function until(expression, done, ms = 5000) {
    const deadline = Date.now() + ms;
    for (;;) {
      const { result } = await chrome.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
      if (done(result.value) || Date.now() > deadline) return result.value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const BADGE_FILL = `(() => { const b = document.querySelector('[data-testid="tweetButtonInline"] .xtobsky-badge'); return b ? getComputedStyle(b).backgroundColor : null; })()`;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "xtobsky-page-"));
    chrome = launch();
    const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
    ({ sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true }));
    await chrome.send("Page.navigate", { url: page(dir) }, sessionId);
  }, 30000);

  afterAll(async () => {
    await chrome?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }, 30000);

  it("fills the badge with the page's background color", async () => {
    expect(await until(BADGE_FILL, (fill) => fill === "rgb(255, 255, 255)")).toBe("rgb(255, 255, 255)");
  }, 30000);

  it("refills the badge once the background changes and the DOM changes", async () => {
    await chrome.send("Runtime.evaluate", { expression: `document.body.style.background = "#000000"; document.body.appendChild(document.createElement("div"));` }, sessionId);
    expect(await until(BADGE_FILL, (fill) => fill === "rgb(0, 0, 0)")).toBe("rgb(0, 0, 0)");
  }, 30000);
});
