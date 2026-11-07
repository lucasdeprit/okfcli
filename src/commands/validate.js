import { loadProfile } from '../profile.js';
import { validateWiki } from '../validate.js';
import { applyFixes } from '../fixes.js';
import { reviewSummary } from '../review.js';

export const validateHelp = `okw validate [--fix] [--strict]

Checks the wiki against OKF v0.2 and the base profile (see SPEC.md section 8):
structure, sections, links, indexes and review state (which pages nobody has
reviewed, or that changed after being verified). Exits with code 1 if there is
any error (with --strict, any warning too).
  --fix     repair what can be decided mechanically (folders, required pages,
            missing section skeletons, indexes), then validate again
  --strict  treat warnings as failures
  --json    print { ok, errors, warnings, fixed, review, issues }, each issue as
            { rule, severity, file, message, fix }`;

export function validateCommand({ root, fix = false, strict = false }) {
  const profile = loadProfile(root);
  const fixed = fix ? applyFixes(root, profile) : [];
  const issues = validateWiki(root, profile);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const ok = errors === 0 && !(strict && warnings > 0);
  const review = reviewSummary(root, profile);

  const lines = [];
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
