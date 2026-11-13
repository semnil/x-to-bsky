# 設定の同期の決定

> For the English version, see [settings-sync.md](settings-sync.md).

Chrome の同期がどの設定を運ぶかについて閉じた判断。設定の保存のしかたは `AGENTS.md` の「Credential storage」にある。

## ハンドルと App Password は同期しない

- **決定** (2026-11-08): `bskyHandle` と `bskyAppPassword` は `chrome.storage.local` に置いたままにし、ほかの設定を `chrome.storage.sync` に置く ([#96](https://github.com/semnil/x-to-bsky/pull/96))。
- **理由**: Chrome ごとに別の Bluesky アカウントを使えるようにする。
- **却下した案**: ハンドルも同期する。最初の実装はこの形だった。
