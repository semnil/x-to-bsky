import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// content.js and content.css run in headless Chrome, driven over the DevTools protocol, on a stand-in
// for X's compose toolbar with the extension APIs stubbed (see stub()).
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

/**
 * The extension APIs the page runs with: chrome.storage over `areas` ({ local, sync }) with onChanged.
 * window.__fireStorageChange(changes, areaName) applies a change to its area and hands it to the
 * listeners. With `holdLocal` naming a key, the first chrome.storage.local read that asks for it answers
 * what the area held when it was made, once window.__releaseLocal() is called; window.__localHeld turns
 * true when that read is made.
 */
const stub = (areas, holdLocal = "") => `window.chrome = {
  runtime: { id: "test", lastError: undefined, sendMessage(msg, cb) { setTimeout(() => cb({}), 0); } },
  storage: (() => {
    const areas = ${JSON.stringify(areas)};
    const listeners = [];
    let release;
    let hold = ${JSON.stringify(holdLocal)};
    const gate = new Promise((resolve) => { release = resolve; });
    window.__localHeld = false;
    window.__releaseLocal = () => release();
    const area = (name) => ({
      get(keys, cb) {
        const out = {};
        for (const key of [].concat(keys)) if (key in areas[name]) out[key] = JSON.parse(JSON.stringify(areas[name][key]));
        const held = name === "local" && hold && [].concat(keys).includes(hold);
        if (held) { hold = ""; window.__localHeld = true; }
        const answer = held ? gate.then(() => out) : Promise.resolve(out);
        if (cb) return void answer.then(cb);
        return answer;
      },
    });
    window.__fireStorageChange = (changes, areaName) => {
      for (const [key, change] of Object.entries(changes)) {
        if ("newValue" in change) areas[areaName][key] = change.newValue;
        else delete areas[areaName][key];
      }
      listeners.forEach((listener) => listener(changes, areaName));
    };
    return { local: area("local"), sync: area("sync"), onChanged: { addListener: (listener) => listeners.push(listener) } };
  })(),
};`;

// Records every readSettings call content.js makes; window.__settle() waits for all of them, and for the
// ones made while it waits.
const READS = `<script>(() => {
  const read = window.readSettings;
  window.__reads = [];
  window.readSettings = (keys) => { const answer = read(keys); window.__reads.push(answer); return answer; };
  window.__settle = async () => {
    for (let seen = -1; seen !== window.__reads.length;) {
      seen = window.__reads.length;
      await Promise.all(window.__reads);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
})();</script>`;

/** Write the stand-in page into `dir`, with `stubSource` for the extension APIs and `extra` in its body; returns its URL. */
const page = (dir, stubSource, extra = "") => {
  const url = (file) => pathToFileURL(path.resolve(file)).href;
  fs.writeFileSync(path.join(dir, "stub.js"), stubSource);
  fs.writeFileSync(path.join(dir, "page.html"), `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${url("content.css")}"></head>
<body style="background: #ffffff; padding: 40px">
<div data-testid="tweetTextarea_0"></div>
<button data-testid="tweetButtonInline" type="button">Post</button>${extra}
<script src="stub.js"></script><script src="${url("shared.js")}"></script><script src="${url("settings.js")}"></script>${READS}<script src="${url("content.js")}"></script>
</body></html>`);
  return pathToFileURL(path.join(dir, "page.html")).href;
};

const HAS_BADGE = `!!document.querySelector(".xtobsky-badge")`;

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
    await chrome.send("Page.navigate", { url: page(dir, stub({ local: { bskyHandle: "alice.bsky.social" }, sync: {} })) }, sessionId);
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

  /**
   * Hand content.js `events` ([changes, areaName] pairs) one after the other, each once the reads the one
   * before led to have settled; whether a badge is shown after each.
   */
  async function fire(...events) {
    const { result } = await chrome.send("Runtime.evaluate", {
      expression: `(async () => {
        const shown = [];
        for (const [changes, areaName] of ${JSON.stringify(events)}) {
          __fireStorageChange(changes, areaName);
          await __settle();
          shown.push(${HAS_BADGE});
        }
        return shown;
      })()`,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    return result.value;
  }

  it("takes no change of the handle in sync, where it is not kept", async () => {
    expect(await until(HAS_BADGE, Boolean)).toBe(true);
    expect(await fire([{ bskyHandle: { oldValue: "alice.bsky.social" } }, "sync"])).toEqual([true]);
  }, 30000);

  it("takes crossposting turned off in sync, and not the move to sync removing its local copy", async () => {
    expect(await fire(
      [{ bskyHandle: { newValue: "alice.bsky.social" } }, "local"],
      [{ crosspostEnabled: { newValue: false } }, "sync"],
      [{ crosspostEnabled: { oldValue: false } }, "local"],
    )).toEqual([true, false, false]);
  }, 30000);

  it("takes the handle removed from local", async () => {
    expect(await fire(
      [{ crosspostEnabled: { oldValue: false, newValue: true } }, "sync"],
      [{ bskyHandle: { oldValue: "alice.bsky.social" } }, "local"],
    )).toEqual([true, false]);
  }, 30000);
});

