import { describe, it, expect } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { createStorage, QUOTA_MESSAGE } from "./storage-stub.js";

// popup.html and options.html run their scripts (the <script src> they load, in order) in a context
// with a stand-in DOM whose elements are made on first lookup, the storage stand-in
// (test/storage-stub.js), a stubbed chrome.permissions, and Node's own Web Locks.

const RATE_MESSAGE = "This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.";

/** A DOM element with the properties and the event listeners the pages' scripts use. */
class FakeElement {
  constructor(id) {
    Object.assign(this, { id, value: "", checked: false, disabled: false, textContent: "", innerHTML: "", className: "" });
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this.row = { style: {} };
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type) { for (const listener of this.listeners[type] || []) listener({ preventDefault() {} }); }
  closest() { return this.row; }
}

/**
 * Open `html` on `storage`, with `<all_urls>` held where `granted.allUrls` is true; a permission request
 * answers `granted.request`. Returns the element lookup, with the document as `byId.document`.
 */
function open(html, storage, granted = { allUrls: false, request: false }) {
  const elements = {};
  const document = {
    getElementById: (id) => (elements[id] ||= new FakeElement(id)),
    querySelectorAll: () => [],
    documentElement: {},
  };
  const chrome = {
    storage,
    permissions: {
      contains(permissions, callback) {
        const held = permissions.origins[0] === "<all_urls>" && granted.allUrls;
        if (callback) return void setTimeout(callback, 0, held);
        return Promise.resolve(held);
      },
      request(permissions, callback) {
        if (granted.request) granted.allUrls = true;
        setTimeout(callback, 0, granted.request);
      },
      remove() { granted.allUrls = false; },
    },
    runtime: { openOptionsPage() {}, sendMessage() {} },
  };
  const context = vm.createContext({ document, navigator: { language: "en", locks: navigator.locks }, chrome, console, setTimeout });
  const source = fs.readFileSync(html, "utf8");
  for (const [, src] of source.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    vm.runInContext(fs.readFileSync(src, "utf8"), context, { filename: src });
  }
  return Object.assign(document.getElementById, { document });
}

/** Wait until `done()` holds, for at most a second. */
async function until(done) {
  for (let turn = 0; turn < 200 && !done(); turn++) await new Promise((resolve) => setTimeout(resolve, 5));
  return done();
}

/** Wait for every settings write asked for so far to have run. */
const writesDone = () => navigator.locks.request("xtobsky-settings", () => {});

