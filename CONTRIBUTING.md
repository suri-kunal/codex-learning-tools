# Contributing

## Setup

```bash
cd plugins/education-tools
npm ci
```

## Required checks

```bash
npm test
npm run build
cd ../..
node scripts/validate-repo.mjs
```

The bundled `plugins/education-tools/dist/server.mjs` is a committed release artifact. Include it whenever source changes alter the bundle.

## Plugin changes

- Keep `plugin.json` and `.codex-plugin/plugin.json` versions aligned.
- Keep `mcp.json` and `.mcp.json` pointed at the bundled server.
- Add tests for popup behavior, grading, or logger behavior before changing those paths.
- Never commit `node_modules` or user Markdown logs.
- Start a new Codex session after reinstalling an updated plugin.
