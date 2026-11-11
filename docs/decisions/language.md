# Language decisions

> 日本語版は [language.ja.md](language.ja.md) を参照してください.

Closed decisions about the language of the documents and of the extension's own texts. The rules in force are in the "Documentation and language" section of `CLAUDE.md`.

## Documents, commits and pull requests are in English

- **Decision** (2026-10-20): English is the base language of the repository: the documents (the README and the privacy policy have Japanese counterparts), the commit messages, and the titles and bodies of pull requests ([#69](https://github.com/semnil/x-to-bsky/pull/69)).
- **History**: on 2026-10-17 commit messages and pull requests were kept in Japanese; this decision withdrew that. On 2026-10-20 the titles and bodies of 61 earlier pull requests, 43 comments on the pull requests that had been opened to try a required check, and the title of the v1.0.9 release notes were rewritten in English. Earlier commit messages are not rewritten.

## The manifest's default_locale is en

- **Decision** (2026-10-21): `default_locale` in `manifest.json` is `en`, so a browser language without a message catalog gets the English name and description ([#74](https://github.com/semnil/x-to-bsky/pull/74)).
- **History**: on 2026-10-20 `default_locale` was kept at `ja`; #74 changed it the next day.

## The issue templates stay bilingual

- **Decision** (2026-10-20): the issue templates (`.github/ISSUE_TEMPLATE/`) keep their English and Japanese text side by side. They do not link to the feedback entry for people without a GitHub account ([issue #3](https://github.com/semnil/x-to-bsky/issues/3)).
- **Rejected**: a single English set of templates. It was written once and withdrawn before it was committed.
