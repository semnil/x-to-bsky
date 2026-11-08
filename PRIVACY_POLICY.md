# Privacy Policy — X to Bluesky Crossposter

[日本語版はこちら (Japanese)](PRIVACY_POLICY_JA.md)

Last updated: 2026-11-08

## Overview

X to Bluesky Crossposter is a Chrome extension that cross-posts your X (Twitter) posts to Bluesky. This privacy policy explains what data the extension handles, how it is used, and where it is sent.

## Data Collected and Purpose

### Authentication Information

- **What**: Your Bluesky handle and App Password.
- **Purpose**: Used solely to authenticate with the Bluesky API (bsky.social) on your behalf.
- **Storage**: Saved locally in `chrome.storage.local` on your device. Never transmitted to any server other than bsky.social, and not synced to your other devices.

### Settings

- **What**: The extension's options (crossposting on or off, the post options, the link card options and any custom DOM selectors).
- **Purpose**: To keep the same settings in every Chrome you use.
- **Storage**: Saved in `chrome.storage.sync`. When Chrome sync is on, Chrome sends them to Google's sync service and shares them with the other Chromes signed in to the same Google account; when it is off, they stay on your device. Your handle and App Password are not among them.

### User Activity

- **What**: The text and images you compose on X (Twitter) at the time you click the post button.
- **Purpose**: Sent to bsky.social to create the corresponding Bluesky post.
- **Storage**: Not stored by the extension beyond the immediate posting operation.

### Website Content (optional)

- **What**: OGP metadata (page title, description, thumbnail image) from URLs included in your posts.
- **Purpose**: Used to generate link card previews on Bluesky.
- **When**: Only when you have explicitly enabled the "Link Card" feature in the extension settings. Disabled by default.
- **Storage**: Not stored. Metadata is fetched, sent to bsky.social as a link card embed, and discarded.

## Data NOT Collected

- The extension does **not** collect browsing history, analytics, or telemetry.
- The extension does **not** track which pages you visit on X or any other site.
- The extension developer does **not** receive, store, or have access to any of your data.
- No data is sold, shared with third parties, or used for advertising.

## Where Data Is Sent

| Destination | Data Sent | Purpose |
|---|---|---|
| `bsky.social` / `*.bsky.network` | Handle, App Password, post text, images | Authentication and post creation |
| URLs in your posts (optional) | HTTP GET request (no credentials) | Fetch OGP metadata for link cards |

No other external servers are contacted by the extension. When Chrome sync is on, Chrome itself sends the settings in `chrome.storage.sync` (the options, not your handle or App Password) to Google's sync service.

## Data Storage and Security

- Your handle and App Password are stored in `chrome.storage.local`, which is accessible only to this extension and is not synced.
- The other settings are stored in `chrome.storage.sync`, accessible only to this extension, and synced by Chrome through your Google account when Chrome sync is on.
- You can revoke your App Password at any time in Bluesky under Settings > Privacy and security > App passwords.
- Uninstalling the extension removes all data it stored on your device.

## Permissions

- **storage**: Save your credentials on your device, and your preferences in Chrome's sync storage.
- **host_permissions** (`bsky.social`, `*.bsky.network`): Communicate with the Bluesky API.
- **optional_host_permissions** (`<all_urls>`): Requested at runtime only when you enable link cards, in the Chrome where you enable them. Revoked automatically from that Chrome when you disable the feature there.

## Third-Party Dependencies

None. The extension contains no external libraries, SDKs, CDNs, or analytics tools.

## Changes to This Policy

Updates will be posted to this page with a revised date. Continued use of the extension after changes constitutes acceptance.

## Contact

If you have questions about this privacy policy, please open an [issue](https://github.com/semnil/x-to-bsky/issues) on the GitHub repository.
