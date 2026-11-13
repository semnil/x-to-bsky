# リリースの決定

> For the English version, see [release.md](release.md).

リリースと版番号について閉じた判断。リリースの手順そのものは `AGENTS.md` の「Build」にある。

## 変更履歴のファイルを置かない

- **決定** (2026-10-17): リポジトリに `CHANGES.md` と `CHANGES_ja.md` を置かない。
- **版ごとの変更がある場所**: 版上げの PR の本文に、前の版からの拡張機能の変更を並べる (例: [#89](https://github.com/semnil/x-to-bsky/pull/89)・[#98](https://github.com/semnil/x-to-bsky/pull/98))。`release.yaml` が作る下書きの Release には、GitHub が生成するノートが付く (`generate_release_notes`)。

## 版 1.1.0 はマイナーの版上げ

- **決定** (2026-11-08): 版を 1.0.10 から 1.1.0 に上げた ([#98](https://github.com/semnil/x-to-bsky/pull/98))。
- **理由**: このリリースは、新しいオプションを足し、設定の保存先を別の領域 (`chrome.storage.sync`) へ移す。
- **経緯**: それまでの版上げは、1.0.1 から 1.0.10 まで、機能を足したリリースでもパッチの番号を上げていた (例: 1.0.8 で出した、リプライをクロスポストするオプション)。
