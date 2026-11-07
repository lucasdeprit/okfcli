import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir, okfcli, parseJson } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/okfcli.js', import.meta.url));
const profileFile = (dir: string) => join(dir, 'wiki', '.okf-profile.yaml');

test('the real binary reports its version and exits 0', () => {
  const r = spawnSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\d+\.\d+\.\d+/);
});

test('the real binary exits 1 on an unknown command', () => {
  const r = spawnSync(process.execPath, [BIN, 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});

test('profile: extra_folders name must be kebab-case (no path traversal)', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    writeFileSync(profileFile(dir), `profile: base@0.1\nextra_folders:\n  - { name: ../../evil, type: Evil }\n`);
    const r = await okfcli(dir, 'new', 'evil', 'x', '--description', 'x');
    assert.equal(r.code, 1);
    assert.match(r.err, /extra_folders name/);
    assert.equal(existsSync(join(dir, '..', '..', 'evil')), false);
  } finally {
    cleanup();
  }
});

test('profile: invalid shapes give a clear error, not a stack trace', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    for (const [yaml, re] of <[string, RegExp][]>[
      ['extra_folders: nope\n', /must be a list/],
      ['severity: { page.todo: eror }\n', /severity of "page.todo"/],
      ['severity: [a]\n', /"severity" must be a mapping/],
      ['just a string\n', /must be a YAML mapping/],
    ]) {
      writeFileSync(profileFile(dir), yaml);
      const r = await okfcli(dir, 'validate');
      assert.equal(r.code, 1, yaml);
      assert.match(r.err, re);
    }
  } finally {
    cleanup();
  }
});

test('verify refuses paths that escape the wiki, including ".."-prefixed names and symlinks', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    writeFileSync(join(dir, 'outside.md'), '---\ntitle: x\n---\nbody\n');
    let r = await okfcli(dir, 'verify', '../outside.md', '--by', 'human:a');
    assert.equal(r.code, 1);
    r = await okfcli(dir, 'verify', join(dir, 'outside.md'), '--by', 'human:a');
    assert.equal(r.code, 1);
    symlinkSync(join(dir, 'outside.md'), join(dir, 'wiki', 'link.md'));
    r = await okfcli(dir, 'verify', 'link', '--by', 'human:a');
    assert.equal(r.code, 1);
    assert.equal(readFileSync(join(dir, 'outside.md'), 'utf8'), '---\ntitle: x\n---\nbody\n');
  } finally {
    cleanup();
  }
});

test('verify accepts a folder whose name starts with ".." characters', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    mkdirSync(join(dir, 'wiki', '..odd'));
    writeFileSync(join(dir, 'wiki', '..odd', 'p.md'), '---\ntitle: p\n---\nbody\n');
    const r = await okfcli(dir, 'verify', '..odd/p', '--by', 'human:a');
    assert.equal(r.code, 0, r.err);
  } finally {
    cleanup();
  }
});

test('init refuses a pointer block with a start marker but no end marker', async () => {
  const { dir, cleanup } = tempDir();
  try {
    writeFileSync(join(dir, 'AGENTS.md'), '# Mine\n\n<!-- okfcli:start -->\nhalf a block\n');
    const r = await okfcli(dir, 'init');
    assert.equal(r.code, 1);
    assert.match(r.err, /without/);
    assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# Mine\n\n<!-- okfcli:start -->\nhalf a block\n');
  } finally {
    cleanup();
  }
});

test('generated skills quote a wiki path that contains spaces', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const r = await okfcli(dir, 'init', 'my docs/wiki');
    assert.equal(r.code, 0, r.err);
    const text = readFileSync(join(dir, '.github/skills/okf-update-wiki/SKILL.md'), 'utf8');
    assert.match(text, /--wiki "my docs\/wiki"/);
  } finally {
    cleanup();
  }
});

test('validate does not flag indexes checked out with CRLF line endings', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    const file = join(dir, 'wiki', 'index.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
    const r = await okfcli(dir, 'validate', '--json');
    assert.ok(!parseJson(r.out).issues.some((i: { rule: string }) => i.rule === 'index.out-of-date'));
  } finally {
    cleanup();
  }
});

test('new does not overwrite an existing page', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    await okfcli(dir, 'new', 'pattern', 'a', '--description', 'x');
    const r = await okfcli(dir, 'new', 'pattern', 'a', '--description', 'y');
    assert.equal(r.code, 1);
    assert.match(r.err, /already exists/);
  } finally {
    cleanup();
  }
});

test('a symlinked .md is neither a page nor listed in the index (one walk decides both)', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    writeFileSync(join(dir, 'outside.md'), '---\ntype: Pattern\ntitle: Linked\ndescription: d\n---\n');
    symlinkSync(join(dir, 'outside.md'), join(dir, 'wiki', 'patterns', 'linked.md'));
    const r = await okfcli(dir, 'validate', '--fix', '--json');
    const data = parseJson(r.out);
    assert.ok(!data.issues.some((i: { file: string }) => i.file === 'patterns/linked.md'));
    assert.ok(!readFileSync(join(dir, 'wiki', 'patterns', 'index.md'), 'utf8').includes('linked'));
  } finally {
    cleanup();
  }
});
