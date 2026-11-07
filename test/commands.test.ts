import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, okfcli, parseJson, type Json } from './helpers.js';

const read = (dir: string, rel: string) => readFileSync(join(dir, 'wiki', rel), 'utf8');

test('init creates the core, indexes and required pages', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const r = await okfcli(dir, 'init');
    assert.equal(r.code, 0);
    for (const f of ['overview', 'architecture', 'patterns', 'conventions', 'workflows', 'testing']) {
      assert.ok(existsSync(join(dir, 'wiki', f, 'index.md')), `${f}/index.md`);
    }
    assert.ok(existsSync(join(dir, 'wiki/.okf-profile.yaml')));
    assert.ok(existsSync(join(dir, 'wiki/overview/project.md')));
    assert.ok(existsSync(join(dir, 'wiki/workflows/update-wiki.md')));
    assert.match(read(dir, 'testing/strategy.md'), /^---\ntype: Testing\ntitle: Testing strategy\n/);
    assert.match(read(dir, 'testing/index.md'), /\[Testing strategy\]\(\/testing\/strategy\.md\)/);
    assert.match(read(dir, 'index.md'), /^---\nokf_version: "0.2"\n---\n# Index/);
    assert.match(read(dir, 'overview/index.md'), /\[Project\]\(\/overview\/project\.md\) - What the project is/);
    assert.ok(!existsSync(join(dir, 'wiki/log.md')), 'no log.md is created');
    assert.ok(!existsSync(join(dir, 'wiki/.git')) && !existsSync(join(dir, '.git')), 'no git repository is created');
    assert.ok(!existsSync(join(dir, 'wiki/features')), 'optional folders are not created by default');
  } finally {
    cleanup();
  }
});

test('init --with creates optional folders and rejects unknown names', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const bad = await okfcli(dir, 'init', '--with', 'nope');
    assert.equal(bad.code, 1);
    assert.match(bad.err, /is not an optional folder/);
    const ok = await okfcli(dir, 'init', '--with', 'features,modules');
    assert.equal(ok.code, 0);
    assert.ok(existsSync(join(dir, 'wiki/features/index.md')));
    assert.ok(existsSync(join(dir, 'wiki/modules/index.md')));
  } finally {
    cleanup();
  }
});

test('init in a project that already has a wiki refreshes agent files and leaves the pages alone', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    writeFileSync(join(dir, 'wiki/overview/project.md'), 'my edits\n');
    const again = await okfcli(dir, 'init');
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /already exists in wiki; its pages were not touched/);
    assert.equal(read(dir, 'overview/project.md'), 'my edits\n');
    const withFolders = await okfcli(dir, 'init', '--with', 'features');
    assert.equal(withFolders.code, 1);
    assert.match(withFolders.err, /--with only applies when creating/);
  } finally {
    cleanup();
  }
});

test('new creates the page with a skeleton and indexes it', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    const r = await okfcli(dir, 'new', 'pattern', 'state-management', '--description', 'Screen state.');
    assert.equal(r.code, 0, r.err);
    const page = read(dir, 'patterns/state-management.md');
    assert.match(page, /^---\ntype: Pattern\ntitle: State management\ndescription: Screen state\.\n/);
    assert.ok(!/generated|status|verified/.test(page.split('\n---\n')[0] ?? ''), 'new pages start with no trust fields');
    for (const s of ['When to use', 'How', 'Example', 'Why']) assert.match(page, new RegExp(`# ${s}\\n`));
    assert.match(read(dir, 'patterns/index.md'), /\[State management\]\(\/patterns\/state-management\.md\) - Screen state\./);
    assert.ok(!existsSync(join(dir, 'wiki/log.md')));
  } finally {
    cleanup();
  }
});

test('new validates type, description, kebab-case and duplicates', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    const t = await okfcli(dir, 'new', 'cosa', 'x', '--description', 'd');
    assert.match(t.err, /Unknown type/);
    const d = await okfcli(dir, 'new', 'pattern', 'x');
    assert.match(d.err, /Missing --description/);
    const k = await okfcli(dir, 'new', 'pattern', 'State_Management', '--description', 'd');
    assert.match(k.err, /is not kebab-case/);
    await okfcli(dir, 'new', 'pattern', 'x', '--description', 'd');
    const dup = await okfcli(dir, 'new', 'pattern', 'x', '--description', 'd');
    assert.match(dup.err, /patterns\/x\.md already exists/);
  } finally {
    cleanup();
  }
});

test('new in an optional folder creates and indexes it; supports subfolders', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    const r = await okfcli(dir, 'new', 'module', 'auth/core', '--description', 'Core.');
    assert.equal(r.code, 0, r.err);
    assert.match(read(dir, 'index.md'), /\[Modules\]\(\/modules\/index\.md\)/);
    assert.match(read(dir, 'modules/index.md'), /\[Auth\]\(\/modules\/auth\/index\.md\)/);
    assert.match(read(dir, 'modules/auth/index.md'), /\[Core\]\(\/modules\/auth\/core\.md\) - Core\./);
  } finally {
    cleanup();
  }
});

test('new --json returns structured data', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    const r = await okfcli(dir, 'new', 'convention', 'naming', '--description', 'Naming.', '--json');
    const data = parseJson(r.out);
    assert.equal(data.path, 'conventions/naming.md');
    assert.deepEqual(data.sections, ['# Rule', '# Examples']);
  } finally {
    cleanup();
  }
});

test('validate flags out-of-date indexes and --fix regenerates them', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init');
    const rules = async (...a: string[]) => parseJson((await okfcli(dir, 'validate', '--json', ...a)).out).issues.map((i: Json) => `${i.rule}:${i.file}`);
    assert.ok(!(await rules()).some((r: string) => r.startsWith('index.out-of-date')));
    writeFileSync(
      join(dir, 'wiki/conventions/naming.md'),
      '---\ntype: Convention\ntitle: Naming\ndescription: Naming.\n---\n# Rule\n\n# Examples\n',
    );
    assert.ok((await rules()).includes('index.out-of-date:conventions/index.md'));
    await okfcli(dir, 'validate', '--fix');
    assert.ok(!(await rules()).some((r: string) => r.startsWith('index.out-of-date')));
    assert.match(read(dir, 'conventions/index.md'), /\[Naming\]\(\/conventions\/naming\.md\) - Naming\./);
  } finally {
    cleanup();
  }
});

test('--wiki and upward search locate the wiki', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okfcli(dir, 'init', 'docs/wiki');
    mkdirSync(join(dir, 'src/deep'), { recursive: true });
    const viaSearch = await okfcli(join(dir, 'src/deep'), 'validate');
    assert.equal(viaSearch.code, 0, viaSearch.err);
    const viaFlag = await okfcli(dir, 'validate', '--wiki', 'docs/wiki');
    assert.equal(viaFlag.code, 0, viaFlag.err);
    const none = await okfcli(join(dir, '..'), 'validate');
    assert.equal(none.code, 1);
  } finally {
    cleanup();
  }
});

test('unknown command and help', async () => {
  const { dir, cleanup } = tempDir();
  try {
    assert.equal((await okfcli(dir, 'nada')).code, 1);
    const help = await okfcli(dir, '--help');
    assert.equal(help.code, 0);
    assert.match(help.out, /init \[folder\]/);
    assert.match((await okfcli(dir, 'new', '--help')).out, /okfcli new <type>/);
  } finally {
    cleanup();
  }
});
