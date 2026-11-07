import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { KEBAB, UserError } from './util.js';
import type { Folder, Profile, Severity } from './types.js';

export const PROFILE_ID = 'base@0.1';
export const PROFILE_FILE = '.okf-profile.yaml';
export const OKF_VERSION = '0.2';
const SEVERITIES: Severity[] = ['error', 'warning', 'off'];

// Base profile folders. Names and `type` are fixed; see SPEC.md section 3.
const folder = (core: boolean, name: string, type: string, title: string, description: string, sections: string[]): Folder => ({
  name,
  type,
  title,
  description,
  sections,
  core,
});
const core = (...args: [string, string, string, string, string[]]): Folder => folder(true, ...args);
const optional = (...args: [string, string, string, string, string[]]): Folder => folder(false, ...args);

export const CORE_FOLDERS: Folder[] = [
  core('overview', 'Overview', 'Overview', 'What the project is, its scope and its glossary.', ['Purpose', 'Scope']),
  core('architecture', 'Architecture', 'Architecture', 'Structure, layers and dependency rules.', ['Overview', 'Rules', 'Why']),
  core('patterns', 'Pattern', 'Patterns', 'How each thing is implemented, with a real example.', ['When to use', 'How', 'Example', 'Why']),
  core('conventions', 'Convention', 'Conventions', 'Style, naming and working conventions.', ['Rule', 'Examples']),
  core('workflows', 'Workflow', 'Workflows', 'How we work: setup, build, PRs, releases, onboarding.', ['Goal', 'Steps']),
  core('testing', 'Testing', 'Testing', 'Testing strategy, how to run it and rules.', ['Scope', 'How to run', 'Rules']),
];

export const OPTIONAL_FOLDERS: Folder[] = [
  optional('features', 'Feature', 'Features', 'Business capabilities and flows.', ['Summary', 'Behavior']),
  optional('modules', 'Module', 'Modules', 'Internal packages and components.', ['Responsibility', 'Public API']),
  optional('interfaces', 'Interface', 'Interfaces', 'External contracts: APIs, events, integrations.', ['Contract', 'Consumers']),
  optional('operations', 'Operation', 'Operations', 'Deployment, runbooks and incidents.', ['When', 'Steps']),
  optional('troubleshooting', 'Troubleshooting', 'Troubleshooting', 'Known problems and how to fix them.', ['Symptom', 'Cause', 'Fix']),
];

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
      core: false,
      extra: true,
    };
  });
  return {
    config,
    severity: severity as Record<string, Severity>,
    folders: [...CORE_FOLDERS, ...OPTIONAL_FOLDERS, ...extra],
  };
}

export const folderByName = (profile: Profile, name: string): Folder | undefined => profile.folders.find((f) => f.name === name);

/** One of the base profile folders; they always exist. */
export function coreFolder(name: string): Folder {
  const folder = CORE_FOLDERS.find((f) => f.name === name);
  if (!folder) throw new Error(`Unknown core folder: ${name}`);
  return folder;
}

export function findFolderByType(profile: Profile, alias: string): Folder | undefined {
  return profile.folders.find((f) => typeAlias(f.type) === alias.toLowerCase());
}
