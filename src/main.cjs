const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseCommand } = require("./shared/commandParser.cjs");
const { extractOpenAiText, buildAiylaInstructions, buildSafeCoreContext } = require("./shared/openaiResponse.cjs");
const { buildProposalConversation, buildApprovalResponse } = require("./shared/approvalFlow.cjs");

let mainWindow = null;
let orbitWindow = null;
let isQuitting = false;
let state = null;
const activeRequests = new Map();

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const allowedCollections = new Set([
  "tasks", "projects", "captures", "waiting", "decisions", "people",
  "documents", "agentRuns", "approvals", "calendar", "emails"
]);

function dataFile() {
  return path.join(app.getPath("userData"), "sagalution-command-centre.json");
}

function openAiKey() {
  return String(process.env.AIYLA_OPENAI_API_KEY || "").trim();
}

function openAiModel() {
  return String(process.env.AIYLA_OPENAI_MODEL || "gpt-5-mini").trim();
}

function openAiStatus() {
  return { configured: Boolean(openAiKey()), model: openAiModel() };
}

function refreshOpenAiConnectionStatus() {
  const connection = state?.connections?.find((item) => item.id === "openai");
  if (connection) connection.status = openAiKey() ? "Local key available" : "Setup required";
}

function defaultState() {
  return {
    version: 2,
    areas: [
      { id: "personal", name: "Personal & Family", description: "Home, family, children, personal administration and everyday commitments." },
      { id: "australia", name: "Australia Operations", description: "Australian businesses, operations and service work." },
      { id: "uae", name: "UAE Operations", description: "UAE businesses, operations and projects." },
      { id: "international", name: "International Expansion", description: "Cross-border initiatives and country expansion work." }
    ],
    operations: [
      { id: "moonlight", areaId: "australia", name: "Moonlight Care" },
      { id: "kinlea", areaId: "australia", name: "Kinlea Community Care" },
      { id: "supported-home", areaId: "australia", name: "Supported at Home Application" },
      { id: "sanadi", areaId: "uae", name: "Sanadi" },
      { id: "sna", areaId: "uae", name: "SNA" },
      { id: "peptavite", areaId: "uae", name: "Peptavite" },
      { id: "aetyrna", areaId: "uae", name: "Aetyrna" }
    ],
    countries: [
      { id: "saudi", name: "Saudi Arabia" },
      { id: "kenya", name: "Kenya" }
    ],
    tasks: [],
    projects: [],
    captures: [],
    waiting: [],
    decisions: [],
    people: [],
    documents: [],
    calendar: [],
    emails: [],
    agentRuns: [],
    approvals: [],
    conversations: [],
    workState: { status: "ready", summary: "Aiyla is ready.", runId: null, updatedAt: now() },
    connections: [
      { id: "openai", name: "OpenAI Aiyla Brain", category: "AI", status: "Setup required", scope: "Official API key stored outside the dashboard renderer." },
      { id: "work-outlook", name: "Moonlight Care Work Outlook", category: "Email", status: "Not connected", scope: "Observe and report only when configured." },
      { id: "personal-outlook", name: "Personal Outlook Calendar", category: "Calendar", status: "Not connected", scope: "Personal and family calendar management when configured." },
      { id: "work-calendar", name: "Work Calendar and Teams", category: "Calendar", status: "Not connected", scope: "Visibility and controlled actions when configured." },
      { id: "personal-gmail", name: "Personal Gmail Accounts", category: "Email", status: "Not connected", scope: "Per-account configurable access after owner approval." },
      { id: "computer", name: "Local Computer Agent", category: "Computer", status: "No folders approved", scope: "Only owner-approved folders and applications." },
      { id: "browser", name: "Browser Agent", category: "Browser", status: "No sites approved", scope: "Only approved sites and isolated sessions." },
      { id: "phone", name: "Aiyla Phone Companion", category: "Phone", status: "Later", scope: "Protected mobile review, capture, alerts and owner briefings." }
    ],
    history: [
      { id: id(), at: now(), kind: "system", summary: "Sagalution Life & Work Command Centre is ready. Aiyla Core is stored locally on this computer." }
    ],
    settings: {
      reducedClutter: false,
      textScale: "large",
      orbitVisible: true,
      voiceEnabled: true,
      voiceMuted: false,
      voiceRate: 0.92,
      voiceVolume: 0.9,
      voiceName: "",
      automationPaused: false,
      highContrast: false
    }
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), "utf8"));
    const defaults = defaultState();
    const merged = { ...defaults, ...parsed, settings: { ...defaults.settings, ...(parsed.settings || {}) } };
    ["areas", "operations", "countries", "tasks", "projects", "captures", "waiting", "decisions", "people", "documents", "calendar", "emails", "agentRuns", "approvals", "conversations", "connections", "history"].forEach((key) => {
      merged[key] = Array.isArray(parsed[key]) ? parsed[key] : defaults[key];
    });
    merged.workState = { ...defaults.workState, ...(parsed.workState || {}) };
    return merged;
  } catch {
    return defaultState();
  }
}

