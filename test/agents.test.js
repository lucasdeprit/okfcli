import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, okw } from './helpers.js';

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const SKILLS = ['okf-consult-wiki', 'okf-update-wiki', 'okf-review-wiki'];

test('init generates the pointer block and the three Copilot skills', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const r = await okw(dir, 'init', 'docs/wiki');
    assert.equal(r.code, 0, r.err);
    const agents = read(dir, 'AGENTS.md');
    assert.match(agents, /<!-- okw:start -->[\s\S]*docs\/wiki\/index\.md[\s\S]*<!-- okw:end -->/);
    for (const name of SKILLS) {
      const text = read(dir, `.github/skills/${name}/SKILL.md`);
      assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---\\n`), 'name matches the folder and has a description');
      assert.match(text, /docs\/wiki/);
    }
    assert.match(r.out, /created\s+\.github\/skills\/okf-review-wiki\/SKILL\.md/);
  } finally {
    cleanup();
  }
});

test('the skills tell agents to use the CLI and not to review pages themselves', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    const update = read(dir, '.github/skills/okf-update-wiki/SKILL.md');
    assert.match(update, /okw new <type> <name> --description/);
    assert.match(update, /never write `verified` entries/);
    assert.match(update, /okw validate --fix/);
    assert.match(update, /- `pattern` -> `patterns\/` \(sections: `# When to use`, `# How`, `# Example`, `# Why`\)/);
    const review = read(dir, '.github/skills/okf-review-wiki/SKILL.md');
    assert.match(review, /okw verify <path> --by human:<id>/);
    assert.match(review, /Only after a clear yes/);
    assert.match(review, /Never use a `human:` actor for yourself/);
  } finally {
    cleanup();
  }
});

test('the pointer block is appended to an existing AGENTS.md without touching the rest', async () => {
  const { dir, cleanup } = tempDir();
  try {
    writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n\nBe nice.\n');
    await okw(dir, 'init');
    const agents = read(dir, 'AGENTS.md');
    assert.ok(agents.startsWith('# Rules\n\nBe nice.\n\n<!-- okw:start -->'));
    assert.equal(agents.match(/okw:start/g).length, 1);
  } finally {
    cleanup();
  }
});

test('running init again refreshes the block in place and reports unchanged files', async () => {
  const { dir, cleanup } = tempDir();
  try {
    writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n');
    await okw(dir, 'init');
    const file = join(dir, 'AGENTS.md');
    writeFileSync(file, read(dir, 'AGENTS.md').replace('Project wiki', 'OLD TEXT').replace('\n', '\nBefore\n') + '\nAfter\n');
    writeFileSync(join(dir, '.github/skills/okf-update-wiki/SKILL.md'), 'stale\n');
    const again = await okw(dir, 'init', '--json');
    const data = JSON.parse(again.out);
    const status = Object.fromEntries(data.agent_files.map((f) => [f.path, f.status]));
    assert.equal(status['AGENTS.md'], 'updated');
    assert.equal(status['.github/skills/okf-update-wiki/SKILL.md'], 'updated');
    assert.equal(status['.github/skills/okf-consult-wiki/SKILL.md'], 'unchanged');
    const agents = read(dir, 'AGENTS.md');
    assert.ok(!agents.includes('OLD TEXT'));
    assert.match(agents, /Before/);
    assert.match(agents, /After/);
    assert.equal(agents.match(/okw:start/g).length, 1);
    const third = JSON.parse((await okw(dir, 'init', '--json')).out);
    assert.ok(third.agent_files.every((f) => f.status === 'unchanged' || f.path === 'AGENTS.md'));
  } finally {
    cleanup();
  }
});

test('uses .github/copilot-instructions.md when the project has it and no AGENTS.md', async () => {
  const { dir, cleanup } = tempDir();
  try {
    mkdirSync(join(dir, '.github'));
    writeFileSync(join(dir, '.github/copilot-instructions.md'), 'Use tabs.\n');
    await okw(dir, 'init');
    assert.ok(!existsSync(join(dir, 'AGENTS.md')));
    assert.match(read(dir, '.github/copilot-instructions.md'), /^Use tabs\.\n\n<!-- okw:start -->/);
  } finally {
    cleanup();
  }
});

test('--no-agents skips the agent files', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const r = await okw(dir, 'init', '--no-agents');
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(dir, 'wiki/index.md')));
    assert.ok(!existsSync(join(dir, 'AGENTS.md')));
    assert.ok(!existsSync(join(dir, '.github')));
  } finally {
    cleanup();
  }
});

test('the update skill lists the folders declared in extra_folders', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    const profile = join(dir, 'wiki/.okf-profile.yaml');
    writeFileSync(profile, readFileSync(profile, 'utf8').replace('extra_folders: []', 'extra_folders:\n  - name: mobile\n    type: Mobile\n    sections: ["# Summary"]'));
    await okw(dir, 'init');
    assert.match(read(dir, '.github/skills/okf-update-wiki/SKILL.md'), /- `mobile` -> `mobile\/` \(sections: `# Summary`\)/);
  } finally {
    cleanup();
  }
});

test('init creates no git repository and no log', async () => {
  const { dir, cleanup } = tempDir();
  try {
    await okw(dir, 'init');
    assert.ok(!existsSync(join(dir, '.git')));
    assert.ok(!existsSync(join(dir, 'wiki/log.md')));
  } finally {
    cleanup();
  }
});
