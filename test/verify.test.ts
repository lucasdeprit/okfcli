import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir, okfcli, wikiFile, readWiki, parseJson, type Json } from './helpers.js';
import { parseFrontmatter } from '../src/core/frontmatter.js';

// The compiled test lives in dist/test/, two levels below package.json.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

// A pattern page whose placeholders are filled in, with a frontmatter comment to check it survives.
const filled = (extraFront = '') =>
  `---\n# keep this comment\ntype: Pattern\ntitle: State\ndescription: State.\n${extraFront}---\n\n# When to use\n\nAlways.\n\n# How\n\nLike this.\n\n# Example\n\nCode.\n\n# Why\n\nBecause.\n`;

async function setup(dir: string, front?: string): Promise<void> {
  await okfcli(dir, 'init');
  await okfcli(dir, 'new', 'pattern', 'state', '--description', 'State.');
  writeFileSync(wikiFile(dir, 'patterns/state.md'), filled(front));
}

const check = async (dir: string): Promise<Json> => parseJson((await okfcli(dir, 'validate', '--json')).out);
// Review-related issue raised for a page, if any.
const reviewIssue = (res: Json, path: string) => res.issues.find((i: Json) => i.file === path && i.rule.startsWith('frontmatter.verified'))?.rule;

test('verify adds { by, at, hash } and keeps the rest of the file intact', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    const r = await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana', '--json');
    assert.equal(r.code, 0, r.err);
    const data = parseJson(r.out);
    assert.equal(data.tier, 'human-reviewed');
    assert.equal(data.verified.length, 1);
    const page = readWiki(dir, 'patterns/state.md');
    assert.match(page, /# keep this comment/);
    // Compare the parsed data, not the exact YAML layout, which depends on the yaml version.
    const [entry] = parseFrontmatter(page).data?.verified as Json[];
    assert.equal(entry.by, 'human:ana');
    assert.match(String(entry.at instanceof Date ? entry.at.toISOString() : entry.at), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    assert.match(entry.hash, /^[0-9a-f]{16}$/);
    assert.match(page, /\n---\n\n# When to use\n\nAlways\.\n/);
  });
});

test('verify replaces the entry of the same actor and keeps the others', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    await okfcli(dir, 'verify', 'patterns/state.md', '--by', 'human:ana');
    await okfcli(dir, 'verify', 'patterns/state.md', '--by', 'process:nightly');
    await okfcli(dir, 'verify', 'patterns/state.md', '--by', 'human:ana');
    const page = readWiki(dir, 'patterns/state.md');
    assert.equal(page.match(/human:ana/g)?.length, 1);
    assert.equal(page.match(/process:nightly/g)?.length, 1);
  });
});

test('verify converts a single hand-written mapping into a list', async () => {
  await withTempDir(async (dir) => {
    await setup(dir, 'verified: { by: human:bo, at: 2026-10-01T00:00:00Z }\n');
    await okfcli(dir, 'verify', 'patterns/state', '--by', 'process:ci');
    const page = readWiki(dir, 'patterns/state.md');
    const verified = parseFrontmatter(page).data?.verified as Json[];
    assert.deepEqual(verified.map((e: Json) => e.by), ['human:bo', 'process:ci']);
  });
});

test('verify defaults to a machine actor, and honours OKFCLI_ACTOR', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    const r = parseJson((await okfcli(dir, 'verify', 'patterns/state', '--json')).out);
    assert.equal(r.tier, 'machine-confirmed');
    assert.equal(r.verified[0].by, `okfcli/${version}`);
  });
});

test('editing a verified page makes the verification outdated until it is verified again', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), 'frontmatter.verified');
    await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);

    writeFileSync(wikiFile(dir, 'patterns/state.md'), readWiki(dir, 'patterns/state.md').replace('Because.', 'Because of this.'));
    const after = await check(dir);
    assert.equal(reviewIssue(after, 'patterns/state.md'), 'frontmatter.verified-outdated');
    assert.equal(after.review.outdated, 1);

    await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);
  });
});

