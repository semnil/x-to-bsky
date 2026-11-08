import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { createStorage, QUOTA_MESSAGE } from "./storage-stub.js";

// settings.js run against the storage stand-in (test/storage-stub.js), with Node's own Web Locks
// standing in for Chrome's.

/** Everything an earlier version kept in chrome.storage.local. */
const EARLIER = {
  bskyHandle: "alice.test",
  bskyAppPassword: "pw",
  crosspostEnabled: false,
  customSelectors: { postButton: "#post" },
  includeQuoteUrl: true,
  postReplies: true,
  removeInvalidMentions: true,
  includeLinkCard: true,
  linkCardThumbnail: false,
};

/**
 * Wrap `area[method]` so its next call reads storage as it is when called, and answers once `release()`
 * is called; `asked` resolves when that call is made.
 */
function holdNext(area, method) {
  const real = area[method];
  let release;
  let called;
  const asked = new Promise((resolve) => { called = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  area[method] = (...args) => {
    area[method] = real;
    called();
    const answer = real(...args);
    return held.then(() => answer);
  };
  return { asked, release };
}

beforeAll(async () => {
  expect(typeof navigator.locks?.request, "Node provides Web Locks").toBe("function");
  await import("../settings.js");
});

describe("readSettings", () => {
  it("reads the synced settings from sync and the credentials from local", async () => {
    const storage = createStorage();
    storage.areas.sync.postReplies = true;
    Object.assign(storage.areas.local, { bskyHandle: "alice.test", bskyAppPassword: "pw" });
    Object.assign(storage.areas.sync, { bskyHandle: "not-this-one.test", bskyAppPassword: "not this one" });
    expect(await readSettings(["bskyHandle", "bskyAppPassword", "postReplies", "includeQuoteUrl"], storage))
      .toEqual({ bskyHandle: "alice.test", bskyAppPassword: "pw", postReplies: true });
  });

  it("takes sync's value over a copy local still holds", async () => {
    const storage = createStorage();
    storage.areas.sync.postReplies = false;
    storage.areas.local.postReplies = true;
    expect(await readSettings(["postReplies"], storage)).toEqual({ postReplies: false });
  });

  it("reads a synced setting from local while sync does not hold it", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, EARLIER);
    expect(await readSettings(Object.keys(EARLIER), storage)).toEqual(EARLIER);
  });

  it("finds a setting the move puts in sync and clears from local between its reads", async () => {
    const storage = createStorage();
    storage.areas.local.postReplies = true;
    // The read finds sync empty; the move runs before the read goes on to local.
    const sync = holdNext(storage.sync, "get");
    const reading = readSettings(["postReplies"], storage);
    await sync.asked;
    await moveSettingsToSync(storage);
    expect(storage.areas.local).toEqual({});
    sync.release();
    expect(await reading).toEqual({ postReplies: true });
  });
});

describe("moveSettingsToSync", () => {
  it("moves every synced setting into sync and leaves the credentials in local", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, EARLIER, { unrelated: 1 });
    await moveSettingsToSync(storage);
    const { bskyHandle, bskyAppPassword, ...synced } = EARLIER;
    expect(storage.areas.sync).toEqual(synced);
    expect(storage.areas.local).toEqual({ bskyHandle, bskyAppPassword, unrelated: 1 });
  });

  it("keeps the value sync already holds, and drops local's copy", async () => {
    const storage = createStorage();
    storage.areas.sync.crosspostEnabled = false;
    storage.areas.local.crosspostEnabled = true;
    storage.areas.local.postReplies = true;
    await moveSettingsToSync(storage);
    expect(storage.areas.sync).toEqual({ crosspostEnabled: false, postReplies: true });
    expect(storage.areas.local).toEqual({});
  });

  it("leaves a setting sync refuses in local, moves the others, and rejects", async () => {
    const storage = createStorage();
    const customSelectors = { postButton: "x".repeat(9000) };
    Object.assign(storage.areas.local, { customSelectors, postReplies: true });
    await expect(moveSettingsToSync(storage)).rejects.toThrow(QUOTA_MESSAGE);
    expect(storage.areas.sync).toEqual({ postReplies: true });
    expect(storage.areas.local).toEqual({ customSelectors });
    // ...where it is still read.
    expect(await readSettings(["customSelectors"], storage)).toEqual({ customSelectors });
  });

  it("moves includeYouTubeCard and youtubeCardThumbnail as includeLinkCard and linkCardThumbnail", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, { includeYouTubeCard: true, youtubeCardThumbnail: false });
    await moveSettingsToSync(storage);
    expect(storage.areas.sync).toEqual({ includeLinkCard: true, linkCardThumbnail: false });
    expect(storage.areas.local).toEqual({});
  });

  it("keeps the renamed link card settings readable while sync refuses part of the move", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, { includeYouTubeCard: true, youtubeCardThumbnail: false });
    const set = storage.sync.set;
    storage.sync.set = (items, callback) =>
      "linkCardThumbnail" in items ? Promise.reject(new Error("This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.")) : set(items, callback);
    await expect(moveSettingsToSync(storage)).rejects.toThrow("MAX_WRITE_OPERATIONS_PER_MINUTE");
    expect(await readSettings(["includeLinkCard", "linkCardThumbnail"], storage)).toEqual({ includeLinkCard: true, linkCardThumbnail: false });
    storage.sync.set = set;
    await moveSettingsToSync(storage);
    expect(storage.areas.sync).toEqual({ includeLinkCard: true, linkCardThumbnail: false });
    expect(storage.areas.local).toEqual({});
  });

  it("drops includeYouTubeCard and youtubeCardThumbnail where local holds includeLinkCard, on every start", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, { includeLinkCard: true, includeYouTubeCard: true, youtubeCardThumbnail: false });
    const keys = ["includeLinkCard", "linkCardThumbnail"];
    await moveSettingsToSync(storage);
    expect(await readSettings(keys, storage)).toEqual({ includeLinkCard: true });
    await moveSettingsToSync(storage);
    expect(await readSettings(keys, storage)).toEqual({ includeLinkCard: true });
    expect(storage.areas).toEqual({ local: {}, sync: { includeLinkCard: true } });
  });

  it("writes nothing when local holds no synced setting", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, { bskyHandle: "alice.test", bskyAppPassword: "pw" });
    storage.areas.sync.postReplies = true;
    await moveSettingsToSync(storage);
    expect(storage.writes).toEqual([]);
  });
});

