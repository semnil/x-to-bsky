# Privacy Policy — X to Bluesky Crossposter

[日本語版はこちら (Japanese)](PRIVACY_POLICY_JA.md)

Last updated: 2026-04-05

## Overview

X to Bluesky Crossposter is a Chrome extension that cross-posts your X (Twitter) posts to Bluesky. This privacy policy explains what data the extension handles, how it is used, and where it is sent.

## Data Collected and Purpose

### Authentication Information

- **What**: Your Bluesky handle and App Password.
- **Purpose**: Used solely to authenticate with the Bluesky API (bsky.social) on your behalf.
- **Storage**: Saved locally in `chrome.storage.local` on your device. Never transmitted to any server other than bsky.social.

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

No other external servers are contacted.

## Data Storage and Security

- All credentials and settings are stored in `chrome.storage.local`, which is accessible only to this extension.
- No data is synced across devices or stored in the cloud.
- You can revoke your App Password at any time in Bluesky under Settings > Privacy and security > App passwords.
- Uninstalling the extension removes all locally stored data.

## Permissions

- **storage**: Save your credentials and preferences locally.
- **host_permissions** (`bsky.social`, `*.bsky.network`): Communicate with the Bluesky API.
- **optional_host_permissions** (`<all_urls>`): Requested at runtime only when you enable link cards. Revoked automatically when you disable the feature.

## Third-Party Dependencies

None. The extension contains no external libraries, SDKs, CDNs, or analytics tools.

## Changes to This Policy

Updates will be posted to this page with a revised date. Continued use of the extension after changes constitutes acceptance.

## Contact

If you have questions about this privacy policy, please open an [issue](https://github.com/semnil/x-to-bsky/issues) on the GitHub repository.
