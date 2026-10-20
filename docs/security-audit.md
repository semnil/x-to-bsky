# Security audit report — X to Bluesky Crossposter

**Date**: 2026-04-05 (updated 2026-04-09, updated 2026-04-10, updated 2026-04-12, updated 2026-04-29, updated 2026-10-11, updated 2026-10-20)
**Scope**: all source files (manifest.json, background.js, lib.js, content.js, shared.js, options.js, options.html, popup.js, popup.html)
**Method**: OWASP Top 10 for Browser Extensions, Chrome MV3 security model review, analysis of AT Protocol credential handling

---

## Overview

This Chrome extension cross-posts from X (Twitter) to Bluesky. It stores a Bluesky App Password locally and communicates with the `bsky.social` API endpoints. With the link card feature enabled, it fetches OGP metadata from arbitrary URLs (dynamic permissions through `optional_host_permissions`). No serious vulnerability was found. Medium- to low-risk findings are listed below.

**Overall risk rating: LOW**

---

## 1. Credential storage

### 1.1 App Password stored in plain text in chrome.storage.local (MEDIUM)

- **Location**: `options.js`, `background.js`
- **Details**: the Bluesky App Password is saved in `chrome.storage.local` in plain text. `chrome.storage.local` is not encrypted at rest and is stored as is in a LevelDB database inside the Chrome profile directory.
- **Impact**: an attacker who gains file system access to the Chrome profile can read the App Password.
- **Mitigating factors**:
  - An App Password has a limited scope (it cannot delete the account or change the password)
  - An App Password can be revoked individually in Bluesky's settings
  - `chrome.storage.local` is accessible only to this extension (enforced by Chrome)
  - `chrome.storage.sync` is not used (the credentials are not synced to Google's cloud)

### 1.2 Session tokens are held only in memory (GOOD)

- **Location**: `background.js` (`let session = null`)
- **Details**: `accessJwt` and `refreshJwt` are kept only in JavaScript memory and are not saved to `chrome.storage`. They are discarded when the service worker terminates.
- **Assessment**: correct implementation. A fresh login happens when the service worker restarts.

---

## 2. Permission analysis

### 2.1 Manifest permissions (GOOD)

```json
"permissions": ["storage"],
"host_permissions": [
  "https://bsky.social/*",
  "https://*.bsky.network/*"
],
"optional_host_permissions": ["<all_urls>"]
```

- **Assessment**: the required permissions are minimal. The only API permission is `storage`. The required host_permissions are only the Bluesky domains.
- No sensitive permissions such as `tabs`, `webRequest`, `cookies` or `history`.
- `<all_urls>` is declared as `optional_host_permissions`. No permission is requested at install time. Web access permission is granted all at once when the link card feature is enabled on the options page, and removed automatically when it is disabled.
- The service worker checks the permission with `chrome.permissions.contains()` and skips fetches to domains that are not permitted (posting without a card).
- Link card feature: used to fetch OGP metadata (reading only the `<head>` of an arbitrary URL), and to download thumbnail images and re-upload them to Bluesky.

### 2.2 Content script scope (GOOD)

```json
"matches": ["https://x.com/*", "https://twitter.com/*"]
```

- The content script is injected only into X/Twitter pages.
- No unnecessary page access.

---

## 3. Cross-site scripting (XSS) analysis

### 3.1 innerHTML and i18n-html (LOW)

- **Location**: `shared.js:applyMessages()`, elements with the `data-i18n-html` attribute in `options.html`
- **Details**: `applyMessages()` sets `el.innerHTML = translate(messages, key)` on `data-i18n-html` elements. The i18n values contain HTML (`<strong>` tags). `popup.html` has no `data-i18n-html` elements; its messages are set with `textContent`.
- **Assessment**: safe — the i18n strings are hard-coded in the source code and are not user input. However, if the i18n values were ever externalized or loaded from storage, this would become an XSS vector.

### 3.2 Toasts use textContent (GOOD)

- **Location**: `content.js:showToast()`
- **Details**: `toast.textContent = message` — uses textContent, not innerHTML. No XSS impact.

---

## 4. Message passing security

### 4.1 No sender validation (LOW)

- **Location**: `background.js:chrome.runtime.onMessage.addListener()`
- **Details**: the `onMessage` handler does not validate the sender (tab / extension ID). Any content script on a matched page can send a message.
- **Assessment**: low risk:
  - Only this extension's content scripts can send messages to this extension's background
  - The `matches` pattern is limited to x.com/twitter.com
  - Messages only trigger Bluesky API actions that use the saved credentials
  - **2026-04-12 update**: `popup.js` dropped `chrome.runtime.sendMessage` and moved to reading `chrome.storage.local` directly. The `TOGGLE_CROSSPOST` message and `chrome.tabs.sendMessage` were removed. The only messages reaching background.js are `POST_TO_BSKY` and `TEST_LOGIN`, which shrank the attack surface.
- **Verdict**: acceptable. Sender (`sender.id`) validation is not added.

### 4.2 Thread data from the content script is trusted (LOW)

- **Details**: `msg.thread` from the content script is used as is. If the content script were compromised (for example by a DOM-based XSS on x.com), arbitrary text/images could be posted to Bluesky.
- **Assessment**: the attack surface is the x.com page itself. If x.com has an XSS vulnerability, the attacker has far broader access than this extension.

---

## 5. Network security

### 5.1 All traffic over HTTPS (GOOD)

- Bluesky API: `https://bsky.social` — no HTTP fallback.
- Link cards: fetch the URLs contained in the user's post text. HTTP URLs can also be fetched, but no credentials are sent.

### 5.2 Credentials go only to limited destinations (GOOD)

- The App Password is sent only in the body of the `createSession` request to `bsky.social`.
- Access tokens are sent only in the `Authorization: Bearer` header to `bsky.social`.
- External URL fetches for link cards contain no credentials at all.

### 5.3 External URL fetches (LOW)

- The API endpoint is hard-coded in the `BSKY_SERVICE` constant.
- `resolveHandle` uses `encodeURIComponent()` for the handle parameter — no injection risk.
- The oEmbed URL parameter is escaped with `encodeURIComponent()`.
- **Link cards**: URLs extracted from the user's post text are fetched with `fetch()`. The attack surface is limited to the user's own input. Only the OGP response up to the HTML `</head>` (at most 32KB) is read, and only `og:title`/`og:description`/`og:image` are used. No JavaScript is executed.

---

## 6. Data exposure

### 6.0 Security review of content.js changes (2026-04-09) (INFORMATIONAL)

#### `getVisibleRect(img)` — getComputedStyle / injection risk

- **Details**: reads `objectFit` and `objectPosition` with `getComputedStyle(img)` and computes the crop region drawn to the canvas.
- **Assessment**: safe. `getComputedStyle` only reads layout information and performs no DOM writes or eval. The `objectPosition` value (`parseFloat`) is handled as a number, so there is no string injection risk. When `img.clientWidth`/`clientHeight` is 0, it falls back to `{ sx:0, sy:0, sw:nw, sh:nh }`, so neither division by zero nor infinity propagation occurs.

#### `captureImageToBase64` — tainted canvas / data leakage

- **Details**: the `drawImage` call changed from `(img, 0, 0, w, h)` to `(img, sx, sy, sw, sh, 0, 0, w, h)` (the overload that specifies the source rectangle explicitly).
- **Assessment**: as before, cross-origin images (`pbs.twimg.com` etc.) make the canvas tainted and `canvas.toDataURL()` throws. The `catch` block returns `null`, so cross-origin image data never leaks out. Capture still succeeds only for local attachments (`blob:` URLs), unchanged. `getVisibleRect` opens no new cross-origin access path to the canvas.

#### `sendMessageWithWakeup` — timeout abuse / race condition

- **Details**: changed so that both the `GET_STATUS` callback and `setTimeout(send, 1000)` call `send()`. The `sent` flag ensures only one of them actually sends.
- **Assessment**:
  - The `sent` flag is a local variable in the same closure scope and cannot be manipulated from outside.
  - The timeout is the browser's `setTimeout`, and an attacker cannot call `send()` directly from a page script (it is a closure inside the IIFE scope).
  - Even if the timeout fires first, the later `GET_STATUS` callback returns immediately with `sent === true`, so there is no duplicate send.
  - `chrome.runtime.sendMessage` reaches only this extension's service worker, so there is no risk of message spoofing (guaranteed by MV3's extension isolation).
  - The 1000ms timeout is neither too short nor long enough to delay the UI's response. It cannot be used as a DoS vector.

