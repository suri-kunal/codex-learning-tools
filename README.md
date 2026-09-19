# Codex Learning Tools

A distributable Codex plugin providing:

- **Question popups** for free-form, single-select, multi-select, and custom answers
- **Quiz popups** with exact grading, an automatic “I don't know” choice, and immediate feedback
- **Markdown lesson logging** for opted-in Codex sessions

The plugin runs locally, makes no network requests, and writes conversation data only to the existing Markdown file selected by the user.

## Origin and attribution

**This repository's implementation, packaging, tests, and documentation were created by OpenAI Codex (GPT-5.6 Sol), under the direction of Kunal Suri.**

The repository was created to make the core interactive-learning workflow from [Amos Blomqvist's `learn`](https://github.com/amosblomqvist/learn) usable in Codex. That project is a learning system for Pi; this repository independently adapts its question popup, graded quiz, and Markdown session-logging ideas to Codex's MCP, plugin, and hook systems.

This is an independent Codex adaptation and is not an official upstream release. See [`ACKNOWLEDGMENTS.md`](ACKNOWLEDGMENTS.md) for details.

## Requirements

- Codex CLI or Codex in the ChatGPT desktop app with plugin support
- Node.js 20 or newer

## Install from GitHub

```bash
codex plugin marketplace add suri-kunal/codex-learning-tools
codex plugin add education-tools@codex-learning-tools
```

Start a new Codex session after installation. Open `/hooks` and review and trust the Education Tools hooks before using Markdown logging. Question and quiz popups do not depend on the logger hooks.

## Install from this local checkout

```bash
codex plugin marketplace add /absolute/path/to/codex-learning-tools
codex plugin add education-tools@codex-learning-tools
```

Then start a new Codex session.

## Use

Ask naturally:

```text
Ask me which implementation path I prefer.
Quiz me on BPE merge priority.
Start Markdown logging to /absolute/path/lesson.md.
Stop Markdown logging.
```

The Markdown destination must already exist. Logging begins after the start tool call and does not backfill earlier conversation.

## Start logging to a new Markdown file

First create the file and obtain its absolute path:

```bash
mkdir -p notes
printf '# Learning Session\n' > notes/session.md
realpath notes/session.md
```

Start a new Codex session:

```bash
codex
```

On first use, open `/hooks` and review and trust the **Education Tools** hooks. Then ask Codex to start logging with the absolute path returned by `realpath`:

```text
Start Markdown logging to /absolute/path/to/notes/session.md
```

Approve the write operation if prompted. Future user prompts, assistant replies, question exchanges, and quiz results will be appended to the file. Conversation from before activation is not backfilled.

To stop logging:

```text
Stop Markdown logging.
```

## Update

```bash
codex plugin marketplace upgrade codex-learning-tools
codex plugin add education-tools@codex-learning-tools
```

Start a new session so Codex loads the updated skills and MCP tools.

## Repository layout

```text
.agents/plugins/marketplace.json     Git-backed marketplace catalog
plugins/education-tools/             Installable plugin
  plugin.json                        Portable Agent Plugins manifest
  mcp.json                           Portable MCP configuration
  .codex-plugin/plugin.json          Codex compatibility manifest
  .mcp.json                          Codex compatibility MCP configuration
  dist/server.mjs                    Bundled dependency-free-at-install MCP server
  hooks/                             Opt-in Markdown logger hooks
  skills/                            Agent instructions
```

The generated `dist/server.mjs` is committed so users do not need to run `npm install`. Development dependencies and `node_modules` are not distributed through the marketplace.

## Development

```bash
cd plugins/education-tools
npm ci
npm test
npm run build
cd ../..
node scripts/validate-repo.mjs
```

If rebuilding changes `plugins/education-tools/dist/server.mjs`, commit the generated file with its source changes.

## Distribution scope

A GitHub marketplace lets users explicitly add and install this plugin in Codex CLI and supported desktop surfaces. It does not automatically publish the plugin to OpenAI's universal public Plugins Directory; that has a separate submission and review process.

## License

MIT. The bundled MCP server contains third-party open-source components listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
