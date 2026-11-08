import { existsSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stringify } from 'yaml';
import { BASE_REQUIRED, OPTIONAL_FOLDERS, PROFILE_FILE, PROFILE_ID, loadProfile, writeMissingRequired } from '../core/profile.js';
import { regenerateIndexes } from '../wiki/indexer.js';
import { requiredPageTemplates } from '../generate/templates.js';
import { writeAgentFiles } from '../generate/agents.js';
import { AGENT_NAMES, AGENT_TARGETS, DEFAULT_AGENTS, type AgentName } from '../generate/targets.js';
import { findWikiRoot } from '../wiki/root.js';
import { UserError, toPosix, writeText } from '../core/util.js';
import type { CommandResult, Folder, AgentFileResult } from '../core/types.js';

export const initHelp = `okfcli init [folder] [--with features,modules] [--language en] ${AGENT_NAMES.map((n) => `[--${n}]`).join(' ')} [--no-agents]

Creates a wiki with the base profile (in ./wiki by default) and the files
that connect it to your coding agents, relative to the current directory:
  a pointer block to the wiki in the instructions file the agent loads
  okf-consult-wiki, okf-update-wiki, okf-review-wiki skills (consult, update and review the wiki)

Pass the agents you use; without any flag it connects ${DEFAULT_AGENTS.join(', ')}:
${AGENT_NAMES.map((n) => `  --${n.padEnd(10)} ${AGENT_TARGETS[n].instructions[0]} + ${AGENT_TARGETS[n].skillsDir}/`).join('\n')}
Flags can be combined (okfcli init --claude --codex). okfcli never deletes
files, so files of an agent you stop passing stay where they are.

Run it again in a project that already has a wiki to refresh those files (for
example after upgrading okfcli). It never touches the wiki pages; if the profile
lacks required_folders or required_pages it writes them.
  --with       optional folders to create now: ${OPTIONAL_FOLDERS.map((f) => f.name).join(', ')}
  --language   language of the wiki content, informational only (default: en)
  --no-agents  do not generate the agent files`;

function findExisting(cwd: string, dir: string | undefined): string | null {
  if (dir !== undefined) {
    const root = resolve(cwd, dir);
    return existsSync(join(root, PROFILE_FILE)) ? root : null;
  }
  try {
    return findWikiRoot(cwd);
  } catch {
    return null;
  }
}

function createWiki(root: string, withFolders: string[], language: string): string[] {
  const known = new Map<string, Folder>(OPTIONAL_FOLDERS.map((f) => [f.name, f]));
  for (const name of withFolders) {
    if (!known.has(name)) {
      throw new UserError(`"${name}" is not an optional folder. Options: ${[...known.keys()].join(', ')}.`);
    }
  }
  const profileText = `# okfcli profile of this wiki. See https://github.com/lucasdeprit/okfcli/blob/main/SPEC.md\n${stringify({ profile: PROFILE_ID, language, required_folders: BASE_REQUIRED.folders, required_pages: BASE_REQUIRED.pages, extra_folders: [] })}`;
  writeText(join(root, PROFILE_FILE), profileText);

  const created = [PROFILE_FILE];
  const profile = loadProfile(root);
  const names = [...new Set([...profile.requiredFolders, ...withFolders])];
  for (const name of names) {
    mkdirSync(join(root, name), { recursive: true });
    created.push(`${name}/`);
  }
  for (const page of requiredPageTemplates(profile)) {
    writeText(join(root, page.path), page.text);
    created.push(page.path);
  }
  created.push(...regenerateIndexes(root, profile));
  return created;
}

export interface InitOptions {
  cwd: string;
  dir?: string | undefined;
  withFolders?: string[];
  language?: string | undefined;
  /** Agents to connect. Default: Copilot. An empty list generates no agent files. */
  agents?: AgentName[] | undefined;
  version: string;
}

export function init({ cwd, dir, withFolders = [], language = 'en', agents = DEFAULT_AGENTS, version }: InitOptions): CommandResult {
  const existing = findExisting(cwd, dir);
  if (existing && withFolders.length) {
    throw new UserError('A wiki already exists here: --with only applies when creating one. Add folders by creating pages with "okfcli new".');
  }
  const root = existing ?? resolve(cwd, dir ?? 'wiki');
  const wikiRel = toPosix(relative(cwd, root)) || '.';

  const created = existing ? [] : createWiki(root, withFolders, language);
  const migrated = existing ? writeMissingRequired(root) : [];
  const agentFiles: AgentFileResult[] = agents.length ? writeAgentFiles({ projectRoot: cwd, wiki: wikiRel, profile: loadProfile(root), version, agents }) : [];

  const lines = [];
  if (existing) {
    lines.push(`A wiki already exists in ${wikiRel}; its pages were not touched.`);
    if (migrated.length) lines.push(`Wrote ${migrated.join(' and ')} to ${PROFILE_FILE}: edit them to choose what this wiki requires.`);
  }
  else lines.push(`Wiki created in ${wikiRel}`, ...created.map((c) => `  ${c}`));
  if (agentFiles.length) lines.push('', 'Agent files:', ...agentFiles.map((f) => `  ${f.status.padEnd(9)} ${f.path}`));
  return { root, created, agent_files: agentFiles, text: lines.join('\n') };
}
