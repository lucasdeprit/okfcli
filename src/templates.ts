import { yamlScalar } from './util.js';
import { coreFolder } from './profile.js';
import type { Folder } from './types.js';

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

// Scaffold of the testing strategy page. `init` and `validate --fix` create it
// when testing/ has no page; it is not a required name, any testing page counts.
export function testingStrategyPage(): TemplatePage {
  return {
    path: 'testing/strategy.md',
    text: renderPage({ folder: coreFolder('testing'), title: 'Testing strategy', description: 'How testing is done in this project.' }),
  };
}

// Required core pages (SPEC.md section 3). Created by `init`.
export function requiredPages(): TemplatePage[] {
  return [
    {
      path: 'overview/project.md',
      text: renderPage({
        folder: coreFolder('overview'),
        title: 'Project',
        description: 'What the project is and who it is for.',
      }),
    },
    {
      path: 'workflows/update-wiki.md',
      text: [
        renderPage({
          folder: { type: 'Workflow', sections: [] },
          title: 'Update the wiki',
          description: 'When and how this wiki is updated.',
        }).trimEnd(),
        '',
        UPDATE_WIKI_BODY,
      ].join('\n'),
    },
  ];
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