function persist() {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(state, null, 2), "utf8");
}

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("state:changed", snapshot());
}

function setWorkState(status, summary, runId = null) {
  state.workState = { status, summary, runId, updatedAt: now() };
  persist();
  broadcastState();
}

function addConversation(role, content, meta = {}) {
  const entry = { id: id(), at: now(), role, content: String(content || "").trim(), ...meta };
  state.conversations.push(entry);
  state.conversations = state.conversations.slice(-120);
  return entry;
}

function appendHistory(kind, summary, details = {}) {
  state.history.unshift({ id: id(), at: now(), kind, summary, details });
  state.history = state.history.slice(0, 800);
}

function commit(kind, summary, details = {}) {
  appendHistory(kind, summary, details);
  persist();
  broadcastState();
}

function labelFor(collection) {
  return {
    tasks: "action", projects: "project", captures: "capture", waiting: "follow-up",
    decisions: "decision", people: "person", documents: "document", agentRuns: "work item",
    approvals: "approval", calendar: "calendar item", emails: "email item"
  }[collection] || "item";
}

function normaliseRecord(collection, input = {}) {
  const title = String(input.title || input.name || input.text || `Untitled ${labelFor(collection)}`).trim();
  const base = { id: id(), createdAt: now(), updatedAt: now(), ...input };
  if (collection === "tasks") return { ...base, title, status: input.status || "open", bucket: input.bucket || "inbox", priority: input.priority || "normal", dueDate: input.dueDate || null, projectId: input.projectId || null, areaId: input.areaId || null, operationId: input.operationId || null, countryId: input.countryId || null, completedAt: null };
  if (collection === "projects") return { ...base, title, status: input.status || "active", nextStep: input.nextStep || "", areaId: input.areaId || null, operationId: input.operationId || null, countryId: input.countryId || null, reviewDate: input.reviewDate || null };
  if (collection === "captures") return { ...base, text: String(input.text || title).trim(), processed: false, areaId: input.areaId || null };
  if (collection === "waiting") return { ...base, title, status: input.status || "waiting", personId: input.personId || null, followUpDate: input.followUpDate || null, areaId: input.areaId || null, operationId: input.operationId || null };
  if (collection === "decisions") return { ...base, title, status: input.status || "open", decisionDate: input.decisionDate || null, areaId: input.areaId || null, operationId: input.operationId || null };
  if (collection === "people") return { ...base, name: String(input.name || title).trim(), context: input.context || "" };
  if (collection === "documents") return { ...base, title, filePath: input.filePath || "", status: input.status || "reference", areaId: input.areaId || null, operationId: input.operationId || null };
  if (collection === "agentRuns") return { ...base, title, agent: input.agent || "Aiyla", status: input.status || "planned", scope: input.scope || "", summary: input.summary || "", approvalRequired: Boolean(input.approvalRequired) };
  if (collection === "approvals") return { ...base, title, status: input.status || "pending", category: input.category || "review", target: input.target || "", description: input.description || "", consequence: input.consequence || "" };
  if (collection === "calendar") return { ...base, title, start: input.start || null, end: input.end || null, source: input.source || "Aiyla local", areaId: input.areaId || null, operationId: input.operationId || null };
  if (collection === "emails") return { ...base, title, account: input.account || "", status: input.status || "reference", receivedAt: input.receivedAt || now() };
  return { ...base, title };
}

