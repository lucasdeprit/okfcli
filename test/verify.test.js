import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, okw } from './helpers.js';

const W = (dir, rel) => join(dir, 'wiki', rel);
const read = (dir, rel) => readFileSync(W(dir, rel), 'utf8');

// A pattern page whose placeholders are filled in, with a frontmatter comment to check it survives.
const filled = (extraFront = '') =>
  `---\n# keep this comment\ntype: Pattern\ntitle: State\ndescription: State.\n${extraFront}---\n\n# When to use\n\nAlways.\n\n# How\n\nLike this.\n\n# Example\n\nCode.\n\n# Why\n\nBecause.\n`;

async function setup(dir, front) {
  await okw(dir, 'init');
  await okw(dir, 'new', 'pattern', 'state', '--description', 'State.');
  writeFileSync(W(dir, 'patterns/state.md'), filled(front));
}

const check = async (dir) => JSON.parse((await okw(dir, 'validate', '--json')).out);
// Review-related issue raised for a page, if any.
const reviewIssue = (res, path) => res.issues.find((i) => i.file === path && i.rule.startsWith('frontmatter.verified'))?.rule;

test('verify adds { by, at, hash } and keeps the rest of the file intact', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    const r = await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana', '--json');
    assert.equal(r.code, 0, r.err);
    const data = JSON.parse(r.out);
    assert.equal(data.tier, 'human-reviewed');
    assert.equal(data.verified.length, 1);
    const page = read(dir, 'patterns/state.md');
    assert.match(page, /# keep this comment/);
    assert.match(page, /verified:\n  - \{ by: human:ana, at: \d{4}-\d{2}-\d{2}T[\d:]+Z, hash: [0-9a-f]{16} \}/);
    assert.match(page, /\n---\n\n# When to use\n\nAlways\.\n/);
  } finally {
    cleanup();
  }
});

test('verify replaces the entry of the same actor and keeps the others', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    await okw(dir, 'verify', 'patterns/state.md', '--by', 'human:ana');
    await okw(dir, 'verify', 'patterns/state.md', '--by', 'process:nightly');
    await okw(dir, 'verify', 'patterns/state.md', '--by', 'human:ana');
    const page = read(dir, 'patterns/state.md');
    assert.equal(page.match(/human:ana/g).length, 1);
    assert.equal(page.match(/process:nightly/g).length, 1);
  } finally {
    cleanup();
  }
});

test('verify converts a single hand-written mapping into a list', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir, 'verified: { by: human:bo, at: 2026-10-01T00:00:00Z }\n');
    await okw(dir, 'verify', 'patterns/state', '--by', 'process:ci');
    const page = read(dir, 'patterns/state.md');
    assert.match(page, /verified:\n  - \{ by: human:bo, at: 2026-10-01T00:00:00Z \}\n  - \{ by: process:ci,/);
  } finally {
    cleanup();
  }
});

test('verify defaults to a machine actor, and honours OKW_ACTOR', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    const r = JSON.parse((await okw(dir, 'verify', 'patterns/state', '--json')).out);
    assert.equal(r.tier, 'machine-confirmed');
    assert.equal(r.verified[0].by, 'okw/0.1.0');
  } finally {
    cleanup();
  }
});

test('editing a verified page makes the verification outdated until it is verified again', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), 'frontmatter.verified');
    await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);

    writeFileSync(W(dir, 'patterns/state.md'), read(dir, 'patterns/state.md').replace('Because.', 'Because of this.'));
    const after = await check(dir);
    assert.equal(reviewIssue(after, 'patterns/state.md'), 'frontmatter.verified-outdated');
    assert.equal(after.review.outdated, 1);

    await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);
  } finally {
    cleanup();
  }
});

test('changing status does not invalidate a verification; re-verifying drops outdated entries of others', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    await okw(dir, 'verify', 'patterns/state', '--by', 'process:ci');
    writeFileSync(W(dir, 'patterns/state.md'), read(dir, 'patterns/state.md').replace('type: Pattern', 'status: stable\ntype: Pattern'));
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);

    writeFileSync(W(dir, 'patterns/state.md'), read(dir, 'patterns/state.md').replace('Code.', 'More code.'));
    await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    const page = read(dir, 'patterns/state.md');
    assert.ok(!page.includes('process:ci'), 'the outdated entry of another actor is dropped');
    assert.match(page, /human:ana/);
  } finally {
    cleanup();
  }
});

test('a verification written by hand (no hash) is accepted and never outdated', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir, 'verified:\n  - { by: human:ana, at: 2026-10-01T00:00:00Z }\n');
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);
    writeFileSync(W(dir, 'patterns/state.md'), read(dir, 'patterns/state.md').replace('Because.', 'Changed.'));
    const after = await check(dir);
    assert.equal(reviewIssue(after, 'patterns/state.md'), undefined);
    assert.equal(after.review['human-reviewed'], 1);
  } finally {
    cleanup();
  }
});

test('verify refuses pages with unfilled TODOs unless --force', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    await okw(dir, 'new', 'pattern', 'state', '--description', 'State.');
    const refused = await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    assert.equal(refused.code, 1);
    assert.match(refused.err, /4 unfilled TODO placeholders/);
    assert.ok(!/verified/.test(read(dir, 'patterns/state.md')));
    const forced = await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana', '--force');
    assert.equal(forced.code, 0, forced.err);
  } finally {
    cleanup();
  }
});

test('verify validates its inputs', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    assert.match((await okw(dir, 'verify')).err, /Usage: okw verify/);
    assert.match((await okw(dir, 'verify', 'patterns/nope')).err, /Page not found/);
    assert.match((await okw(dir, 'verify', 'patterns/state', '--by', 'ana')).err, /Invalid actor/);
    writeFileSync(W(dir, 'patterns/raw.md'), '# no frontmatter\n');
    assert.match((await okw(dir, 'verify', 'patterns/raw')).err, /no parseable frontmatter/);
  } finally {
    cleanup();
  }
});

test('verify accepts a path relative to the current directory', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    const r = await okw(join(dir, 'wiki/patterns'), 'verify', 'state.md', '--by', 'human:ana');
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Verified patterns\/state\.md/);
  } finally {
    cleanup();
  }
});

test('validate summarises the review state and skips deprecated pages', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await setup(dir);
    await okw(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    writeFileSync(W(dir, 'patterns/old.md'), filled('status: deprecated\n').replace('title: State', 'title: Old'));
    await okw(dir, 'validate', '--fix');
    const r = await check(dir);
    assert.deepEqual(r.review, { pages: 5, deprecated: 1, 'human-reviewed': 1, 'machine-confirmed': 0, unverified: 3, outdated: 0 });
    assert.equal(reviewIssue(r, 'patterns/old.md'), undefined, 'deprecated pages are not asked to be reviewed');
    assert.equal(reviewIssue(r, 'testing/strategy.md'), 'frontmatter.verified');
    const text = (await okw(dir, 'validate')).out;
    assert.match(text, /Review: 1 human-reviewed, 0 machine-confirmed, 3 unverified, 0 outdated/);
  } finally {
    cleanup();
  }
});

test('the status and index commands no longer exist', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    for (const name of ['status', 'index', 'log']) {
      const r = await okw(dir, name);
      assert.equal(r.code, 1);
      assert.match(r.err, /Unknown command/);
    }
  } finally {
    cleanup();
  }
});
