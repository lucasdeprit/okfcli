import { UserError } from './util.js';

/**
 * A starting point for a new wiki: which folders and pages `init` writes into
 * `required_folders` / `required_pages` and seeds. After that the wiki is
 * governed by its own profile; nothing reads the template again, except to
 * complete the profile of a wiki written before those keys existed.
 */
export interface WikiTemplate {
  name: string;
  description: string;
  /** Names of catalog folders (see profile.ts). */
  folders: string[];
  /** Paths of the pages to require and create. */
  pages: string[];
}

export const TEMPLATES: Record<string, WikiTemplate> = {
  development: {
    name: 'development',
    description: 'a software project: overview, architecture, patterns, conventions, workflows and testing',
    folders: ['overview', 'architecture', 'patterns', 'conventions', 'workflows', 'testing'],
    pages: ['overview/project.md', 'workflows/update-wiki.md'],
  },
  minimal: {
    name: 'minimal',
    description: 'the least a wiki needs: overview/project.md and workflows/update-wiki.md',
    folders: ['overview', 'workflows'],
    pages: ['overview/project.md', 'workflows/update-wiki.md'],
  },
};

export const DEFAULT_TEMPLATE = 'development';

export function getTemplate(name: string): WikiTemplate {
  const template = TEMPLATES[name];
  if (!template || !Object.hasOwn(TEMPLATES, name)) {
    throw new UserError(`Unknown template "${name}". Available: ${Object.keys(TEMPLATES).join(', ')}.`);
  }
  return template;
}
