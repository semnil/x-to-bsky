# セキュリティ監査レポート — X to Bluesky Crossposter

**日付**: 2026-04-05
**対象**: 全ソースファイル (manifest.json, background.js, lib.js, content.js, shared.js, options.js, options.html, popup.js, popup.html)
**手法**: OWASP Top 10 for Browser Extensions、Chrome MV3 セキュリティモデルレビュー、AT Protocol 認証情報取り扱い分析

---

## 概要

この Chrome 拡張は X (Twitter) から Bluesky へのクロスポストを行う。Bluesky App Password をローカルに保存し、`bsky.social` API エンドポイントと通信する。リンクカード機能有効時は任意の URL から OGP メタデータを取得する（`optional_host_permissions` による動的権限）。重大な脆弱性は発見されなかった。以下に中〜低リスクの所見を記載する。

**総合リスク評価: LOW**

---

## 1. 認証情報の保存

### 1.1 App Password が chrome.storage.local に平文保存 (MEDIUM)

- **場所**: `options.js`, `background.js`
- **詳細**: Bluesky App Password が `chrome.storage.local` に平文で保存される。`chrome.storage.local` は保存時に暗号化されず、Chrome プロファイルディレクトリ内の LevelDB データベースにそのまま格納される。
- **影響**: 攻撃者が Chrome プロファイルへのファイルシステムアクセスを取得した場合、App Password を読み取ることができる。
- **緩和要素**:
  - App Password はスコープが限定されている（アカウント削除やパスワード変更は不可）
  - App Password は Bluesky の設定から個別に無効化可能
  - `chrome.storage.local` はこの拡張のみがアクセス可能（Chrome が強制）
  - `chrome.storage.sync` は使用していない（認証情報は Google クラウドに同期されない）

### 1.2 セッショントークンはメモリ内のみ (GOOD)

- **場所**: `background.js` (`let session = null`)
- **詳細**: `accessJwt` と `refreshJwt` は JavaScript メモリにのみ保存され、`chrome.storage` には保存されない。Service worker の終了時に破棄される。
- **評価**: 正しい実装。Service worker の再起動時にはフレッシュログインが行われる。

---

## 2. 権限分析

### 2.1 Manifest 権限 (GOOD)

```json
"permissions": ["storage"],
"host_permissions": [
  "https://bsky.social/*",
  "https://*.bsky.network/*"
],
"optional_host_permissions": ["<all_urls>"]
```

- **評価**: 必須権限は最小限。API 権限は `storage` のみ。必須 host_permissions は Bluesky ドメインのみ。
- `tabs`、`webRequest`、`cookies`、`history` 等の機密権限なし。
- `<all_urls>` は `optional_host_permissions` として宣言。インストール時には権限要求されない。設定画面でリンクカード機能を有効化した時点でウェブアクセス権限が一括付与され、無効化すると自動解除される。
- Service worker は `chrome.permissions.contains()` で権限を確認し、未許可ドメインの fetch をスキップする (カードなしで投稿)。
- リンクカード機能: OGP メタデータ取得 (任意 URL の `<head>` のみ読み取り)、サムネイル画像のダウンロード・Bluesky への再アップロードに使用。

### 2.2 Content script のスコープ (GOOD)

```json
"matches": ["https://x.com/*", "https://twitter.com/*"]
```

- Content script は X/Twitter ページにのみ注入される。
- 不要なページアクセスなし。

---

## 3. クロスサイトスクリプティング (XSS) 分析

### 3.1 innerHTML と i18n-html (LOW)

- **場所**: `options.js:applyLanguage()`、`options.html` の `data-i18n-html` 属性要素
- **詳細**: `applyLanguage()` が `data-i18n-html` 要素に対して `el.innerHTML = t(key)` を設定する。i18n 値には HTML (`<strong>` タグ) が含まれる。
- **評価**: 安全 — i18n 文字列はソースコードにハードコードされており、ユーザー入力ではない。ただし i18n 値が外部化またはストレージから読み込まれるようになった場合、XSS ベクターとなる。

### 3.2 トーストは textContent を使用 (GOOD)

- **場所**: `content.js:showToast()`
- **詳細**: `toast.textContent = message` — innerHTML ではなく textContent を使用。XSS の影響なし。

---

## 4. メッセージパッシングのセキュリティ

### 4.1 送信元検証なし (LOW)

