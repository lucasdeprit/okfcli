import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';

// Runs `fn` in a fresh temp directory and always removes it afterwards.
export async function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'okfcli-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Paths and reads inside the wiki created by `okfcli init` (./wiki).
export const wikiFile = (dir: string, rel: string): string => join(dir, 'wiki', rel);
export const readWiki = (dir: string, rel: string): string => readFileSync(wikiFile(dir, rel), 'utf8');

// Runs the CLI capturing output and exit code.
export async function okfcli(cwd: string, ...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { cwd, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

// Parsed `--json` output. Its shape depends on the command, so tests treat it loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
export const parseJson = (text: string): Json => JSON.parse(text);
