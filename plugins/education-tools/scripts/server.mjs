import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import {
  DONT_KNOW_VALUE,
  OTHER_VALUE,
  feedbackText,
  gradeQuiz,
  normalizeCorrectAnswer,
  normalizeOptions,
  optionTitle,
  selectedLabels,
  shuffleOptions,
  textResult,
} from "./lib.mjs";
import { loadState, setPendingPath, validateLogFile } from "./logger.mjs";

const optionSchema = z.object({
  label: z.string().min(1).describe("Text displayed to the user"),
  value: z.string().min(1).optional().describe("Stable machine-readable value; defaults to option_N"),
  description: z.string().optional().describe("Optional clarification displayed beside the label"),
});

function elicitationMessage(question, details) {
  return details ? `${question}\n\n${details}` : question;
}

function cancellationResult(kind, action) {
  return textResult(
    `${kind} was ${action === "decline" ? "declined" : "cancelled"}.`,
    { status: "cancelled", action },
  );
}

async function collectOther(server, question) {
  const result = await server.server.elicitInput({
    mode: "form",
    message: `Enter your custom answer for:\n\n${question}`,
    requestedSchema: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          title: "Other answer",
          minLength: 1,
        },
      },
      required: ["answer"],
    },
  });

  if (result.action !== "accept" || !result.content) return null;
  return String(result.content.answer);
}

async function showQuizFeedback(server, message) {
  await server.server.elicitInput({
    mode: "form",
    message,
    requestedSchema: {
      type: "object",
      properties: {
        acknowledge: {
          type: "string",
          title: "Continue",
          oneOf: [{ const: "continue", title: "Continue" }],
          default: "continue",
        },
      },
      required: ["acknowledge"],
    },
  });
}

function toolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(`Education tool failed: ${message}`, { status: "error", error: message }, true);
}

