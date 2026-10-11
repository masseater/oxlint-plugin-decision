import { defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionRule, RuleContext } from "@r_masseater/oxlint-plugin-decision";
import { Predicate } from "effect";

import { isDescribeCall, isLogCall, isTestCall, namedLike } from "./jev-select.ts";

interface Judgement {
  readonly ask: string;
  readonly yes: string;
  readonly no: string;
  readonly note?: string | undefined;
}

interface JevRule extends Judgement {
  readonly id: string;
  readonly target?: "function" | "call";
  readonly cutoff: number;
  readonly select?: NonNullable<DecisionRule["select"]>;
  readonly context?: RuleContext;
}

const questionOf = ({ ask, yes, no, note }: Judgement): string =>
  [ask, `It is true when: ${yes}`, `It is false when: ${no}`, note]
    .filter((part) => Predicate.isNotUndefined(part))
    .join("\n\n");

const jevRule = ({ ask, yes, no, note, ...rule }: JevRule): DecisionRule =>
  defineDecisionRule({
    target: "function",
    ...rule,
    message: ask,
    question: questionOf({ ask, yes, no, note }),
  });

const COMMENT: RuleContext = { scope: "comment" };
const ENCLOSING_FUNCTION: RuleContext = { scope: "enclosing", kind: "function" };

const fnNamePromises = jevRule({
  id: "fn-name-promises",
  cutoff: 0.55,
  ask: "The body of this function does something materially different from what its name promises.",
  yes: "Someone who read only the name and the parameter list would be wrong about what this function does: it returns a different kind of thing than the name suggests (a count that is a list, a predicate that is a number), it changes state when the name says it only reads, checks, looks up or serialises, it can fail or return nothing when the name promises a value, it handles only a narrower case than the name claims, it never performs an effect or repetition the name names (a drain or remove that leaves the container as it was, a retry that tries once), it computes something no reading of the name accounts for, or it does substantial work the name does not mention at all, such as writing what it was asked to read.",
  no: "The name and parameter list describe what the body actually does. Someone who read only them would not be surprised by the body, even if a longer or more specific name could be imagined. A terse or conventional name (run, handle, take, len, fmt, toString, a getter) that the body fits is not a violation, and a comment inside the body that is wrong about the body is a wrong comment, not a wrong name.",
});

const pureNameIsPure = jevRule({
  id: "pure-name-is-pure",
  cutoff: 0.54,
  select: namedLike({ prefixes: ["compute", "calculate", "derive", "format", "to", "parse"] }),
  ask: "This function's name presents it as a computation of a result from its inputs, but its body changes state outside itself or performs I/O.",
  yes: "The body mutates an argument or something reachable through one, assigns to a module-level binding, a field of `this` or an object it did not create, stores something it computed into a cache, Map, Set or other store that outlives the call, logs, emits or increments a metric, or reads or writes a file, network, database, environment, clock or random source, directly or through a call whose name or arguments show it does so (fetch, a path, a URL, a query, send, save). One such read or write on any path is enough.",
  no: "The body derives its result from its parameters, from `this`, from module-level values it only reads, and from dependencies it obtains, and returns it. A mutable local accumulator, a copy of an argument that is then modified, and a local object built up and returned are not effects outside the function.",
  note: "Obtaining a dependency (a module, a client, a parser handed back by a loader) is not an effect; using an acquired client to fetch, read, write or send is. A body that puts its own result into a cache that outlives the call is an effect even when it is only memoisation.",
});

const safeNameIsSafe = jevRule({
  id: "safe-name-is-safe",
  cutoff: 0.53,
  select: namedLike({
    prefixes: ["safe", "try"],
    suffixes: ["OrNull", "OrDefault", "OrUndefined"],
  }),
  ask: "This function's name says that failure is absorbed and reported as a value, but its body has a path on which a failure escapes as a throw or a rejection.",
  yes: "A failure of the kind the name promises to absorb can reach the caller as an exception or a rejected promise: the operation that can fail is outside any try, the catch rethrows or throws a new error, a failing case is detected and answered with a throw instead of the null, undefined, default, false or result value the name promises, or the fallback itself is computed by something that can fail.",
  no: "Every failure of the kind the name refers to is turned into the value the name promises: null, undefined, a default, a boolean, or a result object the caller can inspect. A body that cannot fail at all, and so has nothing to catch, honours the name.",
  note: "A throw on a programmer error, such as an argument of the wrong type, is not the failure such a name promises to absorb. Logging before returning the fallback is fine.",
});

