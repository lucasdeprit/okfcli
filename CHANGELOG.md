# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `okfcli init --template <name>` chooses what a new wiki requires: `development` (default, the structure used so far) or `minimal` (only `overview/project.md` and `workflows/update-wiki.md`). The choice is written to the profile as `template`, informational, along with `required_folders` and `required_pages`, which are what `validate` reads.
- `required_folders` and `required_pages` in `.okf-profile.yaml`: each wiki now decides which folders and pages `validate` requires. `init` writes the base ones, so the default behaviour is unchanged, and a wiki can drop (for example) `conventions` or `testing`, or require a page of its own. A folder that is no longer required is still recognized: its pages keep being checked against its `type` and sections.
- `profile.migrate` warning, for profiles written before those keys existed. Until the keys are written they are read as requiring the base ones. `validate --fix` and `init` write them, keeping comments and the other keys.

### Changed
- The rule `structure.core-folder` is now `structure.required-folder`. A `severity` override under the old name no longer applies.
- The update skill lists the folders the wiki has (plus `extra_folders`) instead of the whole catalog, so a minimal wiki does not advertise folders it lacks.
- The consult skill no longer lists folders: it sends the agent to the wiki's `index.md`, so it stays correct when a wiki requires other folders.

### Removed
- `structure.testing-page` and the `testing/strategy.md` scaffold. `testing/` is now a folder like any other: when required, it only has to exist.

## [0.1.1] - 2026-11-07

No functional changes. First version published from GitHub Actions with a provenance attestation (npm trusted publishing).

## [0.1.0] - 2026-11-07

First public release.

### Added
- `okfcli init` can connect more coding agents: `--claude`, `--codex`, `--opencode` and `--cursor` (GitHub Copilot stays the default when no flag is given). A new `CLAUDE.md` imports an existing `AGENTS.md` so it does not hide it from Claude Code.

### Changed
- Rewritten in TypeScript (strict). The package now ships compiled JavaScript with type declarations from `dist/`.
- Added a small programmatic API (`run`, `loadProfile`, `validateWiki`, `parseFrontmatter`, `contentHash`, `trustState`).
- Internal cleanup: `errors` and `review` modules merged into their only users, unused helpers removed.
- Rules that lived in two places now live in one: the wiki directory walk (a symlinked `.md` is now ignored by both validation and the indexes; before it was validated but not indexed), required sections and their skeleton (`validate` and `validate --fix` share them), folder lookup, and the created/updated/unchanged file writes.

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