#### `handlePostClick` — context invalidation guard

- **Details**: added a guard clause that returns early when `chrome.runtime?.id` is falsy, and a `try/catch` around the whole `sendMessageWithWakeup` call.
- **Assessment**: when an old content script keeps running after the extension is reloaded, `chrome.runtime` is invalidated and throws. This defensive implementation handles that safely with the `chrome.runtime?.id` check and the `catch` block. There is no room for a bypass — `chrome.runtime.id` is a property managed by Chrome and cannot be spoofed from a page script (the `chrome.runtime` object is a separate binding exclusive to content scripts). The feedback to the user ("please reload this page") is appropriate.

### 6.1 Addition of the aspectRatio field (2026-04-10) (INFORMATIONAL)

- **Location**: `content.js:captureImageToBase64()`, `background.js:createPost()`
- **Details**: changed the return value of `captureImageToBase64` from `string` to `{ base64, width, height }`, so that it returns the actual dimensions after drawing to the canvas (positive integers after `Math.round`). `createPost` attaches them to `app.bsky.embed.images` as the AT Protocol `aspectRatio: { width, height }` field.
- **Assessment**:
  - **Whether the values can be manipulated**: `width`/`height` are taken from `canvas.width`/`canvas.height`. The canvas size is decided inside `captureImageToBase64`, for example with `Math.round(img.clientWidth * dpr)`, and there is no path for an external script to rewrite it directly. The content script runs in an IIFE scope, so page scripts cannot swap its variables.
  - **AT Protocol injection**: the values of the `aspectRatio` field are limited to positive integers. Bluesky's lexicon (`app.bsky.embed.images#aspectRatio`) defines `width`/`height` as type `integer`, so there is no injection vector through strings or nested objects. They are also emitted as numbers when serialized to JSON.
  - **Prototype pollution**: the spread operator in `{ ...(condition ? { aspectRatio: { width, height } } : {}) }` creates a new object. The `{}` literal inherits from `Object.prototype`, but the spread source is our own object literal, so no `__proto__` or getter can be mixed in. No AT Protocol library is used, and prototype pollution cannot propagate along the `JSON.stringify` → `fetch` path.
  - **Information exposure**: an image's width and height are only metadata and contain no sensitive information. The canvas content itself (base64) is already sent, so sending the dimensions as well does not widen the attack surface.

