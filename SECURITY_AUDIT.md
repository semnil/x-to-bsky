# Security Audit Report — X to Bluesky Crossposter

**Date**: 2026-04-05
**Scope**: All source files (manifest.json, background.js, content.js, shared.js, options.js, options.html, popup.js, popup.html)
**Methodology**: OWASP Top 10 for Browser Extensions, Chrome MV3 security model review, AT Protocol credential handling analysis

---

## Executive Summary

This Chrome extension cross-posts from X (Twitter) to Bluesky. It stores Bluesky App Password credentials locally and communicates with `bsky.social` API endpoints. The extension follows the principle of least privilege with minimal permissions. No critical vulnerabilities were found. Several medium and low severity findings are documented below.

**Overall Risk Rating: LOW**

---

## 1. Credential Storage

### 1.1 App Password stored in chrome.storage.local (MEDIUM)

- **Location**: `options.js:162`, `background.js:105`
- **Detail**: Bluesky App Password is stored in `chrome.storage.local` as plaintext. `chrome.storage.local` is not encrypted at rest — it is stored in a LevelDB database in the user's Chrome profile directory.
- **Impact**: If an attacker gains filesystem access to the Chrome profile, they can read the App Password.
- **Mitigating Factors**:
  - App Passwords have limited scope (no account deletion, no password change)
  - App Passwords can be revoked independently from the Bluesky settings
  - `chrome.storage.local` is only accessible by this extension (enforced by Chrome)
  - No `chrome.storage.sync` is used (credentials are NOT synced to Google cloud)
- **Recommendation**: Document this limitation in the security note. Consider using `chrome.storage.session` for the session tokens (cleared on browser close), while keeping the App Password in `chrome.storage.local`.

### 1.2 Session tokens in memory only (GOOD)

- **Location**: `background.js:9` (`let session = null`)
- **Detail**: `accessJwt` and `refreshJwt` are stored in JavaScript memory only, not in `chrome.storage`. They are lost when the service worker terminates.
- **Assessment**: This is correct practice. Service worker restarts trigger a fresh login.

---

## 2. Permissions Analysis

### 2.1 Manifest permissions (GOOD)

```json
"permissions": ["storage"],
"host_permissions": ["https://bsky.social/*", "https://*.bsky.network/*"]
```

- **Assessment**: Minimal permissions. Only `storage` API permission. Host permissions limited to Bluesky domains.
- No `tabs`, `webRequest`, `cookies`, `history`, or other sensitive permissions.
- No `<all_urls>` or broad host patterns.

### 2.2 Content script scope (GOOD)

```json
"matches": ["https://x.com/*", "https://twitter.com/*"]
```

- Content scripts only injected on X/Twitter pages.
- No unnecessary page access.

---

## 3. Cross-Site Scripting (XSS) Analysis

### 3.1 options.js: innerHTML with i18n-html (LOW)

- **Location**: `options.js:99-104`, `options.html` elements with `data-i18n-html`
- **Detail**: `applyLanguage()` sets `el.innerHTML = t(key)` for elements with `data-i18n-html`. The i18n values contain HTML (`<strong>` tags).
- **Assessment**: Safe — i18n strings are hardcoded in source, not user-supplied. However, if i18n values were ever externalized or loaded from storage, this would become an XSS vector.
- **Recommendation**: Add a comment documenting that i18n-html values must only contain developer-controlled strings.

### 3.2 options.js: renderHistory uses escapeHtml correctly (GOOD)

- **Location**: `options.js:257-260`
- **Detail**: User-supplied text (post text, error messages) is passed through `escapeHtml()` before insertion into innerHTML.
- **Assessment**: Safe.

### 3.3 content.js: toast uses textContent (GOOD)

- **Location**: `content.js:44`
- **Detail**: `toast.textContent = message` — not innerHTML. Safe from XSS.

---

## 4. Message Passing Security

### 4.1 No sender validation in background.js (LOW)

- **Location**: `background.js:407`
- **Detail**: The `onMessage` handler does not verify `_sender` (sender tab/extension ID). Any content script on any matched page can send messages.
- **Assessment**: Low risk because:
  - Only this extension's content scripts can send messages to this extension's background
  - The `matches` pattern is limited to x.com/twitter.com
  - Messages only trigger Bluesky API actions with stored credentials
- **Recommendation**: For defense in depth, validate `sender.id === chrome.runtime.id`.

### 4.2 Thread data from content script is trusted (LOW)

- **Location**: `background.js:410`
- **Detail**: `msg.thread` from content script is used directly. If the content script is somehow compromised (e.g. via DOM-based XSS on x.com), arbitrary text/images could be posted to Bluesky.
- **Assessment**: The attack surface is the x.com page itself. If x.com has an XSS vulnerability, the attacker has broader access than just this extension.

---

## 5. Network Security

### 5.1 All API calls use HTTPS (GOOD)

- **Location**: `background.js:3` (`const BSKY_SERVICE = "https://bsky.social"`)
- All fetch calls go to `https://bsky.social` — no HTTP fallback.

### 5.2 Credentials sent only to bsky.social (GOOD)

- App Password is only sent in the `createSession` request body to `bsky.social`.
- Access tokens are only sent as `Authorization: Bearer` headers to `bsky.social`.
- No credentials are sent to any other domain.

### 5.3 No user-controlled URL construction (GOOD)

- API endpoints are hardcoded with the `BSKY_SERVICE` constant.
- `resolveHandle` uses `encodeURIComponent()` for the handle parameter — no injection risk.

---

## 6. Data Exposure

### 6.1 Post history stored in cleartext (LOW)

- **Location**: `background.js:395-403`
- **Detail**: Post text previews (first 200 chars) and URIs are stored in `chrome.storage.local.postHistory`.
- **Assessment**: Low risk. This is user-initiated data stored locally. No sensitive credentials in history.

### 6.2 Base64 image data in memory during posting (INFORMATIONAL)

- **Location**: `content.js:176` (sendMessage with thread containing images)
- **Detail**: Full image data (base64) passes through Chrome's message channel between content script and service worker. This is in-memory only, not persisted.
- **Assessment**: Acceptable. Images are from the user's own compose area.

---

## 7. Content Security Policy

### 7.1 No explicit CSP in manifest (INFORMATIONAL)

- **Detail**: No `content_security_policy` key in manifest.json. MV3 enforces a default CSP that blocks inline scripts and `eval()`.
- **Assessment**: Default MV3 CSP is sufficient. No inline scripts are used.

---

## 8. Supply Chain / Dependencies

### 8.1 Zero external dependencies (GOOD)

- No npm packages, no CDN scripts, no externally loaded resources.
- All code is first-party.
- **Assessment**: No supply chain attack surface.

---

## Summary of Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1.1 | App Password in chrome.storage.local (plaintext at rest) | MEDIUM | Accepted risk — documented in UI |
| 3.1 | innerHTML with i18n-html values | LOW | Safe (developer-controlled strings) |
| 4.1 | No sender validation in message handler | LOW | Acceptable (MV3 enforces isolation) |
| 4.2 | Content script data trusted by background | LOW | Acceptable (x.com trust boundary) |
| 6.1 | Post history in cleartext | LOW | Acceptable (user's own data) |

**No CRITICAL or HIGH severity findings.**

---

## Recommendations (Priority Order)

1. **Consider `chrome.storage.session`** for session tokens if the extension ever caches them in storage
2. **Add `sender.id` check** in `onMessage` handler for defense in depth
3. **Document** the security model in README for transparency with users
4. **Monitor** Bluesky AT Protocol changes for any new authentication requirements (e.g. DPoP/OAuth migration)
