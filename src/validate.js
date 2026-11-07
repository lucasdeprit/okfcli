import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { CORE_FOLDERS, typeAlias } from './profile.js';
import { loadWiki, scanBody } from './pages.js';
import { regenerateIndexes } from './indexer.js';
import { KEBAB } from './util.js';
import { requiredPages } from './templates.js';
import { trustState } from './trust.js';

export const DEFAULT_SEVERITY = {
  'okf.frontmatter': 'error',
  'okf.type': 'error',
  'okf.index': 'error',
  'structure.core-folder': 'error',
  'structure.required-page': 'error',
  'structure.testing-page': 'error',
  'structure.unknown-folder': 'warning',
  'page.type': 'error',
  'page.sections': 'error',
  'page.todo': 'warning',
  'frontmatter.title': 'error',
  'frontmatter.description': 'error',
  'frontmatter.status': 'error',
  'frontmatter.verified': 'warning',
  'frontmatter.verified-outdated': 'warning',
  'name.kebab-case': 'error',
  'index.out-of-date': 'error',
  'link.broken': 'warning',
  'page.orphan': 'warning',
};

const STATUSES = ['draft', 'stable', 'deprecated'];
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// Returns the list of issues: { rule, severity, file, message, fix }.
export function validateWiki(root, profile) {
  const issues = [];
  const add = (rule, file, message, fix) => {
    const severity = profile.severity[rule] ?? DEFAULT_SEVERITY[rule];
    if (severity === 'off') return;
    issues.push({ rule, severity, file, message, fix });
  };

  const wiki = loadWiki(root);
  const foldersByName = new Map(profile.folders.map((f) => [f.name, f]));

  // Structure
  for (const folder of CORE_FOLDERS) {
    if (!existsSync(join(root, folder.name))) {
      add('structure.core-folder', `${folder.name}/`, `Core folder "${folder.name}/" is missing.`, 'Run "okw validate --fix" to create it.');
    }
  }
  for (const page of requiredPages()) {
    if (!existsSync(join(root, page.path))) {
      add('structure.required-page', page.path, `Required page ${page.path} is missing.`, 'Run "okw validate --fix" to recreate it.');
    }
  }
  if (existsSync(join(root, 'testing')) && !wiki.concepts.some((c) => c.folder === 'testing')) {
    add('structure.testing-page', 'testing/', 'testing/ has no strategy page.', 'Run "okw validate --fix" to scaffold testing/strategy.md, or create one with "okw new testing <name>".');
  }

  // Names
  for (const rel of [...wiki.dirs, ...wiki.concepts.map((c) => c.rel.replace(/\.md$/, ''))]) {
    const bad = rel.split('/').find((seg) => !KEBAB.test(seg));
    if (bad) {
      add('name.kebab-case', rel, `"${bad}" is not kebab-case.`, 'Rename it using lowercase letters, digits and hyphens, then run "okw validate --fix".');
    }
  }

  // Reserved files
  for (const idx of wiki.indexes) {
    const hasFront = /^---\r?\n/.test(idx.text);
    if (hasFront) {
      const keys = [...idx.text.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);
      const allowed = idx.rel === 'index.md' && keys.every((k) => k === 'okf_version');
      if (!allowed) {
        add('okf.index', idx.rel, 'index.md must not have frontmatter (only the root one may carry okf_version).', 'Run "okw validate --fix" to regenerate it.');
      }
    }
  }

  // Concept pages
  const linkedFrom = new Map();
  for (const page of wiki.concepts) {
    const { rel, data, body } = page;
    if (!data) {
      add('okf.frontmatter', rel, 'Missing or unparseable YAML frontmatter.', 'Start the file with a "---" block containing at least type, title and description.');
      continue;
    }
    if (isBlank(data.type)) {
      add('okf.type', rel, 'Frontmatter has no "type".', 'Add a "type:" field.');
    }
    const folder = page.folder ? foldersByName.get(page.folder) : undefined;
    if (!folder) {
      add(
        'structure.unknown-folder',
        rel,
        page.folder ? `Folder "${page.folder}/" is not part of the profile.` : 'Pages must live inside a profile folder, not at the wiki root.',
        'Move the page to a profile folder, or declare the folder in extra_folders of .okf-profile.yaml.',
      );
    } else {
      if (!isBlank(data.type) && data.type !== folder.type) {
        add('page.type', rel, `type is "${data.type}" but pages in ${folder.name}/ must be "${folder.type}".`, `Set "type: ${folder.type}" or move the page.`);
      }
    }
    if (isBlank(data.title)) add('frontmatter.title', rel, 'Frontmatter has no "title".', 'Add a "title:" field.');
    if (isBlank(data.description)) add('frontmatter.description', rel, 'Frontmatter has no "description".', 'Add a one-sentence "description:" field.');
    if (data.status !== undefined && !STATUSES.includes(data.status)) {
      add('frontmatter.status', rel, `status "${data.status}" is not valid.`, `Use one of: ${STATUSES.join(', ')}.`);
    }
    if (data.status !== 'deprecated') {
      const { tier, outdated, last } = trustState(data, body);
      const review = `Review the page and run "okw verify ${rel} --by human:<id>".`;
      if (outdated) {
        add('frontmatter.verified-outdated', rel, `Page changed after it was verified (last by ${last?.by ?? 'unknown'} on ${String(last?.at ?? '?').slice(0, 10)}).`, review);
      } else if (tier === 'unverified') {
        add('frontmatter.verified', rel, 'Page has not been reviewed.', review);
      }
    }

    const { headings, links } = scanBody(body);
    if (folder) {
      for (const section of folder.sections) {
        if (!headings.includes(section)) {
          add('page.sections', rel, `Missing required section "# ${section}".`, 'Run "okw validate --fix" to add the skeleton, then fill it in.');
        }
      }
    }
    const todos = (body.match(/<!--\s*TODO/g) ?? []).length;
    if (todos) add('page.todo', rel, `${todos} unfilled TODO placeholder${todos > 1 ? 's' : ''}.`, 'Write the section content and remove the "<!-- TODO -->" comment.');

    for (const target of links) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const path = target.split('#')[0];
      if (!path.endsWith('.md')) continue;
      const resolved = path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(rel), path));
      if (!existsSync(join(root, resolved))) {
        add('link.broken', rel, `Broken link to ${target}.`, 'Fix the path or remove the link.');
      } else if (resolved !== rel) {
        if (!linkedFrom.has(resolved)) linkedFrom.set(resolved, new Set());
        linkedFrom.get(resolved).add(rel);
      }
    }
  }
  const entryPoints = new Set(requiredPages().map((p) => p.path));
  for (const page of wiki.concepts) {
    if (page.data && !entryPoints.has(page.rel) && !linkedFrom.has(page.rel)) {
      add('page.orphan', page.rel, 'No other page links to this one.', 'Link it from a related page (for example the workflow or architecture page that uses it).');
    }
  }

  // Indexes
  for (const rel of regenerateIndexes(root, profile, { check: true })) {
    add('index.out-of-date', rel, 'This index does not match the pages in its folder (or is missing).', 'Run "okw validate --fix" to regenerate it.');
  }

  const order = { error: 0, warning: 1 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
  return issues;
}

export { typeAlias };
