# CLAUDE.md — X to Bluesky Crossposter

## プロジェクト概要

X (Twitter) の投稿ボタンをフックし、同じテキストを Bluesky に同時投稿する Chrome 拡張 (Manifest V3)。
外部依存ゼロ、全ファイル自作。API キー不要（X 側は DOM フック、Bluesky 側は AT Protocol 直接通信）。

## リポジトリ構成

```
x-to-bsky/
├── manifest.json        # Manifest V3 設定
├── background.js        # Service worker: Bluesky API (認証・投稿・画像・スレッド・履歴)
├── shared.js            # content.js / options.js 共有定数 (DEFAULT_SELECTORS)
├── content.js           # x.com 上のコンテンツスクリプト (投稿・画像・スレッドフック)
├── content.css          # トースト通知・🦋バッジのスタイル
├── popup.html           # ツールバーポップアップ UI
├── popup.js             # ポップアップロジック (トグル ON/OFF)
├── options.html         # 設定画面 UI (認証・セレクタ設定・投稿履歴)
├── options.js           # 設定ロジック (認証・セレクタ・履歴・i18n)
├── icons/               # 16/48/128px PNG + SVG ソースアイコン
│   ├── icon.svg         # SVG ソース (PNG 生成元)
│   └── generate-png.html  # PNG 生成ヘルパー
├── build.sh             # zip パッケージング
├── SECURITY_AUDIT.md    # セキュリティ監査レポート
├── README.md            # セットアップ手順・仕様説明
└── CLAUDE.md            # このファイル
```

## アーキテクチャ

### データフロー

```
[x.com compose area] → content.js (capture phase click) → chrome.runtime.sendMessage
  → background.js → AT Protocol (bsky.social) → createRecord → response
  → content.js → toast notification
```

### content.js

- `document.addEventListener("click", handler, true)` で capture phase フック
- セレクタはデフォルト定義 + `chrome.storage.local.customSelectors` で上書き可能
- テキスト抽出: `tweetTextarea_${n}` を 0 からインクリメントしてスレッド全体を取得
- 画像抽出: textarea 近傍の `<img>` を canvas 経由で base64 キャプチャ (同期処理)
- フォールバック: `.DraftEditor-root [data-text="true"]`
- 投稿ボタンに 🦋 バッジを MutationObserver で動的付与
- トースト通知で Bluesky 投稿結果を表示 (成功: 青, 失敗: 赤, スレッド件数表示)

### background.js

- `countGraphemes(text)`: `Intl.Segmenter` による正確な grapheme 単位カウント
- `splitText(text)`: 300 grapheme 超のテキストを改行・スペースで自動分割
- `createSession()`: 認証 + セッションキャッシュ。401 時の明確なエラーメッセージ
- `parseFacets(text)`: lookbehind 不使用。`(^|\s)` でバウンダリ判定し offset 補正
- `resolveMentionFacets()`: メンション handle → DID 解決
- `uploadImage(base64, mimeType)`: `com.atproto.repo.uploadBlob` で画像アップロード
- `createPost(text, images, parent, root)`: 画像 embed + reply chain 対応
- `postThread(thread)`: 自動分割 + reply chain によるスレッド投稿
- `addToHistory(entry)`: 投稿履歴を `chrome.storage.local` に保存 (最大 100 件)
- メッセージハンドラ: `POST_TO_BSKY`, `TEST_LOGIN`, `GET_STATUS`, `GET_HISTORY`, `CLEAR_HISTORY`

### 認証情報の保存

- `chrome.storage.local` に `bskyHandle`, `bskyAppPassword`, `crosspostEnabled`, `customSelectors`, `postHistory` を保存
- App Password を使用（メインパスワードではない）
- `host_permissions` は `https://bsky.social/*` と `https://*.bsky.network/*` のみ

## コーディング規約

- JA discussion, EN code（コメントは EN）
- 外部ライブラリ・ビルドツール不使用。生 JS のみ
- セミコロンあり、ダブルクォート不統一（manifest は JSON 標準）
- 関数に JSDoc コメント付与済み

## 既知の制限

- **画像キャプチャ**: canvas 経由のため、cross-origin 画像 (pbs.twimg.com 等) は tainted canvas で取得失敗する場合がある。blob: URL (ローカル添付) は問題なし
- **動画非対応**: Bluesky の動画投稿 API が安定したら対応を検討
- **引用 RT**: コメントテキストのみが投稿される（引用元の内容・リンクは含まれない）
- **RT (リポスト)**: テキスト入力を伴わないため作用しない（意図通り）

## テスト方法

1. `chrome://extensions` → デベロッパーモード → フォルダ読み込み
2. 設定画面で Bluesky App Password を設定 → 接続テスト
3. x.com でテスト投稿 → Bluesky 側で投稿確認
4. 画像付き投稿 → Bluesky 側で画像が表示されることを確認
5. スレッド投稿 (X の「+」ボタンで複数ツイート) → Bluesky でも reply chain になることを確認
6. 300 文字超テスト → 自動分割されてスレッドとして投稿されることを確認
7. ポップアップで OFF → 投稿しても Bluesky に送信されないことを確認
8. 設定画面の投稿履歴 → 成功/失敗が正しく記録されていることを確認
9. 設定画面の Advanced → セレクタ変更・リセットが反映されることを確認

## ビルド

```bash
chmod +x build.sh
./build.sh
# → x-to-bsky-v1.0.0.zip が生成される
```

## 関連コンテキスト

- claude-voice 拡張の開発経験あり (Manifest V3, MutationObserver, content script パターン)
- check-handle プロジェクトで Playwright + DOM セレクタ探索の経験あり
- Bluesky AT Protocol の認証は App Password 方式 (OAuth は未使用)
