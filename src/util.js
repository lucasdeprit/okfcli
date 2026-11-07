import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { UserError } from './errors.js';

export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Wiki paths always use "/", on Windows too.
export const toPosix = (p) => p.split('\\').join('/');

// Writes through a temp file and a rename, so a crash never leaves a truncated page.
export function writeText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

// Creates a new file; fails with EEXIST instead of overwriting (no check-then-write race).
export function createText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
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
