import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// background.js runs with a stubbed `chrome` (link cards on, thumbnails on, <all_urls> granted)
// and a stubbed `fetch` that serves `pages`, and is driven through its onMessage listener.

const store = {};
let listener = null;
let pages = {};
const requested = [];
const uploads = [];
const records = [];

const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });

/** A stubbed response for `url`; `finalUrl` stands for the URL a followed redirect ended at. */
function respond(url) {
  const page = pages[url];
  if (!page) return new Response("not found", { status: 404 });
  const res = new Response(page.body, { status: 200, headers: { "content-type": page.type } });
  Object.defineProperty(res, "url", { value: page.finalUrl || url });
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
    requested.push(requestUrl);
    return respond(requestUrl);
  };
  await import("../background.js");
});

beforeEach(() => {
  pages = {};
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

  it("ignores a linked page whose redirect ends on a private address", async () => {
    pages["https://pub.example/moved"] = { type: "text/html", body: html({ title: "Local page" }), finalUrl: "http://10.0.0.5/" };
    const record = await post("see https://pub.example/moved");
    expect(record.embed.external.title).toBe("");
    expect(record.embed.external.thumb).toBeUndefined();
  });

  it("ignores a thumbnail whose redirect ends on a private address", async () => {
    pages["https://pub.example/page"] = { type: "text/html", body: html({ title: "Page", image: "https://img.example/moved.png" }) };
    pages["https://img.example/moved.png"] = { type: "image/png", body: "LOCAL-IMAGE", finalUrl: "http://10.0.0.5/a.png" };
    const record = await post("see https://pub.example/page");
    expect(record.embed.external.thumb).toBeUndefined();
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
