import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'yaml';

/** Expected error: the message is printed and the process exits with code 1, no stack trace. */
export class UserError extends Error {}

// Files the CLI owns inside every wiki folder; they are never pages.
export const RESERVED = new Set(['index.md', 'log.md']);

export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Wiki paths always use "/", on Windows too.
export const toPosix = (p: string): string => p.split('\\').join('/');

// Writes through a temp file and a rename, so a crash never leaves a truncated page.
export function writeText(file: string, text: string): void {
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
export function createText(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
}

// Writes only if the content changes. Returns true if it wrote.
export function writeIfChanged(file: string, text: string): boolean {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeText(file, text);
  return true;
}

export function humanize(slug: string): string {
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isoNow(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Single-line YAML scalar (quoted only when needed).
export const yamlScalar = (value: unknown): string => stringify(value, { lineWidth: 0 }).trim();

export function assertKebabPath(rel: string): void {
  for (const s of rel.split('/')) {
    if (!KEBAB.test(s)) {
      throw new UserError(`"${s}" is not kebab-case (lowercase letters, digits and hyphens). Example: "state-management".`);
    }
  }
}

/** Reads the `code` of a Node error without assuming the thrown value is an Error. */
export const errorCode = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : undefined;
