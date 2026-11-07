import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PROFILE_FILE } from './profile.js';
import { UserError } from './errors.js';

// The wiki root is the folder that contains .okf-profile.yaml.
export function findWikiRoot(cwd, explicit) {
  if (explicit) {
    const root = resolve(cwd, explicit);
    if (!existsSync(join(root, PROFILE_FILE))) {
      throw new UserError(`${explicit} is not an okw wiki (${PROFILE_FILE} is missing).`);
    }
    return root;
  }
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, PROFILE_FILE))) return dir;
    // Wiki in ./wiki or ./docs/wiki relative to the current directory.
    for (const sub of ['wiki', 'docs/wiki']) {
      if (existsSync(join(dir, sub, PROFILE_FILE))) return join(dir, sub);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new UserError(`No okw wiki found from ${cwd}. Run "okw init" or use --wiki <folder>.`);
}
