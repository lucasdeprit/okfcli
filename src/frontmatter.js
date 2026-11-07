import { parse, parseDocument } from 'yaml';

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Returns { data, body }. data is null when there is no parseable frontmatter.
export function parseFrontmatter(text) {
  const match = FENCE.exec(text);
  if (!match) return { data: null, body: text };
  try {
    const data = parse(match[1]);
    return { data: data && typeof data === 'object' ? data : null, body: text.slice(match[0].length) };
  } catch {
    return { data: null, body: text.slice(match[0].length) };
  }
}

// Edits the frontmatter through a YAML document, keeping comments, order and
// the rest of the file untouched. Returns the new text.
export function editFrontmatter(text, mutate) {
  const match = FENCE.exec(text);
  if (!match) throw new Error('No frontmatter to edit');
  const doc = parseDocument(match[1]);
  mutate(doc);
  return `---\n${doc.toString({ lineWidth: 0 }).trimEnd()}\n---\n${text.slice(match[0].length)}`;
}
