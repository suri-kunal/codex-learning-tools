import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("committed bundle starts over stdio and exposes every tool", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "education-tools-bundle-"));
  const client = new Client({ name: "bundle-smoke-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(pluginRoot, "dist", "server.mjs")],
    cwd: pluginRoot,
    env: { EDUCATION_TOOLS_STATE_FILE: path.join(temporary, "state.json") },
    stderr: "pipe",
  });

  await client.connect(transport);
  t.after(async () => {
    await client.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    ["ask_user_question", "markdown_log_start", "markdown_log_status", "markdown_log_stop", "quiz"],
  );

  const status = await client.callTool({ name: "markdown_log_status", arguments: {} });
  assert.equal(status.structuredContent.status, "inactive");
});