describe.skipIf(!chromePath)(chromePath ? "content.js reading the settings (headless Chrome)" : "content.js reading the settings (skipped: no Chrome at CHROME_PATH or the usual install path)", () => {
  let chrome;
  let sessionId;
  const dirs = [];

  /** Evaluate `expression` in the page, awaiting a promise it gives. */
  async function evaluate(expression) {
    const { result } = await chrome.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    return result.value;
  }

  /** Open a fresh stand-in page over `areas`, and wait until content.js has asked for its settings. */
  async function load(areas, { holdLocal = "", extra = "" } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xtobsky-page-"));
    dirs.push(dir);
    await chrome.send("Page.navigate", { url: page(dir, stub(areas, holdLocal), extra) }, sessionId);
    const deadline = Date.now() + 5000;
    while (!(await evaluate(`document.readyState === "complete" && window.__reads?.length > 0`))) {
      if (Date.now() > deadline) throw new Error("content.js did not read its settings");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const BADGES = `[!!document.querySelector("#custom-post .xtobsky-badge"), !!document.querySelector('[data-testid="tweetButtonInline"] .xtobsky-badge')]`;

  beforeAll(async () => {
    chrome = launch();
    const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
    ({ sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true }));
  }, 30000);

  afterAll(async () => {
    await chrome?.close();
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }, 30000);

  it("takes what its first read gives", async () => {
    await load({ local: { bskyHandle: "alice.bsky.social" }, sync: { crosspostEnabled: true } }, { holdLocal: "bskyHandle" });
    expect(await evaluate(`(async () => { __releaseLocal(); await __settle(); return ${HAS_BADGE}; })()`)).toBe(true);
  }, 30000);

  it("keeps a change that arrives while its first read is out", async () => {
    await load({ local: { bskyHandle: "alice.bsky.social" }, sync: { crosspostEnabled: true } }, { holdLocal: "bskyHandle" });
    expect(await evaluate(`(async () => {
      __fireStorageChange({ crosspostEnabled: { oldValue: true, newValue: false } }, "sync");
      __releaseLocal();
      await __settle();
      return ${HAS_BADGE};
    })()`)).toBe(false);
  }, 30000);

  it("takes the default selectors once a copy left in local is removed", async () => {
    await load(
      { local: { bskyHandle: "alice.bsky.social", customSelectors: { postButton: "#custom-post" } }, sync: {} },
      { extra: `<button id="custom-post" type="button">Custom</button>` },
    );
    expect(await evaluate(`(async () => { await __settle(); return ${BADGES}; })()`)).toEqual([true, false]);
    expect(await evaluate(`(async () => {
      __fireStorageChange({ customSelectors: { oldValue: { postButton: "#custom-post" } } }, "local");
      await __settle();
      return ${BADGES};
    })()`)).toEqual([false, true]);
  }, 30000);

  it("does not bring back a copy in local removed while its first read is out", async () => {
    // The first read has read the copy from local, and answers after the copy is removed and read again.
    // Until it answers there is no handle, so no badge.
    await load(
      { local: { bskyHandle: "alice.bsky.social", customSelectors: { postButton: "#custom-post" } }, sync: {} },
      { holdLocal: "customSelectors", extra: `<button id="custom-post" type="button">Custom</button>` },
    );
    expect(await evaluate(`(async () => {
      while (!__localHeld) await new Promise((resolve) => setTimeout(resolve, 0));
      __fireStorageChange({ customSelectors: { oldValue: { postButton: "#custom-post" } } }, "local");
      await __reads.at(-1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const afterReset = ${BADGES};
      __releaseLocal();
      await __settle();
      return [afterReset, ${BADGES}];
    })()`)).toEqual([[false, false], [false, true]]);
  }, 30000);
});
