import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir, okfcli, parseJson, type Json } from './helpers.js';

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8');
const SKILLS = ['okf-consult-wiki', 'okf-update-wiki', 'okf-review-wiki'];

test('init generates the pointer block and the three Copilot skills', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', 'docs/wiki');
    assert.equal(r.code, 0, r.err);
    const agents = read(dir, 'AGENTS.md');
    assert.match(agents, /<!-- okfcli:start -->[\s\S]*docs\/wiki\/index\.md[\s\S]*<!-- okfcli:end -->/);
    for (const name of SKILLS) {
      const text = read(dir, `.github/skills/${name}/SKILL.md`);
      assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---\\n`), 'name matches the folder and has a description');
      assert.match(text, /docs\/wiki/);
    }
    assert.match(r.out, /created\s+\.github\/skills\/okf-review-wiki\/SKILL\.md/);
  });
});

test('the skills tell agents to use the CLI and not to review pages themselves', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    const update = read(dir, '.github/skills/okf-update-wiki/SKILL.md');
    assert.match(update, /okfcli new <type> <name> --description/);
    assert.match(update, /never write `verified` entries/);
    assert.match(update, /okfcli validate --fix/);
    assert.match(update, /- `pattern` -> `patterns\/` \(sections: `# When to use`, `# How`, `# Example`, `# Why`\)/);
    const review = read(dir, '.github/skills/okf-review-wiki/SKILL.md');
    assert.match(review, /okfcli verify <path> --by human:<id>/);
    assert.match(review, /Only after a clear yes/);
    assert.match(review, /Never use a `human:` actor for yourself/);
  });
});

test('the pointer block is appended to an existing AGENTS.md without touching the rest', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n\nBe nice.\n');
    await okfcli(dir, 'init');
    const agents = read(dir, 'AGENTS.md');
    assert.ok(agents.startsWith('# Rules\n\nBe nice.\n\n<!-- okfcli:start -->'));
    assert.equal(agents.match(/okfcli:start/g)?.length, 1);
  });
});

test('running init again refreshes the block in place and reports unchanged files', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n');
    await okfcli(dir, 'init');
    const file = join(dir, 'AGENTS.md');
    writeFileSync(file, read(dir, 'AGENTS.md').replace('Project wiki', 'OLD TEXT').replace('\n', '\nBefore\n') + '\nAfter\n');
    writeFileSync(join(dir, '.github/skills/okf-update-wiki/SKILL.md'), 'stale\n');
    const again = await okfcli(dir, 'init', '--json');
    const data = parseJson(again.out);
    const status = Object.fromEntries(data.agent_files.map((f: Json) => [f.path, f.status]));
    assert.equal(status['AGENTS.md'], 'updated');
    assert.equal(status['.github/skills/okf-update-wiki/SKILL.md'], 'updated');
    assert.equal(status['.github/skills/okf-consult-wiki/SKILL.md'], 'unchanged');
    const agents = read(dir, 'AGENTS.md');
    assert.ok(!agents.includes('OLD TEXT'));
    assert.match(agents, /Before/);
    assert.match(agents, /After/);
    assert.equal(agents.match(/okfcli:start/g)?.length, 1);
    const third = parseJson((await okfcli(dir, 'init', '--json')).out);
    assert.ok(third.agent_files.every((f: Json) => f.status === 'unchanged' || f.path === 'AGENTS.md'));
  });
});

test('uses .github/copilot-instructions.md when the project has it and no AGENTS.md', async () => {
  await withTempDir(async (dir) => {
    mkdirSync(join(dir, '.github'));
    writeFileSync(join(dir, '.github/copilot-instructions.md'), 'Use tabs.\n');
    await okfcli(dir, 'init');
    assert.ok(!existsSync(join(dir, 'AGENTS.md')));
    assert.match(read(dir, '.github/copilot-instructions.md'), /^Use tabs\.\n\n<!-- okfcli:start -->/);
  });
});

test('--no-agents skips the agent files', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', '--no-agents');
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(dir, 'wiki/index.md')));
    assert.ok(!existsSync(join(dir, 'AGENTS.md')));
    assert.ok(!existsSync(join(dir, '.github')));
  });
});

