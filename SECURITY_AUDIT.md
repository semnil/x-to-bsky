# セキュリティ監査レポート — X to Bluesky Crossposter

**日付**: 2026-04-05 (更新)
**対象**: 全ソースファイル (manifest.json, background.js, lib.js, content.js, shared.js, options.js, options.html, popup.js, popup.html)
**手法**: OWASP Top 10 for Browser Extensions、Chrome MV3 セキュリティモデルレビュー、AT Protocol 認証情報取り扱い分析

---

## 概要

この Chrome 拡張は X (Twitter) から Bluesky へのクロスポストを行う。Bluesky App Password をローカルに保存し、`bsky.social` API エンドポイントおよび YouTube oEmbed API と通信する。最小権限の原則に従い、必要最小限の権限のみを使用している。重大な脆弱性は発見されなかった。以下に中〜低リスクの所見を記載する。

**総合リスク評価: LOW**

---

## 1. 認証情報の保存

### 1.1 App Password が chrome.storage.local に平文保存 (MEDIUM)

- **場所**: `options.js:177`, `background.js:34`
- **詳細**: Bluesky App Password が `chrome.storage.local` に平文で保存される。`chrome.storage.local` は保存時に暗号化されず、Chrome プロファイルディレクトリ内の LevelDB データベースにそのまま格納される。
- **影響**: 攻撃者が Chrome プロファイルへのファイルシステムアクセスを取得した場合、App Password を読み取ることができる。
- **緩和要素**:
  - App Password はスコープが限定されている（アカウント削除やパスワード変更は不可）
  - App Password は Bluesky の設定から個別に無効化可能
  - `chrome.storage.local` はこの拡張のみがアクセス可能（Chrome が強制）
  - `chrome.storage.sync` は使用していない（認証情報は Google クラウドに同期されない）
- **推奨**: セキュリティ注記に本制限を記載済み。セッショントークンをストレージにキャッシュする場合は `chrome.storage.session`（ブラウザ終了時に消去）の使用を検討。

### 1.2 セッショントークンはメモリ内のみ (GOOD)

- **場所**: `background.js:15` (`let session = null`)
- **詳細**: `accessJwt` と `refreshJwt` は JavaScript メモリにのみ保存され、`chrome.storage` には保存されない。Service worker の終了時に破棄される。
- **評価**: 正しい実装。Service worker の再起動時にはフレッシュログインが行われる。

---

## 2. 権限分析

### 2.1 Manifest 権限 (GOOD)

```json
"permissions": ["storage"],
"host_permissions": [
  "https://bsky.social/*",
  "https://*.bsky.network/*",
  "https://www.youtube.com/*",
  "https://youtu.be/*",
  "https://i.ytimg.com/*"
]
```

- **評価**: 最小権限。API 権限は `storage` のみ。Host permissions は Bluesky ドメインと YouTube 関連ドメインに限定。
- `tabs`、`webRequest`、`cookies`、`history` 等の機密権限なし。
- `<all_urls>` や広範なホストパターンなし。
- YouTube ドメインは oEmbed メタデータ取得 (`www.youtube.com`)、短縮 URL 解決 (`youtu.be`)、サムネイル画像取得 (`i.ytimg.com`) にのみ使用。

### 2.2 Content script のスコープ (GOOD)

```json
"matches": ["https://x.com/*", "https://twitter.com/*"]
```

- Content script は X/Twitter ページにのみ注入される。
- 不要なページアクセスなし。

---

## 3. クロスサイトスクリプティング (XSS) 分析

### 3.1 options.js: innerHTML と i18n-html (LOW)

- **場所**: `options.js:109-114`、`options.html` の `data-i18n-html` 属性を持つ要素
- **詳細**: `applyLanguage()` が `data-i18n-html` 要素に対して `el.innerHTML = t(key)` を設定する。i18n 値には HTML (`<strong>` タグ) が含まれる。
- **評価**: 安全 — i18n 文字列はソースコードにハードコードされており、ユーザー入力ではない。ただし i18n 値が外部化またはストレージから読み込まれるようになった場合、XSS ベクターとなる。
- **推奨**: i18n-html 値は開発者管理の文字列のみを含む旨のコメントを追加。

### 3.2 options.js: renderHistory は escapeHtml を正しく使用 (GOOD)

- **場所**: `options.js:282-285`
- **詳細**: ユーザー由来のテキスト（投稿テキスト、エラーメッセージ）は innerHTML への挿入前に `escapeHtml()` を経由している。
- **評価**: 安全。

### 3.3 content.js: トーストは textContent を使用 (GOOD)

