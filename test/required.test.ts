import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir, okfcli, wikiFile, readWiki, parseJson, type Json } from './helpers.js';

const profilePath = (dir: string): string => wikiFile(dir, '.okf-profile.yaml');
const setProfile = (dir: string, yaml: string): void => writeFileSync(profilePath(dir), yaml);
const validate = async (dir: string, ...extra: string[]): Promise<Json> => parseJson((await okfcli(dir, 'validate', '--json', ...extra)).out);
const rules = (res: Json): string[] => res.issues.map((i: Json) => `${i.rule}:${i.file}`);

// A profile as written before required_folders / required_pages existed.
const OLD_PROFILE = '# my comment\nprofile: base@0.1\nlanguage: en\nextra_folders:\n  - { name: mobile, type: Mobile, sections: ["# Summary"] }\n';

test('a profile without the required keys keeps requiring what the base profile did, and says so', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    setProfile(dir, OLD_PROFILE);
    rmSync(wikiFile(dir, 'conventions'), { recursive: true });
    const res = await validate(dir);
    const r = rules(res);
    assert.ok(r.includes('structure.required-folder:conventions/'));
    assert.ok(r.includes('profile.migrate:.okf-profile.yaml'));
    assert.equal(readFileSync(profilePath(dir), 'utf8'), OLD_PROFILE, 'a read-only validate does not write the profile');
  });
});

test('validate --fix writes the missing keys, keeps comments and other keys, and is idempotent', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    setProfile(dir, OLD_PROFILE);
    const res = await validate(dir, '--fix');
    assert.ok(res.fixed.some((f: string) => f.includes('required_folders and required_pages')));
    assert.ok(!rules(res).some((x: string) => x.startsWith('profile.migrate')));
    const text = readFileSync(profilePath(dir), 'utf8');
    assert.match(text, /# my comment/);
    assert.match(text, /name: mobile/);
    assert.match(text, /required_folders:\n  - overview\n/);
    assert.match(text, /required_pages:\n  - overview\/project\.md\n  - workflows\/update-wiki\.md\n/);
    await validate(dir, '--fix');
    assert.equal(readFileSync(profilePath(dir), 'utf8'), text);
  });
});

test('init on a wiki with an old profile writes the missing keys', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    setProfile(dir, OLD_PROFILE);
    const again = await okfcli(dir, 'init');
    assert.match(again.out, /Wrote required_folders and required_pages to \.okf-profile\.yaml/);
    assert.match(readFileSync(profilePath(dir), 'utf8'), /required_folders:/);
    const third = await okfcli(dir, 'init');
    assert.doesNotMatch(third.out, /Wrote required_folders/);
  });
});

test('a folder removed from required_folders is no longer required but its pages are still checked', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    setProfile(dir, 'profile: base@0.1\nrequired_folders: [overview, workflows]\nrequired_pages: [overview/project.md, workflows/update-wiki.md]\n');
    rmSync(wikiFile(dir, 'conventions'), { recursive: true });
    writeFileSync(wikiFile(dir, 'patterns/odd.md'), '---\ntype: Wrong\ntitle: Odd\ndescription: Odd.\n---\n');
    const res = await validate(dir, '--fix');
    const r = rules(res);
    assert.ok(!r.some((x: string) => x.startsWith('structure.required-folder')));
    assert.ok(!r.some((x: string) => x.startsWith('structure.unknown-folder')));
    assert.ok(r.includes('page.type:patterns/odd.md'));
    assert.ok(!existsSync(wikiFile(dir, 'conventions')), '--fix does not recreate a folder that is not required');
    assert.ok(!res.fixed.some((f: string) => f.includes('profile')), 'a profile with both keys is not rewritten');
  });
});

test('required_pages decides which pages are required and recreated', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    setProfile(dir, 'profile: base@0.1\nrequired_pages: [overview/project.md, conventions/naming.md]\n');
    rmSync(wikiFile(dir, 'workflows/update-wiki.md'));
    let res = await validate(dir);
    let r = rules(res);
    assert.ok(r.includes('structure.required-page:conventions/naming.md'));
    assert.ok(!r.includes('structure.required-page:workflows/update-wiki.md'), 'a page not listed is not required');
    res = await validate(dir, '--fix');
    r = rules(res);
    assert.ok(res.fixed.some((f: string) => f.includes('Recreated conventions/naming.md')));
    assert.ok(!existsSync(wikiFile(dir, 'workflows/update-wiki.md')));
    assert.match(readWiki(dir, 'conventions/naming.md'), /^---\ntype: Convention\ntitle: Naming\n/);
    assert.match(readWiki(dir, 'conventions/naming.md'), /# Rule\n\n<!-- TODO: Rule -->/);
    assert.ok(!r.includes('structure.required-page:conventions/naming.md'));
  });
});

test('profile: required_folders and required_pages are validated', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    for (const [yaml, re] of <[string, RegExp][]>[
      ['required_folders: nope\n', /"required_folders" must be a list of strings/],
      ['required_folders: [overview, nonsense]\n', /required_folders has "nonsense"/],
      ['required_folders: [../evil]\n', /required_folders has "\.\.\/evil"/],
      ['required_pages: [overview/Project.md]\n', /required_pages entry "overview\/Project\.md" must look like/],
      ['required_pages: [project.md]\n', /required_pages entry "project\.md" must look like/],
      ['required_pages: [overview/index.md]\n', /required_pages entry "overview\/index\.md" must look like/],
      ['required_pages: [elsewhere/page.md]\n', /"elsewhere\/", which is not a base folder/],
    ]) {
      setProfile(dir, `profile: base@0.1\n${yaml}`);
      const r = await okfcli(dir, 'validate');
      assert.equal(r.code, 1, yaml);
      assert.match(r.err, re);
    }
  });
});

test('required_folders may name a folder declared in extra_folders', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    setProfile(dir, 'profile: base@0.1\nrequired_folders: [overview, mobile]\nrequired_pages: [overview/project.md]\nextra_folders:\n  - { name: mobile, type: Mobile }\n');
    const res = await validate(dir, '--fix');
    assert.ok(res.fixed.some((f: string) => f.includes('Created folder mobile/')));
    assert.ok(existsSync(wikiFile(dir, 'mobile/index.md')));
  });
});

test('the consult skill sends the agent to index.md instead of listing folders', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    const skill = readFileSync(join(dir, '.github/skills/okf-consult-wiki/SKILL.md'), 'utf8');
    assert.match(skill, /wiki\/index\.md/);
    assert.doesNotMatch(skill, /troubleshooting|interfaces|operations/);
  });
});
