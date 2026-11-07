import { createHash } from 'node:crypto';

// Trust signals of a page, derived from its frontmatter (OKF v0.2, section 5).

// `verified` may be a list or, as OKF allows, a single { by, at } mapping.
export function verifiedList(data) {
  const v = data?.verified;
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter((e) => e && typeof e === 'object');
}

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
};

// Hash of what a reviewer read: the frontmatter (except verified and status,
// which do not change the content) and the body.
export function contentHash(data, body) {
  const { verified, status, ...rest } = data ?? {};
  const text = `${JSON.stringify(canonical(rest))}\n${body.replace(/\r\n/g, '\n').trim()}`;
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// A verification still counts when it has no hash (written by hand) or its
// hash matches the current content.
export function validVerifications(data, body) {
  const current = contentHash(data, body);
  return verifiedList(data).filter((e) => !e.hash || String(e.hash) === current);
}

// tier: unverified | machine-confirmed | human-reviewed
// outdated: the page was verified, but its content changed afterwards.
export function trustState(data, body) {
  const all = verifiedList(data);
  const valid = validVerifications(data, body);
  if (!valid.length) return { tier: 'unverified', outdated: all.length > 0, last: all[all.length - 1] };
  const human = valid.some((e) => String(e.by ?? '').startsWith('human:'));
  return { tier: human ? 'human-reviewed' : 'machine-confirmed', outdated: false, last: valid[valid.length - 1] };
}

export const countTodos = (body) => (body.match(/<!--\s*TODO/g) ?? []).length;
