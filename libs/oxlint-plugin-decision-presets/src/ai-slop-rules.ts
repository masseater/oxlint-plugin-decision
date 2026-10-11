import { defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionRule, RuleContext } from "@r_masseater/oxlint-plugin-decision";

import {
  forwardsOneCall,
  hasAtMostOneStatement,
  isDeclared,
  hasCast,
  hasCommentInside,
  hasFallback,
  hasGuard,
  hasSuppression,
} from "./ai-slop-select.ts";
import type { Select } from "./ai-slop-select.ts";

interface SlopRule {
  readonly id: string;
  readonly ask: string;
  readonly flag: string;
  readonly pass: string;
  readonly select?: Select;
  readonly context?: RuleContext;
  readonly cutoff?: number;
}

const CUTOFF = 0.6;

const slopRule = ({ ask, flag, pass, ...rule }: SlopRule): DecisionRule =>
  defineDecisionRule({
    target: "function",
    cutoff: CUTOFF,
    ...rule,
    message: ask,
    question: `${ask}\n\nAnswer yes when: ${flag}\n\nAnswer no when: ${pass}`,
  });

const redundantGuard = slopRule({
  id: "redundant-guard",
  cutoff: 0.8,
  select: hasGuard,
  ask: "This function checks one of its own parameters for a case that the parameter's declared type already rules out, so the check can never change what happens.",
  flag: "A parameter whose type annotation is non-optional and non-nullable, such as `user: User` or `name: string`, is compared with null or undefined, has its `typeof` tested against the type it is already declared as, or is read with `?.`.",
  pass: "No parameter is checked against its own declared type. Checks on local variables do not count: a local that holds the result of `Map.get`, `find`, `JSON.parse` or any other call, or a value annotated `unknown`, can really be missing or of another type, so checking it is necessary. Parameters of plain JavaScript have no declared type, so any check on them is allowed.",
});

const defaultMasksMissingValue = slopRule({
  id: "default-masks-missing-value",
  select: hasFallback,
  ask: "This function replaces a value that should always be present with a made-up default, so a missing value is hidden instead of reported.",
  flag: "A `??` or `||` default, or a default parameter, stands in for data the rest of the code treats as required, such as an id, a user, a price, a config entry or a response field, with a placeholder like 'unknown', '', 0, [] or {} that later code will use as if it were real; or a chain of two or more fallbacks (`a ?? b ?? c`) picks among sources with no sign of why that order is right.",
  pass: "Every default is a value the domain genuinely allows when the input is absent, such as an optional setting with a documented default, an empty list for an optional filter, or a display label for an optional field; or the missing case is reported, thrown or returned to the caller instead of being filled in.",
});

const passThroughWrapper = slopRule({
  id: "pass-through-wrapper",
  select: forwardsOneCall,
  ask: "This function only forwards its arguments to another function and returns the result, adding no behaviour of its own.",
  flag: "The body is a single call that receives every parameter exactly as it came in, in the same order, or with an extra argument that is always the same constant, and returns or awaits the result unchanged, so callers could call the inner function directly.",
  pass: "The function changes something on the way: it transforms an argument before passing it on (for example trimming, lower-casing, converting or validating it), transforms the result, binds a dependency, adapts to a different signature a caller requires, or it is an entry point that a framework or another package calls by name.",
});

const placeholderImplementation = slopRule({
  id: "placeholder-implementation",
  select: hasAtMostOneStatement,
  ask: "This function is a stand-in that pretends to do its job: it returns a fixed value or does nothing where its name promises real work.",
  flag: "The body is empty, only logs, or only holds a TODO while the name promises an action; a validator, checker or permission function always returns true or always returns false; a function named after a computation returns a hard-coded number, string or object; or a branch the name promises to handle silently does nothing.",
  pass: "The body does the work its name promises, even simply. An intentional no-op whose name says so (noop, ignore, a default callback), an abstract method meant to be overridden, and a test double inside test code are not placeholders.",
});

const commentRestatesCode = slopRule({
  id: "comment-restates-code",
  select: hasCommentInside,
  ask: "A comment inside this function only translates the next line of code into words and adds no reason, unit, or constraint.",
  flag: "A comment repeats the code in words, such as `// increment the counter` over `count += 1`, `// loop over the items` over a for loop, or `// return the total` over a return; deleting it would leave a reader knowing exactly as much.",
  pass: "Every comment says something the code cannot say on its own: why it is done this way (often with `because` or `so`), a fact about the outside world such as a billing rule, an API quirk or a standard, a unit, or an invariant. Lint directive comments such as `eslint-disable` are not judged here.",
});