### 6.2 Migration of state initialization to direct storage reads (2026-04-12) (INFORMATIONAL)

- **Location**: the initialization block of `content.js`, the initialization block of `popup.js`
- **Changes**:
  - `content.js`: removed `sendMessageWithRetry({ type: "GET_STATUS" })` and the `TOGGLE_CROSSPOST` handler of `chrome.runtime.onMessage`. Changed to fetching `crosspostEnabled`, `bskyHandle`, `includeQuoteUrl` and `customSelectors` at once with `chrome.storage.local.get`. Extended the `chrome.storage.onChanged` listener to also track changes to `crosspostEnabled`, `bskyHandle` and `customSelectors`.
  - `popup.js`: removed `chrome.runtime.sendMessage({ type: "GET_STATUS" })`. Reads directly with `chrome.storage.local.get`. Removed the `TOGGLE_CROSSPOST` broadcast through `chrome.tabs.sendMessage`.

#### When `storage.onChanged`'s `newValue` is `undefined`

- **Details**: when a key is deleted with `chrome.storage.local.remove()`, the change entry in `onChanged` has no `newValue` (`undefined`).
- **Assessment**:
  - `changes.crosspostEnabled.newValue !== false` → `undefined !== false` → `true`. Deleting the key returns enabled to the default (`true`). Accepted as the intended behavior.
  - `!!changes.bskyHandle.newValue` → `false`. Deleting the key makes configured `false`. Correct behavior.
  - `!!changes.includeQuoteUrl.newValue` → `false`. Correct behavior.
  - `changes.customSelectors.newValue ? ... : { ...DEFAULT_SELECTORS }` → resets to the defaults on the falsy branch. Correct behavior.
  - **Overall assessment**: the implementation handles `undefined` safely for every field.

