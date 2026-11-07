# Project wiki contract on top of OKF (draft 0.1)

Status: **draft under review**. This defines what a wiki must satisfy; the `okw` CLI implements and enforces it.

## 1. Goal

Every project wiki must have the same shape, so that:

- an agent (or a person) knows where to look in any project without knowing it beforehand;
- agents can maintain the wiki by following fixed rules;
- the structure lasts over time without growing in a disorderly way.

### Principle: the CLI does the mechanical work, the agent only writes content

Anything that can be decided with rules is done by the CLI, deterministically and without spending tokens. The agent is limited to what requires judgement: writing the content of the pages.

| The CLI does | The agent does |
|---|---|
| Create folders and `index.md` | Decide what deserves a page |
| Create a page with frontmatter and a section skeleton | Fill in the sections |
| Register the page in the `index.md` of its folder | Write the `# Why` and the examples |
| Stamp `verified` with actor, date and content hash | Decide whether something should be marked `deprecated` |
| Validate structure, sections, links and indexes | Review content against the code |
| Fix only the mechanical issues (`validate --fix`) | Fix the content problems that `validate` reports |
| Fix only the mechanical issues (`validate --fix`) | |

Design consequences:

- One command per operation. `new` creates the page and registers it in the index, so the agent does not have to edit two files.
- The skills generated for agents tell them to **use the CLI** and not to create or hand-edit `index.md` or the `verified` entries.
- `validate` messages say which file, which rule and how to fix it, so the agent reads only what it needs.
- `validate` and `index` can run in CI or in a hook without any agent.

## 2. Layers

1. **OKF v0.2** (Google, [open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format)): the base format. A wiki is a *bundle*: a tree of `.md` files with YAML frontmatter and reserved `index.md` (and, optionally, `log.md`).
2. **Base profile** (this document): additional rules, stricter than OKF.
3. **Project extension**: folders and rules specific to a project, without removing those of the base profile.

A wiki that breaks the profile but satisfies OKF is still valid OKF.

## 3. Structure

```
wiki/
├── index.md
├── .okf-profile.yaml
├── overview/          # core
├── architecture/      # core
├── patterns/          # core
├── conventions/       # core
├── workflows/         # core
├── testing/           # core
├── features/          # optional
├── modules/           # optional
├── interfaces/        # optional
├── operations/        # optional
└── troubleshooting/   # optional
```

Folder names are fixed and do not depend on any technology. Whatever is specific to a project (a framework, an internal package) goes in pages, not in folders of the standard.

### General rules

- Every folder has an `index.md`.
- File and folder names in `kebab-case`, without repeating the folder name (`modules/auth/core.md`, not `modules/auth/auth-core.md`).
- Own folders can be added (declared in `extra_folders`); core folders cannot be removed or renamed.
- There is no decisions folder. The reason for a rule lives in the `# Why` section of its page. What changes is edited in the page; the history is left to git. What stops applying is marked `status: deprecated`.
- Page content can be in any language. The `type` names, frontmatter fields and required section names are in English.

### Folder, `type` and minimum sections

| Folder | `type` | Sections required in every page |
|---|---|---|
| `overview/` | `Overview` | `# Purpose`, `# Scope` |
| `architecture/` | `Architecture` | `# Overview`, `# Rules`, `# Why` |
| `patterns/` | `Pattern` | `# When to use`, `# How`, `# Example`, `# Why` |
| `conventions/` | `Convention` | `# Rule`, `# Examples` |
| `workflows/` | `Workflow` | `# Goal`, `# Steps` |
| `testing/` | `Testing` | `# Scope`, `# How to run`, `# Rules` |
| `features/` | `Feature` | `# Summary`, `# Behavior` |
| `modules/` | `Module` | `# Responsibility`, `# Public API` |
| `interfaces/` | `Interface` | `# Contract`, `# Consumers` |
| `operations/` | `Operation` | `# When`, `# Steps` |
| `troubleshooting/` | `Troubleshooting` | `# Symptom`, `# Cause`, `# Fix` |

A page may have more sections. Only these are required.

### Required pages

- `overview/project.md`: what the project is.
- `workflows/update-wiki.md`: when and how the wiki is updated (see section 6).
- `testing/` must contain at least one testing strategy page (so `testing/index.md` links to it). `okw init` scaffolds `testing/strategy.md` (title, frontmatter and the required sections, unfilled); any page in `testing/` satisfies the rule, so a project may rename or replace it.

## 4. Frontmatter