const idempotentName = jevRule({
  id: "idempotent-name",
  cutoff: 0.4,
  select: namedLike({ prefixes: ["ensure", "upsert", "setup", "install", "register"] }),
  ask: "This function's name says a repeated call is harmless, but calling it a second time with the same arguments leaves a different result from calling it once.",
  yes: "The body performs its effect without finding out whether it is already in place, and repeating the effect accumulates or fails: it appends to a list or adds a listener, creates a record, index, table, column or resource that would then exist twice or make the second creation fail, inserts where a matching row may already be, or runs a step that is not itself safe to repeat, with no existence check, no keyed overwrite and no guard that makes the second call a no-op.",
  no: "A second call finds the effect already in place and leaves the state as the first call left it: the body checks for existence before acting, writes by key so a repeat overwrites the same entry, assigns rather than appends, uses an operation that is inherently repeatable (put, set, mkdir with recursive, CREATE IF NOT EXISTS, ON CONFLICT), returns early on a flag it sets, or has no effect at all beyond its return value.",
  note: "A helper whose own name says it is repeat-safe (ensure*, upsert*, put*, set*) is assumed to be. Logging on each call, or returning a fresh object each call, is not a different result.",
});

const catchHidesFailure = jevRule({
  id: "catch-hides-failure",
  cutoff: 0.55,
  ask: "A catch block in this function hides a failure the function's caller needed to know about.",
  yes: "The catch block neither rethrows, returns an error value the signature admits, nor reports through a channel the function is documented to use; it returns a default, an empty value, a made-up value or nothing, or only logs, and the function's name or return type promises a real result: a value that was fetched, parsed or computed, or an operation such as a save or a send that the caller will assume happened.",
  no: "The function has no catch block; or the failure is propagated (rethrown, wrapped, or logged and then rethrown); converted into a value the caller can distinguish from success, such as a Result or null when the return type admits it; or absorbed where absorbing is the point: a cleanup or best-effort step after the real result is in hand, a fallback to the next attempt or source, a catch that swallows only the case in which the goal already holds, or a top-level entry point that reports and exits with a non-zero status. A function named safe*, try* or *OrNull has promised to absorb failure.",
});

const errorMessageMatchesCondition = jevRule({
  id: "error-message-matches-condition",
  cutoff: 0.65,
  ask: "The message given to an error thrown in this function misdescribes the condition that leads to the throw.",
  yes: "The message names a different cause, value, operation or expectation than the condition guarding the throw actually checks: it says a thing is missing when the check is about its permission, form or range; it names one field or operand when the condition tests another; it names one failure (a timeout, an expiry) when the status or state tested is a different one; it states a bound or direction the condition does not test; or it is a copy of another throw's message in the same function and describes that throw's condition rather than this one.",
  no: "The function throws nothing with a message; or every message describes the condition that leads to its throw, whether it states the failed requirement, its consequence, or the intent the check serves. A message that is short, generic or lacks detail is not wrong, only unhelpful. A message that quotes the offending input, names what cannot proceed, or wraps a caught error with the name of the operation that failed, is a match.",
});

const logLevelMatchesEvent = jevRule({
  id: "log-level-matches-event",
  target: "call",
  cutoff: 0.6,
  select: isLogCall,
  context: ENCLOSING_FUNCTION,
  ask: "The level of this log call misstates the severity of what the surrounding code is handling at that point.",
  yes: "The call is at info, debug or trace but sits on a path where the operation has failed and the function gives up, rethrows, exits, discards data or returns a failure the caller must act on; the call is at debug or trace for an outcome the function reports to its caller, such as a refusal; the call is at error or fatal but sits on the ordinary success path or on a routine, expected branch such as a cache miss or a validation failure; or the call is at warn but the code immediately exits or throws with no recovery.",
  no: "The level fits what the code around the call shows: error or warn where something went wrong that an operator should see, even if the function recovers from it; info for routine outcomes; debug or trace for per-item progress and chatter; warn for a degraded or transient condition the code goes on to handle. Whether the message text is well written is not the question.",
});

const logMessageMatchesEvent = jevRule({
  id: "log-message-matches-event",
  target: "call",
  cutoff: 0.62,
  select: isLogCall,
  context: ENCLOSING_FUNCTION,
  ask: "The message of this log call misdescribes the event at the point in the code where the call sits.",
  yes: "What the message says happened is not what the code path shows at that point: it reports an outcome as done before the operation that produces it runs, or on the branch where that operation failed or was skipped; it names an action (a retry, a deletion, a cache hit, a send) that the path does not perform; it reports a count of what was selected or attempted as the count of what was deleted, sent or written; it interpolates a value that is not what the message calls it; or it names a kind of thing other than the one the surrounding code acts on.",
  no: "The message is true of the point where it sits: an intent phrased before the operation, a completion phrased after it, a failure on the branch that fails, a templated message whose values are what it calls them, or a terse message on the path it describes. A message that is vague or could say more is not wrong. Whether the level fits is not the question.",
});

