---
name: education-tools
description: Use interactive question and quiz popups, or start and stop opt-in Markdown session logging. Invoke whenever asking the user a non-graded question, giving a graded conceptual quiz, or handling a request to log the conversation to Markdown.
---

# Education Tools

## Ask one ungraded question

Use `mcp__education_tools__ask_user_question` for exactly one preference, clarification, decision, or constructive response with no known correct answer.

- Omit `options` for free-form input.
- Supply at least two options for single- or multi-select input.
- Keep `allowOther` enabled unless custom input would be invalid.
- Ask one question per call.

## Give a graded quiz

Use `mcp__education_tools__quiz` only when there is a known correct answer.

- Give every option a stable `value`.
- Pass the value, not the option position, in `correctAnswer`.
- Make distractors diagnostic and unambiguously wrong.
- Do not add an “I don't know” option; the tool adds it.
- Keep `showFeedbackPopup` enabled so grading and explanation appear immediately.
- Do not use a quiz for the learner's first implementation or derivation attempt; use the question tool instead.

## Log to Markdown

When the user asks to begin logging, call `mcp__education_tools__markdown_log_start` with an absolute path to an existing Markdown file. Logging starts after that tool call and records future user prompts, assistant final replies, question exchanges, and quiz results for this Codex session. It does not backfill earlier conversation.

Call `mcp__education_tools__markdown_log_stop` when the user asks to stop. Use `mcp__education_tools__markdown_log_status` for diagnostics.
