import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { UserError } from './errors.js';

export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Wiki paths always use "/", on Windows too.
export const toPosix = (p) => p.split('\\').join('/');

export function writeText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// Writes only if the content changes. Returns true if it wrote.
export function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeText(file, text);
  return true;
}

export function humanize(slug) {
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isoNow(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoDate(now = new Date()) {
  return isoNow(now).slice(0, 10);
}

// Single-line YAML scalar (quoted only when needed).
export const yamlScalar = (value) => stringify(value, { lineWidth: 0 }).trim();

export function assertKebabPath(rel) {
  const segments = rel.split('/');
  for (const s of segments) {
    if (!KEBAB.test(s)) {
      throw new UserError(`"${s}" is not kebab-case (lowercase letters, digits and hyphens). Example: "state-management".`);
    }
  }
}
