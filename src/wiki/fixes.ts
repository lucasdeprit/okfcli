import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { folderByName, loadProfile, writeMissingRequired } from '../core/profile.js';
import { loadWiki, missingSections, scanBody } from './pages.js';
import { regenerateIndexes } from './indexer.js';
import { requiredPageTemplates, sectionSkeleton } from '../generate/templates.js';
import { writeText } from '../core/util.js';
import type { Profile } from '../core/types.js';

// Repairs only what can be decided mechanically. Returns a list of what was done.
export function applyFixes(root: string, initial: Profile): string[] {
  const done: string[] = [];

  // A profile without required_folders / required_pages gets them written first.
  let profile = initial;
  const added = writeMissingRequired(root);
  if (added.length) {
    done.push(`Wrote ${added.join(' and ')} to .okf-profile.yaml`);
    profile = loadProfile(root);
  }

  for (const name of profile.requiredFolders) {
    if (!existsSync(join(root, name))) {
      mkdirSync(join(root, name), { recursive: true });
      done.push(`Created folder ${name}/`);
    }
  }
  for (const page of requiredPageTemplates(profile)) {
    if (!existsSync(join(root, page.path))) {
      writeText(join(root, page.path), page.text);
      done.push(`Recreated ${page.path}`);
    }
  }

  for (const page of loadWiki(root).concepts) {
    const folder = page.folder ? folderByName(profile, page.folder) : undefined;
    if (!folder || !page.data) continue;
    const { headings } = scanBody(page.body);
    const missing = missingSections(folder, headings);
    if (!missing.length) continue;
    const file = join(root, page.rel);
    const text = readFileSync(file, 'utf8').replace(/\s+$/, '');
    const add = missing.map(sectionSkeleton).join('\n');
    writeText(file, `${text}\n\n${add}`);
    done.push(`Added ${missing.map((s) => `"# ${s}"`).join(', ')} to ${page.rel}`);
  }

  for (const rel of regenerateIndexes(root, profile)) done.push(`Regenerated ${rel}`);
  return done;
}
