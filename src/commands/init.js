import { existsSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stringify } from 'yaml';
import { CORE_FOLDERS, OPTIONAL_FOLDERS, PROFILE_FILE, PROFILE_ID, loadProfile } from '../profile.js';
import { regenerateIndexes } from '../indexer.js';
import { requiredPages, testingStrategyPage } from '../templates.js';
import { writeAgentFiles } from '../agents.js';
import { findWikiRoot } from '../wiki.js';
import { toPosix, writeText } from '../util.js';
import { UserError } from '../errors.js';

export const initHelp = `okw init [folder] [--with features,modules] [--language en] [--no-agents]

Creates a wiki with the base profile core (in ./wiki by default) and the files
that connect it to GitHub Copilot, relative to the current directory:
  AGENTS.md (or .github/copilot-instructions.md)   pointer block to the wiki
  .github/skills/okf-*/SKILL.md                    skills to consult, update and review the wiki

Run it again in a project that already has a wiki to refresh those files (for
example after upgrading okw). It never touches the wiki pages.
  --with       optional folders to create now: ${OPTIONAL_FOLDERS.map((f) => f.name).join(', ')}
  --language   language of the wiki content, informational only (default: en)
  --no-agents  do not generate the agent files`;

function findExisting(cwd, dir) {
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

function createWiki(root, withFolders, language) {
  const known = new Map(OPTIONAL_FOLDERS.map((f) => [f.name, f]));
  for (const name of withFolders) {
    if (!known.has(name)) {
      throw new UserError(`"${name}" is not an optional folder. Options: ${[...known.keys()].join(', ')}.`);
    }
  }
  const profileText = `# okw profile of this wiki. See SPEC.md.\n${stringify({ profile: PROFILE_ID, language, extra_folders: [] })}`;
  writeText(join(root, PROFILE_FILE), profileText);

  const created = [PROFILE_FILE];
  for (const folder of [...CORE_FOLDERS, ...withFolders.map((n) => known.get(n))]) {
    mkdirSync(join(root, folder.name), { recursive: true });
    created.push(`${folder.name}/`);
  }
  for (const page of [...requiredPages(), testingStrategyPage()]) {
    writeText(join(root, page.path), page.text);
    created.push(page.path);
  }
  created.push(...regenerateIndexes(root, loadProfile(root)));
  return created;
}

export function init({ cwd, dir, withFolders = [], language = 'en', agents = true, version }) {
  const existing = findExisting(cwd, dir);
  if (existing && withFolders.length) {
    throw new UserError('A wiki already exists here: --with only applies when creating one. Add folders by creating pages with "okw new".');
  }
  const root = existing ?? resolve(cwd, dir ?? 'wiki');
  const wikiRel = toPosix(relative(cwd, root)) || '.';

  const created = existing ? [] : createWiki(root, withFolders, language);
  const agentFiles = agents ? writeAgentFiles({ projectRoot: cwd, wiki: wikiRel, profile: loadProfile(root), version }) : [];

  const lines = [];
  if (existing) lines.push(`A wiki already exists in ${wikiRel}; its pages were not touched.`);
  else lines.push(`Wiki created in ${wikiRel}`, ...created.map((c) => `  ${c}`));
  if (agentFiles.length) lines.push('', 'Agent files:', ...agentFiles.map((f) => `  ${f.status.padEnd(9)} ${f.path}`));
  return { root, created, agent_files: agentFiles, text: lines.join('\n') };
}
