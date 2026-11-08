import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir, okfcli, readWiki, parseJson, type Json } from './helpers.js';
import { TEMPLATES } from '../src/core/wiki-templates.js';
import { loadProfile } from '../src/core/profile.js';

const folders = (dir: string): string[] =>
  readdirSync(join(dir, 'wiki'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const validate = async (dir: string): Promise<Json> => parseJson((await okfcli(dir, 'validate', '--json')).out);

test('every template names catalog folders and pages inside them', async () => {
  await withTempDir(async (dir) => {
    for (const template of Object.values(TEMPLATES)) {
      await okfcli(dir, 'init', '--no-agents', '--template', template.name, `w-${template.name}`);
      const profile = loadProfile(join(dir, `w-${template.name}`));
      assert.deepEqual(profile.requiredFolders, template.folders);
      assert.deepEqual(profile.requiredPages, template.pages);
    }
  });
});

test('init without --template is the development template', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    assert.deepEqual(folders(dir), ['architecture', 'conventions', 'overview', 'patterns', 'testing', 'workflows']);
    assert.match(readWiki(dir, '.okf-profile.yaml'), /template: development\n/);
    assert.equal((await validate(dir)).errors, 0);
  });
});

test('init --template minimal creates only overview/project.md and workflows/update-wiki.md', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', '--template', 'minimal');
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(folders(dir), ['overview', 'workflows']);
    assert.ok(existsSync(join(dir, 'wiki/overview/project.md')));
    assert.ok(existsSync(join(dir, 'wiki/workflows/update-wiki.md')));
    const profile = readWiki(dir, '.okf-profile.yaml');
    assert.match(profile, /template: minimal\n/);
    assert.match(profile, /required_folders:\n  - overview\n  - workflows\nrequired_pages:\n  - overview\/project\.md\n  - workflows\/update-wiki\.md\n/);
    assert.match(readWiki(dir, 'index.md'), /\[Overview\]\(\/overview\/index\.md\)/);
    assert.doesNotMatch(readWiki(dir, 'index.md'), /Patterns|Testing/);
    const res = await validate(dir);
    assert.equal(res.errors, 0);
    assert.equal(res.issues.some((i: Json) => i.rule.startsWith('structure.') || i.rule === 'profile.migrate'), false);
  });
});

test('an unknown template is rejected and the error lists the available ones', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', '--template', 'nope');
    assert.equal(r.code, 1);
    assert.match(r.err, /Unknown template "nope"\. Available: development, minimal\./);
    assert.ok(!existsSync(join(dir, 'wiki')));
    const proto = await okfcli(dir, 'init', '--template', 'toString');
    assert.equal(proto.code, 1);
    assert.match(proto.err, /Unknown template/);
  });
});

test('--template only applies when creating a wiki', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    const r = await okfcli(dir, 'init', '--template', 'minimal');
    assert.equal(r.code, 1);
    assert.match(r.err, /--template only applies when creating one/);
  });
});

test('--template minimal --with adds a folder without requiring it', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init', '--template', 'minimal', '--with', 'features');
    assert.deepEqual(folders(dir), ['features', 'overview', 'workflows']);
    assert.doesNotMatch(readWiki(dir, '.okf-profile.yaml'), /- features/);
  });
});

test('a minimal wiki grows with "new" and still validates', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init', '--template', 'minimal');
    const r = await okfcli(dir, 'new', 'pattern', 'state', '--description', 'State.');
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(dir, 'wiki/patterns/state.md')));
    assert.equal((await validate(dir)).errors, 0);
  });
});

test('the update skill lists only the folders the wiki has', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init', '--template', 'minimal');
    const minimal = readFileSync(join(dir, '.github/skills/okf-update-wiki/SKILL.md'), 'utf8');
    assert.match(minimal, /- `overview` -> `overview\/`/);
    assert.match(minimal, /- `workflow` -> `workflows\/`/);
    assert.doesNotMatch(minimal, /`pattern`|`convention`|`architecture`/);
  });
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    const dev = readFileSync(join(dir, '.github/skills/okf-update-wiki/SKILL.md'), 'utf8');
    assert.match(dev, /- `pattern` -> `patterns\/`/);
    assert.doesNotMatch(dev, /`feature`/, 'optional folders that were not created are not listed');
  });
});
