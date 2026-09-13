const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand } = require("../src/shared/commandParser.cjs");
const { extractOpenAiText, buildSafeCoreContext } = require("../src/shared/openaiResponse.cjs");
const { buildProposalConversation, buildApprovalResponse } = require("../src/shared/approvalFlow.cjs");

test("creates an inbox task from a plain capture command", () => {
  assert.deepEqual(parseCommand("Add book school appointment"), {
    type: "create_task",
    title: "Book school appointment",
    bucket: "inbox"
  });
});

test("creates a task in Today when explicitly requested", () => {
  assert.deepEqual(parseCommand("Add submit report to today"), {
    type: "create_task",
    title: "Submit report",
    bucket: "today"
  });
});

test("recognises a completion request", () => {
  assert.deepEqual(parseCommand("Complete submit report"), {
    type: "complete_task",
    query: "submit report"
  });
});

test("recognises a project creation request", () => {
  assert.deepEqual(parseCommand("Create project kitchen refresh"), {
    type: "create_project",
    title: "Kitchen refresh"
  });
});

test("recognises a defer request as a limited offline fallback", () => {
  assert.deepEqual(parseCommand("Defer submit report to next week"), {
    type: "defer_task",
    query: "submit report",
    when: "next week"
  });
});

test("recognises a prioritisation request as a limited offline fallback", () => {
  assert.deepEqual(parseCommand("Prioritise book school appointment"), {
    type: "prioritise_task",
    query: "book school appointment"
  });
});

test("flags an unrecognised natural-language request for review rather than pretending to reason", () => {
  assert.deepEqual(parseCommand("Please prepare a short family briefing for tomorrow"), {
    type: "review_required",
    message: "Aiyla has kept your words in command history. Please turn this into a task or use a clearer command."
  });
});

test("extracts text from all OpenAI Responses API output messages rather than assuming the first item", () => {
  assert.equal(extractOpenAiText({
    output: [
      { type: "reasoning", content: [] },
      { type: "message", content: [{ type: "output_text", text: "First sentence." }, { type: "output_text", text: "Second sentence." }] }
    ]
  }), "First sentence.\nSecond sentence.");
});

test("builds a minimal Aiyla Brain context without document, email, person, or secret fields", () => {
  const context = buildSafeCoreContext({
    tasks: [{ title: "Book school appointment", status: "open", bucket: "today", priority: "high", dueDate: null, areaId: "personal", operationId: null, apiKey: "must-not-leak" }],
    projects: [{ title: "Kitchen refresh", status: "active", nextStep: "Measure cupboards", areaId: "personal", operationId: null }],
    waiting: [],
    decisions: [],
    documents: [{ title: "Private document", filePath: "C:\\Sensitive" }],
    emails: [{ title: "Sensitive email body" }],
    people: [{ name: "Sensitive person" }]
  });
  assert.equal(JSON.stringify(context).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(context).includes("Private document"), false);
  assert.equal(JSON.stringify(context).includes("Sensitive email body"), false);
  assert.equal(JSON.stringify(context).includes("Sensitive person"), false);
  assert.equal(context.open_actions[0].title, "Book school appointment");
});

test("creates an owner-facing local proposal conversation before any acknowledgement action", () => {
  assert.deepEqual(buildProposalConversation({ title: "Send the prepared school email" }), {
    owner: "You asked Aiyla to prepare: Send the prepared school email.",
    aiyla: "I have prepared the proposed next step below. Nothing will happen outside Aiyla until you acknowledge it."
  });
});

test("keeps a deferred acknowledgement waiting without claiming an external action occurred", () => {
  assert.deepEqual(buildApprovalResponse("Send the prepared school email", "deferred"), {
    owner: "You deferred the proposed action: Send the prepared school email.",
    aiyla: "Understood. Aiyla will leave this proposal waiting until you return to it.",
    workState: "complete",
    workSummary: "Aiyla has completed the acknowledgement update."
  });
});
