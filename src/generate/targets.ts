// Where each coding agent reads the project instructions and the skills.
// This table is the single source of truth: the CLI flags, the help text and
// the validation all derive from it, so supporting a tool is one line.
//
//  - skillsDir: folder with <skill>/SKILL.md (open standard: agentskills.io)
//  - instructions: files that carry the pointer block, in order of preference
//    (the first is created when none of them exists)

interface AgentTarget {
  skillsDir: string;
  instructions: readonly [string, ...string[]];
}

export const AGENT_TARGETS = {
  copilot: { skillsDir: '.github/skills', instructions: ['AGENTS.md', '.github/copilot-instructions.md'] },
  // Claude Code reads AGENTS.md only when the project has no CLAUDE.md at all.
  claude: { skillsDir: '.claude/skills', instructions: ['CLAUDE.md', '.claude/CLAUDE.md'] },
  codex: { skillsDir: '.agents/skills', instructions: ['AGENTS.md'] },
  opencode: { skillsDir: '.agents/skills', instructions: ['AGENTS.md'] },
  cursor: { skillsDir: '.agents/skills', instructions: ['AGENTS.md'] },
} as const satisfies Record<string, AgentTarget>;

export type AgentName = keyof typeof AGENT_TARGETS;

export const AGENT_NAMES = Object.keys(AGENT_TARGETS) as AgentName[];

/** Used when `init` is run without any agent flag. */
export const DEFAULT_AGENTS: AgentName[] = ['copilot'];