describe("options.html", () => {
  /** Open options.html and wait until it has loaded the settings, which it translates the page after. */
  async function load(storage, granted) {
    const byId = open("options.html", storage, granted);
    expect(await until(() => byId.document.documentElement.lang === "en")).toBe(true);
    return byId;
  }

  it("saves the handle and the App Password to local", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "alice.test";
    const byId = await load(storage);
    expect(byId("handle").value).toBe("alice.test");
    byId("handle").value = "bob.test";
    byId("password").value = "pw";
    byId("save").dispatch("click");
    expect(await until(() => byId("message").textContent === "Saved.")).toBe(true);
    expect(storage.areas).toEqual({ local: { bskyHandle: "bob.test", bskyAppPassword: "pw" }, sync: {} });
  });

  it("stores removeInvalidMentions in sync", async () => {
    const storage = createStorage();
    storage.areas.sync.removeInvalidMentions = true;
    const byId = await load(storage);
    expect(byId("removeInvalidMentions").checked).toBe(true);
    byId("removeInvalidMentions").checked = false;
    byId("removeInvalidMentions").dispatch("change");
    expect(await until(() => storage.areas.sync.removeInvalidMentions === false)).toBe(true);
    expect(storage.areas.local).toEqual({});
  });

  it("shows the link card toggle off where this Chrome lacks <all_urls>, and leaves the stored setting as it is", async () => {
    const storage = createStorage();
    storage.areas.sync.includeLinkCard = true;
    storage.areas.local.includeLinkCard = true;
    const byId = await load(storage, { allUrls: false, request: false });
    await writesDone();
    expect(byId("includeLinkCard").checked).toBe(false);
    expect(byId("linkCardThumbnail").disabled).toBe(true);
    expect(storage.writes).toEqual([]);
  });

  it("leaves the stored setting as it is when the permission is refused", async () => {
    const storage = createStorage();
    storage.areas.sync.includeLinkCard = true;
    storage.areas.local.includeLinkCard = true;
    const byId = await load(storage, { allUrls: false, request: false });
    byId("includeLinkCard").checked = true;
    byId("includeLinkCard").dispatch("change");
    expect(await until(() => byId("includeLinkCard").checked === false)).toBe(true);
    await writesDone();
    expect(storage.writes).toEqual([]);
  });

  it("stores includeLinkCard in sync once the permission is granted", async () => {
    const storage = createStorage();
    const byId = await load(storage, { allUrls: false, request: true });
    byId("includeLinkCard").checked = true;
    byId("includeLinkCard").dispatch("change");
    expect(await until(() => storage.areas.sync.includeLinkCard === true)).toBe(true);
    expect(byId("linkCardThumbnail").disabled).toBe(false);
  });

  it("shows why a toggle was not saved under the toggles, and shows the stored setting again", async () => {
    const storage = createStorage();
    storage.areas.sync.postReplies = false;
    const byId = await load(storage);
    storage.sync.refuse = RATE_MESSAGE;
    byId("postReplies").checked = true;
    byId("postReplies").dispatch("change");
    expect(await until(() => byId("behaviorMessage").textContent !== "")).toBe(true);
    expect(byId("behaviorMessage").textContent).toBe(`Could not save: ${RATE_MESSAGE}`);
    expect(byId("behaviorMessage").className).toBe("message message--error");
    expect(await until(() => byId("postReplies").checked === false)).toBe(true);
    // A later write that lands takes the message down.
    storage.sync.refuse = null;
    byId("postReplies").checked = true;
    byId("postReplies").dispatch("change");
    expect(await until(() => byId("behaviorMessage").className === "message")).toBe(true);
    expect(storage.areas.sync.postReplies).toBe(true);
  });

  it("shows a post option as it is changed elsewhere", async () => {
    const storage = createStorage();
    storage.areas.sync.postReplies = false;
    const byId = await load(storage);
    expect(byId("postReplies").checked).toBe(false);
    await storage.sync.set({ postReplies: true });
    expect(await until(() => byId("postReplies").checked === true)).toBe(true);
  });

  it("keeps showing the latest stored setting when an earlier read answers late", async () => {
    const storage = createStorage();
    storage.areas.sync.postReplies = false;
    const byId = await load(storage);
    // The read the first change starts takes the stored value at once and answers after the second's.
    const get = storage.sync.get;
    let release;
    const late = new Promise((resolve) => { release = resolve; });
    let first = true;
    storage.sync.get = (keys, callback) => {
      const answer = get(keys, callback);
      if (!first) return answer;
      first = false;
      return late.then(() => answer);
    };
    await storage.sync.set({ postReplies: true });
    storage.sync.get = get;
    await storage.sync.set({ postReplies: false });
    await writesDone();
    release();
    // The stand-in storage and permissions answer with resolved promises, so the late read has ended
    // by the next task.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(byId("postReplies").checked).toBe(false);
  });

  it("keeps the link card toggle off when includeLinkCard arrives where this Chrome lacks <all_urls>, and writes nothing", async () => {
    const storage = createStorage();
    const byId = await load(storage, { allUrls: false, request: false });
    await storage.sync.set({ includeLinkCard: true, includeQuoteUrl: true });
    expect(await until(() => byId("includeQuoteUrl").checked === true)).toBe(true);
    await writesDone();
    expect(byId("includeLinkCard").checked).toBe(false);
    expect(storage.writes).toEqual([["sync", "set", ["includeLinkCard", "includeQuoteUrl"]]]);
  });

  it("shows why selectors were not saved", async () => {
    const storage = createStorage();
    const byId = await load(storage);
    byId("sel-postButton").value = "x".repeat(9000);
    byId("saveSelectors").dispatch("click");
    expect(await until(() => byId("selectorMessage").textContent !== "")).toBe(true);
    expect(byId("selectorMessage").textContent).toBe(`Could not save: ${QUOTA_MESSAGE}`);
    expect(storage.areas.sync).toEqual({});
  });
});

