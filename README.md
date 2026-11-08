<div align="center">

<img src="assets/banner.svg" alt="okfcli — create and maintain project wikis in Open Knowledge Format" width="100%">

<br>

[![npm](https://img.shields.io/npm/v/okfcli?style=for-the-badge&color=7c3aed)](https://www.npmjs.com/package/okfcli)
[![CI](https://img.shields.io/github/actions/workflow/status/lucasdeprit/okfcli/ci.yml?style=for-the-badge&label=CI)](https://github.com/lucasdeprit/okfcli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/okfcli?style=for-the-badge&color=0ea5e9)](LICENSE)
[![node](https://img.shields.io/node/v/okfcli?style=for-the-badge&color=22c55e)](#1-install)

**A CLI to create and maintain project wikis in [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/open-knowledge-format).**

[Quick start](#quick-start) · [Commands](#commands) · [Agent compatibility](#agent-compatibility) · [Spec](SPEC.md) · [Contributing](CONTRIBUTING.md) · [Español](README.es.md)

</div>

---

okfcli creates the wiki structure (folders, indexes and page templates), validates it against the [spec](SPEC.md), keeps track of which pages a person has reviewed, and connects the wiki to your coding agents. Agents write the content; the CLI handles the mechanical parts.

## Quick start

### 1. Install

```bash
npm install -g okfcli
```

Requires Node 22 or later. You can also run it without installing, with `npx okfcli`.

<details>
<summary><b>Pin or upgrade a version</b></summary>

Pin a version with `npm install -g okfcli@0.2.0`. To upgrade, install again, then run `okfcli init` in each project to refresh the generated agent files.

</details>

### 2. Create the wiki and connect your agent

```bash
okfcli init docs/wiki --claude
```

<p align="center">
  <img src="assets/demo.svg" alt="Output of okfcli init and okfcli new" width="85%">
</p>

Use `--copilot`, `--claude`, `--codex`, `--opencode` or `--cursor` for the agents you use (see [Agent compatibility](#agent-compatibility)).

### 3. Fill it and check it

Ask your agent to write the content, for example:

```text
Update this project's wiki from the current source and tests.
```

The agent creates pages with `okfcli new`, which you can also run yourself:

```bash
okfcli new pattern state-management --description "How screen state is structured."
```

Once a page has content, check the wiki and mark the page as reviewed:

```bash
okfcli validate
okfcli verify patterns/state-management --by human:ana
```

## Commands

| Command | What it does |
|---|---|
| `okfcli init [folder]` | Create the wiki (default `./wiki`) and connect it to your coding agents. `--template minimal` creates only the two required pages |
| `okfcli new <type> <name> --description "..."` | Create a page from its template and add it to the index |
| `okfcli validate [--fix]` | Check the wiki and list the pages nobody has reviewed. `--fix` repairs the mechanical issues |
| `okfcli verify <path> --by human:<id>` | Mark a page as reviewed |

- **Types for `new`:** `overview` `architecture` `pattern` `convention` `workflow` `testing` `feature` `module` `interface` `operation` `troubleshooting`
- **Every command:** `--json` for machine-readable output, `--wiki <folder>` to choose a wiki (otherwise it is found from the current directory)
- **Help:** `okfcli --help`, `okfcli <command> --help`

## Validation and review

- **Checks:** `validate` covers folder structure, frontmatter, required sections, links, orphan pages, unfilled TODO placeholders and out-of-date indexes. Rule severities can be changed in `.okf-profile.yaml`.
- **Fixes:** `validate --fix` regenerates indexes, recreates missing required folders and pages, and adds missing section headings. It does not write page content.
- **CI:** `validate --json` returns the issues as JSON. The exit code is 1 when there are errors; `--strict` also fails on warnings.
- **Review:** a page counts as unreviewed until someone runs `okfcli verify`. If a verified page changes afterwards, `validate` reports it as outdated. `verify` refuses pages that still contain TODO placeholders unless you pass `--force`.
- **History:** the wiki keeps no history files; git covers that.

## What you get

```
docs/wiki/
├── index.md
├── .okf-profile.yaml     settings: required folders and pages, extra folders, rule severities
├── overview/             what the project is
├── architecture/         structure and rules
├── patterns/             how we implement things
├── conventions/          style and naming
├── workflows/            how we work
├── testing/              how we test
└── (features/ modules/ interfaces/ operations/ troubleshooting/)  optional, created by `okfcli new`
```

This is the `development` template, the default. For anything that is not a software project, `okfcli init --template minimal` creates only `overview/project.md` and `workflows/update-wiki.md`. Which folders and pages are required is set in `.okf-profile.yaml`, so you can change it later.

Every folder has a generated `index.md`. Every page has `type`, `title` and `description`, plus the sections its type requires.

## Agent compatibility

`okfcli init` writes the files that connect the wiki to your coding agents. Pass one flag per tool; without any flag it connects GitHub Copilot.

| Agent | Flag | Instructions block in | Skills in |
|---|---|---|---|
| GitHub Copilot | `--copilot` (default) | `AGENTS.md`, or `.github/copilot-instructions.md` if the project already uses it | `.github/skills/` |
| Claude Code | `--claude` | `CLAUDE.md` (or `.claude/CLAUDE.md`) | `.claude/skills/` |
| Codex | `--codex` | `AGENTS.md` | `.agents/skills/` |
| OpenCode | `--opencode` | `AGENTS.md` | `.agents/skills/` |
| Cursor | `--cursor` | `AGENTS.md` | `.agents/skills/` |

```bash
okfcli init --claude --codex     # several at once
```

`init` adds a short block to the instructions file, so the agent knows the wiki exists, and installs three skills: `okf-consult-wiki`, `okf-update-wiki` and `okf-review-wiki`. The skills call `okfcli`, so it must be installed on the machines where the agents run.

<details>
<summary><b>Details</b></summary>

- `init` never deletes files, so files of an agent you stop passing stay where they are.
- Run `okfcli init` again to refresh the agent files. It never touches the wiki pages.
- `--no-agents` skips the agent files.
- Skills follow the open [agentskills.io](https://agentskills.io) format. Supporting another tool is one line in `src/generate/targets.ts`.

</details>

## Development

```bash
npm install
npm test                          # builds to dist/ and runs the tests
node dist/bin/okfcli.js --help    # run from a clone
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
