# Education Tools Plugin

The installable plugin package for the [Codex Education Tools marketplace](../../README.md).

## MCP tools

- `ask_user_question`: one ungraded free-form or option-based question
- `quiz`: one graded single- or multi-select question with feedback
- `markdown_log_start`: begin session-scoped logging to an existing Markdown file
- `markdown_log_stop`: stop logging the current session
- `markdown_log_status`: report logger state

## Runtime

The committed `dist/server.mjs` bundles the MCP SDK and validation dependencies. Plugin users need Node.js 20 or newer but do not need to install npm packages.

Markdown logger hooks use only Node.js built-ins. Logger state is stored in the plugin data directory when Codex supplies one, with `$CODEX_HOME/education-tools/` as a compatibility fallback.

## Development

```bash
npm ci
npm test
npm run build
```

Do not edit `dist/server.mjs` directly.
