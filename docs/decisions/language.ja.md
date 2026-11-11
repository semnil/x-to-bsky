# 言語の決定

> For the English version, see [language.md](language.md).

文書の言語と、拡張機能自身の文言の言語について閉じた判断。今有効な規則は `CLAUDE.md` の「Documentation and language」にある。

## 文書・コミット・PR は英語で書く

- **決定** (2026-10-20): リポジトリの基本の言語を英語にする。対象は、文書 (README とプライバシーポリシーには日本語版がある)、コミットメッセージ、PR のタイトルと本文 ([#69](https://github.com/semnil/x-to-bsky/pull/69))。
- **経緯**: 2026-10-17 の時点では、コミットメッセージと PR は日本語のままにしていた。この決定で取り下げた。2026-10-20 に、それより前の PR 61 件のタイトルと本文、必須チェックを試すために開いた PR のコメント 43 件、v1.0.9 のリリースノートのタイトルを英語に書き換えた。それより前のコミットメッセージは書き換えない。

## manifest の default_locale は en

- **決定** (2026-10-21): `manifest.json` の `default_locale` を `en` にする。メッセージのカタログが無い言語のブラウザには、英語の名前と説明が出る ([#74](https://github.com/semnil/x-to-bsky/pull/74))。
- **経緯**: 2026-10-20 の時点では `default_locale` を `ja` のままにしていた。翌日の #74 で変えた。

## Issue テンプレートは英日併記のままにする

- **決定** (2026-10-20): Issue テンプレート (`.github/ISSUE_TEMPLATE/`) は、英語と日本語を並べて書いた形のままにする。GitHub のアカウントを持たない人のための窓口 ([issue #3](https://github.com/semnil/x-to-bsky/issues/3)) へのリンクは、テンプレートに置かない。
- **却下した案**: 英語だけの 1 セットのテンプレート。一度書いたが、コミットする前に取り下げた。
