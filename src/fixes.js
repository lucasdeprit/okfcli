import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_FOLDERS } from './profile.js';
import { loadWiki, scanBody } from './pages.js';
import { regenerateIndexes } from './indexer.js';
import { requiredPages, testingStrategyPage } from './templates.js';
import { writeText } from './util.js';

// Repairs only what can be decided mechanically. Returns a list of what was done.
export function applyFixes(root, profile) {
  const done = [];

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

  const foldersByName = new Map(profile.folders.map((f) => [f.name, f]));
  for (const page of loadWiki(root).concepts) {
    const folder = page.folder ? foldersByName.get(page.folder) : undefined;
    if (!folder || !page.data) continue;
    const { headings } = scanBody(page.body);
    const missing = folder.sections.filter((s) => !headings.includes(s));
    if (!missing.length) continue;
    const file = join(root, page.rel);
    const text = readFileSync(file, 'utf8').replace(/\s+$/, '');
    const add = missing.map((s) => `# ${s}\n\n<!-- TODO: ${s} -->\n`).join('\n');
    writeText(file, `${text}\n\n${add}`);
    done.push(`Added ${missing.map((s) => `"# ${s}"`).join(', ')} to ${page.rel}`);
  }

  for (const rel of regenerateIndexes(root, profile)) done.push(`Regenerated ${rel}`);
  return done;
}