#### Defaults when `chrome.storage.local.get` fails

- **Details**: on a Chrome error, the callback receives an empty object `{}`.
- **Assessment**: `enabled = true` (a safe default), `configured = false` (treated as credentials not set), `includeQuoteUrl = false`, `selectors = DEFAULT_SELECTORS`. When get fails it runs in the not-configured state, so it never tries to post with wrong credentials.

#### Race condition: `storage.local.get` callback vs `storage.onChanged`

- **Details**: if `storage.onChanged` fires before the `storage.local.get` callback returns (for example together with a popup operation), the later `get` callback may overwrite the value set by `onChanged` with an old value.
- **Assessment**: Chrome's storage API runs inside the single-threaded renderer process and is queued in order on the JavaScript event loop's task queue. If a `set` runs after the `storage.local.get` is sent, the value the `get` callback receives is either the latest value after the `set`, or `onChanged` fires first and then the `get` callback fires. In either case the final state only sets the same value twice, and a scenario where a stale old value overwrites it does not occur in Chrome's internal implementation. **S3 (theoretical) — no practical problem.**

### 6.3 Shortened URL display and separation of the facet URI (2026-04-29) (INFORMATIONAL)

- **Location**: `lib.js:shortenUrlsInText()`, `lib.js:buildShortenedUrlFacets()`, `background.js:createPost()`
- **Changes**: URLs contained in text over 300 graphemes are converted to a shortened display (`https://` removed + path truncated + `...`). Changed to a split approach that stores the shortened display in the text and the original percent-encoded URL in the facet's `uri` field.
- **Assessment**:
  - **Trustworthiness of the facet URI**: `urlEntries[].original` is exactly the URL the content script extracted from X's DOM. `shortenUrlsInText` only keeps the value of a URL detected with `URL_RE_GLOBAL` after `cleanUrlMatch` removes trailing punctuation, and does not alter the URL. There is no path for an attacker to swap `original` from a page script (IIFE scope + content script isolation).
  - **Accuracy of byte offsets**: `buildShortenedUrlFacets` computes the UTF-8 byte offsets of the shortened text with `buildByteOffsetMap`. `charStart`/`charEnd` are tracked exactly while the strings are concatenated inside `shortenUrlsInText`. No invalid text range caused by misaligned offsets occurs.
  - **Interaction with splitText**: when the text is split by `splitText` after URL shortening, each chunk's `urlEntries` are searched again with `chunk.indexOf(entry.display)`. This assumes `display` is unique within the shortened text, but even when the same URL appears several times, the in-order search of `indexOf` handles it correctly.

### 6.4 Base64 image data in memory while posting (INFORMATIONAL)

- **Details**: the whole image data (base64) passes through the Chrome message channel between the content script and the service worker. It stays only in memory and is not persisted.
- **Assessment**: acceptable. The images come from the user's own compose area.

### 6.5 External traffic for link cards (LOW-MEDIUM)

