# X to Bluesky Crossposter

X (Twitter) の投稿ボタンをフックし、同じテキスト・画像を Bluesky に同時投稿する Chrome 拡張 (Manifest V3)。

## 特徴

- **テキスト同時投稿**: x.com で投稿すると Bluesky にも自動投稿
- **画像対応**: 添付画像 (最大 4 枚) を Bluesky にも同時アップロード
- **スレッド対応**: X のスレッド投稿を Bluesky の reply chain として再現
- **300 文字超の自動分割**: Bluesky の 300 grapheme 制限を超える場合、自動でスレッド化
- **リッチテキスト**: URL, メンション (@handle → DID 解決), ハッシュタグを自動検出
- **YouTube リンクカード**: YouTube URL を含むポストにサムネイル付きリンクカードを自動添付
- **投稿履歴**: 成功/失敗の履歴を設定画面で確認可能
- **日本語/英語**: ブラウザ言語設定で自動切替
- **DOM セレクタ設定**: X の DOM 変更時にセレクタを手動更新可能
- **外部依存ゼロ**: npm パッケージ・CDN なし。全コード自作

## セットアップ

### 1. Bluesky App Password を発行

1. [bsky.app](https://bsky.app) にログイン
2. **設定** → **プライバシーとセキュリティ** → **アプリパスワード**
   (EN: Settings → Privacy and security → App passwords)
3. 新しい App Password を作成してコピー

### 2. 拡張をインストール

1. `chrome://extensions` を開く
2. 「デベロッパー モード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを指定

### 3. 認証情報を設定

1. 拡張アイコン右クリック →「オプション」(または拡張ポップアップから「設定を開く」)
2. Bluesky ハンドルと App Password を入力
3. 「接続テスト」で確認 → 「保存」

### 4. 使う

- x.com で通常通り投稿 → Bluesky にも同時投稿される
- ポップアップのトグルで ON/OFF 切り替え可能
- 投稿ボタンに 🦋 バッジが表示される (ON 時)

## 仕組み

```
[x.com compose area] → content.js (capture phase click)
  → テキスト・画像・スレッドを同期抽出
  → chrome.runtime.sendMessage → background.js
  → AT Protocol (bsky.social) → createRecord
  → content.js → トースト通知
```

- content.js: x.com の click イベントを capture phase でリッスンし、投稿ボタンのクリック時にテキスト・画像を同期的に抽出
- background.js: AT Protocol で Bluesky に認証・投稿。facets (URL, メンション, ハッシュタグ) を自動構築

## ビルド

```bash
chmod +x build.sh
./build.sh
# → x-to-bsky-v1.0.0.zip が生成される
```

## ファイル構成

```
x-to-bsky/
├── manifest.json        # Manifest V3 設定
├── background.js        # Service worker (Bluesky API)
├── shared.js            # 共有定数 (DOM セレクタ)
├── content.js           # x.com コンテンツスクリプト
├── content.css          # トースト・バッジスタイル
├── popup.html/js        # ツールバーポップアップ (トグル)
├── options.html/js      # 設定画面 (認証・セレクタ・履歴)
├── icons/               # 拡張アイコン
├── build.sh             # zip パッケージング
├── SECURITY_AUDIT.md    # セキュリティ監査レポート
└── README.md
```

## セキュリティ

- 認証情報は `chrome.storage.local` に保存。この拡張のみアクセス可能
- 通信先は `bsky.social` と YouTube (oEmbed API / サムネイル取得) のみ
- App Password は Bluesky の設定からいつでも無効化可能
- ソースコードは全ファイル公開。第三者依存なし
- 詳細は [SECURITY_AUDIT.md](SECURITY_AUDIT.md) を参照

## 既知の制限

- **画像キャプチャ**: canvas 経由のため、cross-origin 画像は取得失敗する場合がある
- **動画非対応**: 動画の同時投稿は未対応
- **スレッド**: 「+」ボタンで複数ポストを一度に作成した場合のみ対応。既存ポストへの返信によるスレッド追加は未対応
- **引用 RT**: デフォルトではコメントテキストのみ。設定で有効化すると引用元の X リンクを追加可能
- **YouTube リンクカード**: 画像付き投稿では画像が優先される (両方の embed は共存不可)。プレイリスト等はタイトルなしカードにフォールバック
- **RT (リポスト)**: テキスト入力を伴わないため作用しない（意図通り）
- **メンション**: Bluesky 上に存在するハンドルのみ DID 解決される

## 免責事項

この拡張機能は個人利用を目的としたオープンソースプロジェクトです。以下の点にご注意ください。

- **X (Twitter)**: X の利用規約は自動的手段によるサービスへのアクセスやコンテンツの再配布を広く制限しています。本拡張は DOM を読み取りクロスポストを行うため、利用規約上のグレーゾーンに該当する可能性があります。
- **Bluesky**: 現在 App Password による認証を使用していますが、Bluesky は OAuth への移行を推奨しています。将来的に App Password が制限される可能性があります。
- **YouTube**: リンクカード生成時に YouTube のサムネイル画像をダウンロードし Bluesky にアップロードします。これは YouTube の利用規約における再ホスティング制限に該当する可能性がありますが、リンクプレビュー生成として広く行われている慣行です。

本拡張の使用は自己責任で行ってください。各プラットフォームの利用規約を確認し、リスクを理解した上でご利用ください。詳細は [SECURITY_AUDIT.md](SECURITY_AUDIT.md) のセクション 10 を参照してください。
