# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/lucasdeprit/okfcli/security/advisories/new)
for this repository. You will get an answer within a few days.

## Scope

okfcli reads and writes files inside a wiki directory and in the project root
(`AGENTS.md`, `.github/`). Reports about writing outside those locations,
path traversal, or unsafe handling of `.okf-profile.yaml` are in scope.

## Supported versions

Only the latest published minor version receives fixes.
