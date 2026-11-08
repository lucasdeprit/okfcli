import { humanize, yamlScalar } from '../core/util.js';
import { baseFolder, folderByName } from '../core/profile.js';
import type { Folder, Profile } from '../core/types.js';

export interface TemplatePage {
  path: string;
  text: string;
}

// What a section looks like until someone writes it. Used by new pages and by `validate --fix`.
export const sectionSkeleton = (section: string): string => `# ${section}\n\n<!-- TODO: ${section} -->\n`;

export function renderPage({ folder, title, description }: { folder: Pick<Folder, 'type' | 'sections'>; title: string; description: string }): string {
  const front = ['---', `type: ${yamlScalar(folder.type)}`, `title: ${yamlScalar(title)}`, `description: ${yamlScalar(description)}`, '---'];
  const sections = folder.sections.map(sectionSkeleton);
  return `${front.join('\n')}\n\n${sections.join('\n')}`;
}

// Pages okfcli knows how to write: the ones the base profile requires.
const KNOWN_PAGES: Record<string, () => string> = {
  'overview/project.md': () =>
    renderPage({
      folder: baseFolder('overview'),
      title: 'Project',
      description: 'What the project is and who it is for.',
    }),
  'workflows/update-wiki.md': () =>
    [
      renderPage({
        folder: { type: 'Workflow', sections: [] },
        title: 'Update the wiki',
        description: 'When and how this wiki is updated.',
      }).trimEnd(),
      '',
      UPDATE_WIKI_BODY,
    ].join('\n'),
};

// The pages the profile requires (`required_pages`), with the text to create them
// from. A page okfcli does not know gets its folder's sections, unfilled.
export function requiredPageTemplates(profile: Profile): TemplatePage[] {
  return profile.requiredPages.map((path) => {
    const known = KNOWN_PAGES[path];
    if (known) return { path, text: known() };
    const [folderName = '', ...rest] = path.slice(0, -3).split('/');
    const folder = folderByName(profile, folderName) ?? { type: humanize(folderName), sections: [] };
    return { path, text: renderPage({ folder, title: humanize(rest.join('-')), description: 'TODO: describe this page.' }) };
  });
}

const UPDATE_WIKI_BODY = `# Goal

Keep the wiki faithful to the project with as little manual work as possible. The \`okfcli\` CLI does the mechanical parts (indexes, frontmatter, validation); whoever edits only writes content.

# Steps

1. If a change affects a rule, a pattern or a convention, edit the existing page. Do not create a new page for something that is already documented.
2. If a new page is needed, create it with \`okfcli new <type> <name> --description "..."\`. It registers the page in the index. Do not edit \`index.md\` by hand.
3. Fill in the page sections. Explain the reason in \`# Why\` when the page asks for it.
4. If something no longer applies, mark its page with \`status: deprecated\` instead of just deleting it.
5. Run \`okfcli validate\` and fix whatever it reports.
`;
