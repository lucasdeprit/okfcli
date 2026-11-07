import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../core/frontmatter.js';
import { RESERVED } from '../core/util.js';
import type { Folder, Page } from '../core/types.js';

// The one place that decides what is part of the wiki: hidden entries and
// node_modules are skipped. Names are sorted by code unit, so output is the
// same on every machine. `md` holds regular .md files (reserved ones included).
export function listDir(absDir: string): { md: string[]; dirs: string[] } {
  const entries = readdirSync(absDir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules');
  const names = (keep: (e: Dirent) => boolean): string[] => entries.filter(keep).map((e) => e.name).sort();
  return {
    md: names((e) => e.isFile() && e.name.endsWith('.md')),
    dirs: names((e) => e.isDirectory()),
  };
}

// Every directory of the wiki, relative to the root, parents before children.
export function wikiDirs(root: string): string[] {
  const result: string[] = [];
  const walk = (rel: string): void => {
    for (const d of listDir(join(root, rel)).dirs) {
      const child = rel ? `${rel}/${d}` : d;
      result.push(child);
      walk(child);
    }
  };
  walk('');
  return result;
}

// Loads every markdown file of the wiki.
export function loadWiki(root: string): { concepts: Page[]; indexes: { rel: string; text: string }[]; dirs: string[] } {
  const concepts: Page[] = [];
  const indexes: { rel: string; text: string }[] = [];
  const dirs = wikiDirs(root);
  for (const dir of ['', ...dirs]) {
    for (const name of listDir(join(root, dir)).md) {
      const rel = dir ? `${dir}/${name}` : name;
      const text = readFileSync(join(root, rel), 'utf8');
      if (name === 'index.md') indexes.push({ rel, text });
      else if (!RESERVED.has(name)) {
        const { data, body } = parseFrontmatter(text);
        concepts.push({ rel, text, data, body, folder: dir ? (dir.split('/')[0] ?? null) : null });
      }
    }
  }
  return { concepts, indexes, dirs };
}

// The sections a page of this folder still lacks, given its level-1 headings.
export const missingSections = (folder: Pick<Folder, 'sections'>, headings: string[]): string[] =>
  folder.sections.filter((s) => !headings.includes(s));

// Level-1 headings and markdown links, ignoring fenced code blocks.
export function scanBody(body: string): { headings: string[]; links: string[] } {
  const headings: string[] = [];
  const links: string[] = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const h = /^# (.+?)\s*$/.exec(line);
    if (h?.[1]) headings.push(h[1]);
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) if (m[1]) links.push(m[1]);
  }
  return { headings, links };
}
