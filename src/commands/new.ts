import { join } from 'node:path';
import { findFolderByType, loadProfile, typeAlias } from '../core/profile.js';
import { regenerateIndexes } from '../wiki/indexer.js';
import { renderPage } from '../generate/templates.js';
import { UserError, assertKebabPath, createText, errorCode, humanize } from '../core/util.js';
import type { CommandResult } from '../core/types.js';

export const newHelp = `okfcli new <type> <name> --description "..." [--title "..."]

Creates a page with frontmatter and a section skeleton, and registers it in
the index.md of its folder. The name is relative to the folder of the type
(e.g. "state-management" or "ui/forms"). The type is the singular name: overview, architecture, pattern, convention, workflow,
testing, feature, module, interface, operation, troubleshooting.`;

export interface NewPageOptions {
  root: string;
  type: string;
  name: string;
  title?: string | undefined;
  description?: string | undefined;
}

export function newPage({ root, type, name, title, description }: NewPageOptions): CommandResult {
  const profile = loadProfile(root);
  const folder = findFolderByType(profile, type);
  if (!folder) {
    const valid = profile.folders.map((f) => typeAlias(f.type)).join(', ');
    throw new UserError(`Unknown type "${type}". Available types: ${valid}.`);
  }
  if (!description?.trim()) {
    throw new UserError('Missing --description: one sentence saying what the page is about.');
  }
  const slug = name.replace(/\.md$/, '').replace(/^\/+|\/+$/g, '');
  assertKebabPath(slug);

  const rel = `${folder.name}/${slug}.md`;
  const file = join(root, rel);
  const pageTitle = title?.trim() || humanize(slug.split('/').pop() ?? slug);
  const text = renderPage({
    folder,
    title: pageTitle,
    description: description.trim(),
  });
  try {
    createText(file, text);
  } catch (err) {
    if (errorCode(err) === 'EEXIST') throw new UserError(`${rel} already exists. Edit it instead of creating it again.`);
    throw err;
  }

  const indexes = regenerateIndexes(root, profile);
  const sections = folder.sections.map((s) => `# ${s}`);

  return {
    path: rel,
    type: folder.type,
    sections,
    updated: indexes,
    text: [
      `Created ${rel} (type: ${folder.type}).`,
      `Indexes updated: ${indexes.join(', ') || 'none'}.`,
      `Fill in these sections: ${sections.join(', ')}.`,
    ].join('\n'),
  };
}