const commentNarratesHistory = slopRule({
  id: "comment-narrates-history",
  select: hasCommentInside,
  ask: "A comment inside this function records how the code came to be, or speaks to the person who asked for the change, instead of describing the code as it stands.",
  flag: "A comment says what was added, changed, removed, fixed or kept for compatibility (`added X`, `changed to Y`, `previously`, `now uses`, `new:`), marks the code as a stopgap (`temporary`, `for now`, `quick fix`, `hack until`), mentions a date, a ticket in progress, a model or a conversation, or addresses a reader as if replying (`as requested`, `here we`, `note that I`).",
  pass: "Every comment describes the code as it is now and would still be true and useful to a reader who never saw the earlier version or the conversation. A TODO that names a concrete missing case is a description of the code, not history.",
});

const docRestatesSignature = slopRule({
  id: "doc-restates-signature",
  context: { scope: "comment" },
  ask: "The comment above this function contains nothing except the function's name and parameter names reworded.",
  flag: "Every sentence of the comment can be rebuilt from the signature alone, such as `Gets the order.`, `@param id - the id`, `@returns the order` or `Creates a new instance.`",
  pass: "At least one sentence states behaviour the signature does not show, such as what is returned when nothing matches, when it fails, a unit or range, a side effect, or how values are compared.",
});

const castInsteadOfNarrowing = slopRule({
  id: "cast-instead-of-narrowing",
  select: hasCast,
  ask: "This function uses a type assertion (`as`, `<T>` or a non-null `!`) to silence the type checker where the value is not known to have that type.",
  flag: "The asserted type is not established by anything on the path: data from parsing, I/O, `unknown`, `any` or a wider union is cast to a specific shape without a check, a possibly missing value gets `!` without a preceding check or a guarantee from the API, or the cast goes through `unknown` (`as unknown as T`) to force an unrelated type.",
  pass: "Each assertion states something the code has just established or the API guarantees, such as a cast after a type guard, a DOM element looked up by a selector that the same module creates, or a literal narrowed for an overload; `as const` is not a cast.",
});

const suppressionInsteadOfFix = slopRule({
  id: "suppression-instead-of-fix",
  cutoff: 0.7,
  select: hasSuppression,
  ask: "A lint or type-check suppression comment inside this function hides a problem that the code next to it could simply fix.",
  flag: "The directive gives no reason after the rule name, or the line it silences has a direct local fix, such as handling a floating promise, typing a value instead of `any`, removing an unused variable, or narrowing instead of `@ts-ignore`.",
  pass: "Every directive is followed by `--` or a comment with a reason explaining why the rule does not fit this line, such as output a command-line tool prints on purpose, a wrong third-party type, or generated code.",
});

const reinventsBuiltin = slopRule({
  id: "reinvents-builtin",
  select: isDeclared,
  ask: "This function contains a hand-written loop or algorithm that re-implements something the JavaScript standard library or the platform already provides.",
  flag: "A loop or manual algorithm in the body does what one built-in call does: de-duplicating with an array and includes instead of a Set, deep copying instead of structuredClone, grouping instead of Object.groupBy, building query strings instead of URLSearchParams, formatting numbers or dates instead of Intl, padding instead of padStart, flattening instead of flat, or finding the last match instead of findLast.",
  pass: "The function has no such hand-written loop: it already calls the built-in directly (for example `new Set`, `structuredClone`, `reduce` or `Intl`), or its loop does domain work that no single built-in does.",
});

const aiSlopRules = [
  redundantGuard,
  defaultMasksMissingValue,
  passThroughWrapper,
  placeholderImplementation,
  commentRestatesCode,
  commentNarratesHistory,
  docRestatesSignature,
  castInsteadOfNarrowing,
  suppressionInsteadOfFix,
  reinventsBuiltin,
] as const;

export {
  aiSlopRules,
  castInsteadOfNarrowing,
  commentNarratesHistory,
  commentRestatesCode,
  defaultMasksMissingValue,
  docRestatesSignature,
  passThroughWrapper,
  placeholderImplementation,
  redundantGuard,
  reinventsBuiltin,
  suppressionInsteadOfFix,
};