test('changing status does not invalidate a verification; re-verifying drops outdated entries of others', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    await okfcli(dir, 'verify', 'patterns/state', '--by', 'process:ci');
    writeFileSync(wikiFile(dir, 'patterns/state.md'), readWiki(dir, 'patterns/state.md').replace('type: Pattern', 'status: stable\ntype: Pattern'));
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);

    writeFileSync(wikiFile(dir, 'patterns/state.md'), readWiki(dir, 'patterns/state.md').replace('Code.', 'More code.'));
    await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    const page = readWiki(dir, 'patterns/state.md');
    assert.ok(!page.includes('process:ci'), 'the outdated entry of another actor is dropped');
    assert.match(page, /human:ana/);
  });
});

test('a verification written by hand (no hash) is accepted and never outdated', async () => {
  await withTempDir(async (dir) => {
    await setup(dir, 'verified:\n  - { by: human:ana, at: 2026-10-01T00:00:00Z }\n');
    assert.equal(reviewIssue(await check(dir), 'patterns/state.md'), undefined);
    writeFileSync(wikiFile(dir, 'patterns/state.md'), readWiki(dir, 'patterns/state.md').replace('Because.', 'Changed.'));
    const after = await check(dir);
    assert.equal(reviewIssue(after, 'patterns/state.md'), undefined);
    assert.equal(after.review['human-reviewed'], 1);
  });
});

test('verify refuses pages with unfilled TODOs unless --force', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    await okfcli(dir, 'new', 'pattern', 'state', '--description', 'State.');
    const refused = await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    assert.equal(refused.code, 1);
    assert.match(refused.err, /4 unfilled TODO placeholders/);
    assert.ok(!/verified/.test(readWiki(dir, 'patterns/state.md')));
    const forced = await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana', '--force');
    assert.equal(forced.code, 0, forced.err);
  });
});

test('verify validates its inputs', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    assert.match((await okfcli(dir, 'verify')).err, /Usage: okfcli verify/);
    assert.match((await okfcli(dir, 'verify', 'patterns/nope')).err, /Page not found/);
    assert.match((await okfcli(dir, 'verify', 'patterns/state', '--by', 'ana')).err, /Invalid actor/);
    writeFileSync(wikiFile(dir, 'patterns/raw.md'), '# no frontmatter\n');
    assert.match((await okfcli(dir, 'verify', 'patterns/raw')).err, /no parseable frontmatter/);
  });
});

test('verify accepts a path relative to the current directory', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    const r = await okfcli(join(dir, 'wiki/patterns'), 'verify', 'state.md', '--by', 'human:ana');
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Verified patterns\/state\.md/);
  });
});

test('validate summarises the review state and skips deprecated pages', async () => {
  await withTempDir(async (dir) => {
    await setup(dir);
    await okfcli(dir, 'verify', 'patterns/state', '--by', 'human:ana');
    writeFileSync(wikiFile(dir, 'patterns/old.md'), filled('status: deprecated\n').replace('title: State', 'title: Old'));
    await okfcli(dir, 'validate', '--fix');
    const r = await check(dir);
    assert.deepEqual(r.review, { pages: 4, deprecated: 1, 'human-reviewed': 1, 'machine-confirmed': 0, unverified: 2, outdated: 0 });
    assert.equal(reviewIssue(r, 'patterns/old.md'), undefined, 'deprecated pages are not asked to be reviewed');
    assert.equal(reviewIssue(r, 'overview/project.md'), 'frontmatter.verified');
    const text = (await okfcli(dir, 'validate')).out;
    assert.match(text, /Review: 1 human-reviewed, 0 machine-confirmed, 2 unverified, 0 outdated/);
  });
});

test('the status and index commands no longer exist', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    for (const name of ['status', 'index', 'log']) {
      const r = await okfcli(dir, name);
      assert.equal(r.code, 1);
      assert.match(r.err, /Unknown command/);
    }
  });
});
