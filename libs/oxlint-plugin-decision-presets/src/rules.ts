import { defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";

const noPiiInLogs = defineDecisionRule({
  id: "no-pii-in-logs",
  target: "call",
  question:
    "Does this call write personal data, such as an email or phone number, to a log or console?",
  cutoff: 0.8,
});

const noPromptInjection = defineDecisionRule({
  id: "no-prompt-injection",
  target: "function",
  question:
    "Does this function build a language model prompt by concatenating untrusted user input into the instructions?",
  cutoff: 0.8,
});

const noHardcodedSecrets = defineDecisionRule({
  id: "no-hardcoded-secrets",
  target: "file",
  question:
    "Does this file contain a hard-coded secret, such as an API key, password, or private token, as a literal value?",
  cutoff: 0.8,
});

const nameMatchesBehavior = defineDecisionRule({
  id: "name-matches-behavior",
  target: "function",
  question:
    "Does this function's name describe only reading or fetching data (for example get, find, load or fetch), while its body also writes, logs or sends something?",
  cutoff: 0.6,
});

const noSwallowedErrors = defineDecisionRule({
  id: "no-swallowed-errors",
  target: "function",
  question:
    "Does this function catch an error and then drop it without logging, rethrowing, or returning it?",
  cutoff: 0.7,
});

const untrustedInputRisk = defineDecisionRule({
  id: "untrusted-input-risk",
  target: "function",
  question:
    "Does this function splice untrusted input, such as a user message or request parameter, into the same string as a SQL query, shell command, eval code, HTML, or language model instructions, instead of passing it as a separate parameter or field?",
  cutoff: 0.6,
  answer: { kind: "severity", minimum: "warn" },
});

const staleComment = defineDecisionRule({
  id: "stale-comment",
  target: "function",
  question: "How does the comment right above this function relate to what the function does?",
  cutoff: 0.7,
  context: { scope: "lines", before: 5, after: 0 },
  answer: {
    kind: "classify",
    labels: {
      accurate: "Everything the comment says, the code does",
      missing: "There is no comment right above the function",
      stale:
        "The comment claims something, such as logging, returning or checking, that the code does not do",
    },
    report: ["stale"],
  },
});

export {
  nameMatchesBehavior,
  noHardcodedSecrets,
  noPiiInLogs,
  noPromptInjection,
  noSwallowedErrors,
  staleComment,
  untrustedInputRisk,
};