- **Location**: `background.js:fetchOgpMetadata()`, `background.js:uploadThumbnail()`
- **Details**: when a post containing a URL is made, external traffic occurs to generate the link card:
  1. `fetch()` of the target URL to parse the OGP meta tags in the HTML `<head>`
  2. Download of the thumbnail image (og:image)
- **Assessment**:
  - No credentials are ever sent to external sites
  - The HTML response is read only up to `</head>` (at most 32KB), and no JavaScript is executed
  - Only `title`/`description`/`image` are extracted from OGP. Other fields are ignored
  - The thumbnail image is only sent to Bluesky through `uploadBlob` — it is not persisted locally
  - Only URLs contained in the text the user posted trigger it (the extension never communicates on its own)
  - Uses `optional_host_permissions`. Works only when the user has explicitly granted the permission
  - A 5-second timeout is set
- **Mitigations**: disabled by default. A permission dialog is shown when it is enabled on the options page. Disabling only the thumbnail is also possible.

### 6.6 State synchronization of the post button badge (2026-10-11) (INFORMATIONAL)

- **Location**: `content.js:syncBadges()`, `content.js:removeBadges()`, the `storage.onChanged` listener in `content.js`
- **Changes**: a badge is put on the post button only when crossposting is ON and credentials are set; otherwise every badge is removed. Changes to `crosspostEnabled`, `bskyHandle` and `customSelectors`, and the initial load, are reflected on existing buttons. The OFF badge (`.xtobsky-badge--off`) was dropped.
- **Assessment**:
  - **DOM insertion**: the badge is only a `span` containing the SVG that `createIcon()` (shared.js) builds with `createElementNS`. The path data are fixed constants in shared.js, and there is no path that writes a page-derived value into the DOM. The check icon of the success toast is also made with the same `createIcon()`.
  - **DOM removal**: `removeBadges()` removes only elements with the `.xtobsky-badge` class and does not touch X's elements.
  - **Permissions**: no additional permissions or traffic.

---

## 7. Content Security Policy

### 7.1 No explicit CSP in the manifest (INFORMATIONAL)

- **Details**: manifest.json has no `content_security_policy` key. MV3 enforces a default CSP that blocks inline scripts and `eval()`.
- **Assessment**: MV3's default CSP is sufficient. No inline scripts are used.

---

## 8. Supply chain / dependencies

### 8.1 Zero external dependencies (GOOD)

- No npm packages, CDN scripts or external resources are loaded.
- All code is first-party.
- **Assessment**: no supply-chain attack surface.

---

## 9. Good points of the design

- **ES module separation**: the pure functions are extracted into `lib.js`. The service worker uses `"type": "module"` for strict scope separation.
- **Shared uploadBlob**: the common logic of `uploadImage` and `uploadThumbnail` is consolidated into `uploadBlob()`. Handling of the auth token is concentrated in one place, which makes review and maintenance easy.
- **Quote repost URL feature**: disabled by default. The extracted URL is validated with a strict regular expression (`STATUS_URL_RE`). No vector for script injection.
- **Real-time reflection of setting changes**: the `chrome.storage.onChanged` listener reads only extension-scoped booleans. No security concern.
- **Fetching OGP for link cards**: stream-reads only up to the HTML `</head>` (at most 32KB). The 5-second timeout is kept from the start of the fetch until the stream read completes (`AbortController`). Supports detecting the charset from Content-Type. No JavaScript execution.
- **Optional permissions**: `optional_host_permissions` + `chrome.permissions.request()` grant the permission when the toggle on the options page is turned on. It is removed automatically with `chrome.permissions.remove()` when disabled.
- **Session reuse for thread posts**: `postThread()` passes the session obtained once to every post. Removes unnecessary re-authentication and storage reads during a thread post.
- **Settings migration**: old setting keys are migrated automatically in `chrome.runtime.onInstalled`. The old keys are deleted after the migration.
- **Service worker startup handling (2026-04-12 update)**: reworked the handling of MV3's inactive service worker problem. Changed the initial state retrieval of `popup.js` and `content.js` from `chrome.runtime.sendMessage (GET_STATUS)` to reading `chrome.storage.local.get` directly. No service worker startup is needed, and neither callback delays nor retry races occur. Posting (`POST_TO_BSKY`) still uses `sendMessageWithWakeup()`, keeping the wakeup approach that starts the service worker with a ping before sending. `sendMessageWithRetry` (sending `GET_STATUS` with retries) has been removed.