const commentDescribesBlock = jevRule({
  id: "comment-describes-block",
  cutoff: 0.75,
  ask: "A comment inside this function makes a claim about the code beneath it that the code contradicts.",
  yes: "The comment says what the code beneath it does, and the code does something else: a count, limit, number of attempts or delay that differs from the code's; a direction, order, sign, rounding or unit that is not the one the code uses; a condition the code tests the other way round; or a step the comment says happens here that the code beneath it does not perform.",
  no: "The function has no comment inside its body; or every specific claim in each comment holds for the code beneath it, meaning the run of statements down to the next comment or the end of the block. A comment that gives a reason outside the code, says what the whole function is for, is vague, or summarises the code loosely but not wrongly, makes no claim the code can contradict. A comment at the end of a line belongs to that line.",
});

const commentDescribesDeclaration = jevRule({
  id: "comment-describes-declaration",
  cutoff: 0.63,
  context: COMMENT,
  ask: "The comment directly above this function claims something that is not true of the code.",
  yes: "A specific claim the comment makes is contradicted by the code: it names a different operation, direction, rounding, ordering or unit than the code uses, it states a return value or guarantee the code does not provide, it describes a side effect the code does not perform or omits one it does, it gives a count, limit or default that differs from the code's, or it refers to a parameter, field or function that the code no longer has.",
  no: "Every specific claim the comment makes holds for the code below it. A comment that is vague, redundant or says less than it could is not a false comment. A section heading or divider names the part of the file that starts there and makes no claim about the function.",
  note: "Only a comment that ends on the line just before the function, or just before the export or declaration that holds it, is directly above it; a comment followed by other code belongs to that code. Judge only claims the code can confirm or contradict. A comment about a caller's obligations, about performance, or about history is not checkable here.",
});

const docErrorsMatchBody = jevRule({
  id: "doc-errors-match-body",
  cutoff: 0.56,
  context: COMMENT,
  ask: "The failure contract stated in the documentation right above this function (what it says the function throws, rejects with, or returns in place of a result when something goes wrong, and under what condition) is contradicted by the body.",
  yes: "The documentation names a failure the body cannot produce: it says the function throws a named error and the body returns null, a default or a success value on that condition instead. Or it names the wrong failure: a different error type or a different condition than the one the body checks before failing. Or the body explicitly fails on its own (a throw, an assert, or a null or default returned in place of a result) under a condition the documentation says nothing about. Or the documentation says the function never throws and the body has a throw.",
  no: "The documentation states no failure contract; or every failure the documentation names is one the body produces under the condition named, and every explicit failure the body writes is covered somewhere in the documentation. A failure described at the level of intent is honoured by whatever mechanism the body uses. A fallback the documentation describes, such as a default when a file is absent, is a documented outcome.",
  note: "The snippet starts with the documentation directly above the function, and that documentation is what is judged. An error that merely passes through unchanged from a callee is the callee's failure, not a clause this body owes, unless the documentation says the function cannot fail.",
});

const varNameDescribesValue = jevRule({
  id: "var-name-describes-value",
  cutoff: 0.5,
  ask: "A binding declared in this function has a name that misdescribes the value it is bound to.",
  yes: "The name states a type, unit, shape, quantity or meaning that the initializer does not produce: a plural name bound to a single item or a singular name bound to a collection, a name that reads as a boolean bound to something that is not one, a name naming one unit while the value is in another, a name saying it holds a value while it holds a function or a promise, or a name describing a different thing entirely from what the initializer computes.",
  no: "Every name is an accurate description of what its initializer produces, even if it is terse or a clearer name could be imagined. Being short or generic is not a mismatch. A plural name on a number names the count of those things; an accumulator, index or buffer name is a convention, not a claim.",
});

const describeNamesSubject = jevRule({
  id: "describe-names-subject",
  cutoff: 0.45,
  target: "call",
  select: isDescribeCall,
  ask: "The tests inside this describe block exercise something other than what its title names.",
  yes: "The title names a specific function, method, class or module and no test in the block calls, constructs or otherwise reaches it: every test calls a differently named sibling instead; or the title names a behaviour and no test makes that behaviour happen or observes it.",
  no: "What the title names is what the tests exercise, directly or through something that reaches it: a feature tested through a public function of another name, a class tested through its factory or an instance created in beforeEach, a title that is a file name, a scenario or a sentence when the tests are about it, or an abbreviation or synonym of what the tests call.",
});