- **場所**: `content.js:63`
- **詳細**: `toast.textContent = message` — innerHTML ではなく textContent を使用。XSS の影響なし。

---

## 4. メッセージパッシングのセキュリティ

### 4.1 background.js で送信元検証なし (LOW)

- **場所**: `background.js:362`
- **詳細**: `onMessage` ハンドラが `_sender`（送信元タブ/拡張 ID）を検証していない。マッチしたページ上の任意のコンテンツスクリプトがメッセージを送信可能。
- **評価**: 低リスク:
  - この拡張のコンテンツスクリプトのみがこの拡張のバックグラウンドにメッセージを送信可能
  - `matches` パターンは x.com/twitter.com に限定
  - メッセージは保存済み認証情報を使用した Bluesky API アクションのみをトリガー
- **推奨**: 多層防御として `sender.id === chrome.runtime.id` の検証を追加。

### 4.2 コンテンツスクリプトからのスレッドデータを信頼 (LOW)

- **場所**: `background.js:365`
- **詳細**: コンテンツスクリプトからの `msg.thread` がそのまま使用される。コンテンツスクリプトが何らかの方法で侵害された場合（例: x.com 上の DOM ベース XSS）、任意のテキスト/画像が Bluesky に投稿される可能性がある。
- **評価**: 攻撃面は x.com ページ自体。x.com に XSS 脆弱性がある場合、攻撃者はこの拡張よりも広範なアクセスを持つ。

---

## 5. ネットワークセキュリティ

### 5.1 全 API 通信が HTTPS (GOOD)

- **場所**: `background.js:10` (`const BSKY_SERVICE = "https://bsky.social"`)
- 全ての fetch 呼び出しは `https://bsky.social` または `https://www.youtube.com` (oEmbed) — HTTP フォールバックなし。

### 5.2 認証情報の送信先が限定 (GOOD)

- App Password は `bsky.social` への `createSession` リクエストボディにのみ送信される。
- アクセストークンは `bsky.social` への `Authorization: Bearer` ヘッダーにのみ送信される。
- YouTube を含む他のドメインに認証情報は一切送信されない。

### 5.3 ユーザー制御の URL 構築なし (GOOD)

- API エンドポイントは `BSKY_SERVICE` 定数でハードコードされている。
- `resolveHandle` はハンドルパラメータに `encodeURIComponent()` を使用 — インジェクションリスクなし。
- YouTube oEmbed URL は `encodeURIComponent()` でエスケープ済み。

---

## 6. データ露出

### 6.1 投稿履歴が平文保存 (LOW)

- **場所**: `background.js:350-358`
- **詳細**: 投稿テキストのプレビュー（先頭 200 文字）と URI が `chrome.storage.local.postHistory` に保存される。
- **評価**: 低リスク。ユーザー操作起点のデータがローカルに保存される。履歴に機密認証情報は含まれない。

### 6.2 投稿時のメモリ内 Base64 画像データ (INFORMATIONAL)

- **場所**: `content.js:252` (画像データを含むスレッドの sendMessage)
- **詳細**: 画像データ全体 (base64) がコンテンツスクリプトと Service worker 間の Chrome メッセージチャネルを通過する。メモリ内のみで永続化されない。
- **評価**: 許容範囲。画像はユーザー自身のコンポーズエリアから取得される。

---

## 7. Content Security Policy

### 7.1 manifest に明示的 CSP なし (INFORMATIONAL)

- **詳細**: manifest.json に `content_security_policy` キーがない。MV3 はインラインスクリプトと `eval()` をブロックするデフォルト CSP を強制する。
- **評価**: MV3 のデフォルト CSP で十分。インラインスクリプトは使用していない。

---

## 8. サプライチェーン / 依存関係

### 8.1 外部依存ゼロ (GOOD)

- npm パッケージ、CDN スクリプト、外部リソースの読み込みなし。
- 全コードがファーストパーティ。
- **評価**: サプライチェーン攻撃面なし。

---

## 所見一覧 (初期監査)

| # | 所見 | 重要度 | 状態 |
|---|------|--------|------|
| 1.1 | App Password が chrome.storage.local に平文保存 | MEDIUM | 許容リスク — UI に記載済み |
| 3.1 | innerHTML と i18n-html 値 | LOW | 安全（開発者管理の文字列） |
| 4.1 | メッセージハンドラで送信元検証なし | LOW | 許容（MV3 が分離を強制） |
| 4.2 | コンテンツスクリプトのデータを信頼 | LOW | 許容（x.com 信頼境界） |
| 6.1 | 投稿履歴が平文保存 | LOW | 許容（ユーザー自身のデータ） |

