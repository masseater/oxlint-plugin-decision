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
    "Does this function's name describe only reading or fetching data (for example get, find, load or fetch), while its body also changes or announces something on the side, such as writing to a database or file, logging, or sending a message? Sending the request that fetches the data, such as calling an API or a model and reading its answer, is the fetching itself and does not count.",
  cutoff: 0.6,
});

const untrustedInputRisk = defineDecisionRule({
  id: "untrusted-input-risk",
  target: "function",
  question:
    "Does this function splice untrusted input, such as a user message or request parameter, into the same string as a SQL query, shell command, eval code, HTML, or language model instructions, instead of passing it as a separate parameter or field? Count input as untrusted only when it comes from outside the program, such as a request, a user message, a form, or a file or response the program does not control; a parameter whose origin is not shown counts when its name or type marks it as user or request data. Text taken from the program's own rule definitions, settings, constants or cache is not untrusted, and JSON.parse is not eval.",
  cutoff: 0.6,
  answer: { kind: "severity", minimum: "warn" },
});

const domainNaming = defineDecisionRule({
  id: "domain-naming",
  target: "function",
  question:
    "Is this function named after a mechanism word such as Manager, Processor, Handler, Helper, Data, Info, handle, process, or do, while its body works on one specific business concept, such as an invoice, an order, or a refund, that the name should call by its domain name instead? Code whose subject is a generic mechanism, such as HTTP, files, the command line, or framework glue, does not count.",
  cutoff: 0.6,
});

const preferSchemaValidation = defineDecisionRule({
  id: "prefer-schema-validation",
  target: "function",
  question:
    "Does this function check the shape or values of untyped data, such as parsed JSON, a request body, config, or an API response, with a long hand-written chain of typeof, instanceof, in, or field checks joined by && or ||, where a schema from a validation library would state the same rules more simply? A single simple check does not count.",
  cutoff: 0.6,
});

export {
  domainNaming,
  nameMatchesBehavior,
  noHardcodedSecrets,
  noPiiInLogs,
  noPromptInjection,
  preferSchemaValidation,
  untrustedInputRisk,
};
