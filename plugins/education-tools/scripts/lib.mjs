export const OTHER_VALUE = "__education_tools_other__";
export const DONT_KNOW_VALUE = "__education_tools_dont_know__";

export function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error("At least two options are required.");
  }

  const seen = new Set();
  return options.map((option, index) => {
    if (!option || typeof option.label !== "string" || option.label.trim() === "") {
      throw new Error(`Option ${index + 1} must have a non-empty label.`);
    }

    const value = option.value == null || option.value === ""
      ? `option_${index + 1}`
      : String(option.value);

    if (value === OTHER_VALUE || value === DONT_KNOW_VALUE) {
      throw new Error(`Option value ${JSON.stringify(value)} is reserved.`);
    }
    if (seen.has(value)) {
      throw new Error(`Duplicate option value: ${JSON.stringify(value)}.`);
    }
    seen.add(value);

    return {
      label: option.label.trim(),
      value,
      ...(option.description ? { description: String(option.description).trim() } : {}),
    };
  });
}

export function optionTitle(option) {
  return option.description
    ? `${option.label} — ${option.description}`
    : option.label;
}

export function shuffleOptions(options, random = Math.random) {
  const result = [...options];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function normalizeCorrectAnswer(correctAnswer, multiSelect) {
  let answer = correctAnswer;
  if (typeof answer === "string" && answer.trim().startsWith("[")) {
    try {
      answer = JSON.parse(answer);
    } catch {
      // Keep it as a string; validation below will produce a useful error if needed.
    }
  }

  const values = Array.isArray(answer) ? answer.map(String) : [String(answer)];
  if (!multiSelect && values.length !== 1) {
    throw new Error("A single-select quiz must have exactly one correct answer.");
  }
  if (values.length === 0 || values.some((value) => value === "")) {
    throw new Error("correctAnswer must contain at least one non-empty option value.");
  }
  return [...new Set(values)];
}

export function gradeQuiz({ selectedValues, correctValues, multiSelect }) {
  const selected = [...new Set(selectedValues.map(String))];
  const dontKnow = selected.includes(DONT_KNOW_VALUE);
  if (dontKnow) {
    return { correct: false, dontKnow: true, selectedValues: [] };
  }

  const correct = multiSelect
    ? selected.length === correctValues.length
      && selected.every((value) => correctValues.includes(value))
    : selected.length === 1 && selected[0] === correctValues[0];

  return { correct, dontKnow: false, selectedValues: selected };
}

export function selectedLabels(values, options) {
  const byValue = new Map(options.map((option) => [option.value, option.label]));
  return values.map((value) => byValue.get(value) ?? value);
}

export function feedbackText({ correct, dontKnow, selected, correctLabels, explanation }) {
  const heading = correct ? "✓ Correct" : dontKnow ? "I don't know" : "✗ Not quite";
  const selectedLine = dontKnow
    ? "You chose: I don't know"
    : `Your answer: ${selected.length ? selected.join(", ") : "(none)"}`;

  return [
    heading,
    selectedLine,
    `Correct answer: ${correctLabels.join(", ")}`,
    explanation,
  ].join("\n\n");
}

export function textResult(text, structuredContent, isError = false) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  };
}
