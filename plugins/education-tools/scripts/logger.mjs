import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EMPTY_STATE = Object.freeze({ pendingPath: null, sessions: {} });

export function stateFilePath() {
  if (process.env.EDUCATION_TOOLS_STATE_FILE) {
    return process.env.EDUCATION_TOOLS_STATE_FILE;
  }

  const pluginData = process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return path.join(pluginData, "md-log-state.json");

  return path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    "education-tools",
    "md-log-state.json",
  );
}

export function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFilePath(), "utf8"));
    return {
      pendingPath: typeof parsed.pendingPath === "string" ? parsed.pendingPath : null,
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export function saveState(state) {
  const destination = stateFilePath();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, destination);
}

export function setPendingPath(filePath) {
  const state = loadState();
  state.pendingPath = filePath;
  saveState(state);
}

export function bindSession(sessionId, filePath) {
  if (!sessionId) return;
  const state = loadState();
  state.sessions[sessionId] = filePath;
  state.pendingPath = null;
  saveState(state);
}

export function unbindSession(sessionId) {
  if (!sessionId) return;
  const state = loadState();
  delete state.sessions[sessionId];
  state.pendingPath = null;
  saveState(state);
}

export function logPathForSession(sessionId) {
  if (!sessionId) return null;
  return loadState().sessions[sessionId] || null;
}

export function validateLogFile(filePath) {
  if (!path.isAbsolute(filePath)) {
    throw new Error("file_path must be absolute.");
  }
  const stats = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stats) throw new Error(`Markdown file does not exist: ${filePath}`);
  if (!stats.isFile()) throw new Error(`Markdown log destination is not a file: ${filePath}`);
  return path.normalize(filePath);
}

export function appendMarkdown(filePath, markdown) {
  fs.appendFileSync(filePath, `\n\n${markdown.trim()}\n`, "utf8");
}

function quote(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function callout(kind, title, body) {
  return `> [!${kind}] ${title}\n>\n${quote(body)}`;
}

export function formatUserPrompt(prompt) {
  return callout("quote", "YOU", prompt);
}

export function formatAssistantMessage(message) {
  return callout("abstract", "ASSISTANT", message);
}

function formatOptions(options = []) {
  return options.map((option) => `- ${option.label}${option.description ? ` — ${option.description}` : ""}`).join("\n");
}

export function formatQuestionExchange(input, result) {
  const questionBody = [
    input.question,
    input.details,
    input.options?.length ? formatOptions(input.options) : "",
  ].filter(Boolean).join("\n\n");

  const answer = result.status === "answered"
    ? (result.answerLabels || result.answers || []).join(", ") || "(empty answer)"
    : "Question cancelled.";

  return `${callout("question", "QUESTION", questionBody)}\n\n${callout("info", "ANSWER", answer)}`;
}

export function formatQuizExchange(input, result) {
  const questionBody = [
    input.question,
    input.details,
    formatOptions(result.options || input.options || []),
  ].filter(Boolean).join("\n\n");

  if (result.status !== "answered") {
    return `${callout("question", "QUIZ", questionBody)}\n\n${callout("warning", "QUIZ CANCELLED", "No answer was submitted.")}`;
  }

  const title = result.correct ? "ANSWER — CORRECT" : result.dontKnow ? "ANSWER — I DON'T KNOW" : "ANSWER — INCORRECT";
  const kind = result.correct ? "success" : result.dontKnow ? "warning" : "failure";
  const selected = result.dontKnow ? "I don't know" : (result.answerLabels || []).join(", ") || "(none)";
  const body = [
    `Selected: ${selected}`,
    `Correct: ${(result.correctLabels || []).join(", ")}`,
    input.explanation,
  ].join("\n\n");

  return `${callout("question", "QUIZ", questionBody)}\n\n${callout(kind, title, body)}`;
}