**CRITICAL または HIGH の所見なし。**

---

## 9. 初期監査以降の変更

### 9.1 ES モジュールリファクタリング (GOOD)

- **詳細**: 純粋関数を `background.js` から `lib.js` に抽出。バックグラウンド Service worker は manifest で `"type": "module"` を使用。
- **評価**: セキュリティへの影響なし。ES モジュールはクラシックスクリプトよりも厳密なスコープ分離を持つ。

### 9.2 引用 RT URL 機能 — DOM 抽出 (LOW)

- **場所**: `content.js:extractQuoteUrl()`
- **詳細**: コンポーズエリアの DOM から引用ツイートの URL を抽出する新機能。`findComposeContainer()` で親要素を 10 レベル遡行する。フォールバック検索はコンテナ内の `a[href*="/status/"]` にマッチする。
- **評価**: 低リスク — 機能はデフォルトで無効。抽出された URL はユーザーに可視のコンテンツ（X ポストリンク）であり、平文テキストとして追加され、`parseFacets` でリンクファセットとして処理される。URL は厳密な正規表現 (`STATUS_URL_RE`) で検証されるため、スクリプトインジェクションのベクターはない。
- **推奨**: 修正不要。デフォルト無効により意図しないデータ露出を緩和。

### 9.3 storage.onChanged リスナー (INFORMATIONAL)

- **場所**: `content.js:27-31`
- **詳細**: `chrome.storage.onChanged` で `includeQuoteUrl` 設定の変更を監視。拡張管理のストレージから真偽値のみを読み取る。
- **評価**: セキュリティ上の懸念なし。`chrome.storage.onChanged` は拡張スコープ。

### 9.4 YouTube リンクカード機能 — 外部通信の追加 (LOW)

- **場所**: `background.js:fetchYouTubeOEmbed()`, `background.js:uploadThumbnail()`
- **詳細**: YouTube URL を含むポスト投稿時に 2 つの外部通信が追加された:
  1. YouTube oEmbed API (`https://www.youtube.com/oembed?url=...&format=json`) へのメタデータ取得
  2. YouTube サムネイル画像 (`https://i.ytimg.com/vi/...`) のダウンロード
- **評価**:
  - 認証情報は YouTube 側に一切送信されない（oEmbed は API キー不要の公開エンドポイント）
  - `host_permissions` に `www.youtube.com/*`, `youtu.be/*`, `i.ytimg.com/*` を追加済み — 必要最小限のドメイン
  - oEmbed レスポンスの `title`, `author_name`, `thumbnail_url` フィールドのみ使用。HTML コンテンツ (`html` フィールド) は無視される
  - サムネイル画像は `uploadBlob` 経由で Bluesky に送信されるのみ — ローカルに永続化されない
  - ユーザーが投稿したテキストに含まれる YouTube URL のみがトリガーとなる（拡張が自律的に外部通信を行うことはない）
- **リスク**: ユーザーが投稿する YouTube URL が YouTube サーバーに送信される。これはユーザーが意図した投稿内容であり、ブラウザの通常の URL アクセスと同等の情報露出
- **緩和策**: デフォルト有効だが設定画面から無効化可能

### 9.5 host_permissions の拡大 (INFORMATIONAL)

- **場所**: `manifest.json:7-13`
- **詳細**: `host_permissions` が 2 ドメインから 5 ドメインに拡大:
  - 追加: `https://www.youtube.com/*`, `https://youtu.be/*`, `https://i.ytimg.com/*`
- **評価**: 追加ドメインは全て YouTube/Google の公開インフラ。`fetch` のみに使用され、Cookie やページコンテンツへのアクセスはない。Chrome Web Store の審査で host_permissions の正当性説明が必要になる可能性あり

### 9.6 uploadBlob 共通化 (GOOD)

- **場所**: `background.js:uploadBlob()`
- **詳細**: `uploadImage` と `uploadThumbnail` の共通ロジックを `uploadBlob(bytes, contentType, accessJwt)` に抽出。blob アップロードのエンドポイントと認証ヘッダーが単一箇所に集約された
- **評価**: セキュリティ改善。認証トークンの取り扱いが 1 箇所に集約され、レビューと保守が容易になった

---

## 所見一覧 (全体)

