import { parseArgs, type ParseArgsConfig } from 'node:util';
import { readFileSync } from 'node:fs';
import { UserError, errorCode } from './util.js';
import { findWikiRoot } from './wiki.js';
import type { CommandResult } from './types.js';
import { init, initHelp } from './commands/init.js';
import { newPage, newHelp } from './commands/new.js';
import { validateCommand, validateHelp } from './commands/validate.js';
import { verifyCommand, verifyHelp } from './commands/verify.js';

// The compiled file lives in dist/src/, two levels below package.json.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

const HELP = `okfcli ${version} - scaffolding and management of OKF wikis

Commands:
  init [folder]             Create a wiki with the base profile and the files for Copilot (run again to refresh them)
  new <type> <name>         Create a page and register it in its index
  validate [--fix]          Check the wiki (structure, indexes, review state); --fix repairs the mechanical issues
  verify <path>             Record that a page has been reviewed

Common options:
  --wiki <folder>           Wiki to operate on (by default it is searched from the current directory)
  --json                    JSON output, for agents and scripts
  -h, --help                Help for a command
  -v, --version

Run "okfcli <command> --help" for details.`;

const COMMON = {
  wiki: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

type Values = Record<string, string | boolean | (string | boolean)[] | undefined>;

interface Context {
  values: Values;
  positionals: string[];
  cwd: string;
  /** The wiki to operate on (--wiki, else searched from cwd). Throws if there is none. */
  root: () => string;
}

interface Command {
  help: string;
  options: NonNullable<ParseArgsConfig['options']>;
  run: (ctx: Context) => CommandResult | Promise<CommandResult>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const flag = (v: unknown): boolean => v === true;

const COMMANDS: Record<string, Command> = {
  init: {
    help: initHelp,
    options: { with: { type: 'string' }, language: { type: 'string' }, 'no-agents': { type: 'boolean' } },
    run: ({ values, positionals, cwd }) =>
      init({
        cwd,
        dir: positionals[0],
        withFolders: str(values.with)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
        language: str(values.language),
        agents: !flag(values['no-agents']),
        version,
      }),
  },
  new: {
    help: newHelp,
    options: { title: { type: 'string' }, description: { type: 'string' } },
    run: ({ values, positionals, root }) => {
      const wiki = root();
      const [type, name] = positionals;
      if (!type || !name) throw new UserError('Usage: okfcli new <type> <name> --description "..."');
      return newPage({ root: wiki, type, name, title: str(values.title), description: str(values.description) });
    },
  },
  verify: {
    help: verifyHelp,
    options: { by: { type: 'string' }, force: { type: 'boolean' } },
    run: ({ values, positionals, root, cwd }) =>
      verifyCommand({ root: root(), cwd, path: positionals[0], by: str(values.by), force: flag(values.force), version }),
  },
  validate: {
    help: validateHelp,
    options: { fix: { type: 'boolean' }, strict: { type: 'boolean' } },
    run: ({ values, root }) => validateCommand({ root: root(), fix: flag(values.fix), strict: flag(values.strict) }),
  },
};

interface RunOptions {
  cwd?: string;
  out?: (text: string) => void;
  err?: (text: string) => void;
}

export async function run(argv: string[], { cwd = process.cwd(), out = console.log, err = console.error }: RunOptions = {}): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === '-h' || name === '--help' || name === 'help') {
    out(HELP);
    return 0;
  }
  if (name === '-v' || name === '--version') {
    out(version);
    return 0;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command) {
    err(`Unknown command: ${name}\n\n${HELP}`);
    return 1;
  }
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { ...COMMON, ...command.options },
      allowPositionals: true,
    });
    if (values.help) {
      out(command.help);
      return 0;
    }
    const result = await command.run({ values, positionals, cwd, root: () => findWikiRoot(cwd, str(values.wiki)) });
    if (values.json) {
      const { text: _text, ...data } = result;
      out(JSON.stringify(data, null, 2));
    } else {
      out(result.text);
    }
    return result.ok === false ? 1 : 0;
  } catch (e) {
    if (e instanceof UserError || errorCode(e)?.startsWith('ERR_PARSE_ARGS')) {
      err(`Error: ${(e as Error).message}`);
      return 1;
    }
    throw e;
  }
}
