# Security

## Data handling

Education Tools runs locally and makes no network requests. Question and quiz responses are returned to the active Codex session. Markdown logging is disabled by default and writes only after the user selects an existing destination file.

## Hooks

Codex requires users to review and trust plugin hooks before they run. The included hooks invoke only `scripts/md-log-hook.mjs` with Node.js.

## Reporting

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/suri-kunal/codex-learning-tools/security/advisories/new). Do not include sensitive conversation logs in public issues.
