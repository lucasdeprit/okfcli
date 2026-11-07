// Shapes shared across modules.

export type Severity = 'error' | 'warning' | 'off';

/** A folder of the wiki: the base profile ones plus `extra_folders` from the profile. */
export interface Folder {
  name: string;
  type: string;
  title: string;
  description: string;
  sections: string[];
  core: boolean;
  extra?: boolean;
}

export interface Profile {
  config: Record<string, unknown>;
  severity: Record<string, Severity>;
  folders: Folder[];
}

/** Parsed YAML frontmatter. Its values come from user files, so they are `unknown`. */
export type Frontmatter = Record<string, unknown>;

export interface Page {
  /** Path relative to the wiki root, with "/" separators. */
  rel: string;
  text: string;
  /** null when the page has no parseable frontmatter. */
  data: Frontmatter | null;
  body: string;
  /** First path segment, or null for a page at the wiki root. */
  folder: string | null;
}

/** One entry of the `verified` list. Hand-written entries may omit `hash`. */
export interface Verification {
  by?: unknown;
  at?: unknown;
  hash?: unknown;
}

export type TrustTier = 'unverified' | 'machine-confirmed' | 'human-reviewed';

export interface Issue {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  message: string;
  fix: string;
}

export interface ReviewSummary {
  pages: number;
  deprecated: number;
  'human-reviewed': number;
  'machine-confirmed': number;
  unverified: number;
  outdated: number;
}

/** What every command returns: `text` for people, the rest for `--json`. */
export interface CommandResult {
  text: string;
  ok?: boolean;
  [key: string]: unknown;
}

export interface AgentFileResult {
  path: string;
  status: 'created' | 'updated' | 'unchanged';
}
