# Settings sync decisions

> 日本語版は [settings-sync.ja.md](settings-sync.ja.md) を参照してください.

Closed decisions about which settings Chrome sync carries. How the settings are stored is in the "Credential storage" section of `AGENTS.md`.

## The handle and the App Password are not synced

- **Decision** (2026-11-08): `bskyHandle` and `bskyAppPassword` stay in `chrome.storage.local`, and the other settings are kept in `chrome.storage.sync` ([#96](https://github.com/semnil/x-to-bsky/pull/96)).
- **Reason**: each Chrome can use its own Bluesky account.
- **Rejected**: syncing the handle as well. The first implementation did so.