function createRecord(collection, input) {
  if (!allowedCollections.has(collection)) throw new Error("Unsupported record type.");
  const record = normaliseRecord(collection, input);
  state[collection].unshift(record);
  commit(`${collection}_created`, `Added ${labelFor(collection)} “${record.title || record.name || record.text}”.`, { collection, recordId: record.id });
  return record;
}

function updateRecord(collection, recordId, patch) {
  if (!allowedCollections.has(collection)) throw new Error("Unsupported record type.");
  const record = state[collection].find((item) => item.id === recordId);
  if (!record) throw new Error("Record not found.");
  Object.assign(record, patch, { updatedAt: now() });
  if (collection === "tasks" && patch.status === "complete" && !record.completedAt) record.completedAt = now();
  if (collection === "tasks" && patch.status && patch.status !== "complete") record.completedAt = null;
  commit(`${collection}_updated`, `Updated ${labelFor(collection)} “${record.title || record.name || record.text}”.`, { collection, recordId });
  return record;
}

function deleteRecord(collection, recordId) {
  if (!allowedCollections.has(collection)) throw new Error("Unsupported record type.");
  const record = state[collection].find((item) => item.id === recordId);
  state[collection] = state[collection].filter((item) => item.id !== recordId);
  commit(`${collection}_deleted`, `Removed ${labelFor(collection)} “${record?.title || record?.name || record?.text || "item"}”.`, { collection, recordId });
  return true;
}

