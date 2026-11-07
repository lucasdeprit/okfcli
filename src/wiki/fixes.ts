import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_FOLDERS, folderByName } from '../core/profile.js';
import { loadWiki, missingSections, scanBody } from './pages.js';
import { regenerateIndexes } from './indexer.js';
import { requiredPages, sectionSkeleton, testingStrategyPage } from '../generate/templates.js';
import { writeText } from '../core/util.js';
import type { Profile } from '../core/types.js';

// Repairs only what can be decided mechanically. Returns a list of what was done.
export function applyFixes(root: string, profile: Profile): string[] {
  const done: string[] = [];

  for (const folder of CORE_FOLDERS) {
    if (!existsSync(join(root, folder.name))) {
      mkdirSync(join(root, folder.name), { recursive: true });
      done.push(`Created folder ${folder.name}/`);
    }
  }
  for (const page of requiredPages()) {
    if (!existsSync(join(root, page.path))) {
      writeText(join(root, page.path), page.text);
      done.push(`Recreated ${page.path}`);
    }
  }

  if (!loadWiki(root).concepts.some((c) => c.folder === 'testing')) {
    const page = testingStrategyPage();
    writeText(join(root, page.path), page.text);
    done.push(`Created ${page.path}`);
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
