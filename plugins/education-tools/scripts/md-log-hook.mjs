import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  appendMarkdown,
  bindSession,
  callout,
  formatAssistantMessage,
  formatQuestionExchange,
  formatQuizExchange,
  formatUserPrompt,
  loadState,
  logPathForSession,
  unbindSession,
  validateLogFile,
} from "./logger.mjs";

function canonicalToolName(name = "") {
  return String(name).split("__").at(-1);
}

function findStructured(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (value.structuredContent && typeof value.structuredContent === "object") {
    return value.structuredContent;
  }
  if (value.structured_content && typeof value.structured_content === "object") {
    return value.structured_content;
  }
  if (typeof value.status === "string" && ["answered", "cancelled", "error"].includes(value.status)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findStructured(child, seen);
    if (found) return found;
  }
  return null;
}

function fallbackResult(response) {
  let text = "";
  if (typeof response === "string") text = response;
  else if (response && typeof response === "object") {
    const parts = [];
    const visit = (value) => {
      if (typeof value === "string") parts.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(response);
    text = parts.join("\n");
  }
  return { status: "answered", answerLabels: text ? [text] : ["(answer unavailable)"] };
}

function appendIfActive(sessionId, markdown) {
  const destination = logPathForSession(sessionId);
  if (!destination) return;
  appendMarkdown(destination, markdown);
}

export function handleHookEvent(event) {
  const sessionId = event.session_id;

  if (event.hook_event_name === "UserPromptSubmit") {
    if (event.prompt) appendIfActive(sessionId, formatUserPrompt(event.prompt));
    return;
  }

  if (event.hook_event_name === "Stop") {
    if (event.last_assistant_message) {
      appendIfActive(sessionId, formatAssistantMessage(event.last_assistant_message));
    }
    return;
  }

  if (event.hook_event_name !== "PostToolUse") return;

  const name = canonicalToolName(event.tool_name);
  const input = event.tool_input && typeof event.tool_input === "object" ? event.tool_input : {};

  if (name === "markdown_log_start") {
    const structured = findStructured(event.tool_response);
    if (structured?.status === "error") return;
    const requested = structured?.filePath || input.file_path || loadState().pendingPath;
    if (!requested) return;
    const destination = validateLogFile(requested);
    bindSession(sessionId, destination);
    appendMarkdown(destination, callout("note", "CODEX LOG", "Logging started for this session. Earlier conversation was not backfilled."));
    return;
  }

  if (name === "markdown_log_stop") {
    appendIfActive(sessionId, callout("note", "CODEX LOG", "Logging stopped for this session."));
    unbindSession(sessionId);
    return;
  }

  const structured = findStructured(event.tool_response) || fallbackResult(event.tool_response);
  if (name === "ask_user_question") {
    appendIfActive(sessionId, formatQuestionExchange(input, structured));
  } else if (name === "quiz") {
    appendIfActive(sessionId, formatQuizExchange(input, structured));
  }
}

export async function main() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) return;
    handleHookEvent(JSON.parse(raw));
  } catch (error) {
    // Hooks must never block the user's Codex turn because logging failed.
    fs.writeSync(process.stderr.fd, `education-tools logger warning: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) await main();
