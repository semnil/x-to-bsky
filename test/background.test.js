import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// background.js runs with a stubbed `chrome` (link cards on, thumbnails on, <all_urls> granted)
// and a stubbed `fetch` that serves `pages`, and is driven through its onMessage listener.

const store = {};
let listener = null;
let pages = {};
let handles = {};
let handleLookups = [];
const requested = [];
const uploads = [];
const records = [];

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/**
 * A stubbed response for `url`. A page with `redirectTo` redirects there: with `redirect: "error"`
 * the fetch fails as a network error, otherwise the target is requested and served.
 */
function respond(url, init) {
  requested.push(url);
  const page = pages[url];
  if (!page) return new Response("not found", { status: 404 });
  if (page.redirectTo) {
    if (init.redirect === "error") throw new TypeError("Failed to fetch");
    return respond(page.redirectTo, init);
  }
  const res = new Response(page.body, { status: 200, headers: { "content-type": page.type } });
  Object.defineProperty(res, "url", { value: url });
  return res;
}

/** Cross-post `text` and return the record that createRecord received. */
function post(text) {
  return new Promise((resolve, reject) => {
    listener({ type: "POST_TO_BSKY", thread: [{ text, images: [] }] }, {}, (res) => {
      if (!res?.ok) reject(new Error(res?.error));
      else resolve(records.at(-1).record);
    });
  });
}

/** Cross-post `thread` and return the whole response. */
function postThreadResponse(thread) {
  return new Promise((resolve) => {
    listener({ type: "POST_TO_BSKY", thread }, {}, resolve);
  });
}

/** Cross-post `text` and return the whole response. */
function postResponse(text) {
  return postThreadResponse([{ text, images: [] }]);
}

const html = (props) =>
  `<html><head>${Object.entries(props).map(([name, value]) => `<meta property="og:${name}" content="${value}">`).join("")}</head><body></body></html>`;

beforeAll(async () => {
  Object.assign(store, { bskyHandle: "alice.test", bskyAppPassword: "pw", includeLinkCard: true });
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const out = {};
          for (const key of [].concat(keys)) if (key in store) out[key] = store[key];
          if (callback) { callback(out); return undefined; }
          return Promise.resolve(out);
        },
        set(obj, callback) { Object.assign(store, obj); callback?.(); return Promise.resolve(); },
        remove(keys, callback) { for (const key of [].concat(keys)) delete store[key]; callback?.(); return Promise.resolve(); },
      },
    },
    permissions: { contains: async () => true },
    runtime: {
      onMessage: { addListener(handler) { listener = handler; } },
      onInstalled: { addListener() {} },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/xrpc/com.atproto.server.createSession")) {
      return json({ did: "did:example:alice", handle: "alice.test", accessJwt: "acc", refreshJwt: "ref" });
    }
    if (requestUrl.endsWith("/xrpc/com.atproto.repo.uploadBlob")) {
      uploads.push(Buffer.from(init.body).toString("utf8"));
      return json({ blob: { $type: "blob", ref: { $link: "bafy" }, mimeType: init.headers["Content-Type"], size: 1 } });
    }
    if (requestUrl.endsWith("/xrpc/com.atproto.repo.createRecord")) {
      const body = JSON.parse(init.body);
      records.push(body);
      return json({ uri: `at://${body.repo}/app.bsky.feed.post/1`, cid: "cid" });
    }
    if (requestUrl.includes("/xrpc/com.atproto.identity.resolveHandle")) {
      const handle = new URL(requestUrl).searchParams.get("handle");
      handleLookups.push(handle);
      const answer = handles[handle];
      if (answer === "error") throw new TypeError("Failed to fetch");
      if (answer === "unavailable") return new Response("{}", { status: 503 });
      if (!answer) return json({ error: "InvalidRequest", message: "Unable to resolve handle" }, 400);
      return json({ did: answer });
    }
    return respond(requestUrl, init);
  };
  await import("../background.js");
});

beforeEach(() => {
  pages = {};
  handles = {};
  handleLookups = [];
  delete store.removeInvalidMentions;
  requested.length = 0;
  uploads.length = 0;
  records.length = 0;
});

