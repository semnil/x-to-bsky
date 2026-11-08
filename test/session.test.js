import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// background.js runs with a stubbed `chrome` (the credentials in chrome.storage.local) and a stubbed
// `fetch` standing in for bsky.social: createSession logs in as the identifier it is given, and
// refreshSession answers a refresh token it issued with that account's session again.

const areas = { local: {}, sync: {} };
let listener = null;
const logins = [];
const refreshes = [];

/** A chrome.storage area over `data`, answering by callback or promise. */
function area(data) {
  return {
    get(keys, callback) {
      const out = {};
      for (const key of keys == null ? Object.keys(data) : [].concat(keys)) if (key in data) out[key] = data[key];
      if (callback) return void callback(out);
      return Promise.resolve(out);
    },
    set(items, callback) { Object.assign(data, items); callback?.(); return Promise.resolve(); },
    remove(keys, callback) { for (const key of [].concat(keys)) delete data[key]; callback?.(); return Promise.resolve(); },
  };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/** The session bsky.social gives `handle`. */
const sessionOf = (handle) => ({ did: `did:example:${handle}`, handle, accessJwt: `acc-${handle}`, refreshJwt: `ref-${handle}` });

/** Send TEST_LOGIN to background.js and resolve with its response. */
function testLogin() {
  return new Promise((resolve) => listener({ type: "TEST_LOGIN" }, {}, resolve));
}

beforeAll(async () => {
  globalThis.chrome = {
    storage: { local: area(areas.local), sync: area(areas.sync), onChanged: { addListener() {} } },
    permissions: { contains: async () => false },
    runtime: {
      onMessage: { addListener(handler) { listener = handler; } },
      onInstalled: { addListener() {} },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/xrpc/com.atproto.server.createSession")) {
      const body = JSON.parse(init.body);
      logins.push(body);
      return json(sessionOf(body.identifier));
    }
    if (requestUrl.endsWith("/xrpc/com.atproto.server.refreshSession")) {
      const token = init.headers.Authorization.replace(/^Bearer /, "");
      refreshes.push(token);
      return token.startsWith("ref-") ? json(sessionOf(token.slice(4))) : json({ error: "InvalidToken" }, 400);
    }
    return new Response("not found", { status: 404 });
  };
  await import("../background.js");
});

beforeEach(async () => {
  // Start every case from a session made with alice's credentials.
  Object.assign(areas.local, { bskyHandle: "alice.test", bskyAppPassword: "pw-alice" });
  await testLogin();
  logins.length = 0;
  refreshes.length = 0;
});

describe("the cached session", () => {
  it("is refreshed while the credentials stay the same", async () => {
    const res = await testLogin();
    expect(res).toMatchObject({ ok: true, handle: "alice.test" });
    expect(refreshes).toEqual(["ref-alice.test"]);
    expect(logins).toEqual([]);
  });

  it("is replaced by a login with the new credentials once the handle changes", async () => {
    Object.assign(areas.local, { bskyHandle: "bob.test", bskyAppPassword: "pw-bob" });
    const res = await testLogin();
    expect(res).toMatchObject({ ok: true, handle: "bob.test" });
    expect(logins).toEqual([{ identifier: "bob.test", password: "pw-bob" }]);
  });

  it("is replaced by a login with the new handle once only the handle changes", async () => {
    areas.local.bskyHandle = "bob.test";
    const res = await testLogin();
    expect(res).toMatchObject({ ok: true, handle: "bob.test" });
    expect(logins).toEqual([{ identifier: "bob.test", password: "pw-alice" }]);
  });

  it("is replaced by a login with the new App Password once only the App Password changes", async () => {
    areas.local.bskyAppPassword = "pw-alice-2";
    const res = await testLogin();
    expect(res).toMatchObject({ ok: true, handle: "alice.test" });
    expect(logins).toEqual([{ identifier: "alice.test", password: "pw-alice-2" }]);
  });
});
