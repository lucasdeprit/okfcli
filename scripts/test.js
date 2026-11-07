// Runs the compiled tests (dist/test/*.test.js). The files are listed
// explicitly because Node 20 does not expand globs in `node --test` on Windows.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../dist/test/', import.meta.url));
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => `dist/test/${f}`);

const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
