# X to Bluesky Crossposter

> 日本語版は [README.ja.md](README.ja.md) を参照してください.

A Chrome extension (Manifest V3) that hooks the X (Twitter) post button and posts the same text and images to Bluesky at the same time.

## Features

- **Simultaneous text posting**: posting on x.com also posts to Bluesky automatically
- **Images**: attached images (up to 4) are uploaded to Bluesky at the same time
- **Threads**: X thread posts are reproduced as a Bluesky reply chain
- **Automatic split beyond 300 characters**: text over Bluesky's 300-grapheme limit is turned into a thread automatically. Long URLs are shown shortened (the link still goes to the original URL)
- **Rich text**: URLs, mentions (@handle → DID resolution) and hashtags are detected automatically
- **Link cards**: a link card with a thumbnail is attached automatically to posts that contain a URL (generated from OGP metadata)
- **Japanese / English**: switches automatically with the browser's language setting
- **DOM selector settings**: the selectors can be updated by hand when X changes its DOM
- **Zero external dependencies**: no npm packages or CDNs. All code is written from scratch

## Setup

### 1. Install the extension

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/x-to-bluesky-crossposter/mbbbnhfamflofopokhphhkinpggkogke)

> **To use the development version**: `chrome://extensions` → turn Developer mode ON → "Load unpacked" and select this repository's folder

### 2. Create a Bluesky App Password

1. Sign in to [bsky.app](https://bsky.app)
2. **Settings** → **Privacy and security** → **App passwords**
   (JA: 設定 → プライバシーとセキュリティ → アプリパスワード)
3. Create a new App Password and copy it

### 3. Enter your credentials

1. Right-click the extension icon → "Options" (or 「設定を開く」 (Open settings) in the extension popup)
2. Enter your Bluesky handle and App Password
3. Check with "Test Connection" → "Save"

### 4. Use it

- Post on x.com as usual → it is posted to Bluesky at the same time
- Turn it ON/OFF with the toggle in the popup
- A butterfly badge is shown on the post button (when ON)

## How it works

```
[x.com compose area] → content.js (capture phase click)
  → extracts text, images and threads synchronously
  → chrome.runtime.sendMessage → background.js
  → AT Protocol (bsky.social) → createRecord
  → content.js → toast notification
```

- content.js: listens to click events on x.com in the capture phase, and extracts the text and images synchronously when the post button is clicked
- background.js: authenticates and posts to Bluesky over the AT Protocol. Builds the facets (URLs, mentions, hashtags) automatically

## Build

```bash
chmod +x build.sh
./build.sh
# → produces x-to-bsky-v${VERSION}.zip (VERSION is read from manifest.json)
```

## File layout

```
x-to-bsky/
├── manifest.json        # Manifest V3 configuration
├── background.js        # Service worker (Bluesky API)
├── shared.js            # Shared constants (DOM selectors)
├── content.js           # x.com content script
├── content.css          # Toast and badge styles
├── popup.html/js        # Toolbar popup (toggle)
├── options.html/js      # Options page (credentials, selectors)
├── icons/               # Extension icons
├── build.sh             # zip packaging
└── README.md
```

## Security

- Credentials are stored in `chrome.storage.local`. Only this extension can access them
- The only destination is `bsky.social` (with link cards enabled, the OGP metadata and thumbnail of the target URL are also fetched)
- The App Password can be revoked at any time in Bluesky's settings
- Every source file is public. No third-party dependencies

## Known limitations

- **Image capture**: capture goes through a canvas, so cross-origin images may fail to be captured
- **No video**: posting videos at the same time is not supported
- **Threads**: supported only when several posts are created at once with the "+" button. Adding to a thread by replying to an existing post is not supported
- **Quote reposts**: only the comment text by default. Enabling it in the settings adds the X link of the quoted post
- **Replies**: replies to existing posts are not cross-posted by default. Enabling "Post replies to Bluesky" in the settings cross-posts the reply text as a new post as well
- **Link cards**: on posts with images, the images take priority (the two embeds cannot coexist). Sites without OGP get the page's title and description instead, and the card has no title if there is no title either. Web access permission is granted when the feature is enabled on the options page (removed automatically when it is disabled)
- **Reposts**: they involve no text input, so the extension does nothing (intended)
- **Mentions**: only handles that exist on Bluesky are resolved to DIDs

## Disclaimer

This extension is an open-source project intended for personal use. Please note the following.

- **X (Twitter)**: X's Terms of Service broadly restrict accessing the service by automated means and redistributing content. This extension reads the DOM to cross-post, so it may fall into a gray area under the Terms of Service.
- **Bluesky**: authentication currently uses an App Password, but Bluesky recommends moving to OAuth. App Passwords may be restricted in the future.
- **Link cards**: when generating a link card, the extension fetches the target site's OGP metadata and thumbnail image and uploads them to Bluesky. Rehosting thumbnail images may conflict with each site's terms of use. You can turn thumbnails off in the settings (title only).

Use this extension at your own risk. Check each platform's terms of use and use it with an understanding of the risks.
