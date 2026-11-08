import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { KEBAB, UserError } from './util.js';
import { TEMPLATES, type WikiTemplate } from './wiki-templates.js';
import type { Folder, Profile, Severity } from './types.js';

export const PROFILE_ID = 'base@0.1';
export const PROFILE_FILE = '.okf-profile.yaml';
export const OKF_VERSION = '0.2';
const SEVERITIES: Severity[] = ['error', 'warning', 'off'];

// Catalog of the base profile folders: their names, `type` and sections. Which of
// them a wiki requires is not decided here but by `required_folders` in its profile.
const folder = (name: string, type: string, title: string, description: string, sections: string[]): Folder => ({
  name,
  type,
  title,
  description,
  sections,
});

/** Base folders of the catalog (the `development` template requires all of them). */
export const BASE_FOLDERS: Folder[] = [
  folder('overview', 'Overview', 'Overview', 'What the project is, its scope and its glossary.', ['Purpose', 'Scope']),
  folder('architecture', 'Architecture', 'Architecture', 'Structure, layers and dependency rules.', ['Overview', 'Rules', 'Why']),
  folder('patterns', 'Pattern', 'Patterns', 'How each thing is implemented, with a real example.', ['When to use', 'How', 'Example', 'Why']),
  folder('conventions', 'Convention', 'Conventions', 'Style, naming and working conventions.', ['Rule', 'Examples']),
  folder('workflows', 'Workflow', 'Workflows', 'How we work: setup, build, PRs, releases, onboarding.', ['Goal', 'Steps']),
  folder('testing', 'Testing', 'Testing', 'Testing strategy, how to run it and rules.', ['Scope', 'How to run', 'Rules']),
];

/** Folders of the catalog that `init` only creates on request (`--with`). */
export const OPTIONAL_FOLDERS: Folder[] = [
  folder('features', 'Feature', 'Features', 'Business capabilities and flows.', ['Summary', 'Behavior']),
  folder('modules', 'Module', 'Modules', 'Internal packages and components.', ['Responsibility', 'Public API']),
  folder('interfaces', 'Interface', 'Interfaces', 'External contracts: APIs, events, integrations.', ['Contract', 'Consumers']),
  folder('operations', 'Operation', 'Operations', 'Deployment, runbooks and incidents.', ['When', 'Steps']),
  folder('troubleshooting', 'Troubleshooting', 'Troubleshooting', 'Known problems and how to fix them.', ['Symptom', 'Cause', 'Fix']),
];

// What a profile written before `required_folders` existed required. Only the
// migration reads it: the checks themselves read the profile.
const BASE_REQUIRED = TEMPLATES.development as WikiTemplate;

