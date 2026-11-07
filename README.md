# okw

Create and maintain project wikis in [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/open-knowledge-format), with the same structure in every project.

## Commands

| Command | What it does |
|---|---|
| `okw init [folder]` | Create the wiki (default `./wiki`) and connect it to GitHub Copilot |
| `okw new <type> <name> --description "..."` | Create a page from its template and add it to the index |
| `okw validate [--fix]` | Check the wiki and list what nobody has reviewed. `--fix` repairs the mechanical issues |
| `okw verify <path> --by human:<id>` | Mark a page as reviewed |

```bash
okw init docs/wiki
okw new pattern state-management --description "How screen state is structured."
okw validate --fix
okw verify patterns/state-management --by human:ana
```

- **Types for `new`:** `overview` `architecture` `pattern` `convention` `workflow` `testing` `feature` `module` `interface` `operation` `troubleshooting`
- **Every command:** `--json` for machine-readable output, `--wiki <folder>` to pick a wiki (otherwise it is found from the current directory)
- **Help:** `okw --help`, `okw <command> --help`

## Install

Needs Node 20 or later and read access to this private repo (SSH key or `gh auth login`).

```bash
npm install -g github:lucasdeprit/SDD-Kit     # gives you the `okw` command
npx github:lucasdeprit/SDD-Kit init docs/wiki # or run it without installing
```

Pin a version by adding a tag or commit: `github:lucasdeprit/SDD-Kit#v0.1.0`. To upgrade, install again, then run `okw init` in each project to refresh the generated agent files.

## What you get

```
docs/wiki/
├── index.md
├── .okf-profile.yaml     settings: extra folders, rule severities
├── overview/             what the project is
├── architecture/         structure and rules
├── patterns/             how we implement things
├── conventions/          style and naming
├── workflows/            how we work
├── testing/              how we test
└── (features/ modules/ interfaces/ operations/ troubleshooting/)  optional, created by `okw new`
```

Every folder has an `index.md`, generated for you. Every page has `type`, `title` and `description`, plus the sections its type requires.

## How it works

- **The CLI does the mechanical work:** folders, indexes, page skeletons, structure checks. Nobody edits `index.md` by hand.
- **Agents write the content:** they fill in the sections of the pages `okw new` creates.
- **People review:** a page is unreviewed until someone runs `okw verify` (or writes the `verified` entry by hand). If a verified page changes afterwards, `validate` reports it as outdated.
- **No history files:** the history of the wiki is left to git.

## Agents (GitHub Copilot)

`okw init` also writes, relative to the directory where you run it:

- a pointer block in `AGENTS.md` (or `.github/copilot-instructions.md` if that is what the project uses), so the agent always knows the wiki exists;
- three skills in `.github/skills/`: `okf-consult-wiki`, `okf-update-wiki` and `okf-review-wiki`.

The skills call `okw`, so install it globally on the machines where agents run. Run `okw init` again to refresh these files; it never touches the wiki pages. `--no-agents` skips them.

## Contract

The rules a wiki must follow (folders, page types, required sections, review, checks) are in [SPEC.md](SPEC.md).

## Development

```bash
npm install
npm test
node bin/okw.js --help   # run from a clone
```

## License

[MIT](LICENSE)