Every concept page (not `index.md`) carries:

| Field | Requirement | Notes |
|---|---|---|
| `type` | error if missing | Must match the type of its folder |
| `title` | error if missing | |
| `description` | error if missing | One sentence |
| `tags` | optional | List of strings |
| `verified` | see below | List of `{ by, at, hash }`: who reviewed the page, when, and a fingerprint of the content they read |
| `status` | optional | Only `deprecated` is acted upon; `draft` and `stable` are accepted (absent = `stable`) |

There are no `generated` or `stale_after` fields: nothing expires by date, and who created or changed a page is left to git.

### Review: `verified`

Every page is born **unreviewed**. A page counts as reviewed when it has a valid `verified` entry:

- **Who decides.** A person, not the tool. A person verifies either by running `okw verify <path> --by human:<id>` or by writing the entry by hand in the page frontmatter. Agents may help (the review skill walks the person through the unreviewed pages), but they only run `okw verify --by human:<id>` after the person has confirmed.
- **Tiers** (from OKF): no entry = *unverified*; only machine actors = *machine-confirmed*; any `human:<id>` = *human-reviewed*.
- **Outdated.** `okw verify` stores a `hash` of the content that was read (frontmatter except `verified` and `status`, plus body). If the page is edited afterwards the hash no longer matches and the verification is reported as *outdated* until it is verified again. Entries without a hash (written by hand) are always accepted and never go outdated.
- **Nagging.** `validate` warns about unreviewed and outdated pages, and `status` lists them, so a team can see what nobody has read yet. Projects that want to enforce review can raise `frontmatter.verified` and `frontmatter.verified-outdated` to `error` in their profile. Deprecated pages are not asked to be reviewed.
- **Deprecating.** `status: deprecated` is only ever set by a person or an agent editing the page; the tool never deprecates anything by itself.

Actor convention (OKF): `human:<id>`, `process:<id>` or `<tool>/<version>`.

## 5. `index.md`

**`index.md`** (every folder). No frontmatter, except the root one, which carries `okf_version: "0.2"`. One line per page, as OKF asks:

```markdown
# Patterns

* [State management](/patterns/state-management.md) - How the state of a screen is structured.
```

Indexes are generated by `okw index` and are never edited by hand. Every page of the folder must appear in its `index.md`, and every entry must point to a page that exists.

**`log.md`.** OKF reserves this name for an update history, but `okw` does not create or manage it: the history of a wiki is left to git. If a project keeps its own `log.md`, it is never treated as a concept page.

## 6. Maintenance by agents

Agents update the wiki. `workflows/update-wiki.md` defines the standard procedure:

1. If a change affects a rule, a pattern or a convention, the affected page is edited; a new one is not added.
2. The `index.md` of the folder is updated (by `okw`, never by hand).
3. The page stays unreviewed until a person verifies it; the agent does not verify its own work as a person.
4. If a page stops applying, it is marked `status: deprecated`.

`workflows/` links to `patterns/`: every workflow step that depends on a way of implementing something links to its pattern.

## 7. Configuration: `.okf-profile.yaml`

```yaml
profile: base@0.1          # base profile and version
language: en               # language of the content (informational)
severity:                  # overrides the severity of a rule: error | warning | off
  frontmatter.verified: error
  frontmatter.verified-outdated: error
extra_folders:             # project-specific folders
  - name: mobile
    type: Mobile
    sections: ["# Summary"]
```

## 8. Checks (`validate`)

Every rule has a stable id that can be used in `severity`.

| Rule id | Check | Default severity | Fixed by `--fix` |
|---|---|---|---|
| `okf.frontmatter` | Concept pages have parseable YAML frontmatter | error | |
| `okf.type` | `type` is present and non-empty | error | |
| `okf.index` | `index.md` has no frontmatter (the root one only `okf_version`) | error | |
| `structure.core-folder` | Every core folder exists | error | yes |
| `structure.required-page` | Required pages exist | error | yes |
| `structure.testing-page` | `testing/` has at least one strategy page | error | yes (scaffolds `testing/strategy.md`) |
| `structure.unknown-folder` | Pages live in a core, optional or declared folder | warning | |
| `page.type` | `type` matches the type of the folder | error | |
| `page.sections` | Required sections are present | error | yes |
| `page.todo` | No unfilled `<!-- TODO -->` placeholders | warning | |
| `frontmatter.title` | `title` present | error | |
| `frontmatter.description` | `description` present | error | |
| `frontmatter.status` | `status`, if present, is `draft`, `stable` or `deprecated` | error | |
| `frontmatter.verified` | Page has been reviewed (has a `verified` entry) | warning | |
| `frontmatter.verified-outdated` | The page has not changed since it was verified | warning | |
| `name.kebab-case` | File and folder names are `kebab-case` | error | |
| `index.out-of-date` | Every `index.md` matches the pages in its folder: no page missing from it, no entry pointing to a page that no longer exists, no folder without an `index.md` | error | yes |
| `link.broken` | Internal links point to existing pages | warning | |
| `page.orphan` | Some other concept page links to it | warning | |

