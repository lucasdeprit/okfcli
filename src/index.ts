// Public API. The CLI is the main interface; these are the pieces other tools
// (editors, CI scripts) are most likely to reuse.
export { run } from './cli.js';
export { loadProfile } from './core/profile.js';
export { validateWiki } from './wiki/rules.js';
export { parseFrontmatter } from './core/frontmatter.js';
export { contentHash, trustState } from './core/trust.js';
export type { Folder, Frontmatter, Issue, Page, Profile, Severity, TrustTier } from './core/types.js';
