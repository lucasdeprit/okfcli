import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';

export function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'okw-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// Runs the CLI capturing output and exit code.
export async function okw(cwd, ...args) {
  const out = [];
  const err = [];
  const code = await run(args, { cwd, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
