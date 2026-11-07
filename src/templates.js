import { yamlScalar } from './util.js';
import { CORE_FOLDERS } from './profile.js';

const TODO = (section) => `<!-- TODO: ${section} -->`;

export function renderPage({ folder, title, description }) {
  const front = ['---', `type: ${yamlScalar(folder.type)}`, `title: ${yamlScalar(title)}`, `description: ${yamlScalar(description)}`, '---'];
  const sections = folder.sections.map((s) => `# ${s}\n\n${TODO(s)}\n`);
  return `${front.join('\n')}\n\n${sections.join('\n')}`;
}

// Scaffold of the testing strategy page. `init` and `validate --fix` create it
// when testing/ has no page; it is not a required name, any testing page counts.
export function testingStrategyPage() {
  const folder = CORE_FOLDERS.find((f) => f.name === 'testing');
  return {
    path: 'testing/strategy.md',
    text: renderPage({ folder, title: 'Testing strategy', description: 'How testing is done in this project.' }),
  };
}

// Required core pages (SPEC.md section 3). Created by `init`.
export function requiredPages() {
  return [
    {
      path: 'overview/project.md',
      text: [
        renderPage({
          folder: { type: 'Overview', sections: [] },
          title: 'Project',
          description: 'What the project is and who it is for.',
        }).trimEnd(),
        '',
        `# Purpose\n\n${TODO('Purpose')}\n`,
        `# Scope\n\n${TODO('Scope')}\n`,
      ].join('\n'),
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

Keep the wiki faithful to the project with as little manual work as possible. The \`okw\` CLI does the mechanical parts (indexes, frontmatter, validation); whoever edits only writes content.

# Steps

1. If a change affects a rule, a pattern or a convention, edit the existing page. Do not create a new page for something that is already documented.
2. If a new page is needed, create it with \`okw new <type> <name> --description "..."\`. It registers the page in the index. Do not edit \`index.md\` by hand.
3. Fill in the page sections. Explain the reason in \`# Why\` when the page asks for it.
4. If something no longer applies, mark its page with \`status: deprecated\` instead of just deleting it.
5. Run \`okw validate\` and fix whatever it reports.
`;
