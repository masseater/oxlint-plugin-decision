import { createDecisionPlugin, defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";

const noPiiInLogs = defineDecisionRule({
  id: "no-pii-in-logs",
  target: "call",
  question:
    "Does this call write personal data, such as an email or phone number, to a log or console?",
  cutoff: 0.8,
});

const nameMatchesBehavior = defineDecisionRule({
  id: "name-matches-behavior",
  target: "function",
  question:
    "Does this function's name describe only reading or fetching data (for example get, find, load or fetch), while its body also writes, logs or sends something?",
  cutoff: 0.6,
});

const noPromptInjection = defineDecisionRule({
  id: "no-prompt-injection",
  target: "function",
  question:
    "Does this function build a language model prompt by concatenating untrusted user input into the instructions?",
  cutoff: 0.8,
});

export const rules = [noPiiInLogs, nameMatchesBehavior, noPromptInjection];

export default createDecisionPlugin({ name: "team", rules });
