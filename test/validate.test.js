import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, okw } from './helpers.js';

const W = (dir, rel) => join(dir, 'wiki', rel);
const read = (dir, rel) => readFileSync(W(dir, rel), 'utf8');

async function issues(dir, ...extra) {
  const r = await okw(dir, 'validate', '--json', ...extra);
  return { ...JSON.parse(r.out), code: r.code };
}
const rules = (res) => res.issues.map((i) => `${i.rule}:${i.file}`);

// A page with every section filled in and verified, so it raises no issues.
const goodPage = (type, sections, extra = '') =>
  `---\ntype: ${type}\ntitle: Good\ndescription: A good page.\nverified:\n  - { by: human:me, at: 2026-10-19T09:00:00Z }\n---\n\n${sections.map((s) => `# ${s}\n\nContent.\n`).join('\n')}${extra}`;

async function cleanWiki(dir) {
  await okw(dir, 'init');
  writeFileSync(W(dir, 'testing/strategy.md'), goodPage('Testing', ['Scope', 'How to run', 'Rules'], '\nSee [project](/overview/project.md).\n'));
  writeFileSync(W(dir, 'overview/project.md'), goodPage('Overview', ['Purpose', 'Scope'], '\nTesting: [strategy](/testing/strategy.md).\n'));
  writeFileSync(W(dir, 'workflows/update-wiki.md'), goodPage('Workflow', ['Goal', 'Steps']));
  await okw(dir, 'validate', '--fix');
}

test('a fresh wiki has no errors, only warnings about unreviewed and unfilled pages', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    const res = await issues(dir);
    assert.equal(res.ok, true);
    assert.equal(res.code, 0);
    assert.equal(res.errors, 0);
    assert.ok(rules(res).includes('page.todo:testing/strategy.md'));
  } finally {
    cleanup();
  }
});

test('a complete wiki validates with no issues', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    const res = await issues(dir);
    assert.deepEqual(res.issues, []);
    assert.equal(res.ok, true);
    assert.equal(res.code, 0);
  } finally {
    cleanup();
  }
});

test('new pages raise TODO and unreviewed warnings, not errors', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    await okw(dir, 'new', 'pattern', 'state', '--description', 'State.');
    const res = await issues(dir);
    assert.equal(res.errors, 0);
    assert.ok(rules(res).includes('page.todo:patterns/state.md'));
    assert.ok(rules(res).includes('frontmatter.verified:patterns/state.md'));
    assert.ok(rules(res).includes('page.orphan:patterns/state.md'));
    assert.equal((await issues(dir, '--strict')).ok, false);
  } finally {
    cleanup();
  }
});

test('reports type, sections, frontmatter, names and status errors with a fix hint', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    writeFileSync(W(dir, 'patterns/Bad_Name.md'), '---\ntype: Convention\nstatus: weird\n---\n# How\n');
    writeFileSync(W(dir, 'patterns/no-front.md'), '# Just text\n');
    writeFileSync(W(dir, 'patterns/no-type.md'), '---\ntitle: T\ndescription: D\n---\n');
    const res = await issues(dir);
    const r = rules(res);
    for (const expected of [
      'name.kebab-case:patterns/Bad_Name',
      'page.type:patterns/Bad_Name.md',
      'page.sections:patterns/Bad_Name.md',
      'frontmatter.title:patterns/Bad_Name.md',
      'frontmatter.description:patterns/Bad_Name.md',
      'frontmatter.status:patterns/Bad_Name.md',
      'okf.frontmatter:patterns/no-front.md',
      'okf.type:patterns/no-type.md',
    ]) {
      assert.ok(r.includes(expected), `missing ${expected} in ${r.join(', ')}`);
    }
    assert.ok(res.issues.every((i) => i.fix && i.message));
  } finally {
    cleanup();
  }
});

test('detects broken links and unknown folders', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    writeFileSync(
      W(dir, 'conventions/naming.md'),
      goodPage('Convention', ['Rule', 'Examples'], '\nSee [x](/nope/missing.md) and [web](https://example.com/a.md).\n'),
    );
    mkdirSync(W(dir, 'misc'));
    writeFileSync(W(dir, 'misc/note.md'), goodPage('Note', []));
    await okw(dir, 'validate', '--fix');
    const r = rules(await issues(dir));
    assert.ok(r.includes('link.broken:conventions/naming.md'));
    assert.ok(r.includes('structure.unknown-folder:misc/note.md'));
    assert.equal(r.filter((x) => x.startsWith('link.broken')).length, 1, 'external links are ignored');
  } finally {
    cleanup();
  }
});

test('detects missing core folders and index frontmatter', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    rmSync(W(dir, 'conventions'), { recursive: true });
    writeFileSync(W(dir, 'patterns/index.md'), '---\ntitle: nope\n---\n# Patterns\n');
    const r = rules(await issues(dir));
    assert.ok(r.includes('structure.core-folder:conventions/'));
    assert.ok(r.includes('okf.index:patterns/index.md'));
  } finally {
    cleanup();
  }
});

test('severity can be overridden or switched off in the profile', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    await okw(dir, 'new', 'pattern', 'state', '--description', 'State.');
    const file = W(dir, '.okf-profile.yaml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}severity:\n  page.todo: error\n  page.orphan: off\n  frontmatter.verified: off\n`);
    const res = await issues(dir);
    assert.ok(res.issues.some((i) => i.rule === 'page.todo' && i.severity === 'error'));
    assert.ok(!res.issues.some((i) => i.rule === 'page.orphan' || i.rule === 'frontmatter.verified'));
    assert.equal(res.ok, false);
  } finally {
    cleanup();
  }
});

test('--fix repairs folders, required pages, sections and indexes, and reports what remains', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await cleanWiki(dir);
    rmSync(W(dir, 'conventions'), { recursive: true });
    rmSync(W(dir, 'workflows/update-wiki.md'));
    rmSync(W(dir, 'testing/strategy.md'));
    writeFileSync(W(dir, 'patterns/short.md'), '---\ntype: Pattern\ntitle: Short\ndescription: Short one.\n---\n# How\n\nDone.\n');
    const res = await issues(dir, '--fix');
    assert.ok(res.fixed.some((f) => f.includes('Created folder conventions/')));
    assert.ok(res.fixed.some((f) => f.includes('Recreated workflows/update-wiki.md')));
    assert.ok(res.fixed.some((f) => f.includes('Created testing/strategy.md')));
    assert.ok(res.fixed.some((f) => f.includes('patterns/short.md')));
    assert.match(read(dir, 'patterns/short.md'), /# When to use\n\n<!-- TODO: When to use -->/);
    const r = rules(res);
    assert.ok(!r.some((x) => x.startsWith('structure.core-folder')));
    assert.ok(!r.some((x) => x.startsWith('page.sections')));
    assert.ok(!r.some((x) => x.startsWith('index.out-of-date')));
    assert.ok(r.includes('page.todo:patterns/short.md'), 'content problems remain for the agent');
    assert.equal(res.errors, 0);
  } finally {
    cleanup();
  }
});

test('human output lists rule, file, message and fix, and a summary line', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    rmSync(W(dir, 'testing/strategy.md'));
    const r = await okw(dir, 'validate');
    assert.equal(r.code, 1);
    assert.match(r.out, /error\s+structure\.testing-page\s+testing\//);
    assert.match(r.out, /scaffold testing\/strategy\.md/);
    assert.match(r.out, /\d+ errors?, \d+ warnings?\. Validation failed\./);
  } finally {
    cleanup();
  }
});