describe("link card destinations", () => {
  it("attaches a thumbnail served from a public host", async () => {
    pages["https://pub.example/page"] = { type: "text/html", body: html({ title: "Page", image: "https://img.example/ok.png" }) };
    pages["https://img.example/ok.png"] = { type: "image/png", body: "PUBLIC-IMAGE" };
    const record = await post("see https://pub.example/page");
    expect(record.embed.external.title).toBe("Page");
    expect(record.embed.external.thumb).toBeDefined();
    expect(uploads).toEqual(["PUBLIC-IMAGE"]);
  });

  it("does not fetch a thumbnail on a loopback address", async () => {
    pages["https://pub.example/page"] = { type: "text/html", body: html({ title: "Page", image: "http://127.0.0.1:8080/a.png" }) };
    pages["http://127.0.0.1:8080/a.png"] = { type: "image/png", body: "LOCAL-IMAGE" };
    const record = await post("see https://pub.example/page");
    expect(requested).not.toContain("http://127.0.0.1:8080/a.png");
    expect(record.embed.external.thumb).toBeUndefined();
    expect(uploads).toEqual([]);
  });

  it("does not fetch a linked page on a private address", async () => {
    pages["http://192.168.1.1/"] = { type: "text/html", body: html({ title: "Local page" }) };
    const record = await post("see http://192.168.1.1/");
    expect(requested).not.toContain("http://192.168.1.1/");
    expect(record.embed.external.uri).toBe("http://192.168.1.1/");
    expect(record.embed.external.title).toBe("");
  });

  it("does not fetch a linked page on the Chrome Web Store", async () => {
    const url = "https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop?utm_source=item-share-x";
    pages[url] = { type: "text/html", body: html({ title: "Store page" }) };
    const record = await post(`see ${url}`);
    expect(requested).not.toContain(url);
    expect(record.embed.external.uri).toBe(url);
    expect(record.embed.external.title).toBe("");
  });

  it("does not fetch a thumbnail on the Chrome Web Store", async () => {
    pages["https://pub.example/page"] = { type: "text/html", body: html({ title: "Page", image: "https://chrome.google.com/webstore/a.png" }) };
    pages["https://chrome.google.com/webstore/a.png"] = { type: "image/png", body: "STORE-IMAGE" };
    const record = await post("see https://pub.example/page");
    expect(requested).not.toContain("https://chrome.google.com/webstore/a.png");
    expect(record.embed.external.title).toBe("Page");
    expect(record.embed.external.thumb).toBeUndefined();
    expect(uploads).toEqual([]);
  });

  it("does not follow a linked page's redirect to a private address", async () => {
    pages["https://pub.example/moved"] = { redirectTo: "http://10.0.0.5/" };
    pages["http://10.0.0.5/"] = { type: "text/html", body: html({ title: "Local page" }) };
    const record = await post("see https://pub.example/moved");
    expect(requested).not.toContain("http://10.0.0.5/");
    expect(record.embed.external.title).toBe("");
    expect(record.embed.external.thumb).toBeUndefined();
  });

  it("does not follow a thumbnail's redirect to a private address", async () => {
    pages["https://pub.example/page"] = { type: "text/html", body: html({ title: "Page", image: "https://img.example/moved.png" }) };
    pages["https://img.example/moved.png"] = { redirectTo: "http://10.0.0.5/a.png" };
    pages["http://10.0.0.5/a.png"] = { type: "image/png", body: "LOCAL-IMAGE" };
    const record = await post("see https://pub.example/page");
    expect(requested).not.toContain("http://10.0.0.5/a.png");
    expect(record.embed.external.thumb).toBeUndefined();
    expect(uploads).toEqual([]);
  });

  it("does not follow redirects to a public address either", async () => {
    pages["https://pub.example/moved"] = { redirectTo: "https://pub.example/final" };
    pages["https://pub.example/final"] = { type: "text/html", body: html({ title: "Final", image: "https://img.example/ok.png" }) };
    pages["https://img.example/ok.png"] = { type: "image/png", body: "PUBLIC-IMAGE" };
    const record = await post("see https://pub.example/moved");
    expect(requested).not.toContain("https://pub.example/final");
    expect(record.embed.external.title).toBe("");
    expect(uploads).toEqual([]);
  });

  it("does not upload a thumbnail response that is not an image", async () => {
    pages["https://pub.example/page"] = { type: "text/html", body: html({ title: "Page", image: "https://img.example/data" }) };
    pages["https://img.example/data"] = { type: "application/json", body: "{\"a\":1}" };
    const record = await post("see https://pub.example/page");
    expect(record.embed.external.thumb).toBeUndefined();
    expect(uploads).toEqual([]);
  });
});

