# Release decisions

> 日本語版は [release.ja.md](release.ja.md) を参照してください.

Closed decisions about releases and version numbers. The release steps themselves are in the "Build" section of `AGENTS.md`.

## The repository keeps no changelog file

- **Decision** (2026-10-17): the repository has no `CHANGES.md` or `CHANGES_ja.md`.
- **Where the changes of a version are**: the body of the version-bump pull request lists the extension changes since the previous version (for example [#89](https://github.com/semnil/x-to-bsky/pull/89) and [#98](https://github.com/semnil/x-to-bsky/pull/98)), and the draft Release that `release.yaml` creates carries the notes GitHub generates (`generate_release_notes`).

## Version 1.1.0 is a minor bump

- **Decision** (2026-11-08): the version went from 1.0.10 to 1.1.0 ([#98](https://github.com/semnil/x-to-bsky/pull/98)).
- **Reason**: the release adds a new option and moves the settings to another storage area (`chrome.storage.sync`).
- **History**: every earlier bump, 1.0.1 through 1.0.10, raised the patch number, also when the release added a feature (for example the option to cross-post replies, released in 1.0.8).