function findOpenTask(query) {
  const search = String(query || "").toLowerCase();
  return state.tasks.find((task) => task.status !== "complete" && task.title.toLowerCase().includes(search));
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nextWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function executeOfflineCommand(raw) {
  const command = parseCommand(raw);
  if (command.type === "create_task") {
    const task = createRecord("tasks", { title: command.title, bucket: command.bucket });
    return { ok: true, message: `Added “${task.title}” to ${task.bucket}.`, mode: "local" };
  }
  if (command.type === "create_project") {
    const project = createRecord("projects", { title: command.title });
    return { ok: true, message: `Created the project “${project.title}”.`, mode: "local" };
  }
  if (command.type === "complete_task") {
    const task = findOpenTask(command.query);
    if (!task) return { ok: false, message: `I could not find an open action matching “${command.query}”.`, mode: "local" };
    updateRecord("tasks", task.id, { status: "complete" });
    return { ok: true, message: `Marked “${task.title}” as complete.`, mode: "local" };
  }
  if (command.type === "defer_task") {
    const task = findOpenTask(command.query);
    if (!task) return { ok: false, message: `I could not find an open action matching “${command.query}”.`, mode: "local" };
    updateRecord("tasks", task.id, { bucket: "later", dueDate: command.when === "tomorrow" ? tomorrow() : command.when === "next week" ? nextWeek() : null });
    return { ok: true, message: `Deferred “${task.title}”.`, mode: "local" };
  }
  if (command.type === "prioritise_task") {
    const task = findOpenTask(command.query);
    if (!task) return { ok: false, message: `I could not find an open action matching “${command.query}”.`, mode: "local" };
    updateRecord("tasks", task.id, { priority: "high" });
    return { ok: true, message: `Marked “${task.title}” as high priority.`, mode: "local" };
  }
  const capture = createRecord("captures", { text: raw });
  createRecord("agentRuns", { title: "Aiyla Brain request", agent: "Aiyla Brain", status: "waiting for integration", summary: `A natural-language request is ready for the OpenAI Aiyla Brain connection. Capture reference: ${capture.id}` });
  return { ok: false, message: "I have saved that request locally. Connect the Aiyla Brain in Connections to enable full natural-language reasoning.", mode: "integration-required" };
}

async function askAiyla(raw) {
  const request = String(raw || "").trim();
  if (!request) return { ok: false, message: "Type a request for Aiyla first.", mode: "local" };
  addConversation("owner", request, { state: "complete" });
  commit("conversation_request", "You asked Aiyla for help.");
  setWorkState("thinking", "Aiyla is thinking about your request.");
  if (!openAiKey()) {
    const result = executeOfflineCommand(request);
    addConversation("aiyla", result.message, { state: result.mode });
    setWorkState(result.mode === "integration-required" ? "waiting" : "complete", result.mode === "integration-required" ? "Aiyla is waiting for the Aiyla Brain connection." : "Aiyla has completed this local action.");
    commit("conversation_response", "Aiyla responded using the local Core.");
    return result;
  }

  const run = createRecord("agentRuns", {
    title: "Aiyla Brain conversation",
    agent: "Aiyla Brain",
    status: "working",
    summary: "Preparing a text-only response from the configured OpenAI Aiyla Brain.",
    approvalRequired: false
  });
  const controller = new AbortController();
  activeRequests.set(run.id, controller);
  setWorkState("working", "Aiyla is preparing a response.", run.id);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey()}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: openAiModel(),
        instructions: buildAiylaInstructions(),
        input: `Owner request:\n${request}\n\nMinimal local Core reference:\n${JSON.stringify(buildSafeCoreContext(state))}`,
        store: false
      })
    });
    if (!response.ok) {
      await response.text();
      throw new Error(`OpenAI request failed (${response.status}).`);
    }
    const payload = await response.json();
    const message = extractOpenAiText(payload);
    if (!message) throw new Error("OpenAI returned no usable text response.");
    updateRecord("agentRuns", run.id, { status: "complete", summary: "Aiyla prepared and returned a text-only response." });
    addConversation("aiyla", message, { state: "complete", runId: run.id });
    setWorkState("complete", "Aiyla has completed this response.", run.id);
    commit("ai_response", "Aiyla responded through the configured OpenAI Aiyla Brain.", { runId: run.id, model: openAiModel() });
    return { ok: true, message, mode: "ai" };
  } catch (error) {
    if (error?.name === "AbortError") {
      updateRecord("agentRuns", run.id, { status: "stopped", summary: "You stopped this Aiyla Brain response." });
      const message = "I stopped this work. Nothing was sent or changed outside Aiyla.";
      addConversation("aiyla", message, { state: "stopped", runId: run.id });
      setWorkState("stopped", "Aiyla stopped this work.", run.id);
      commit("ai_stopped", "You stopped Aiyla’s current work.", { runId: run.id });
      return { ok: false, message, mode: "stopped" };
    }
    updateRecord("agentRuns", run.id, { status: "failed", summary: "The Aiyla Brain could not complete this request. Check the local OpenAI setup and try again." });
    const message = "I could not reach the configured Aiyla Brain. Please check the local OpenAI setup, billing and model name, then try again.";
    addConversation("aiyla", message, { state: "failed", runId: run.id });
    setWorkState("stopped", "Aiyla could not complete this work.", run.id);
    commit("ai_response_failed", "Aiyla could not reach the configured Aiyla Brain.", { runId: run.id });
    return { ok: false, message, mode: "ai-error" };
  } finally {
    activeRequests.delete(run.id);
  }
}

function stopCurrentWork() {
  const runId = state.workState?.runId;
  const controller = runId ? activeRequests.get(runId) : null;
  if (controller) controller.abort();
  if (!controller && runId) {
    const run = state.agentRuns.find((item) => item.id === runId && ["planned", "working", "waiting for integration"].includes(item.status));
    if (run) updateRecord("agentRuns", run.id, { status: "stopped", summary: "You stopped this work." });
  }
  if (!controller) {
    const message = "Aiyla stopped the current local work state.";
    addConversation("system", message, { state: "stopped" });
    setWorkState("stopped", "Aiyla stopped this work.", runId || null);
    commit("work_stopped", message, { runId: runId || null });
  }
  return { ok: true, message: "Aiyla is stopping the current work." };
}

function setReady() {
  setWorkState("ready", "Aiyla is ready.");
  return { ok: true, message: "Aiyla is ready." };
}

function createProposal(input = {}) {
  const proposal = createRecord("approvals", { ...input, status: "pending", category: input.category || "owner acknowledgement" });
  const conversation = buildProposalConversation(proposal);
  addConversation("owner", conversation.owner, { state: "thinking", approvalId: proposal.id });
  addConversation("aiyla", conversation.aiyla, { state: "waiting", approvalId: proposal.id });
  setWorkState("waiting", "Aiyla needs your approval.", proposal.runId || null);
  commit("approval_proposed", `Aiyla prepared “${proposal.title}” for your acknowledgement.`, { approvalId: proposal.id });
  return proposal;
}