export function createEducationToolsServer() {
  const server = new McpServer(
    { name: "education-tools", version: "1.0.0" },
    {
      capabilities: {},
      instructions: "Use ask_user_question for one ungraded user decision at a time, quiz for graded conceptual checks, and markdown_log_* for session logging.",
    },
  );

  server.registerTool(
    "ask_user_question",
    {
      title: "Ask User Question",
      description: "Open an interactive popup for exactly one ungraded question. Use for preferences, clarifications, and learner-generated responses that have no known correct answer. Options are optional; when omitted, the user gets a free-form text field. Do not use for graded questions.",
      inputSchema: {
        question: z.string().min(1),
        details: z.string().optional(),
        options: z.array(optionSchema).min(2).optional(),
        multiSelect: z.boolean().default(false),
        allowOther: z.boolean().default(true),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ question, details, options, multiSelect, allowOther }) => {
      try {
        if (!options) {
          const result = await server.server.elicitInput({
            mode: "form",
            message: elicitationMessage(question, details),
            requestedSchema: {
              type: "object",
              properties: {
                answer: {
                  type: "string",
                  title: "Answer",
                  minLength: 1,
                },
              },
              required: ["answer"],
            },
          });

          if (result.action !== "accept" || !result.content) {
            return cancellationResult("Question", result.action);
          }
          const answer = String(result.content.answer);
          return textResult(`User answered: ${answer}`, {
            status: "answered",
            mode: "text",
            answers: [answer],
            answerLabels: [answer],
            options: [],
          });
        }

        const normalized = normalizeOptions(options);
        const choices = normalized.map((option) => ({ const: option.value, title: optionTitle(option) }));
        if (allowOther) choices.push({ const: OTHER_VALUE, title: "Other" });

        const answerSchema = multiSelect
          ? {
              type: "array",
              title: "Choose all that apply",
              items: { anyOf: choices },
              minItems: 1,
              maxItems: choices.length,
            }
          : {
              type: "string",
              title: "Choose one",
              oneOf: choices,
            };

        const result = await server.server.elicitInput({
          mode: "form",
          message: elicitationMessage(question, details),
          requestedSchema: {
            type: "object",
            properties: { answer: answerSchema },
            required: ["answer"],
          },
        });

        if (result.action !== "accept" || !result.content) {
          return cancellationResult("Question", result.action);
        }

        const selected = multiSelect
          ? (Array.isArray(result.content.answer) ? result.content.answer.map(String) : [])
          : [String(result.content.answer)];
        const selectedWithoutOther = selected.filter((value) => value !== OTHER_VALUE);
        const labels = selectedLabels(selectedWithoutOther, normalized);

        if (selected.includes(OTHER_VALUE)) {
          const custom = await collectOther(server, question);
          if (custom == null && selectedWithoutOther.length === 0) {
            return cancellationResult("Question", "cancel");
          }
          if (custom != null) labels.push(custom);
        }

        return textResult(`User answered: ${labels.join(", ")}`, {
          status: "answered",
          mode: multiSelect ? "multi" : "single",
          answers: selectedWithoutOther,
          answerLabels: labels,
          options: normalized,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "quiz",
    {
      title: "Quiz",
      description: "Open a graded single- or multi-select quiz popup, instantly grade the response, and show a feedback popup with the correct answer and explanation. Supply stable option values and the known correct value(s). An 'I don't know' choice is added automatically. Use for conceptual checks and retrieval, not for a learner's first implementation attempt or other discovery work.",
      inputSchema: {
        question: z.string().min(1),
        details: z.string().optional(),
        options: z.array(optionSchema).min(2),
        multiSelect: z.boolean().default(false),
        correctAnswer: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        explanation: z.string().min(1),
        shuffle: z.boolean().default(true),
        showFeedbackPopup: z.boolean().default(true),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ question, details, options, multiSelect, correctAnswer, explanation, shuffle, showFeedbackPopup }) => {
      try {
        const normalized = normalizeOptions(options);
        const correctValues = normalizeCorrectAnswer(correctAnswer, multiSelect);
        const availableValues = new Set(normalized.map((option) => option.value));
        const missing = correctValues.filter((value) => !availableValues.has(value));
        if (missing.length) {
          throw new Error(`correctAnswer references unknown option value(s): ${missing.join(", ")}.`);
        }

        const displayed = shuffle ? shuffleOptions(normalized) : [...normalized];
        const choices = [
          ...displayed.map((option) => ({ const: option.value, title: optionTitle(option) })),
          { const: DONT_KNOW_VALUE, title: "I don't know" },
        ];

        const answerSchema = multiSelect
          ? {
              type: "array",
              title: "Select every correct answer",
              items: { anyOf: choices },
              minItems: 1,
              maxItems: choices.length,
            }
          : {
              type: "string",
              title: "Choose one answer",
              oneOf: choices,
            };

        const result = await server.server.elicitInput({
          mode: "form",
          message: elicitationMessage(question, details),
          requestedSchema: {
            type: "object",
            properties: { answer: answerSchema },
            required: ["answer"],
          },
        });

        if (result.action !== "accept" || !result.content) {
          return cancellationResult("Quiz", result.action);
        }

        const rawSelected = multiSelect
          ? (Array.isArray(result.content.answer) ? result.content.answer.map(String) : [])
          : [String(result.content.answer)];
        const grade = gradeQuiz({ selectedValues: rawSelected, correctValues, multiSelect });
        const answerLabels = selectedLabels(grade.selectedValues, normalized);
        const correctLabels = selectedLabels(correctValues, normalized);
        const feedback = feedbackText({
          correct: grade.correct,
          dontKnow: grade.dontKnow,
          selected: answerLabels,
          correctLabels,
          explanation,
        });

        if (showFeedbackPopup) {
          await showQuizFeedback(server, feedback);
        }

        return textResult(feedback, {
          status: "answered",
          mode: multiSelect ? "multi" : "single",
          correct: grade.correct,
          dontKnow: grade.dontKnow,
          answers: grade.selectedValues,
          answerLabels,
          correctAnswers: correctValues,
          correctLabels,
          explanation,
          options: displayed,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "markdown_log_start",
    {
      title: "Start Markdown Log",
      description: "Start appending this Codex session's future user prompts, assistant replies, questions, and quizzes to an existing Markdown file. file_path must be absolute. Logging begins after this tool call; prior conversation is not backfilled.",
      inputSchema: {
        file_path: z.string().min(1).describe("Absolute path to an existing Markdown file"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ file_path }) => {
      try {
        const normalized = validateLogFile(file_path);
        setPendingPath(normalized);
        return textResult(`Markdown logging requested for ${normalized}.`, {
          status: "start_requested",
          filePath: normalized,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "markdown_log_stop",
    {
      title: "Stop Markdown Log",
      description: "Stop Markdown logging for the current Codex session.",
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async () => textResult("Markdown logging stop requested.", { status: "stop_requested" }),
  );

  server.registerTool(
    "markdown_log_status",
    {
      title: "Markdown Log Status",
      description: "Report whether Markdown logging has pending or active sessions. This diagnostic does not modify files.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const state = loadState();
      const paths = [...new Set(Object.values(state.sessions))];
      const text = paths.length
        ? `Markdown logging is active for ${Object.keys(state.sessions).length} session(s):\n${paths.join("\n")}`
        : state.pendingPath
          ? `Markdown logging is pending hook activation for ${state.pendingPath}.`
          : "Markdown logging is not active.";
      return textResult(text, {
        status: paths.length ? "active" : state.pendingPath ? "pending" : "inactive",
        activeSessionCount: Object.keys(state.sessions).length,
        paths,
        pendingPath: state.pendingPath,
      });
    },
  );

  return server;
}

export async function main() {
  const server = createEducationToolsServer();
  await server.connect(new StdioServerTransport());
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    fs.writeSync(process.stderr.fd, `education-tools MCP server failed: ${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
