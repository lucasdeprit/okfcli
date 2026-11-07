import { parse, parseDocument, type Document } from 'yaml';
import { UserError } from './util.js';
import type { Frontmatter } from './types.js';

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Returns { data, body }. data is null when there is no parseable frontmatter.
export function parseFrontmatter(text: string): { data: Frontmatter | null; body: string } {
  const match = FENCE.exec(text);
  if (!match) return { data: null, body: text };
  const body = text.slice(match[0].length);
  try {
    const data: unknown = parse(match[1] ?? '');
    return { data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Frontmatter) : null, body };
  } catch {
    return { data: null, body };
  }
}

// Edits the frontmatter through a YAML document, keeping comments, order and
// the rest of the file untouched. Returns the new text.
export function editFrontmatter(text: string, mutate: (doc: Document) => void): string {
  const match = FENCE.exec(text);
  if (!match) throw new UserError('The page has no frontmatter to edit.');
  const doc = parseDocument(match[1] ?? '');
  mutate(doc);
  return `---\n${doc.toString({ lineWidth: 0 }).trimEnd()}\n---\n${text.slice(match[0].length)}`;
}
