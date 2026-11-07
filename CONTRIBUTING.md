# Contributing

Thanks for helping improve okfcli.

## Setup

```bash
git clone https://github.com/lucasdeprit/okfcli.git
cd okfcli
npm install
npm test                      # builds to dist/ and runs the tests
npm run typecheck             # type-check without emitting
node dist/bin/okfcli.js --help
```

Requires Node 20 or later. The source is TypeScript in `src/`, `bin/` and `test/`; `dist/` is generated and not committed.

## Guidelines

- Keep the CLI small: four commands (`init`, `new`, `validate`, `verify`). Open an issue before proposing a new one.
- Keep it strict and simple: no `any` in `src/`, and no new dependency without a clear need (today there is one, `yaml`).
- Every change needs a test. Tests run the CLI in-process through `test/helpers.js`; avoid asserting the exact YAML layout, which depends on the `yaml` version.
- Wiki paths always use `/`, on Windows too. Never write outside the wiki.
- Update `CHANGELOG.md` under `[Unreleased]`.
- The wiki format is defined in [SPEC.md](SPEC.md); changes to rules or file layout must update it.

## Pull requests

Describe what changed and why, and confirm `npm test` passes. CI runs the tests on Linux, macOS and Windows.
