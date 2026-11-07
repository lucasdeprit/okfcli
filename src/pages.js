import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

// log.md is reserved by OKF: okw does not manage it, but it is never a concept page.
const RESERVED = new Set(['index.md', 'log.md']);

// Walks the wiki and loads every markdown file. Hidden folders are skipped.
export function loadWiki(root) {
  const concepts = [];
  const indexes = [];
  const dirs = [];
  const walk = (rel) => {
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
          concepts.push({ rel: childRel, text, data, body, folder: childRel.includes('/') ? childRel.split('/')[0] : null });
        }
      }
    }
  };
  walk('');
  return { concepts, indexes, dirs };
}

// Level-1 headings and markdown links, ignoring fenced code blocks.
export function scanBody(body) {
  const headings = [];
  const links = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const h = /^# (.+?)\s*$/.exec(line);
    if (h) headings.push(h[1]);
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) links.push(m[1]);
  }
  return { headings, links };
}
