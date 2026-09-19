import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repositoryRoot, "plugins", "education-tools");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const marketplace = readJson(".agents/plugins/marketplace.json");
const portableManifest = readJson("plugins/education-tools/plugin.json");
const compatibilityManifest = readJson("plugins/education-tools/.codex-plugin/plugin.json");
const portableMcp = readJson("plugins/education-tools/mcp.json");
const compatibilityMcp = readJson("plugins/education-tools/.mcp.json");
const packageJson = readJson("plugins/education-tools/package.json");
const hooks = readJson("plugins/education-tools/hooks/hooks.json");

assert(marketplace.name === "codex-learning-tools", "Unexpected marketplace name.");
assert(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, "Marketplace must expose exactly one plugin.");
const entry = marketplace.plugins[0];
assert(entry.name === "education-tools", "Marketplace plugin name is inconsistent.");
assert(entry.source?.source === "local", "Repository marketplace entry must use a local source.");
assert(entry.source?.path === "./plugins/education-tools", "Marketplace source path is inconsistent.");
assert(entry.policy?.installation && entry.policy?.authentication && entry.category, "Marketplace policy metadata is incomplete.");

assert(portableManifest.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "Portable manifest schema is missing.");
assert(portableManifest.name === entry.name, "Portable manifest and marketplace names differ.");
assert(compatibilityManifest.name === entry.name, "Compatibility manifest and marketplace names differ.");
assert(portableManifest.version === compatibilityManifest.version, "Manifest versions differ.");
assert(portableManifest.version === packageJson.version, "Plugin and package versions differ.");
assert(portableManifest.extensions?.["com.openai"]?.hooks === "./hooks/hooks.json", "Portable hook path is inconsistent.");

const portableServer = portableMcp.mcpServers?.education_tools;
const compatibilityServer = compatibilityMcp.mcpServers?.education_tools;
assert(portableMcp.$schema === "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "Portable MCP schema is missing.");
assert(portableServer?.type === "stdio", "Portable MCP server must use stdio.");
assert(portableServer?.command === "node", "Portable MCP command must use Node.js.");
assert(portableServer?.args?.[0] === "./dist/server.mjs", "Portable MCP server must use the committed bundle.");
assert(compatibilityServer?.args?.[0] === "./dist/server.mjs", "Compatibility MCP server must use the committed bundle.");

const requiredFiles = [
  "dist/server.mjs",
  "hooks/hooks.json",
  "scripts/md-log-hook.mjs",
  "skills/education-tools/SKILL.md",
];
for (const relativePath of requiredFiles) {
  assert(fs.statSync(path.join(pluginRoot, relativePath), { throwIfNoEntry: false })?.isFile(), `Missing required plugin file: ${relativePath}`);
}
assert(fs.statSync(path.join(pluginRoot, "dist/server.mjs")).size > 100_000, "Bundled MCP server appears incomplete.");

const hookText = JSON.stringify(hooks);
assert(hookText.includes("${PLUGIN_ROOT}/scripts/md-log-hook.mjs"), "Hooks must resolve their script through PLUGIN_ROOT.");

if (fs.existsSync(path.join(repositoryRoot, ".git"))) {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert(!tracked.split("\n").some((file) => file.includes("node_modules/")), "node_modules must not be committed.");
}

console.log("Repository marketplace and plugin manifests are consistent.");