test('the update skill lists the folders declared in extra_folders', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    const profile = join(dir, 'wiki/.okf-profile.yaml');
    writeFileSync(profile, readFileSync(profile, 'utf8').replace('extra_folders: []', 'extra_folders:\n  - name: mobile\n    type: Mobile\n    sections: ["# Summary"]'));
    await okfcli(dir, 'init');
    assert.match(read(dir, '.github/skills/okf-update-wiki/SKILL.md'), /- `mobile` -> `mobile\/` \(sections: `# Summary`\)/);
  });
});

test('init creates no git repository and no log', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    assert.ok(!existsSync(join(dir, '.git')));
    assert.ok(!existsSync(join(dir, 'wiki/log.md')));
  });
});

const exists = (dir: string, rel: string): boolean => existsSync(join(dir, rel));
const skillsAt = (dir: string, skillsDir: string): boolean => SKILLS.every((name) => exists(dir, `${skillsDir}/${name}/SKILL.md`));

test('with no agent flag only Copilot is connected', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init');
    assert.ok(skillsAt(dir, '.github/skills'));
    assert.ok(!exists(dir, '.claude') && !exists(dir, '.agents') && !exists(dir, 'CLAUDE.md'));
  });
});

test('--claude connects Claude Code and not Copilot', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', '--claude');
    assert.equal(r.code, 0, r.err);
    assert.ok(skillsAt(dir, '.claude/skills'));
    assert.match(read(dir, 'CLAUDE.md'), /<!-- okfcli:start -->[\s\S]*wiki\/index\.md[\s\S]*<!-- okfcli:end -->/);
    assert.ok(!exists(dir, '.github') && !exists(dir, 'AGENTS.md'));
  });
});

test('--claude puts the block in an existing CLAUDE.md and keeps the rest', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Mine\n\nBe brief.\n');
    await okfcli(dir, 'init', '--claude');
    assert.ok(read(dir, 'CLAUDE.md').startsWith('# Mine\n\nBe brief.\n\n<!-- okfcli:start -->'));
  });
});

test('a new CLAUDE.md imports an existing AGENTS.md and leaves it untouched', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n\nUse tabs.\n');
    await okfcli(dir, 'init', '--claude');
    assert.ok(read(dir, 'CLAUDE.md').startsWith('@AGENTS.md\n\n<!-- okfcli:start -->'));
    assert.equal(read(dir, 'AGENTS.md'), '# Rules\n\nUse tabs.\n');
  });
});

test('--codex --opencode --cursor share one AGENTS.md and one .agents/skills', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', '--codex', '--opencode', '--cursor', '--json');
    const paths: string[] = parseJson(r.out).agent_files.map((f: Json) => f.path);
    assert.equal(new Set(paths).size, paths.length, 'no file is written twice');
    assert.equal(paths.length, 1 + SKILLS.length);
    assert.ok(skillsAt(dir, '.agents/skills'));
    assert.equal(read(dir, 'AGENTS.md').match(/okfcli:start/g)?.length, 1);
    assert.ok(!exists(dir, '.github'));
  });
});

test('--copilot --claude connects both, and a second run changes nothing', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init', '--copilot', '--claude');
    assert.ok(skillsAt(dir, '.github/skills') && skillsAt(dir, '.claude/skills'));
    assert.ok(read(dir, 'CLAUDE.md').startsWith('@AGENTS.md\n\n'), 'CLAUDE.md imports the AGENTS.md written in the same run');
    const again = parseJson((await okfcli(dir, 'init', '--copilot', '--claude', '--json')).out);
    assert.ok(again.agent_files.every((f: Json) => f.status === 'unchanged'));
  });
});

test('the order of the flags does not change the result', async () => {
  await withTempDir(async (a) => {
    await withTempDir(async (b) => {
      await okfcli(a, 'init', '--claude', '--copilot');
      await okfcli(b, 'init', '--copilot', '--claude');
      assert.equal(read(a, 'CLAUDE.md'), read(b, 'CLAUDE.md'));
    });
  });
});

test('--no-agents wins over the agent flags', async () => {
  await withTempDir(async (dir) => {
    await okfcli(dir, 'init', '--claude', '--no-agents');
    assert.ok(!exists(dir, 'CLAUDE.md') && !exists(dir, '.claude'));
  });
});

test('init --help lists every supported agent', async () => {
  await withTempDir(async (dir) => {
    const r = await okfcli(dir, 'init', '--help');
    for (const name of ['copilot', 'claude', 'codex', 'opencode', 'cursor']) assert.match(r.out, new RegExp(`--${name}\\b`));
  });
});
