import { loadWiki } from './pages.js';
import { trustState } from './trust.js';

// Review state of the wiki: how many pages are at each trust tier.
// Deprecated pages are not asked to be reviewed, so they are counted apart.
export function reviewSummary(root, profile) {
  const known = new Set(profile.folders.map((f) => f.name));
  const pages = loadWiki(root).concepts.filter((c) => c.data && c.folder && known.has(c.folder));
  const active = pages.filter((p) => p.data.status !== 'deprecated');
  const states = active.map((p) => trustState(p.data, p.body));
  const count = (pred) => states.filter(pred).length;
  return {
    pages: pages.length,
    deprecated: pages.length - active.length,
    'human-reviewed': count((s) => s.tier === 'human-reviewed'),
    'machine-confirmed': count((s) => s.tier === 'machine-confirmed'),
    unverified: count((s) => s.tier === 'unverified' && !s.outdated),
    outdated: count((s) => s.outdated),
  };
}
