#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('This is a bug in okfcli; please report it with the command you ran.');
    process.exitCode = 2;
  },
);
