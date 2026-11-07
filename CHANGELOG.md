# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Rewritten in TypeScript (strict). The package now ships compiled JavaScript with type declarations from `dist/`.
- Added a small programmatic API (`run`, `loadProfile`, `validateWiki`, `parseFrontmatter`, `contentHash`, `trustState`).
- Internal cleanup: `errors` and `review` modules merged into their only users, unused helpers removed.

- Renamed the CLI, package and generated markers from `okw` to `okfcli`
  (`OKW_ACTOR` is now `OKFCLI_ACTOR`; the pointer block markers are
  `<!-- okfcli:start/end -->`).

### Security
- `verify` now resolves symlinks and rejects any path that leaves the wiki.
- `.okf-profile.yaml` is validated: `extra_folders` names must be kebab-case
  and `severity` values must be `error`, `warning` or `off`.

### Fixed
- Pages are written atomically, and `new` never overwrites an existing page.
- `init` refuses a pointer block that has a start marker but no end marker
  instead of appending a duplicate block.
- Indexes checked out with CRLF line endings are no longer reported as out of date.
- Wiki paths with spaces are quoted in the generated skills.
- Unexpected errors print a short message and exit with code 2.

## [0.1.0]
- First version.
