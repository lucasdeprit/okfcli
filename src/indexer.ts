import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { humanize, writeIfChanged, toPosix, RESERVED } from './util.js';
import { OKF_VERSION } from './profile.js';
import type { Profile } from './types.js';

const isHidden = (name: string): boolean => name.startsWith('.');

function listDir(absDir: string): { pages: string[]; dirs: string[] } {
  const entries = readdirSync(absDir, { withFileTypes: true }).filter((e) => !isHidden(e.name));
  const pages = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !RESERVED.has(e.name))
    .map((e) => e.name)
    .sort();
  const dirs = entries
    .filter((e) => e.isDirectory() && e.name !== 'node_modules')
    .map((e) => e.name)
    .sort();
  return { pages, dirs };
}

const entryLine = (title: string, url: string, description: string): string =>
  `* [${title}](${url})${description ? ` - ${description}` : ''}`;

// Single line: multi-line descriptions would break the list format.
const oneLine = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

export function renderIndex(root: string, relDir: string, profile: Profile): string {
  const absDir = join(root, relDir);
  const { pages, dirs } = listDir(absDir);
  const folderMeta = (name: string) => (relDir === '' ? profile.folders.find((f) => f.name === name) : undefined);
  const prefix = relDir === '' ? '' : `/${relDir}`;
  const ownMeta = relDir === '' ? undefined : profile.folders.find((f) => f.name === relDir);
  const heading = relDir === '' ? 'Index' : ownMeta?.title ?? humanize(relDir.split('/').pop() ?? relDir);

  const lines = [`# ${heading}`, ''];

  const subs = dirs.map((d) => {
    const meta = folderMeta(d);
    return entryLine(meta?.title ?? humanize(d), `${prefix}/${d}/index.md`, oneLine(meta?.description));
  });
  const files = pages.map((p) => {
    const { data } = parseFrontmatter(readFileSync(join(absDir, p), 'utf8'));
    const title = oneLine(data?.title) || humanize(p.replace(/\.md$/, ''));
    return entryLine(title, `${prefix}/${p}`, oneLine(data?.description));
  });

  const entries = [...subs, ...files];
  lines.push(...(entries.length ? entries : ['_No pages yet._']), '');

  const body = lines.join('\n');
  return relDir === '' ? `---\nokf_version: "${OKF_VERSION}"\n---\n${body}` : body;
}

// Directories (relative, "" = root) that must have an index.md.
export function indexedDirs(root: string): string[] {
  const result = [''];
  const walk = (rel: string): void => {
    const { dirs } = listDir(join(root, rel));
    for (const d of dirs) {
      const child = rel ? `${rel}/${d}` : d;
      result.push(child);
      walk(child);
    }
  };
  walk('');
  return result;
}

// Regenerates every index.md. With check=true it writes nothing and only reports.
export function regenerateIndexes(root: string, profile: Profile, { check = false }: { check?: boolean } = {}): string[] {
  const changed: string[] = [];
  for (const rel of indexedDirs(root)) {
    const file = join(root, rel, 'index.md');
    const text = renderIndex(root, rel, profile);
    const current = existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : null;
    if (current !== null && current.replace(/\r\n/g, '\n') === text) continue;
    if (!check) writeIfChanged(file, text);
    changed.push(toPosix(rel ? `${rel}/index.md` : 'index.md'));
  }
  return changed;
}
