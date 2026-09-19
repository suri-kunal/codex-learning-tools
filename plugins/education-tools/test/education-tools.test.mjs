import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  DONT_KNOW_VALUE,
  gradeQuiz,
  normalizeCorrectAnswer,
  normalizeOptions,
} from "../scripts/lib.mjs";
import { createEducationToolsServer } from "../scripts/server.mjs";
import { handleHookEvent } from "../scripts/md-log-hook.mjs";

function structured(result) {
  return result.structuredContent || result.structured_content;
}

test("normalizes options and grades multi-select as an exact set", () => {
  const options = normalizeOptions([
    { label: "Alpha", value: "a" },
    { label: "Beta", value: "b" },
  ]);
  assert.deepEqual(options.map((option) => option.value), ["a", "b"]);
  assert.deepEqual(normalizeCorrectAnswer('["a","b"]', true), ["a", "b"]);
  assert.equal(gradeQuiz({ selectedValues: ["b", "a"], correctValues: ["a", "b"], multiSelect: true }).correct, true);
  assert.equal(gradeQuiz({ selectedValues: ["a"], correctValues: ["a", "b"], multiSelect: true }).correct, false);
  assert.deepEqual(
    gradeQuiz({ selectedValues: [DONT_KNOW_VALUE, "a"], correctValues: ["a"], multiSelect: true }),
    { correct: false, dontKnow: true, selectedValues: [] },
  );
});

test("MCP tools elicit a question and grade a quiz with feedback", async (t) => {
  const server = createEducationToolsServer();
  const client = new Client(
    { name: "education-tools-test", version: "1.0.0" },
    { capabilities: { elicitation: { form: {} } } },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const requests = [];

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    requests.push(request.params);
    if (request.params.message.startsWith("Which path?")) {
      return { action: "accept", content: { answer: "fast" } };
    }
    if (request.params.message.startsWith("What is 2 + 2?")) {
      return { action: "accept", content: { answer: "four" } };
    }
    if (request.params.message.startsWith("✓ Correct")) {
      return { action: "accept", content: { acknowledge: "continue" } };
    }
    throw new Error(`Unexpected elicitation: ${request.params.message}`);
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const questionResult = await client.callTool({
    name: "ask_user_question",
    arguments: {
      question: "Which path?",
      options: [
        { label: "Fast", value: "fast" },
        { label: "Careful", value: "careful" },
      ],
    },
  });
  assert.equal(structured(questionResult).status, "answered");
  assert.deepEqual(structured(questionResult).answerLabels, ["Fast"]);

  const quizResult = await client.callTool({
    name: "quiz",
    arguments: {
      question: "What is 2 + 2?",
      options: [
        { label: "Three", value: "three" },
        { label: "Four", value: "four" },
      ],
      correctAnswer: "four",
      explanation: "Two pairs contain four items.",
      shuffle: false,
    },
  });
  assert.equal(structured(quizResult).correct, true);
  assert.deepEqual(structured(quizResult).correctLabels, ["Four"]);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].requestedSchema.properties.answer.oneOf.at(-1).title, "I don't know");
});

test("Markdown hook records only the opted-in session", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "education-tools-"));
  const stateFile = path.join(directory, "state.json");
  const markdownFile = path.join(directory, "lesson.md");
  fs.writeFileSync(markdownFile, "# Lesson\n", "utf8");

  const previousStateFile = process.env.EDUCATION_TOOLS_STATE_FILE;
  process.env.EDUCATION_TOOLS_STATE_FILE = stateFile;
  try {
    handleHookEvent({
      session_id: "session-a",
      hook_event_name: "PostToolUse",
      tool_name: "mcp__education_tools__markdown_log_start",
      tool_input: { file_path: markdownFile },
      tool_response: { structuredContent: { status: "start_requested", filePath: markdownFile } },
    });
    handleHookEvent({ session_id: "session-b", hook_event_name: "UserPromptSubmit", prompt: "Do not log this" });
    handleHookEvent({ session_id: "session-a", hook_event_name: "UserPromptSubmit", prompt: "Explain BPE" });
    handleHookEvent({
      session_id: "session-a",
      hook_event_name: "PostToolUse",
      tool_name: "mcp__education_tools__quiz",
      tool_input: {
        question: "Which pair merges first?",
        options: [{ label: "Lowest rank", value: "low" }, { label: "Highest count", value: "count" }],
        explanation: "Encoding replays learned merges by rank.",
      },
      tool_response: {
        structuredContent: {
          status: "answered",
          correct: true,
          dontKnow: false,
          answerLabels: ["Lowest rank"],
          correctLabels: ["Lowest rank"],
          options: [{ label: "Lowest rank", value: "low" }, { label: "Highest count", value: "count" }],
        },
      },
    });
    handleHookEvent({ session_id: "session-a", hook_event_name: "Stop", last_assistant_message: "Exactly." });
    handleHookEvent({
      session_id: "session-a",
      hook_event_name: "PostToolUse",
      tool_name: "mcp__education_tools__markdown_log_stop",
      tool_input: {},
      tool_response: {},
    });
    handleHookEvent({ session_id: "session-a", hook_event_name: "UserPromptSubmit", prompt: "Also do not log this" });

    const log = fs.readFileSync(markdownFile, "utf8");
    assert.match(log, /Logging started for this session/);
    assert.match(log, /Explain BPE/);
    assert.match(log, /Which pair merges first\?/);
    assert.match(log, /ANSWER — CORRECT/);
    assert.match(log, /Exactly\./);
    assert.match(log, /Logging stopped for this session/);
    assert.doesNotMatch(log, /Do not log this/);
    assert.doesNotMatch(log, /Also do not log this/);
  } finally {
    if (previousStateFile === undefined) delete process.env.EDUCATION_TOOLS_STATE_FILE;
    else process.env.EDUCATION_TOOLS_STATE_FILE = previousStateFile;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