- **場所**: `background.js:chrome.runtime.onMessage.addListener()`
- **詳細**: `onMessage` ハンドラが送信元（タブ/拡張 ID）を検証していない。マッチしたページ上の任意のコンテンツスクリプトがメッセージを送信可能。
- **評価**: 低リスク:
  - この拡張のコンテンツスクリプトのみがこの拡張のバックグラウンドにメッセージを送信可能
  - `matches` パターンは x.com/twitter.com に限定
  - メッセージは保存済み認証情報を使用した Bluesky API アクションのみをトリガー
- **推奨**: 多層防御として `sender.id === chrome.runtime.id` の検証を追加。

### 4.2 コンテンツスクリプトからのスレッドデータを信頼 (LOW)

- **詳細**: コンテンツスクリプトからの `msg.thread` がそのまま使用される。コンテンツスクリプトが侵害された場合（例: x.com 上の DOM ベース XSS）、任意のテキスト/画像が Bluesky に投稿される可能性がある。
- **評価**: 攻撃面は x.com ページ自体。x.com に XSS 脆弱性がある場合、攻撃者はこの拡張よりも広範なアクセスを持つ。

---

## 5. ネットワークセキュリティ

### 5.1 全通信が HTTPS (GOOD)

- Bluesky API: `https://bsky.social` — HTTP フォールバックなし。
- リンクカード: ユーザーの投稿テキストに含まれる URL を fetch する。HTTP URL も fetch 対象になり得るが、認証情報は送信されない。

### 5.2 認証情報の送信先が限定 (GOOD)

- App Password は `bsky.social` への `createSession` リクエストボディにのみ送信される。
- アクセストークンは `bsky.social` への `Authorization: Bearer` ヘッダーにのみ送信される。
- リンクカード用の外部 URL fetch には認証情報は一切含まれない。

### 5.3 外部 URL fetch (LOW)

- API エンドポイントは `BSKY_SERVICE` 定数でハードコードされている。
- `resolveHandle` はハンドルパラメータに `encodeURIComponent()` を使用 — インジェクションリスクなし。
- oEmbed URL パラメータは `encodeURIComponent()` でエスケープ済み。
- **リンクカード**: ユーザーの投稿テキストから抽出した URL を `fetch()` で取得する。攻撃面はユーザー自身の入力に限定される。OGP レスポンスは HTML の `</head>` まで (最大 32KB) のみ読み取り、`og:title`/`og:description`/`og:image` のみ使用。JavaScript は実行されない。

---

## 6. データ露出

### 6.1 投稿時のメモリ内 Base64 画像データ (INFORMATIONAL)

- **詳細**: 画像データ全体 (base64) がコンテンツスクリプトと Service worker 間の Chrome メッセージチャネルを通過する。メモリ内のみで永続化されない。
- **評価**: 許容範囲。画像はユーザー自身のコンポーズエリアから取得される。

### 6.2 リンクカード外部通信 (LOW-MEDIUM)

- **場所**: `background.js:fetchOgpMetadata()`, `background.js:uploadThumbnail()`
- **詳細**: URL を含むポスト投稿時、リンクカード生成のため外部通信が発生する:
  1. 対象 URL への `fetch()` で HTML `<head>` の OGP メタタグを解析
  2. サムネイル画像 (og:image) のダウンロード
- **評価**:
  - 認証情報は外部サイトに一切送信されない
  - HTML レスポンスは `</head>` まで (最大 32KB) のみ読み取り、JavaScript は実行されない
  - OGP から `title`/`description`/`image` のみ抽出。他のフィールドは無視
  - サムネイル画像は `uploadBlob` 経由で Bluesky に送信されるのみ — ローカルに永続化されない
  - ユーザーが投稿したテキストに含まれる URL のみがトリガー（拡張が自律的に通信を行うことはない）
  - `optional_host_permissions` を使用。ユーザーが明示的に権限を許可した場合のみ動作
  - 5 秒タイムアウト設定あり
- **緩和策**: デフォルト無効。設定画面で有効化時に権限ダイアログが表示される。サムネイルのみの無効化も可能。

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

## 9. 設計上の良好な点