`validate` exits with code 1 if there is any error (`--strict`: any warning too). `--json` prints every issue with `rule`, `severity`, `file`, `message` and `fix`.

## 9. CLI (Node, `npx`)

| Command | What it does |
|---|---|
| `init` | Creates the wiki with the core, the indexes and `.okf-profile.yaml` |
| `new <type> <name>` | Creates a page with its template and frontmatter and registers it in the index |
| `validate` | Runs the checks of section 8, including which pages nobody has reviewed or that changed after being verified, with a review summary; `--fix` repairs the mechanical issues (folders, required pages, section skeletons, indexes) |
| `verify <path>` | Records a review in `verified` (`--by <actor>`, one entry per actor) with a hash of the content. Refuses pages with unfilled TODOs unless `--force` |

There are deliberately only four commands: people should not have to learn an ecosystem. Indexes are kept up to date by `new` and `validate --fix`, so there is no `index` command; the review state is part of `validate`, so there is no `status` command; the agent files are refreshed by running `init` again, so there is no `update` command.

## 10. Agent integration

As OpenSpec does, the connection with agents is made with **generated files** in the paths each tool reads, plus a CLI with `--json` output. There is no MCP server and no hooks in the first version.

First target: **GitHub Copilot in VS Code**. Paths verified in the VS Code documentation (vscode-docs, October 2026):

| Piece | File generated by `init` (running it again refreshes them) | Purpose |
|---|---|---|
| Pointer to the wiki | Marked block inside `AGENTS.md` (or `.github/copilot-instructions.md` if the project already uses it) | So the agent always knows the wiki exists and consults it before touching code |
| Consult skill | `.github/skills/okf-consult-wiki/SKILL.md` | Read `index.md` and drill into the relevant pages |
| Update skill | `.github/skills/okf-update-wiki/SKILL.md` | Edit pages in place, create new ones with `okw new`, then `okw validate --fix` and fix what it reports (so there is no separate validation skill) |
| Review skill | `.github/skills/okf-review-wiki/SKILL.md` | List unreviewed pages with `status`, walk the person through them one by one, and run `verify --by human:<id>` only after the person confirms |

Notes on Copilot:

- **Skills** (`SKILL.md` with required `name` and `description`, `name` equal to the folder name) follow the open standard agentskills.io. Copilot reads them in `.github/skills/`, `.claude/skills/` and `.agents/skills/`, and they show up as `/` commands in chat. They are used instead of *prompt files* (`.github/prompts/*.prompt.md`), which only work in the Local harness.
- `AGENTS.md` is read by Copilot, and also by Codex and others. In the Local harness it depends on the `chat.useAgentsMdFile` setting.
- `.github/copilot-instructions.md` is also read, with `github.copilot.chat.codeGeneration.useInstructionFiles`.
- A skill is activated by its `description` and the agent decides whether to load it; that is why the pointer exists, since it is always loaded.
- Generated files belong to the CLI: running `init` again regenerates them (and never touches the pages). Project content goes outside the markers. Each skill carries a header comment saying so.
- Paths are relative to the directory where `init` runs (the project root). The pointer block goes in the file that already has it, else in `AGENTS.md` if it exists, else in `.github/copilot-instructions.md` if it exists, else a new `AGENTS.md`.
- The wiki path is written into the generated files, and the update skill lists the types and sections of every folder of the profile, including `extra_folders`.
- `--no-agents` skips all of this.

Other agents (Claude Code, Cursor, Codex) will be added later as adapters with their paths.

Output for agents: `--json` on every command. `new` already returns the sections to fill in, so no separate command is needed to get a page template.

## 11. Open questions

- Minimum sections per folder: are they the right ones or too rigid?
- Is `# Why` required in `conventions/`? Currently not.
- Is a folder needed for raw sources (original documents the wiki is derived from)?
- Exact template of `workflows/update-wiki.md`.
