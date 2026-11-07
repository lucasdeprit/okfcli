import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { RESERVED } from './util.js';
import type { Page } from './types.js';

// Walks the wiki and loads every markdown file. Hidden folders are skipped.
export function loadWiki(root: string): { concepts: Page[]; indexes: { rel: string; text: string }[]; dirs: string[] } {
  const concepts: Page[] = [];
  const indexes: { rel: string; text: string }[] = [];
  const dirs: string[] = [];
  const walk = (rel: string): void => {
    const entries = readdirSync(join(root, rel), { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        dirs.push(childRel);
        walk(childRel);
      } else if (e.name.endsWith('.md')) {
        const text = readFileSync(join(root, childRel), 'utf8');
        if (e.name === 'index.md') indexes.push({ rel: childRel, text });
        else if (!RESERVED.has(e.name)) {
          const { data, body } = parseFrontmatter(text);
          concepts.push({ rel: childRel, text, data, body, folder: childRel.includes('/') ? (childRel.split('/')[0] ?? null) : null });
        }
      }
    }
  };
  walk('');
  return { concepts, indexes, dirs };
}

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