function respondToApproval(approvalId, action, patch = {}) {
  const approval = state.approvals.find((item) => item.id === approvalId);
  if (!approval) throw new Error("Approval not found.");
  const validActions = new Set(["approved", "deferred", "cancelled", "edited"]);
  if (!validActions.has(action)) throw new Error("Unsupported approval action.");
  if (action === "edited") {
    updateRecord("approvals", approvalId, { ...patch, status: "pending" });
    addConversation("owner", `You edited the proposed action: ${approval.title}.`, { state: "waiting", approvalId });
    addConversation("aiyla", "I have updated the proposal and will wait for your acknowledgement before taking any consequential step.", { state: "waiting", approvalId });
    setWorkState("waiting", "Aiyla needs your approval.", approval.runId || null);
    commit("approval_edited", `You edited the proposed action “${approval.title}”.`, { approvalId });
    return { ok: true, message: "Aiyla updated the proposal and is waiting for your acknowledgement." };
  }
  updateRecord("approvals", approvalId, { status: action });
  const response = buildApprovalResponse(approval.title, action);
  addConversation("owner", response.owner, { state: action, approvalId });
  addConversation("aiyla", response.aiyla, { state: action, approvalId });
  setWorkState(response.workState, response.workSummary, approval.runId || null);
  commit(`approval_${action}`, response.owner, { approvalId });
  return { ok: true, message: response.aiyla };
}

function openDashboard() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  if (orbitWindow) orbitWindow.hide();
}

function showOrbit() {
  if (orbitWindow && state?.settings?.orbitVisible) orbitWindow.showInactive();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    title: "Sagalution Life & Work Command Centre",
    backgroundColor: "#f7f7f1",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showOrbit();
    }
  });
}

function createOrbitWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  orbitWindow = new BrowserWindow({
    width: 174,
    height: 158,
    x: workArea.x + workArea.width - 198,
    y: workArea.y + workArea.height - 184,
    frame: false,
    show: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  orbitWindow.setAlwaysOnTop(true, "floating");
  orbitWindow.loadFile(path.join(__dirname, "renderer", "orbit.html"));
  orbitWindow.once("ready-to-show", () => showOrbit());
  orbitWindow.on("close", (event) => {
    if (!isQuitting) { event.preventDefault(); orbitWindow.hide(); }
  });
}

function wireIpc() {
  ipcMain.handle("state:get", () => snapshot());
  ipcMain.handle("record:create", (_event, collection, input) => createRecord(collection, input));
  ipcMain.handle("record:update", (_event, collection, recordId, patch) => updateRecord(collection, recordId, patch));
  ipcMain.handle("record:delete", (_event, collection, recordId) => deleteRecord(collection, recordId));
  ipcMain.handle("command:run", (_event, raw) => askAiyla(raw));
  ipcMain.handle("ai:status", () => openAiStatus());
  ipcMain.handle("work:stop", () => stopCurrentWork());
  ipcMain.handle("work:ready", () => setReady());
  ipcMain.handle("proposal:create", (_event, input) => createProposal(input));
  ipcMain.handle("approval:respond", (_event, approvalId, action, patch) => respondToApproval(approvalId, action, patch));
  ipcMain.handle("settings:update", (_event, patch) => {
    state.settings = { ...state.settings, ...patch };
    commit("settings_updated", "Updated Aiyla settings.");
    return state.settings;
  });
  ipcMain.handle("orbit:openDashboard", () => openDashboard());
  ipcMain.handle("orbit:show", () => showOrbit());
  ipcMain.handle("app:hideToOrbit", () => { if (mainWindow) mainWindow.hide(); showOrbit(); });
  ipcMain.handle("app:quit", () => app.quit());
}

app.whenReady().then(() => {
  state = loadState();
  refreshOpenAiConnectionStatus();
  wireIpc();
  createMainWindow();
  createOrbitWindow();
  if (!state.settings.orbitVisible && orbitWindow) orbitWindow.hide();
});

app.on("before-quit", () => { isQuitting = true; });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