describe("popup.html", () => {
  it("shows the handle stored in local and the crosspost toggle stored in sync", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "bob.test";
    storage.areas.sync.crosspostEnabled = false;
    const byId = open("popup.html", storage);
    expect(await until(() => byId("handle").textContent === "@bob.test")).toBe(true);
    expect(byId("toggle").checked).toBe(false);
  });

  it("shows the crosspost toggle as it is changed elsewhere", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "bob.test";
    storage.areas.sync.crosspostEnabled = true;
    const byId = open("popup.html", storage);
    expect(await until(() => byId("handle").textContent === "@bob.test")).toBe(true);
    expect(byId("toggle").checked).toBe(true);
    await storage.sync.set({ crosspostEnabled: false });
    expect(await until(() => byId("toggle").checked === false)).toBe(true);
  });

  it("keeps a crosspost change that arrives while its first read is out", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "bob.test";
    storage.areas.sync.crosspostEnabled = false;
    // The first read of crosspostEnabled takes the stored value at once and answers after the change.
    const get = storage.sync.get;
    let release;
    const late = new Promise((resolve) => { release = resolve; });
    storage.sync.get = (keys, callback) => {
      storage.sync.get = get;
      const answer = get(keys, callback);
      return late.then(() => answer);
    };
    const byId = open("popup.html", storage);
    await storage.sync.set({ crosspostEnabled: true });
    expect(byId("toggle").checked).toBe(true);
    release();
    expect(await until(() => byId("handle").textContent === "@bob.test")).toBe(true);
    expect(byId("toggle").checked).toBe(true);
  });

  it("keeps a crosspost change that arrives while the read after a refused write is out", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "bob.test";
    storage.areas.sync.crosspostEnabled = true;
    const byId = open("popup.html", storage);
    expect(await until(() => byId("handle").textContent === "@bob.test")).toBe(true);
    // The read after the refused write takes the stored value at once and answers after the change.
    const get = storage.sync.get;
    let release;
    let asked;
    const late = new Promise((resolve) => { release = resolve; });
    const reading = new Promise((resolve) => { asked = resolve; });
    storage.sync.get = (keys, callback) => {
      storage.sync.get = get;
      asked();
      const answer = get(keys, callback);
      return late.then(() => answer);
    };
    storage.sync.refuse = RATE_MESSAGE;
    byId("toggle").checked = false;
    byId("toggle").dispatch("change");
    await reading;
    storage.sync.refuse = null;
    await storage.sync.set({ crosspostEnabled: false });
    release();
    expect(await until(() => byId("save-error").textContent !== "")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(byId("toggle").checked).toBe(false);
  });

  it("stores the crosspost toggle in sync", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "bob.test";
    const byId = open("popup.html", storage);
    expect(await until(() => byId("handle").textContent === "@bob.test")).toBe(true);
    byId("toggle").checked = false;
    byId("toggle").dispatch("change");
    expect(await until(() => storage.areas.sync.crosspostEnabled === false)).toBe(true);
  });

  it("shows why the toggle was not saved, and shows the stored setting again", async () => {
    const storage = createStorage();
    storage.areas.local.bskyHandle = "bob.test";
    storage.areas.sync.crosspostEnabled = true;
    const byId = open("popup.html", storage);
    expect(await until(() => byId("toggle").checked === true)).toBe(true);
    storage.sync.refuse = RATE_MESSAGE;
    byId("toggle").checked = false;
    byId("toggle").dispatch("change");
    expect(await until(() => byId("save-error").textContent !== "")).toBe(true);
    expect(byId("save-error").textContent).toBe(`Could not save: ${RATE_MESSAGE}`);
    expect(byId("save-error").style.display).toBe("block");
    expect(await until(() => byId("toggle").checked === true)).toBe(true);
  });
});
