import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { loadProfile } from '../profile.js';
import { editFrontmatter, parseFrontmatter } from '../frontmatter.js';
import { contentHash, countTodos, trustState, validVerifications } from '../trust.js';
import { isoNow, toPosix } from '../util.js';
import { UserError } from '../errors.js';

const ACTOR = /^(?:(?:human|process):\S+|[^\s/:]+\/\S+)$/;

export const verifyHelp = `okw verify <path> [--by <actor>] [--force]

Records that a page has been reviewed: adds { by, at, hash } to "verified".
The hash fingerprints the content that was read; if the page is edited later,
the verification is reported as outdated until it is verified again.
One entry per actor: a repeat verification replaces the previous one.
The path is relative to the wiki, with or without ".md".
  --by     actor: human:<id>, process:<id> or <tool>/<version>.
           Default: $OKW_ACTOR, else okw/<version> (machine-confirmed).
           Use human:<id> only when a person has actually reviewed the page.
  --force  verify even if the page still has unfilled TODO placeholders

A person can also verify by hand, by adding to the page frontmatter:
  verified:
    - { by: human:<id>, at: <ISO date-time> }
(entries without a hash are never reported as outdated).`;

// Accepts a path relative to the wiki or to the current directory.
function locatePage(root, cwd, arg) {
  const withExt = arg.endsWith('.md') ? arg : `${arg}.md`;
  const candidates = [join(root, withExt)];
  if (!isAbsolute(withExt)) candidates.push(resolve(cwd, withExt));
  for (const file of candidates) {
    const rel = toPosix(relative(root, file));
    if (!rel.startsWith('..') && existsSync(file)) return { file, rel };
  }
  throw new UserError(`Page not found: ${arg}. Use a path relative to the wiki, e.g. patterns/state-management.md.`);
}

export function verifyCommand({ root, cwd, path, by, force = false, now = new Date(), version }) {
  loadProfile(root);
  if (!path) throw new UserError('Usage: okw verify <path> [--by <actor>]');
  const actor = by ?? process.env.OKW_ACTOR ?? `okw/${version}`;
  if (!ACTOR.test(actor)) {
    throw new UserError(`Invalid actor "${actor}". Use human:<id>, process:<id> or <tool>/<version>.`);
  }

  const { file, rel } = locatePage(root, cwd, path);
  const text = readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(text);
  if (!data) throw new UserError(`${rel} has no parseable frontmatter; fix it first (okw validate).`);
  const todos = countTodos(body);
  if (todos && !force) {
    throw new UserError(`${rel} still has ${todos} unfilled TODO placeholder${todos > 1 ? 's' : ''}. Fill them in before verifying (or use --force).`);
  }

  const entry = { by: actor, at: isoNow(now), hash: contentHash(data, body) };
  // Keep the verifications that still describe this content; drop outdated ones and the actor's previous entry.
  const kept = validVerifications(data, body).filter((e) => e.by !== actor);
  const next = editFrontmatter(text, (doc) => {
    const seq = doc.createNode([...kept, entry]);
    for (const item of seq.items) item.flow = true;
    doc.set('verified', seq);
  });
  writeFileSync(file, next);

  const after = parseFrontmatter(next);
  const { tier } = trustState(after.data, after.body);
  return {
    path: rel,
    tier,
    verified: [...kept, entry],
    text: `Verified ${rel} as ${actor} (${tier}).`,
  };
}
