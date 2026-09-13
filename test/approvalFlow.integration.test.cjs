const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

function loadMainWithElectronStub() {
  const handlers = new Map();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "aiyla-approval-test-"));
  class FakeWindow {
    constructor() { this.webContents = { send() {} }; }
    loadFile() {}
    on() {}
    once() {}
    show() {}
    hide() {}
    focus() {}
    isDestroyed() { return false; }
    setAlwaysOnTop() {}
  }
  const electron = {
    app: {
      getPath: () => userData,
      whenReady: () => ({ then: (callback) => { callback(); return Promise.resolve(); } }),
      on() {},
      quit() {}
    },
    BrowserWindow: FakeWindow,
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
  };
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => request === "electron" ? electron : originalLoad(request, parent, isMain);
  const mainPath = require.resolve("../src/main.cjs");
  delete require.cache[mainPath];
  require(mainPath);
  Module._load = originalLoad;
  return { handlers, userData };
}

test("a local proposal produces a pending Home acknowledgement and a defer updates conversation plus History", async () => {
  const { handlers, userData } = loadMainWithElectronStub();
  try {
    const proposal = await handlers.get("proposal:create")(null, {
      title: "Send the prepared school email",
      description: "The message is ready as a draft and requires acknowledgement.",
      target: "Send one email to the school office.",
      consequence: "One email only; no other recipients or changes."
    });
    let state = await handlers.get("state:get")();
    assert.equal(state.approvals[0].id, proposal.id);
    assert.equal(state.approvals[0].status, "pending");
    assert.equal(state.workState.status, "waiting");
    assert.match(state.conversations.at(-1).content, /Nothing will happen outside Aiyla/i);
    assert.match(state.history[0].summary, /prepared/i);

    const result = await handlers.get("approval:respond")(null, proposal.id, "deferred", {});
    state = await handlers.get("state:get")();
    assert.match(result.message, /leave this proposal waiting/i);
    assert.equal(state.approvals[0].status, "deferred");
    assert.match(state.conversations.at(-2).content, /deferred the proposed action/i);
    assert.match(state.conversations.at(-1).content, /leave this proposal waiting/i);
    assert.match(state.history[0].summary, /deferred the proposed action/i);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

async function createSchoolEmailProposal(handlers) {
  return handlers.get("proposal:create")(null, {
    title: "Send the prepared school email",
    description: "The message is ready as a draft and requires acknowledgement.",
    target: "Send one email to the school office.",
    consequence: "One email only; no other recipients or changes."
  });
}

test("approving a Home proposal records the acknowledgement in conversation and History", async () => {
  const { handlers, userData } = loadMainWithElectronStub();
  try {
    const proposal = await createSchoolEmailProposal(handlers);
    const result = await handlers.get("approval:respond")(null, proposal.id, "approved", {});
    const state = await handlers.get("state:get")();
    assert.match(result.message, /continue only within the approved scope/i);
    assert.equal(state.approvals[0].status, "approved");
    assert.equal(state.workState.status, "working");
    assert.match(state.conversations.at(-2).content, /acknowledged the proposed action/i);
    assert.match(state.conversations.at(-1).content, /approved scope/i);
    assert.match(state.history[0].summary, /acknowledged the proposed action/i);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("editing a Home proposal preserves its pending status and updates conversation plus History", async () => {
  const { handlers, userData } = loadMainWithElectronStub();
  try {
    const proposal = await createSchoolEmailProposal(handlers);
    const result = await handlers.get("approval:respond")(null, proposal.id, "edited", {
      target: "Send one revised email to the school office.",
      description: "Use the revised draft only.",
      consequence: "One email only after a later acknowledgement."
    });
    const state = await handlers.get("state:get")();
    assert.match(result.message, /waiting for your acknowledgement/i);
    assert.equal(state.approvals[0].status, "pending");
    assert.equal(state.approvals[0].target, "Send one revised email to the school office.");
    assert.equal(state.workState.status, "waiting");
    assert.match(state.conversations.at(-2).content, /edited the proposed action/i);
    assert.match(state.conversations.at(-1).content, /updated the proposal/i);
    assert.match(state.history[0].summary, /edited the proposed action/i);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("cancelling a Home proposal records the cancellation in conversation and History", async () => {
  const { handlers, userData } = loadMainWithElectronStub();
  try {
    const proposal = await createSchoolEmailProposal(handlers);
    const result = await handlers.get("approval:respond")(null, proposal.id, "cancelled", {});
    const state = await handlers.get("state:get")();
    assert.match(result.message, /cancelled this proposed action/i);
    assert.equal(state.approvals[0].status, "cancelled");
    assert.equal(state.workState.status, "complete");
    assert.match(state.conversations.at(-2).content, /cancelled the proposed action/i);
    assert.match(state.conversations.at(-1).content, /cancelled this proposed action/i);
    assert.match(state.history[0].summary, /cancelled the proposed action/i);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
