import type { DecisionRule } from "@r_masseater/oxlint-plugin-decision";

import { claimRule } from "./claim-rule.ts";
import { isDescribeCall, isTestCall } from "./claim-select.ts";

const describeNamesSubject = claimRule({
  id: "describe-names-subject",
  cutoff: 0.45,
  target: "call",
  select: isDescribeCall,
  ask: "The tests inside this describe block exercise something other than what its title names.",
  yes: "The title names a specific function, method, class or module and no test in the block calls, constructs or otherwise reaches it: every test calls a differently named sibling instead; or the title names a behaviour and no test makes that behaviour happen or observes it.",
  no: "What the title names is what the tests exercise, directly or through something that reaches it: a feature tested through a public function of another name, a class tested through its factory or an instance created in beforeEach, a title that is a file name, a scenario or a sentence when the tests are about it, or an abbreviation or synonym of what the tests call.",
});

const testNameDescribesCode = claimRule({
  id: "test-name-describes-code",
  cutoff: 0.72,
  target: "call",
  select: isTestCall,
  ask: "The operation, input or outcome this test exercises is not the one the test's name names.",
  yes: "The operation the code calls is not the one the name says; the input or case the code sets up is not the one the name states (three units where the name says above ten); the outcome the code expects is the opposite of the one the name implies; the name promises a throw or a rejection where the code expects an ordinary value; or the name refers to something that the code never calls and never checks.",
  no: "The code calls the operation the name says, on the input the name says, and expects the kind of outcome the name says, however weak the assertion is. A one-word title, a synonym for the operation's name, and setup that calls other operations before the named one are all fine.",
});

const testNameVerifiesClaim = claimRule({
  id: "test-name-verifies-claim",
  cutoff: 0.66,
  target: "call",
  select: isTestCall,
  ask: "This test would still pass if the behaviour its name claims were broken.",
  yes: "The body does not establish what the name claims: it asserts nothing at all, it asserts something that would hold whether or not the named behaviour worked, it checks an incidental property such as a length or a type instead of the named behaviour itself, or it never sets up the case the name is about.",
  no: "The body contains at least one assertion that would fail if the named behaviour were broken. A name that claims only that something renders or matches a snapshot is established by the snapshot; a name that claims an interaction with a collaborator is established by an assertion on that call; a name that claims only that something does not throw is established by calling it.",
});

const snapshotOnlyBehaviourClaim = claimRule({
  id: "snapshot-only-behaviour-claim",
  cutoff: 0.67,
  target: "call",
  select: isTestCall,
  ask: "This test's name claims a specific behaviour, but the body only compares a snapshot.",
  yes: "The title asserts a property of the output (an ordering, an element hidden or shown, a state rendered under a condition, a format applied) and the only assertions are toMatchSnapshot, toMatchInlineSnapshot or toMatchFileSnapshot over a whole rendering, so nothing isolates the named property.",
  no: "The body uses no snapshot; or the title claims only that the output matches a snapshot or renders, or only names the input; or at least one assertion targets the named behaviour directly; or the inline snapshot is a short literal that is itself the named outcome.",
});

const testMocksSubject = claimRule({
  id: "test-mocks-subject",
  cutoff: 0.3,
  target: "call",
  select: isTestCall,
  ask: "The behaviour this test's name attributes to the code under test is performed by a mock or stub whose canned value the assertion reads back unchanged.",
  yes: "The title says the code under test computes, derives or returns something, but the function or module that would do it is replaced (vi.mock or jest.mock with a fake, mockReturnValue or mockResolvedValue, a stubbed global) and the value the assertion checks can be traced to that stub's configuration with none of the subject's own logic in between. The assertion then checks the test's own setup.",
  no: "The body mocks nothing; or the stub stands in for a collaborator the code under test calls (the network, the clock, a repository, a mailer) and the assertion checks what the real code did with the stub's output; or the title is itself about the collaborator; or the spy has no replacement value and the real method runs.",
});

const testClaims = [
  describeNamesSubject,
  testNameDescribesCode,
  testNameVerifiesClaim,
  snapshotOnlyBehaviourClaim,
  testMocksSubject,
] as const satisfies readonly DecisionRule[];

export {
  describeNamesSubject,
  snapshotOnlyBehaviourClaim,
  testClaims,
  testMocksSubject,
  testNameDescribesCode,
  testNameVerifiesClaim,
};
