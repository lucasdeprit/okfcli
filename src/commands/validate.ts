import { folderByName, loadProfile } from '../profile.js';
import { validateWiki } from '../validate.js';
import { applyFixes } from '../fixes.js';
import { loadWiki } from '../pages.js';
import { trustState } from '../trust.js';
import type { CommandResult, Profile, ReviewSummary } from '../types.js';

export const validateHelp = `okfcli validate [--fix] [--strict]

Checks the wiki against OKF v0.2 and the base profile (see SPEC.md section 8):
structure, sections, links, indexes and review state (which pages nobody has
reviewed, or that changed after being verified). Exits with code 1 if there is
any error (with --strict, any warning too).
  --fix     repair what can be decided mechanically (folders, required pages,
            missing section skeletons, indexes), then validate again
  --strict  treat warnings as failures
  --json    print { ok, errors, warnings, fixed, review, issues }, each issue as
            { rule, severity, file, message, fix }`;

// How many pages are at each trust tier. Deprecated pages are not asked to be
// reviewed, so they are counted apart.
function reviewSummary(root: string, profile: Profile): ReviewSummary {
  const pages = loadWiki(root).concepts.filter((c) => c.data && c.folder && folderByName(profile, c.folder));
  const active = pages.filter((p) => p.data?.status !== 'deprecated');
  const states = active.map((p) => trustState(p.data, p.body));
  const count = (pred: (s: (typeof states)[number]) => boolean): number => states.filter(pred).length;
  return {
    pages: pages.length,
    deprecated: pages.length - active.length,
    'human-reviewed': count((s) => s.tier === 'human-reviewed'),
    'machine-confirmed': count((s) => s.tier === 'machine-confirmed'),
    unverified: count((s) => s.tier === 'unverified' && !s.outdated),
    outdated: count((s) => s.outdated),
  };
}

export function validateCommand({ root, fix = false, strict = false }: { root: string; fix?: boolean | undefined; strict?: boolean | undefined }): CommandResult {
  const profile = loadProfile(root);
  const fixed = fix ? applyFixes(root, profile) : [];
  const issues = validateWiki(root, profile);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const ok = errors === 0 && !(strict && warnings > 0);
  const review = reviewSummary(root, profile);

  const lines: (string | null)[] = [];
  if (fixed.length) lines.push('Fixed:', ...fixed.map((f) => `  ${f}`), '');
  for (const i of issues) {
    lines.push(`${i.severity.padEnd(7)} ${i.rule}  ${i.file}`, `        ${i.message} ${i.fix}`);
  }
  lines.push(
    issues.length ? '' : null,
    `Review: ${review['human-reviewed']} human-reviewed, ${review['machine-confirmed']} machine-confirmed, ${review.unverified} unverified, ${review.outdated} outdated (${review.deprecated} deprecated pages not counted).`,
    `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.${ok ? '' : ' Validation failed.'}`,
  );
  return { ok, errors, warnings, fixed, review, issues, text: lines.filter((l) => l !== null).join('\n') };
}