describe("removing mentions that do not exist", () => {
  const mentionDids = (record) =>
    (record.facets || []).flatMap((f) => f.features).filter((f) => f.$type === "app.bsky.richtext.facet#mention").map((f) => f.did);

  it("keeps the text as written while the option is off", async () => {
    const record = await post("hi @ghost.test");
    expect(record.text).toBe("hi @ghost.test");
    expect(handleLookups).toEqual(["ghost.test"]);
  });

  it("does not link the handle at the start of an X username while the option is off", async () => {
    handles["alice.test"] = "did:example:alice";
    const record = await post("see @alice.test_x now");
    expect(record.text).toBe("see @alice.test_x now");
    expect(record.facets).toBeUndefined();
    expect(handleLookups).toEqual([]);
  });

  it("removes a mention the service says does not resolve", async () => {
    store.removeInvalidMentions = true;
    handles["real.test"] = "did:example:real";
    const record = await post("hi @ghost.test and @real.test");
    expect(record.text).toBe("hi and @real.test");
    expect(mentionDids(record)).toEqual(["did:example:real"]);
  });

  it("removes a handle that is not a valid handle", async () => {
    store.removeInvalidMentions = true;
    const record = await post("@nodots hello");
    expect(record.text).toBe("hello");
  });

  it("keeps a mention whose lookup failed", async () => {
    store.removeInvalidMentions = true;
    handles["flaky.test"] = "error";
    handles["down.test"] = "unavailable";
    const record = await post("@flaky.test @down.test hi");
    expect(record.text).toBe("@flaky.test @down.test hi");
  });

  it("removes an X username with underscores whole", async () => {
    store.removeInvalidMentions = true;
    const record = await post("hello @foo_bar @_foobar @foobar_ world");
    expect(record.text).toBe("hello world");
    expect(handleLookups).toContain("foo_bar");
  });

  it("keeps the text after an existing mention and two or more dots", async () => {
    store.removeInvalidMentions = true;
    handles["real.test"] = "did:example:real";
    const record = await post("Hi @real.test...thanks!");
    expect(record.text).toBe("Hi @real.test...thanks!");
    expect(handleLookups).not.toContain("real.test...thanks");
    expect(mentionDids(record)).toEqual(["did:example:real"]);
  });

  it("keeps the images of a post whose text is left empty", async () => {
    store.removeInvalidMentions = true;
    const image = { base64: "data:image/png;base64,SU1BR0U=", mimeType: "image/png", width: 2, height: 1 };
    const res = await postThreadResponse([{ text: "@foo_bar", images: [image] }]);
    expect(res.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].record.text).toBe("");
    expect(records[0].record.embed.images).toHaveLength(1);
    expect(uploads).toEqual(["IMAGE"]);
  });

  it("starts the thread at the next post when the first is left empty", async () => {
    store.removeInvalidMentions = true;
    const res = await postThreadResponse([{ text: "@foo_bar", images: [] }, { text: "next", images: [] }]);
    expect(res.ok).toBe(true);
    expect(res.postCount).toBe(1);
    expect(records.map((r) => r.record.text)).toEqual(["next"]);
    expect(records[0].record.reply).toBeUndefined();
  });

  it("fails with a message when no text is left", async () => {
    store.removeInvalidMentions = true;
    const res = await postResponse("@ghost.test");
    expect(res.ok).toBe(false);
    expect(res.code).toBe("nothingToPost");
    expect(records).toEqual([]);
  });
});