- **ES モジュール分離**: 純粋関数を `lib.js` に抽出。Service worker は `"type": "module"` で厳密なスコープ分離。
- **uploadBlob 共通化**: `uploadImage` と `uploadThumbnail` の共通ロジックを `uploadBlob()` に集約。認証トークンの取り扱いが単一箇所に集約され、レビューと保守が容易。
- **引用 RT URL 機能**: デフォルト無効。抽出 URL は厳密な正規表現 (`STATUS_URL_RE`) で検証。スクリプトインジェクションのベクターなし。
- **設定変更のリアルタイム反映**: `chrome.storage.onChanged` リスナーは拡張スコープの真偽値のみを読み取る。セキュリティ上の懸念なし。
- **リンクカード OGP 取得**: HTML の `</head>` まで (最大 32KB) のみストリーム読み取り。5 秒タイムアウトは fetch 開始からストリーム読み取り完了まで維持 (`AbortController`)。Content-Type の charset 検出に対応。JavaScript 実行なし。
- **オプション権限**: `optional_host_permissions` + `chrome.permissions.request()` で設定画面のトグル操作時に権限を付与。無効化時に `chrome.permissions.remove()` で自動解除。
- **スレッド投稿のセッション再利用**: `postThread()` で一度取得した session を全ポストに渡す。スレッド投稿中の不要な再認証・storage 読み取りを排除。
- **設定マイグレーション**: `chrome.runtime.onInstalled` で旧設定キーを自動マイグレーション。マイグレーション後に旧キーを削除。
- **Service worker 起動対策**: MV3 の service worker 非アクティブ問題に対し、初期状態取得 (`GET_STATUS`) はリトライ付きで送信。投稿 (`POST_TO_BSKY`) はリトライせず、事前に `GET_STATUS` で service worker を起動してから送信する wakeup 方式を採用。重複投稿を防止。

---

## 所見一覧

| # | 所見 | 重要度 | 状態 |
|---|------|--------|------|
| 1.1 | App Password が chrome.storage.local に平文保存 | MEDIUM | 許容リスク — UI に記載済み |
| 3.1 | innerHTML と i18n-html 値 | LOW | 安全（開発者管理の文字列） |
| 4.1 | メッセージハンドラで送信元検証なし | LOW | 許容（MV3 が分離を強制） |
| 4.2 | コンテンツスクリプトのデータを信頼 | LOW | 許容（x.com 信頼境界） |
| 5.3 | リンクカード用外部 URL fetch | LOW | ユーザー入力起点、head のみ解析 |
| 6.2 | リンクカード外部通信 | LOW-MEDIUM | デフォルト無効、optional_host_permissions |

**CRITICAL または HIGH の所見なし。**

---

## 推奨事項 (優先順)

1. **`chrome.storage.session` の検討** — セッショントークンをストレージにキャッシュする場合に使用（ブラウザ終了時に消去）
2. **`sender.id` 検証の追加** — `onMessage` ハンドラで多層防御として送信元を検証
3. **AT Protocol の変更を監視** — Bluesky の新しい認証要件（DPoP/OAuth 移行等）への対応

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

### 10.3 リンクカード — OGP 画像再ホスティング (LOW-MEDIUM)

- **関連条項**: 各サイトの利用規約、著作権法
- **詳細**:
  - OGP メタデータの取得: 公開 HTML の `<head>` セクションから `og:title`/`og:description`/`og:image` を読み取る。検索エンジンのクローラーやリンクプレビュー生成と同種の処理
  - OGP 画像のダウンロードと Bluesky への再アップロードは「再ホスティング」に該当する可能性がある
  - ただし、Twitter/Slack/Discord/LINE 等のリンクプレビュー生成も同様の処理を行っており、業界慣行として広く容認されている
- **評価**: OGP 画像の再アップロードは各サイトの ToS 上は議論の余地があるが、リンクプレビューとしての利用は業界標準的な慣行。設定でサムネイルなし（タイトルのみ）に変更可能。デフォルト無効であり、ユーザーの明示的な操作が必要。

### 10.4 総合リスク評価

| プラットフォーム | リスク | 主な懸念 |
|-----------------|--------|---------|
| X (Twitter) | MEDIUM | スクレイピング禁止の広範な解釈 |
| Bluesky | LOW | App Password 廃止予定 |
| リンク先サイト | LOW-MEDIUM | OGP 画像再ホスティング |

**推奨対応**:
1. Bluesky OAuth 移行 — App Password 廃止に備えて中期的に対応計画を持つ
2. README に免責事項 — 各プラットフォームの ToS に基づくリスクをユーザーに開示（対応済み）