| # | 所見 | 重要度 | 状態 |
|---|------|--------|------|
| 1.1 | App Password が chrome.storage.local に平文保存 | MEDIUM | 許容リスク — UI に記載済み |
| 3.1 | innerHTML と i18n-html 値 | LOW | 安全（開発者管理の文字列） |
| 4.1 | メッセージハンドラで送信元検証なし | LOW | 許容（MV3 が分離を強制） |
| 4.2 | コンテンツスクリプトのデータを信頼 | LOW | 許容（x.com 信頼境界） |
| 6.1 | 投稿履歴が平文保存 | LOW | 許容（ユーザー自身のデータ） |
| 9.2 | 引用 RT URL の DOM 抽出 | LOW | デフォルト無効、正規表現で検証 |
| 9.4 | YouTube oEmbed / サムネイル外部通信 | LOW | 認証情報送信なし、ユーザー操作起点 |
| 9.5 | host_permissions の拡大 (3 ドメイン追加) | INFORMATIONAL | YouTube 公開インフラのみ |

**CRITICAL または HIGH の所見なし。**

---

## 推奨事項 (優先順)

1. **`chrome.storage.session` の検討** — セッショントークンをストレージにキャッシュする場合に使用（ブラウザ終了時に消去）
2. **`sender.id` 検証の追加** — `onMessage` ハンドラで多層防御として送信元を検証
3. **セキュリティモデルの文書化** — README にセキュリティモデルを記載し、ユーザーへの透明性を確保
4. **AT Protocol の変更を監視** — Bluesky の新しい認証要件（DPoP/OAuth 移行等）への対応
5. **Chrome Web Store 審査対策** — host_permissions に YouTube ドメインを追加した理由の説明を準備

---

## 10. 利用規約リスク分析

### 10.1 X (Twitter) — スクレイピング・自動化条項 (MEDIUM)

- **関連条項**: X 利用規約 — サービスへの自動的手段によるアクセスの禁止、コンテンツ再配布制限
- **詳細**:
  - X の ToS はスクレイピングを広く禁止しており、DOM 読み取りと API アクセスを区別していない
  - 「自動化された手段」によるサービスアクセスの禁止が、capture phase のクリックフックに適用される可能性
  - 「X Content」の再配布制限が、ユーザー自身のコンテンツの他プラットフォームへの投稿に適用される可能性
- **評価**: ユーザー自身が作成したコンテンツを自身の操作で投稿する形態であり、完全自律型スクレイパーとは性質が異なる。同種の拡張（Skybridge, Tweet Sync 等）が Chrome Web Store で公開・運用されている前例がある。個人ユーザー向けクロスポストツールに対して積極的な措置が取られる可能性は低いが、ToS 上のグレーゾーンは存在する。

### 10.2 Bluesky — App Password 廃止予定 (LOW)

- **関連条項**: Bluesky 開発者ガイドライン、OAuth 移行ブログ記事
- **詳細**:
  - クロスポストを禁止する条項は存在しない
  - ユーザー操作起点の 1:1 投稿であり、スパムには該当しない
  - App Password は現在も動作するが、Bluesky は OAuth への移行を推奨しており、将来的に App Password が制限される可能性がある
  - Bot ラベル要件はユーザー自身のアカウントでの投稿には現時点で適用されない
- **評価**: 最もリスクが低い。唯一の技術的懸念は App Password → OAuth 移行時期。

### 10.3 YouTube — サムネイル再ホスティング (LOW-MEDIUM)

- **関連条項**: YouTube 利用規約 Section 5(C) — ダウンロード制限
- **詳細**:
  - oEmbed エンドポイントは YouTube Data API の一部ではなく、API キー不要の公開エンドポイント。メタデータ取得自体のリスクは極低
  - サムネイル画像のダウンロードと Bluesky への再アップロードは「再ホスティング」に該当する可能性がある（ToS Section 5(C) はダウンロードボタンが提供されないコンテンツのダウンロードを禁止）
  - ただし、Twitter/Slack/Discord 等のリンクプレビュー生成も同様の処理を行っており、業界慣行として広く容認されている
- **評価**: サムネイル再アップロードは ToS の文言上は議論の余地があるが、リンクプレビューとしての利用は業界標準的な慣行。

### 10.4 総合リスク評価

| プラットフォーム | リスク | 主な懸念 |
|-----------------|--------|---------|
| X (Twitter) | MEDIUM | スクレイピング禁止の広範な解釈 |
| Bluesky | LOW | App Password 廃止予定 |
| YouTube | LOW-MEDIUM | サムネイル再ホスティング |

**推奨対応**:
1. Bluesky OAuth 移行 — App Password 廃止に備えて中期的に対応計画を持つ
2. YouTube サムネイル — 将来的にサムネイルなしのリンクカード（タイトルのみ）をオプション提供する案を検討
3. README に免責事項 — 各プラットフォームの ToS に基づくリスクをユーザーに開示
