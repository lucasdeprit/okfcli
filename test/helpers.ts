import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';

export function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'okfcli-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

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
