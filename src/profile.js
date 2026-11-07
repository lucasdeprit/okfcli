import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { UserError } from './errors.js';
import { KEBAB } from './util.js';

export const PROFILE_ID = 'base@0.1';
export const PROFILE_FILE = '.okf-profile.yaml';
export const OKF_VERSION = '0.2';
const SEVERITIES = ['error', 'warning', 'off'];

// Base profile folders. Names and `type` are fixed; see SPEC.md section 3.
const core = (name, type, title, description, sections) => ({
  name,
  type,
  title,
  description,
  sections,
  core: true,
});
const optional = (name, type, title, description, sections) => ({
  name,
  type,
  title,
  description,
  sections,
  core: false,
});

export const CORE_FOLDERS = [
  core('overview', 'Overview', 'Overview', 'What the project is, its scope and its glossary.', ['Purpose', 'Scope']),
  core('architecture', 'Architecture', 'Architecture', 'Structure, layers and dependency rules.', ['Overview', 'Rules', 'Why']),
  core('patterns', 'Pattern', 'Patterns', 'How each thing is implemented, with a real example.', ['When to use', 'How', 'Example', 'Why']),
  core('conventions', 'Convention', 'Conventions', 'Style, naming and working conventions.', ['Rule', 'Examples']),
  core('workflows', 'Workflow', 'Workflows', 'How we work: setup, build, PRs, releases, onboarding.', ['Goal', 'Steps']),
  core('testing', 'Testing', 'Testing', 'Testing strategy, how to run it and rules.', ['Scope', 'How to run', 'Rules']),
];

export const OPTIONAL_FOLDERS = [
  optional('features', 'Feature', 'Features', 'Business capabilities and flows.', ['Summary', 'Behavior']),
  optional('modules', 'Module', 'Modules', 'Internal packages and components.', ['Responsibility', 'Public API']),
  optional('interfaces', 'Interface', 'Interfaces', 'External contracts: APIs, events, integrations.', ['Contract', 'Consumers']),
  optional('operations', 'Operation', 'Operations', 'Deployment, runbooks and incidents.', ['When', 'Steps']),
  optional('troubleshooting', 'Troubleshooting', 'Troubleshooting', 'Known problems and how to fix them.', ['Symptom', 'Cause', 'Fix']),
];

// Command-line alias for a type: "Pattern" -> "pattern".
export const typeAlias = (type) => type.toLowerCase().replace(/\s+/g, '-');

export function loadProfile(wikiRoot) {
  const file = join(wikiRoot, PROFILE_FILE);
  if (!existsSync(file)) {
    throw new UserError(`${PROFILE_FILE} not found in ${wikiRoot}. Is this an okfcli wiki? Run "okfcli init".`);
  }
  let config;
  try {
    config = parse(readFileSync(file, 'utf8')) ?? {};
  } catch (err) {
    throw new UserError(`${PROFILE_FILE} is not valid YAML: ${err.message}`);
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new UserError(`${PROFILE_FILE} must be a YAML mapping.`);
  }
  if (config.extra_folders != null && !Array.isArray(config.extra_folders)) {
    throw new UserError(`${PROFILE_FILE}: "extra_folders" must be a list.`);
  }
  const severity = config.severity ?? {};
  if (typeof severity !== 'object' || Array.isArray(severity)) {
    throw new UserError(`${PROFILE_FILE}: "severity" must be a mapping of rule to ${SEVERITIES.join(', ')}.`);
  }
  for (const [rule, level] of Object.entries(severity)) {
    if (!SEVERITIES.includes(level)) {
      throw new UserError(`${PROFILE_FILE}: severity of "${rule}" is "${level}"; use ${SEVERITIES.join(', ')}.`);
    }
  }
  const extra = (config.extra_folders ?? []).map((f) => {
    if (!f?.name || !f?.type) {
      throw new UserError(`${PROFILE_FILE}: every extra_folders entry needs "name" and "type".`);
    }
    if (typeof f.name !== 'string' || !KEBAB.test(f.name)) {
      throw new UserError(`${PROFILE_FILE}: extra_folders name "${f.name}" must be kebab-case (lowercase letters, digits and hyphens).`);
    }
    const sections = (f.sections ?? []).map((s) => String(s).replace(/^#+\s*/, ''));
    return { name: f.name, type: f.type, title: f.title ?? f.type, description: f.description ?? '', sections, core: false, extra: true };
  });
  return {
    config,
    severity,
    folders: [...CORE_FOLDERS, ...OPTIONAL_FOLDERS, ...extra],
  };
}

export function findFolderByType(profile, alias) {
  return profile.folders.find((f) => typeAlias(f.type) === alias.toLowerCase());
}
