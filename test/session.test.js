import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// background.js runs with a stubbed `chrome` (the credentials in chrome.storage.local) and a stubbed
// `fetch` standing in for bsky.social: createSession logs in as the identifier it is given (and refuses
// the password "wrong"), refreshSession answers a refresh token it issued with that account's session
// again, and createRecord records the repo and the token a post was made with. While `held` is set, an
// authentication request whose URL matches it waits for it before it is answered.

const areas = { local: {}, sync: {} };
let listener = null;
const logins = [];
const refreshes = [];
const records = [];
let held = null;

/**
 * Make the next authentication requests whose URL matches `endpoint` wait until `release()`; `reached`
 * resolves when the first of them is made.
 */
function holdAuthentication(endpoint = /(createSession|refreshSession)$/) {
  let release;
  let asked;
  const reached = new Promise((resolve) => { asked = resolve; });
  held = { endpoint, gate: new Promise((resolve) => { release = resolve; }), asked };
  return { reached, release: () => { held = null; release(); } };
}

/** Let the calls already made run up to the requests they make (storage reads answer at once). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

/** Cross-post `text` and resolve with the response. */
function post(text) {
  return new Promise((resolve) => listener({ type: "POST_TO_BSKY", thread: [{ text, images: [] }] }, {}, resolve));
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
    const authentication = /\/xrpc\/com\.atproto\.server\.(createSession|refreshSession)$/.test(requestUrl);
    if (authentication && held?.endpoint.test(requestUrl)) {
      const { gate, asked } = held;
      asked();
      await gate;
    }
    if (requestUrl.endsWith("/xrpc/com.atproto.server.createSession")) {
      const body = JSON.parse(init.body);
      logins.push(body);
      if (body.password === "wrong") return json({ error: "AuthenticationRequired", message: "Invalid identifier or password" }, 401);
      return json(sessionOf(body.identifier));
    }
    if (requestUrl.endsWith("/xrpc/com.atproto.server.refreshSession")) {
      const token = init.headers.Authorization.replace(/^Bearer /, "");
      refreshes.push(token);
      return token.startsWith("ref-") ? json(sessionOf(token.slice(4))) : json({ error: "InvalidToken" }, 400);
    }
    if (requestUrl.endsWith("/xrpc/com.atproto.repo.createRecord")) {
      records.push({ repo: JSON.parse(init.body).repo, token: init.headers.Authorization });
      return json({ uri: "at://did:example:x/app.bsky.feed.post/1", cid: "cid" });
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
  records.length = 0;
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

describe("an authentication in flight", () => {
  it("is shared by a call with the same credentials", async () => {
    const { reached, release } = holdAuthentication();
    const first = testLogin();
    await reached;
    const second = testLogin();
    await settle();
    release();
    expect(await first).toMatchObject({ ok: true, handle: "alice.test" });
    expect(await second).toMatchObject({ ok: true, handle: "alice.test" });
    expect(refreshes).toEqual(["ref-alice.test"]);
    expect(logins).toEqual([]);
  });

  it("is not used by a call made after the credentials changed", async () => {
    const { reached, release } = holdAuthentication();
    const first = testLogin();
    await reached;
    Object.assign(areas.local, { bskyHandle: "bob.test", bskyAppPassword: "pw-bob" });
    const second = testLogin();
    await settle();
    release();
    expect(await first).toMatchObject({ ok: true, handle: "alice.test" });
    expect(await second).toMatchObject({ ok: true, handle: "bob.test" });
    expect(logins).toEqual([{ identifier: "bob.test", password: "pw-bob" }]);
  });

  it("does not answer for a new App Password that bsky.social refuses", async () => {
    const { reached, release } = holdAuthentication();
    const first = testLogin();
    await reached;
    areas.local.bskyAppPassword = "wrong";
    const second = testLogin();
    await settle();
    release();
    expect(await first).toMatchObject({ ok: true, handle: "alice.test" });
    expect(await second).toMatchObject({ ok: false, code: "authFailed" });
  });

  it("does not carry a post asked for after the credentials changed to the previous account", async () => {
    const { reached, release } = holdAuthentication();
    const first = testLogin();
    await reached;
    Object.assign(areas.local, { bskyHandle: "bob.test", bskyAppPassword: "pw-bob" });
    const posting = post("hello");
    await settle();
    release();
    await first;
    expect(await posting).toMatchObject({ ok: true });
    expect(records).toEqual([{ repo: "did:example:bob.test", token: "Bearer acc-bob.test" }]);
  });

  it("with other credentials ends before a call with new credentials authenticates", async () => {
    // alice's refresh is answered after bob's login would have been, if bob's did not wait for it.
    const { reached, release } = holdAuthentication(/refreshSession$/);
    const first = testLogin();
    await reached;
    Object.assign(areas.local, { bskyHandle: "bob.test", bskyAppPassword: "pw-bob" });
    const second = testLogin();
    await settle();
    release();
    expect(await first).toMatchObject({ ok: true, handle: "alice.test" });
    expect(await second).toMatchObject({ ok: true, handle: "bob.test" });
    expect(await testLogin()).toMatchObject({ ok: true, handle: "bob.test" });
  });

  it("that fails leaves the next call to log in", async () => {
    areas.local.bskyAppPassword = "wrong";
    expect(await testLogin()).toMatchObject({ ok: false, code: "authFailed" });
    expect(await testLogin()).toMatchObject({ ok: false, code: "authFailed" });
    areas.local.bskyAppPassword = "pw-alice";
    expect(await testLogin()).toMatchObject({ ok: true, handle: "alice.test" });
    expect(logins.map((login) => login.password)).toEqual(["wrong", "wrong", "pw-alice"]);
  });
});