---

## Findings

| # | Finding | Severity | Status |
|---|------|--------|------|
| 1.1 | App Password stored in plain text in chrome.storage.local | MEDIUM | Accepted risk — stated in the UI |
| 3.1 | innerHTML and i18n-html values | LOW | Safe (developer-controlled strings) |
| 4.1 | No sender validation in the message handler | LOW | Acceptable (MV3 enforces isolation) |
| 4.2 | Data from the content script is trusted | LOW | Acceptable (x.com trust boundary) |
| 5.3 | External URL fetches for link cards | LOW | Triggered by user input, parses head only |
| 6.0 | content.js changes (getVisibleRect / sendMessageWithWakeup / context guard) | INFO | No issue — see §6.0 for details |
| 6.1 | aspectRatio field added (canvas dimensions sent to the AT Protocol) | INFO | No issue — see §6.1 for details |
| 6.2 | Migration to direct storage reads (newValue=undefined / get failure / race) | INFO | No issue — see §6.2 for details |
| 6.3 | Shortened URL display and facet URI separation (text and facet values differ) | INFO | No issue — see §6.3 for details |
| 6.5 | External traffic for link cards | LOW-MEDIUM | Disabled by default, optional_host_permissions |
| 6.6 | State synchronization of the post button badge (inserting a fixed SVG, removing only its own class) | INFO | No issue — see §6.6 for details |

**No CRITICAL or HIGH findings.**

---

## 10. Terms of Service risk analysis

### 10.1 X (Twitter) — scraping and automation clauses (MEDIUM)

- **Relevant clauses**: X Terms of Service — prohibition of accessing the service by automated means, restrictions on redistributing content
- **Details**:
  - X's ToS broadly prohibits scraping and does not distinguish between reading the DOM and API access
  - The prohibition of accessing the service "by automated means" may apply to the capture phase click hook
  - The restrictions on redistributing "X Content" may apply to posting the user's own content to another platform
- **Assessment**: the form is that users post content they created themselves through their own action, which differs in nature from a fully autonomous scraper. Active measures against a cross-posting tool for individual users are unlikely, but a gray area under the ToS exists.

### 10.2 Bluesky — App Passwords may be restricted (LOW)

- **Relevant clauses**: Bluesky developer guidelines, the blog post on the OAuth migration
- **Details**:
  - There is no clause that prohibits cross-posting
  - Posts are 1:1 and triggered by the user, so they do not count as spam
  - App Passwords still work, but Bluesky recommends moving to OAuth, and App Passwords may be restricted in the future
  - The bot label requirement does not currently apply to posts from the user's own account
- **Assessment**: the lowest risk. The only technical concern is when the App Password → OAuth migration happens. This extension authenticates only with an App Password and does not support OAuth.

### 10.3 Link cards — rehosting OGP images (LOW-MEDIUM)

- **Relevant clauses**: each site's terms of use, copyright law
- **Details**:
  - Fetching OGP metadata: reads `og:title`/`og:description`/`og:image` from the `<head>` section of public HTML
  - Downloading OGP images and re-uploading them to Bluesky may count as "rehosting"
- **Assessment**: re-uploading OGP images is debatable under each site's ToS. It can be changed to no thumbnail (title only) in the settings. Disabled by default, and an explicit action by the user is required.

### 10.4 Overall risk rating

| Platform | Risk | Main concern |
|-----------------|--------|---------|
| X (Twitter) | MEDIUM | Broad interpretation of the scraping prohibition |
| Bluesky | LOW | App Passwords may be restricted |
| Linked sites | LOW-MEDIUM | Rehosting OGP images |