const testNameDescribesCode = jevRule({
  id: "test-name-describes-code",
  cutoff: 0.72,
  target: "call",
  select: isTestCall,
  ask: "The operation, input or outcome this test exercises is not the one the test's name names.",
  yes: "The operation the code calls is not the one the name says; the input or case the code sets up is not the one the name states (three units where the name says above ten); the outcome the code expects is the opposite of the one the name implies; the name promises a throw or a rejection where the code expects an ordinary value; or the name refers to something that the code never calls and never checks.",
  no: "The code calls the operation the name says, on the input the name says, and expects the kind of outcome the name says, however weak the assertion is. A one-word title, a synonym for the operation's name, and setup that calls other operations before the named one are all fine.",
});

const testNameVerifiesClaim = jevRule({
  id: "test-name-verifies-claim",
  cutoff: 0.66,
  target: "call",
  select: isTestCall,
  ask: "This test would still pass if the behaviour its name claims were broken.",
  yes: "The body does not establish what the name claims: it asserts nothing at all, it asserts something that would hold whether or not the named behaviour worked, it checks an incidental property such as a length or a type instead of the named behaviour itself, or it never sets up the case the name is about.",
  no: "The body contains at least one assertion that would fail if the named behaviour were broken. A name that claims only that something renders or matches a snapshot is established by the snapshot; a name that claims an interaction with a collaborator is established by an assertion on that call; a name that claims only that something does not throw is established by calling it.",
});

const snapshotOnlyBehaviourClaim = jevRule({
  id: "snapshot-only-behaviour-claim",
  cutoff: 0.67,
  target: "call",
  select: isTestCall,
  ask: "This test's name claims a specific behaviour, but the body only compares a snapshot.",
  yes: "The title asserts a property of the output (an ordering, an element hidden or shown, a state rendered under a condition, a format applied) and the only assertions are toMatchSnapshot, toMatchInlineSnapshot or toMatchFileSnapshot over a whole rendering, so nothing isolates the named property.",
  no: "The body uses no snapshot; or the title claims only that the output matches a snapshot or renders, or only names the input; or at least one assertion targets the named behaviour directly; or the inline snapshot is a short literal that is itself the named outcome.",
});

const testMocksSubject = jevRule({
  id: "test-mocks-subject",
  cutoff: 0.3,
  target: "call",
  select: isTestCall,
  ask: "The behaviour this test's name attributes to the code under test is performed by a mock or stub whose canned value the assertion reads back unchanged.",
  yes: "The title says the code under test computes, derives or returns something, but the function or module that would do it is replaced (vi.mock or jest.mock with a fake, mockReturnValue or mockResolvedValue, a stubbed global) and the value the assertion checks can be traced to that stub's configuration with none of the subject's own logic in between. The assertion then checks the test's own setup.",
  no: "The body mocks nothing; or the stub stands in for a collaborator the code under test calls (the network, the clock, a repository, a mailer) and the assertion checks what the real code did with the stub's output; or the title is itself about the collaborator; or the spy has no replacement value and the real method runs.",
});

const jevCode = [
  fnNamePromises,
  pureNameIsPure,
  safeNameIsSafe,
  idempotentName,
  catchHidesFailure,
  errorMessageMatchesCondition,
  logLevelMatchesEvent,
  logMessageMatchesEvent,
  commentDescribesBlock,
  commentDescribesDeclaration,
  docErrorsMatchBody,
  varNameDescribesValue,
] as const satisfies readonly DecisionRule[];

const jevTests = [
  describeNamesSubject,
  testNameDescribesCode,
  testNameVerifiesClaim,
  snapshotOnlyBehaviourClaim,
  testMocksSubject,
] as const satisfies readonly DecisionRule[];

export {
  catchHidesFailure,
  commentDescribesBlock,
  commentDescribesDeclaration,
  describeNamesSubject,
  docErrorsMatchBody,
  errorMessageMatchesCondition,
  fnNamePromises,
  idempotentName,
  jevCode,
  jevTests,
  logLevelMatchesEvent,
  logMessageMatchesEvent,
  pureNameIsPure,
  safeNameIsSafe,
  snapshotOnlyBehaviourClaim,
  testMocksSubject,
  testNameDescribesCode,
  testNameVerifiesClaim,
  varNameDescribesValue,
};