describe("writeSettings and removeSettings", () => {
  it("writes the synced settings to sync, drops local's copy, and writes the credentials to local", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, { postReplies: false, bskyHandle: "old.test", bskyAppPassword: "old" });
    await writeSettings({ postReplies: true, bskyHandle: "alice.test", bskyAppPassword: "pw" }, storage);
    expect(storage.areas.sync).toEqual({ postReplies: true });
    expect(storage.areas.local).toEqual({ bskyHandle: "alice.test", bskyAppPassword: "pw" });
  });

  it("rejects with Chrome's reason and writes nothing when sync refuses", async () => {
    const storage = createStorage();
    Object.assign(storage.areas.local, { customSelectors: { postButton: "#old" }, bskyAppPassword: "old" });
    await expect(writeSettings({ customSelectors: { postButton: "x".repeat(9000) }, bskyAppPassword: "pw" }, storage))
      .rejects.toThrow(QUOTA_MESSAGE);
    expect(storage.areas.sync).toEqual({});
    expect(storage.areas.local).toEqual({ customSelectors: { postButton: "#old" }, bskyAppPassword: "old" });
  });

  it("lands a write made while the move is out after the move, so the write stands", async () => {
    const storage = createStorage();
    storage.areas.local.postReplies = false;
    // The move has found sync without postReplies and is about to write local's value.
    const sync = holdNext(storage.sync, "get");
    const moving = moveSettingsToSync(storage);
    await sync.asked;
    const writing = writeSettings({ postReplies: true }, storage);
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    sync.release();
    await Promise.all([moving, writing]);
    expect(storage.areas.sync).toEqual({ postReplies: true });
    expect(storage.areas.local).toEqual({});
  });

  it("rejects a key that is in neither SYNCED_SETTING_KEYS nor LOCAL_SETTING_KEYS, and writes nothing", async () => {
    const storage = createStorage();
    const unknown = /"newSetting" is in neither SYNCED_SETTING_KEYS nor LOCAL_SETTING_KEYS/;
    await expect(readSettings(["bskyHandle", "newSetting"], storage)).rejects.toThrow(unknown);
    await expect(writeSettings({ bskyHandle: "alice.test", newSetting: true }, storage)).rejects.toThrow(unknown);
    await expect(removeSettings(["newSetting"], storage)).rejects.toThrow(unknown);
    expect(storage.writes).toEqual([]);
  });

  it("removes a setting from both areas", async () => {
    const storage = createStorage();
    storage.areas.sync.customSelectors = { postButton: "#a" };
    storage.areas.local.customSelectors = { postButton: "#b" };
    await removeSettings(["customSelectors"], storage);
    expect(storage.areas).toEqual({ local: {}, sync: {} });
  });
});

describe("settingChanges", () => {
  it("keeps the changes of the settings kept in the area the event is for", () => {
    const changes = {
      postReplies: { oldValue: true },
      bskyHandle: { newValue: "alice.test" },
      includeYouTubeCard: { oldValue: true },
      quotaProbe: { newValue: 1 },
    };
    expect(settingChanges(changes, "sync")).toEqual({ postReplies: { oldValue: true } });
    expect(settingChanges(changes, "local")).toEqual({ bskyHandle: { newValue: "alice.test" } });
    expect(settingChanges(changes, "session")).toEqual({});
  });
});

describe("localCopyChanges", () => {
  it("names the synced settings an event in local changes", () => {
    const changes = { postReplies: { oldValue: true }, bskyHandle: { newValue: "alice.test" }, includeYouTubeCard: { oldValue: true } };
    expect(localCopyChanges(changes, "local")).toEqual(["postReplies"]);
    expect(localCopyChanges(changes, "sync")).toEqual([]);
  });
});

describe("linkCardsOn", () => {
  const permissions = (granted) => ({
    contains: async ({ origins }) => granted && origins.length === 1 && origins[0] === "<all_urls>",
  });

  it("is on only where includeLinkCard is set and this Chrome holds <all_urls>", async () => {
    expect(await linkCardsOn({ includeLinkCard: true }, permissions(true))).toBe(true);
    expect(await linkCardsOn({ includeLinkCard: true }, permissions(false))).toBe(false);
    expect(await linkCardsOn({ includeLinkCard: false }, permissions(true))).toBe(false);
    expect(await linkCardsOn({}, permissions(true))).toBe(false);
  });
});

describe("storage access", () => {
  // A setting read or written past settings.js is stored where its own call says, not where
  // SYNCED_SETTING_KEYS says, and a new key would not be synced.
  it("goes through settings.js in every script of the extension", () => {
    const scripts = fs.readdirSync(".").filter((file) => file.endsWith(".js") && file !== "settings.js");
    expect(scripts).toEqual(expect.arrayContaining(["background.js", "content.js", "options.js", "popup.js"]));
    for (const file of scripts) {
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/\bstorage\.(local|sync|session)\.\w+\s*\(/);
    }
  });
});
