// A stand-in for chrome.storage with a `local` and a `sync` area, answering the way Chrome does:
// a read gives a copy of the keys an area holds; a sync item whose key and JSON exceed
// QUOTA_BYTES_PER_ITEM is refused with Chrome's message, and a set holding one writes nothing;
// onChanged is told, with the area's name, of the keys whose value a write changed.

export const QUOTA_BYTES_PER_ITEM = 8192;
export const QUOTA_MESSAGE = "Resource::kQuotaBytesPerItem quota exceeded";

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * A fresh storage. `areas.local` / `areas.sync` are what each area holds; an area's `refuse`, while set,
 * is the message every set and remove on it is refused with; `writes` lists each set and remove as
 * `[areaName, method, keys]`.
 */
export function createStorage() {
  const areas = { local: {}, sync: {} };
  const listeners = [];
  const writes = [];
  const refusals = { local: null, sync: null };

  const answer = (promise, callback) => {
    if (!callback) return promise;
    promise.then(callback, () => callback());
    return undefined;
  };

  const notify = (areaName, changes) => {
    if (Object.keys(changes).length) for (const listener of listeners) listener(changes, areaName);
  };

  const area = (areaName) => ({
    get(keys, callback) {
      const data = areas[areaName];
      const wanted = keys == null ? Object.keys(data) : typeof keys === "string" ? [keys] : keys;
      const out = {};
      for (const key of wanted) if (key in data) out[key] = copy(data[key]);
      return answer(Promise.resolve(out), callback);
    },
    set(items, callback) {
      return answer((async () => {
        writes.push([areaName, "set", Object.keys(items)]);
        if (refusals[areaName]) throw new Error(refusals[areaName]);
        if (areaName === "sync") {
          for (const [key, value] of Object.entries(items)) {
            if (key.length + JSON.stringify(value).length > QUOTA_BYTES_PER_ITEM) throw new Error(QUOTA_MESSAGE);
          }
        }
        const changes = {};
        for (const [key, value] of Object.entries(items)) {
          const before = areas[areaName][key];
          if (JSON.stringify(before) === JSON.stringify(value)) continue;
          areas[areaName][key] = copy(value);
          changes[key] = before === undefined ? { newValue: copy(value) } : { oldValue: before, newValue: copy(value) };
        }
        notify(areaName, changes);
      })(), callback);
    },
    remove(keys, callback) {
      return answer((async () => {
        const list = typeof keys === "string" ? [keys] : keys;
        writes.push([areaName, "remove", list]);
        if (refusals[areaName]) throw new Error(refusals[areaName]);
        const changes = {};
        for (const key of list) {
          if (!(key in areas[areaName])) continue;
          changes[key] = { oldValue: areas[areaName][key] };
          delete areas[areaName][key];
        }
        notify(areaName, changes);
      })(), callback);
    },
    set refuse(message) { refusals[areaName] = message; },
  });

  return {
    areas,
    writes,
    local: area("local"),
    sync: area("sync"),
    onChanged: { addListener: (listener) => listeners.push(listener) },
  };
}