// Command-line alias for a type: "Pattern" -> "pattern".
export const typeAlias = (type: string): string => type.toLowerCase().replace(/\s+/g, '-');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function loadProfile(wikiRoot: string): Profile {
  const file = join(wikiRoot, PROFILE_FILE);
  if (!existsSync(file)) {
    throw new UserError(`${PROFILE_FILE} not found in ${wikiRoot}. Is this an okfcli wiki? Run "okfcli init".`);
  }
  let config: unknown;
  try {
    config = parse(readFileSync(file, 'utf8')) ?? {};
  } catch (err) {
    throw new UserError(`${PROFILE_FILE} is not valid YAML: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(config)) {
    throw new UserError(`${PROFILE_FILE} must be a YAML mapping.`);
  }
  if (config.extra_folders != null && !Array.isArray(config.extra_folders)) {
    throw new UserError(`${PROFILE_FILE}: "extra_folders" must be a list.`);
  }
  const severity = config.severity ?? {};
  if (!isRecord(severity)) {
    throw new UserError(`${PROFILE_FILE}: "severity" must be a mapping of rule to ${SEVERITIES.join(', ')}.`);
  }
  for (const [rule, level] of Object.entries(severity)) {
    if (!SEVERITIES.includes(level as Severity)) {
      throw new UserError(`${PROFILE_FILE}: severity of "${rule}" is "${String(level)}"; use ${SEVERITIES.join(', ')}.`);
    }
  }
  const extra = ((config.extra_folders ?? []) as unknown[]).map((entry): Folder => {
    const f = isRecord(entry) ? entry : {};
    if (!f.name || !f.type) {
      throw new UserError(`${PROFILE_FILE}: every extra_folders entry needs "name" and "type".`);
    }
    if (typeof f.name !== 'string' || !KEBAB.test(f.name)) {
      throw new UserError(`${PROFILE_FILE}: extra_folders name "${String(f.name)}" must be kebab-case (lowercase letters, digits and hyphens).`);
    }
    const type = String(f.type);
    const sections = (Array.isArray(f.sections) ? f.sections : []).map((s) => String(s).replace(/^#+\s*/, ''));
    return {
      name: f.name,
      type,
      title: f.title ? String(f.title) : type,
      description: f.description ? String(f.description) : '',
      sections,
      extra: true,
    };
  });
  const folders = [...BASE_FOLDERS, ...OPTIONAL_FOLDERS, ...extra];
  const known = new Set(folders.map((f) => f.name));

  // A profile written before these keys existed requires what the base profile did.
  const migrated = missingRequiredKeys(config).length > 0;
  const requiredFolders = stringList(config, 'required_folders', BASE_REQUIRED.folders);
  for (const name of requiredFolders) {
    if (!known.has(name)) {
      throw new UserError(`${PROFILE_FILE}: required_folders has "${name}", which is not a base folder or declared in extra_folders. Known: ${[...known].join(', ')}.`);
    }
  }
  const requiredPages = stringList(config, 'required_pages', BASE_REQUIRED.pages);
  for (const path of requiredPages) {
    const segments = path.endsWith('.md') ? path.slice(0, -3).split('/') : [];
    const valid = segments.length >= 2 && segments.every((seg) => KEBAB.test(seg)) && segments[segments.length - 1] !== 'index';
    if (!valid) {
      throw new UserError(`${PROFILE_FILE}: required_pages entry "${path}" must look like "folder/page-name.md" (kebab-case, not index.md).`);
    }
    if (!known.has(segments[0] as string)) {
      throw new UserError(`${PROFILE_FILE}: required_pages entry "${path}" is in "${segments[0]}/", which is not a base folder or declared in extra_folders.`);
    }
  }
  return { config, severity: severity as Record<string, Severity>, folders, requiredFolders, requiredPages, migrated };
}

const REQUIRED_KEYS = { required_folders: BASE_REQUIRED.folders, required_pages: BASE_REQUIRED.pages };

const missingRequiredKeys = (config: Record<string, unknown>): string[] =>
  Object.keys(REQUIRED_KEYS).filter((key) => config[key] === undefined || config[key] === null);

// A list of strings in the profile, or `fallback` when the key is absent.
function stringList(config: Record<string, unknown>, key: string, fallback: string[]): string[] {
  const value = config[key];
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new UserError(`${PROFILE_FILE}: "${key}" must be a list of strings.`);
  }
  return [...new Set(value as string[])];
}

/**
 * Writes `required_folders` / `required_pages` into a profile that lacks them,
 * with what the base profile required, keeping comments and every other key.
 * Returns the keys it added.
 */
export function writeMissingRequired(wikiRoot: string): string[] {
  const file = join(wikiRoot, PROFILE_FILE);
  const doc = parseDocument(readFileSync(file, 'utf8'));
  const added = missingRequiredKeys((doc.toJS() ?? {}) as Record<string, unknown>);
  if (!added.length) return [];
  if (doc.contents === null) doc.contents = doc.createNode({}) as unknown as NonNullable<typeof doc.contents>;
  for (const key of added) doc.set(key, REQUIRED_KEYS[key as keyof typeof REQUIRED_KEYS]);
  writeFileSync(file, String(doc));
  return added;
}

export const folderByName = (profile: Profile, name: string): Folder | undefined => profile.folders.find((f) => f.name === name);

/** One of the base catalog folders, by name. */
export function baseFolder(name: string): Folder {
  const folder = [...BASE_FOLDERS, ...OPTIONAL_FOLDERS].find((f) => f.name === name);
  if (!folder) throw new Error(`Unknown base folder: ${name}`);
  return folder;
}

export function findFolderByType(profile: Profile, alias: string): Folder | undefined {
  return profile.folders.find((f) => typeAlias(f.type) === alias.toLowerCase());
}
