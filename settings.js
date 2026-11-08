// settings.js — Where the settings are stored, and the move of the ones an earlier version kept in
// chrome.storage.local into chrome.storage.sync. Loaded as a classic script before content.js, popup.js
// and options.js, and imported by background.js, so it puts its names on globalThis.

(() => {
  "use strict";

  /**
   * The settings kept in chrome.storage.sync, which Chrome sync carries to the other Chromes the user
   * is signed in to.
   */
  const SYNCED_SETTING_KEYS = Object.freeze([
    "crosspostEnabled",
    "customSelectors",
    "includeQuoteUrl",
    "postReplies",
    "removeInvalidMentions",
    "includeLinkCard",
    "linkCardThumbnail",
  ]);

  /** The settings kept in chrome.storage.local alone: the credentials, so each Chrome has its own account. */
  const LOCAL_SETTING_KEYS = Object.freeze(["bskyHandle", "bskyAppPassword"]);

  /** The names the link card settings had in an earlier version, which kept them in chrome.storage.local. */
  const LEGACY_LINK_CARD_KEYS = Object.freeze(["includeYouTubeCard", "youtubeCardThumbnail"]);

  /** The Web Lock taken by the move to sync and by every settings write, so neither lands inside the other. */
  const SETTINGS_LOCK = "xtobsky-settings";

  /** The host permission link cards fetch pages and thumbnails with, requested on the options page. */
  const LINK_CARD_PERMISSION = Object.freeze({ origins: ["<all_urls>"] });

  /**
   * Whether `key` is kept in chrome.storage.sync (true) or chrome.storage.local (false). Throws for a key
   * in neither SYNCED_SETTING_KEYS nor LOCAL_SETTING_KEYS, so readSettings, writeSettings and
   * removeSettings reject it.
   */
  function isSynced(key) {
    if (SYNCED_SETTING_KEYS.includes(key)) return true;
    if (LOCAL_SETTING_KEYS.includes(key)) return false;
    throw new Error(`"${key}" is in neither SYNCED_SETTING_KEYS nor LOCAL_SETTING_KEYS (settings.js)`);
  }

  /** The entries of `items` whose key `keep` accepts. */
  function entriesWhere(items, keep) {
    return Object.fromEntries(Object.entries(items).filter(([key]) => keep(key)));
  }

  /**
   * Read `keys`: the synced ones from chrome.storage.sync, the local ones from chrome.storage.local.
   * A synced key that sync does not hold is read from local, where an earlier version kept it until
   * moveSettingsToSync moves it. A synced key neither read found is read from sync once more, since the
   * move writes sync and then clears local between the two reads. Keys stored nowhere are left out.
   */
  async function readSettings(keys, storage = chrome.storage) {
    const synced = keys.filter(isSynced);
    const own = keys.filter((key) => !isSynced(key));
    const [fromLocal, fromSync] = await Promise.all([
      own.length ? storage.local.get(own) : {},
      synced.length ? storage.sync.get(synced) : {},
    ]);
    const out = { ...fromLocal, ...fromSync };
    let missing = synced.filter((key) => !(key in out));
    if (missing.length) {
      Object.assign(out, await storage.local.get(missing));
      missing = missing.filter((key) => !(key in out));
    }
    if (missing.length) Object.assign(out, await storage.sync.get(missing));
    return out;
  }

  /**
   * Write `items` under SETTINGS_LOCK: the synced keys to chrome.storage.sync, then removed from
   * chrome.storage.local so no earlier copy is read in their place; the local keys to local. Rejects with
   * Chrome's error when sync refuses the write (an item over QUOTA_BYTES_PER_ITEM, or a write past
   * MAX_WRITE_OPERATIONS_PER_MINUTE / _PER_HOUR), and then writes nothing.
   */
  function writeSettings(items, storage = chrome.storage, locks = navigator.locks) {
    return locks.request(SETTINGS_LOCK, async () => {
      const synced = entriesWhere(items, isSynced);
      const own = entriesWhere(items, (key) => !isSynced(key));
      if (Object.keys(synced).length) {
        await storage.sync.set(synced);
        await storage.local.remove(Object.keys(synced));
      }
      if (Object.keys(own).length) await storage.local.set(own);
    });
  }

  /**
   * The part of a chrome.storage.onChanged event that changes settings kept in `areaName`: the synced
   * keys' changes in "sync", the local keys' changes in "local". A synced key's change in local (the move
   * removing the copy an earlier version kept there) and keys that are no setting are left out.
   */
  function settingChanges(changes, areaName) {
    const keys = areaName === "sync" ? SYNCED_SETTING_KEYS : areaName === "local" ? LOCAL_SETTING_KEYS : [];
    return entriesWhere(changes, (key) => keys.includes(key));
  }

  /** Remove `keys` from both chrome.storage.sync and chrome.storage.local, under SETTINGS_LOCK. */
  function removeSettings(keys, storage = chrome.storage, locks = navigator.locks) {
    return locks.request(SETTINGS_LOCK, async () => {
      const synced = keys.filter(isSynced);
      if (synced.length) await storage.sync.remove(synced);
      await storage.local.remove(keys);
    });
  }

  /**
   * Move the synced settings that chrome.storage.local holds into chrome.storage.sync, under
   * SETTINGS_LOCK. A key sync already holds keeps sync's value, and local's copy is dropped. Each key is
   * written to sync on its own before it is removed from local, so a reader finds it in one of the two,
   * and a key sync refuses stays in local, where readSettings still reads it. includeYouTubeCard and
   * youtubeCardThumbnail, where local holds no includeLinkCard, are moved as includeLinkCard and
   * linkCardThumbnail, and removed once both are in sync. Rejects, once every key has been tried, when
   * sync refused any.
   */
  function moveSettingsToSync(storage = chrome.storage, locks = navigator.locks) {
    return locks.request(SETTINGS_LOCK, async () => {
      const local = await storage.local.get([...SYNCED_SETTING_KEYS, ...LEGACY_LINK_CARD_KEYS]);
      const renamed = local.includeLinkCard === undefined && local.includeYouTubeCard !== undefined;
      if (renamed) {
        local.includeLinkCard = !!local.includeYouTubeCard;
        local.linkCardThumbnail = local.youtubeCardThumbnail !== false;
      }
      const keys = SYNCED_SETTING_KEYS.filter((key) => local[key] !== undefined);
      if (!keys.length) return;
      const inSync = await storage.sync.get(keys);
      const moved = [];
      const refused = [];
      for (const key of keys) {
        if (!(key in inSync)) {
          try {
            await storage.sync.set({ [key]: local[key] });
          } catch (err) {
            refused.push(`${key}: ${err.message}`);
            continue;
          }
        }
        moved.push(key);
      }
      if (renamed && moved.includes("includeLinkCard") && moved.includes("linkCardThumbnail")) {
        moved.push(...LEGACY_LINK_CARD_KEYS);
      }
      if (moved.length) await storage.local.remove(moved);
      if (refused.length) throw new Error(`sync refused ${refused.join("; ")}`);
    });
  }

  /**
   * Whether link cards are made in this Chrome: `settings.includeLinkCard` is set, and this Chrome
   * holds LINK_CARD_PERMISSION.
   */
  async function linkCardsOn(settings, permissions = chrome.permissions) {
    return !!settings.includeLinkCard && await permissions.contains(LINK_CARD_PERMISSION);
  }

  Object.assign(globalThis, {
    SYNCED_SETTING_KEYS,
    LINK_CARD_PERMISSION,
    readSettings,
    writeSettings,
    removeSettings,
    settingChanges,
    moveSettingsToSync,
    linkCardsOn,
  });
})();
