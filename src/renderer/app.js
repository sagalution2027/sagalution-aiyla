const content = document.getElementById("content");
const toast = document.getElementById("toast");
const dialog = document.getElementById("appDialog");

let state = null;
let activeView = "home";
let toastTimer = null;
let availableVoices = [];
let micStream = null;
let audioContext = null;
let meterFrame = null;
let aiStatus = { configured: false, model: "" };

const viewContext = { personal: "personal", australia: "australia", uae: "uae", international: "international" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function dateLabel(value) {
  if (!value) return "No date";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: parsed.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }).format(parsed);
}
function timeLabel(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
}
function titleFor(record) { return record.title || record.name || record.text || "Untitled item"; }
function openTasks() { return state.tasks.filter((item) => item.status !== "complete"); }
function getArea(id) { return state.areas.find((item) => item.id === id); }
function getOperation(id) { return state.operations.find((item) => item.id === id); }
function getCountry(id) { return state.countries.find((item) => item.id === id); }
function tagFor(record) {
  const labels = [getArea(record.areaId)?.name, getOperation(record.operationId)?.name, getCountry(record.countryId)?.name].filter(Boolean);
  return labels.join(" · ") || "Unassigned";
}
function loadVoices() {
  if (!("speechSynthesis" in window)) return [];
  availableVoices = window.speechSynthesis.getVoices() || [];
  return availableVoices;
}
function voiceSettings() {
  return { voiceEnabled: state?.settings?.voiceEnabled !== false, voiceMuted: Boolean(state?.settings?.voiceMuted), voiceRate: Number(state?.settings?.voiceRate || 0.92), voiceVolume: Number(state?.settings?.voiceVolume ?? 0.9), voiceName: state?.settings?.voiceName || "" };
}
function speak(message, force = false) {
  const settings = voiceSettings();
  if (!force && (!settings.voiceEnabled || settings.voiceMuted)) return;
  if (!("speechSynthesis" in window)) { showToast("Windows speech is not available in this app session."); return; }
  const text = String(message || "").replace(/[“”]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const selected = availableVoices.find((voice) => voice.name === settings.voiceName);
  if (selected) utterance.voice = selected;
  utterance.rate = Math.min(1.2, Math.max(0.75, settings.voiceRate));
  utterance.volume = Math.min(1, Math.max(0, settings.voiceVolume));
  window.speechSynthesis.speak(utterance);
}
function topbar(eyebrow, title, intro, actions = "") {
  return `<header class="topbar"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p class="intro">${escapeHtml(intro)}</p></div><div class="top-actions">${actions}</div></header>`;
}
function empty(title, detail, action = "", label = "") {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>${action ? `<button class="button" data-action="${action}">${escapeHtml(label)}</button>` : ""}</div>`;
}
function statusPill(value) { return `<span class="pill ${escapeHtml(String(value).toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(value)}</span>`; }
function card(title, note, body, tone = "") { return `<section class="card ${tone}"><div class="card-head"><div><h2>${escapeHtml(title)}</h2>${note ? `<p class="card-note">${escapeHtml(note)}</p>` : ""}</div></div>${body}</section>`; }
function taskRow(task, editable = false) {
  return `<article class="task-row"><input class="task-check" type="checkbox" ${task.status === "complete" ? "checked" : ""} data-task-toggle="${task.id}" aria-label="Mark ${escapeHtml(task.title)} complete" /><div class="row-copy"><p class="task-title ${task.status === "complete" ? "done" : ""}">${escapeHtml(task.title)}</p><p class="task-meta">${escapeHtml(tagFor(task))}${task.dueDate ? ` · ${dateLabel(task.dueDate)}` : ""}</p></div>${editable ? `<button class="button quiet" data-delete="tasks" data-id="${task.id}">Remove</button>` : statusPill(task.priority)}</article>`;
}
function projectRow(project) {
  return `<article class="project-row"><div><strong>${escapeHtml(project.title)}</strong><small>${escapeHtml(tagFor(project))}</small></div><p>${project.nextStep ? `Next: ${escapeHtml(project.nextStep)}` : "Add a next step when you are ready."}</p></article>`;
}
function activityRow(item) { return `<article class="activity-item"><p>${escapeHtml(item.summary)}</p><time>${timeLabel(item.at)}</time></article>`; }
function accountCard(name, description, status) { return `<article class="account-card"><div class="account-icon">✉</div><div><strong>${escapeHtml(name)}</strong><p>${escapeHtml(description)}</p></div>${statusPill(status)}</article>`; }
function workState() { return state.workState || { status: "ready", summary: "Aiyla is ready." }; }
function workStateCopy(status) {
  return { ready: "Ready", listening: "Listening", thinking: "Thinking", working: "Working", waiting: "Waiting for you", complete: "Complete", stopped: "Stopped" }[status] || "Ready";
}
function conversationEntry(entry) {
  const label = entry.role === "owner" ? "You" : entry.role === "system" ? "Aiyla system" : "Aiyla";
  return `<article class="conversation-entry ${escapeHtml(entry.role || "aiyla")}"><div class="conversation-meta"><strong>${label}</strong><span>${entry.state ? escapeHtml(workStateCopy(entry.state)) : ""}</span><time>${timeLabel(entry.at)}</time></div><p>${escapeHtml(entry.content)}</p></article>`;
}
function conversationApprovalCard(approval) {
  return `<article class="conversation-approval"><div class="conversation-meta"><strong>Aiyla needs your acknowledgement</strong><span>Waiting for you</span></div><h2>${escapeHtml(approval.title)}</h2><p>${escapeHtml(approval.description || "Aiyla has prepared a proposed next step for your review.")}</p><dl><div><dt>Next step</dt><dd>${escapeHtml(approval.target || "Review this proposal and choose how Aiyla should proceed.")}</dd></div><div><dt>Expected result</dt><dd>${escapeHtml(approval.consequence || "No external action occurs until you acknowledge it.")}</dd></div></dl><div class="approval-actions"><button class="button primary" data-approval="${approval.id}" data-approval-action="approved">Approve</button><button class="button" data-approval="${approval.id}" data-approval-action="edit">Edit</button><button class="button" data-approval="${approval.id}" data-approval-action="deferred">Defer</button><button class="button quiet" data-approval="${approval.id}" data-approval-action="cancelled">Cancel</button></div></article>`;
}

function homeView() {
  const current = workState();
  const conversations = (state.conversations || []).slice(-16);
  const pending = state.approvals.filter((item) => item.status === "pending");
  const isActive = ["thinking", "working", "listening"].includes(current.status);
  return `${topbar("Aiyla", "", "", `<button class="button quiet" data-action="hide-to-orbit">Return to desktop Orbit</button>`)}
  <section class="home-conversation">
    <div class="home-orbit state-${escapeHtml(current.status)}" aria-hidden="true"><div class="large-orbit"><span class="home-ring home-ring-one"></span><span class="home-ring home-ring-two"></span><span class="home-ring home-ring-three"></span><span class="home-core"><i></i></span></div></div>
    <div class="conversation-zone"><div class="orbit-status ${escapeHtml(current.status)}"><span class="status-dot"></span>${escapeHtml(workStateCopy(current.status))}</div><h1>Talk to Aiyla</h1><p>${escapeHtml(current.summary || "Speak or type a request. Aiyla will organise, prepare, or explain the next step in one place.")}</p>
      <div class="conversation-thread" aria-live="polite">${conversations.length ? conversations.map(conversationEntry).join("") : `<div class="conversation-empty"><strong>Your conversation will stay here.</strong><span>Type a request, or use the voice controls when speech is configured.</span></div>`}${pending.map(conversationApprovalCard).join("")}</div>
      <form id="askForm" class="ask-form"><input id="askInput" autocomplete="off" placeholder="Type a Request for Aiyla" aria-label="Type a Request for Aiyla" /><button class="button primary" type="submit">Ask Aiyla</button></form>
      <div class="voice-row"><button class="button" data-action="voice-test">Talk to Aiyla</button>${isActive ? `<button class="button stop" data-action="stop-work">Stop</button>` : `<button class="button" data-action="set-ready">Ready</button>`}<button class="text-button" data-action="propose-action">Prepare a proposal</button><button class="text-button" data-action="open-voice">Voice settings</button></div>
      <p class="home-note">${aiStatus.configured ? `Aiyla Brain is available locally using ${escapeHtml(aiStatus.model)}. Computer and Browser actions remain disabled until separately approved.` : "Press-to-talk and the Aiyla Brain activate after their Windows and API setup. Your local command centre is ready now."}</p>
    </div>
  </section>`;
}

function overviewView() {
  const today = openTasks().filter((task) => ["today", "now"].includes(task.bucket) || task.dueDate === new Date().toISOString().slice(0, 10)).slice(0, 6);
  const pending = state.approvals.filter((item) => item.status === "pending").slice(0, 4);
  const upcoming = openTasks().filter((task) => task.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const projects = state.projects.filter((item) => item.status === "active").slice(0, 4);
  const waiting = state.waiting.filter((item) => item.status === "waiting").slice(0, 4);
  const runs = state.agentRuns.filter((item) => !["complete", "cancelled"].includes(item.status)).slice(0, 3);
  return `${topbar("Overview", "What matters across your world.", "A calm executive snapshot. Aiyla surfaces only what genuinely needs your attention.", `<button class="button primary" data-add="task">Add action</button>`)}
  <section class="overview-lead">${card("Today", "Actions, time-sensitive items, and work Aiyla cannot progress without you.", today.length ? `<div class="task-list">${today.map((task) => taskRow(task)).join("")}</div>` : empty("Today is clear.", "Add an action only when it genuinely needs attention today.", "add-task", "Add action"), "soft-sage")}</section>
  <section class="dashboard-grid three">
    ${card("Coming Up", "Important dates and commitments over the next few days.", upcoming.length ? `<div class="task-list">${upcoming.map((task) => taskRow(task)).join("")}</div>` : empty("Nothing scheduled.", "Dates stay optional until time truly matters."), "soft-sky")}
    ${card("Email Snapshot", "Connected accounts will surface only important messages, drafts, replies, bills and deadlines.", `<div class="snapshot-line"><strong>Not connected</strong><span>Set up Email in Connections when you are ready.</span></div>`, "soft-cream")}
    ${card("Calendar Snapshot", "Personal, family, work and Teams events appear here once configured.", `<div class="snapshot-line"><strong>Local schedule only</strong><span>${upcoming.length ? `${upcoming.length} dated local action(s)` : "No local calendar items"}</span></div>`, "soft-sky")}
    ${card("Projects Snapshot", "Movement, risks, milestones and one next step.", projects.length ? `<div class="project-list compact">${projects.map(projectRow).join("")}</div>` : empty("No active projects.", "Create a project when an outcome needs several steps.", "add-project", "Create project"))}
    ${card("Waiting / Follow-ups", "Commitments or responses Aiyla is monitoring.", waiting.length ? `<div class="record-list">${waiting.map((item) => `<article class="record-row"><strong>${escapeHtml(item.title)}</strong><small>${item.followUpDate ? `Follow up ${dateLabel(item.followUpDate)}` : "No follow-up date"}</small></article>`).join("")}</div>` : empty("Nothing is waiting.", "Track something you are waiting on when a response matters.", "add-waiting", "Add follow-up"))}
    ${card("Aiyla Working", "A quiet summary of planning, preparation, or work awaiting integration.", runs.length ? `<div class="record-list">${runs.map((item) => `<article class="record-row"><strong>${escapeHtml(item.title)}</strong>${statusPill(item.status)}</article>`).join("")}</div>` : empty("Aiyla is not working on anything yet.", "Active work will remain optional to inspect, never another queue to manage."), "soft-lilac")}
  </section>
  ${pending.length ? card("Aiyla needs your approval", "Aiyla asks in conversation when a consequential step is ready. These records remain here for reference.", `<div class="record-list">${pending.map((item) => `<article class="approval-row"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description || "Review the proposed next step.")}</p></div><button class="button" data-approval="${item.id}" data-approval-status="approved">Approve</button><button class="button quiet" data-approval="${item.id}" data-approval-status="cancelled">Cancel</button></article>`).join("")}</div>`, "soft-amber") : ""}`;
}

function emailView() {
  const accounts = [
    ["zaraadam43", "Aiyla-managed account when connected.", "Not connected"], ["queensayma1", "Aiyla-managed account when connected.", "Not connected"], ["helpinghcs19", "Aiyla-managed account when connected.", "Not connected"], ["sagal.artan1", "Aiyla-managed account when connected.", "Not connected"], ["Sagal_A", "Aiyla-managed account when connected.", "Not connected"], ["Moonlight Care", "Work Outlook. Observe and report only at first; existing Power Automate remains separate.", "Observe only"]
  ];
  return `${topbar("Email", "One intelligent Email Centre.", "Aiyla brings account status, drafts, replies, bills, dates and key messages together without creating separate sidebar pages.", `<button class="button primary" data-action="open-connections">Manage connections</button>`)}
    ${card("Your accounts", "Open a connected account here for Inbox, Important, Drafts Ready, Waiting for Reply and Search. No email is connected or changed in this local package.", `<div class="account-grid">${accounts.map((account) => accountCard(...account)).join("")}</div>`)}
    ${card("Aiyla email briefing", "Once accounts are authorised, Aiyla will summarise only what matters across them.", empty("No account intelligence yet.", "Connect an email account in Connections. Moonlight Care remains report-only at first."), "soft-sage")}`;
}

function calendarView() {
  const local = [...state.calendar, ...openTasks().filter((task) => task.dueDate).map((task) => ({ id: task.id, title: task.title, start: task.dueDate, source: "Aiyla local action" }))].sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
  return `${topbar("Calendar", "One intelligent view of time.", "Aiyla keeps the source calendar for every event and avoids duplicating events unnecessarily.", `<button class="button primary" data-add="calendar">Add local event</button>`)}
    ${card("Unified Calendar", "Personal Outlook, Moonlight Care work, Teams, school dates, milestones and follow-ups appear together once configured.", local.length ? `<div class="record-list">${local.map((item) => `<article class="record-row"><div><strong>${escapeHtml(item.title)}</strong><small>${item.start ? dateLabel(item.start.slice(0, 10)) : "No time"} · ${escapeHtml(item.source || "Aiyla local")}</small></div></article>`).join("")}</div>` : empty("Nothing is scheduled locally.", "Add a local event now or connect calendars later."), "soft-sky")}
    ${card("Calendar routing", "Aiyla will route new events to the correct configured source.", `<div class="routing-list"><p><strong>Personal / Family / Home / Kids / Cars</strong><span>Personal Outlook Calendar</span></p><p><strong>Moonlight Care</strong><span>Moonlight Care Work Calendar and Teams when relevant</span></p><p><strong>Other operations</strong><span>Configured preferred calendar or a question from Aiyla</span></p></div>`)}`;
}

function contextView(view) {
  const areaId = viewContext[view];
  const area = getArea(areaId);
  const operations = state.operations.filter((item) => item.areaId === areaId);
  const projects = state.projects.filter((item) => item.areaId === areaId || operations.some((operation) => operation.id === item.operationId));
  const tasks = openTasks().filter((item) => item.areaId === areaId || operations.some((operation) => operation.id === item.operationId)).slice(0, 7);
  const headings = {
    personal: ["Personal & Family", "Home, bills, children, health, maintenance, cars and personal administration."],
    australia: ["Australia Operations", "Your Australian businesses and operations, organised through one Aiyla Core."],
    uae: ["UAE Operations", "Your UAE businesses and operations, visible contextually without duplicate projects."],
    international: ["International Expansion", "Focused cross-border work for country and business expansion."]
  }[view];
  const subareas = view === "personal" ? ["Home & Bills", "Kids — School, Fees & Events", "Kids — Health & Appointments", "House — Maintenance & Projects", "Cars", "Personal Admin"] : operations.map((operation) => operation.name);
  if (view === "international") subareas.splice(0, subareas.length, "Peptavite → Saudi Arabia", "Peptavite → Kenya", "Aetyrna → Saudi Arabia", "Aetyrna → Kenya");
  return `${topbar(headings[0], headings[0], headings[1], `<button class="button primary" data-add="task" data-context="${areaId}">Add action</button>`)}
    <section class="context-band">${subareas.map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</section>
    <section class="dashboard-grid two">
      ${card("Relevant projects", "One project system, shown wherever it belongs.", projects.length ? `<div class="project-list">${projects.map(projectRow).join("")}</div>` : empty("No projects in this area.", "Create one from Projects and assign it when useful.", "add-project", "Create project"), "soft-sage")}
      ${card("Open actions", "Only actions related to this area.", tasks.length ? `<div class="task-list">${tasks.map((task) => taskRow(task)).join("")}</div>` : empty("No actions here.", "Aiyla will place future items in the right context from your conversation."), "soft-sky")}
    </section>
    ${view === "international" ? card("Expansion relationships", "Projects can relate to a parent operation and country without being duplicated.", `<div class="routing-list"><p><strong>Countries</strong><span>Saudi Arabia · Kenya</span></p><p><strong>Operations</strong><span>Peptavite · Aetyrna</span></p><p><strong>Master view</strong><span>All expansion projects remain in Projects.</span></p></div>`) : ""}`;
}

function projectsView() {
  const active = state.projects.filter((item) => item.status !== "complete");
  return `${topbar("Projects", "One system, multiple contextual views.", "Projects appear inside Personal & Family, Operations or Expansion where they belong, while this page remains the master view.", `<button class="button primary" data-add="project">Create project</button>`)}
    ${card("Master Projects", "An outcome needs more than one action. Keep one next step visible.", active.length ? `<div class="project-list">${active.map(projectRow).join("")}</div>` : empty("No projects yet.", "Create a project when an outcome needs several actions.", "add-project", "Create project"))}`;
}

function computerView() {
  const runs = state.agentRuns.filter((item) => item.agent === "Local Computer Agent");
  return `${topbar("Computer", "Aiyla’s local Windows work.", "Aiyla can eventually find files, create drafts, prepare documents, PDFs and spreadsheets, and save results—only in approved locations.", `<button class="button primary" data-add="run" data-agent="Local Computer Agent">Plan computer work</button>`)}
    <section class="dashboard-grid two">
      ${card("Computer permissions", "No folder or application is approved in this package yet.", `<div class="permission-card"><strong>Approved folders: none</strong><p>When enabled, Aiyla will work only in folders you select. Existing files are never overwritten by default.</p><button class="button" data-action="open-connections">Manage permissions</button></div>`, "soft-sage")}
      ${card("What Aiyla will do", "Local Computer Agent work is planned, reviewed and recorded.", `<ul class="capability-list"><li>Find and compare files in approved folders</li><li>Create dated draft versions of documents and templates</li><li>Prepare Word, PDF and spreadsheet outputs</li><li>Move, rename or organise only after scope review</li><li>Prepare files for a later approved upload</li></ul>`, "soft-sky")}
    </section>
    ${card("Computer work", "This secondary view shows only work Aiyla is preparing, waiting on or completing.", runs.length ? `<div class="run-list">${runs.map(runRow).join("")}</div>` : empty("No computer work is planned.", "Ask Aiyla to prepare a file task after you approve a folder scope."))}`;
}

function browserView() {
  const runs = state.agentRuns.filter((item) => item.agent === "Browser Agent");
  return `${topbar("Browser", "Aiyla’s website and portal work.", "Browser work can support CRMs, Gumtree, supplier sites, recruitment platforms and business portals in an isolated approved session.", `<button class="button primary" data-add="run" data-agent="Browser Agent">Plan browser work</button>`)}
    <section class="dashboard-grid two">
      ${card("Browser permissions", "No site is approved in this package yet.", `<div class="permission-card"><strong>Approved sites: none</strong><p>You log in yourself. Aiyla never stores passwords, verification codes or CAPTCHA answers, and stops before final consequential actions.</p><button class="button" data-action="open-connections">Manage permissions</button></div>`, "soft-sage")}
      ${card("What Aiyla will do", "Browser Agent work remains inside Aiyla’s workflow.", `<ul class="capability-list"><li>Navigate an approved portal after you authenticate</li><li>Research, search, filter and review records</li><li>Prepare data entry, forms, drafts and uploads</li><li>Stop for approval before submission, publishing, payment or account change</li><li>Record what was prepared and the final result</li></ul>`, "soft-sky")}
    </section>
    ${card("Browser work", "This is a calm status view, not a queue you need to manage.", runs.length ? `<div class="run-list">${runs.map(runRow).join("")}</div>` : empty("No browser work is planned.", "Ask Aiyla to prepare a website task after a site is approved."))}`;
}

function runRow(run) { return `<article class="run-row"><div><strong>${escapeHtml(run.title)}</strong><p>${escapeHtml(run.summary || run.scope || "Aiyla is preparing this work.")}</p><small>${escapeHtml(run.agent)}${run.scope ? ` · ${escapeHtml(run.scope)}` : ""}</small></div>${statusPill(run.status)}</article>`; }

function workingView() {
  const runs = state.agentRuns.filter((item) => !["complete", "cancelled"].includes(item.status));
  return `${topbar("Aiyla Working", "Work Aiyla is currently doing.", "Research, preparation, waiting and completion stay visible if you want to inspect them—not as another system you must manage.", `<button class="button primary" data-add="run">Plan work</button>`)}
    ${card("Current work", "Aiyla coordinates specialist capabilities behind the scenes and reports one clear outcome.", runs.length ? `<div class="run-list">${runs.map(runRow).join("")}</div>` : empty("Aiyla is not working on anything yet.", "Requests requiring deeper work will appear here once they are prepared."), "soft-lilac")}`;
}

function historyView() {
  return `${topbar("History", "What Aiyla did.", "A clear local record of conversations, local changes, planned work, approvals, cancellations and results.")} ${card("Activity History", "Each important action remains understandable and auditable.", `<div class="activity-list">${state.history.length ? state.history.map(activityRow).join("") : empty("No activity yet.", "Aiyla will record important actions here.")}</div>`)}`;
}

function connectionsView() {
  return `${topbar("Connections", "Connected systems and permissions.", "Every connection has one stated purpose, a limited scope and a revoke control. Nothing is connected in this local package.")}
    <section class="connection-grid">${state.connections.map((item) => `<article class="connection-card"><div class="connection-icon">${item.category === "AI" ? "✦" : item.category === "Computer" ? "▣" : item.category === "Browser" ? "◉" : item.category === "Calendar" ? "◷" : item.category === "Email" ? "✉" : "⌁"}</div><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.scope)}</p></div>${statusPill(item.status)}</article>`).join("")}</section>
    ${card("Connection rules", "Aiyla connects only when you choose and stays within the scope you approve.", `<div class="routing-list"><p><strong>Work Outlook</strong><span>Observe/report only at first; existing Power Automate stays independent.</span></p><p><strong>Computer & Browser</strong><span>Approved folders/apps/sites/sessions only.</span></p><p><strong>Financial systems</strong><span>Separate scoped permissions and strong financial controls.</span></p></div>`, "soft-amber")}`;
}

function settingsView() {
  const settings = voiceSettings();
  const voiceOptions = availableVoices.map((voice) => `<option value="${escapeHtml(voice.name)}" ${voice.name === settings.voiceName ? "selected" : ""}>${escapeHtml(voice.name)}${voice.lang ? ` (${escapeHtml(voice.lang)})` : ""}</option>`).join("");
  return `${topbar("Settings", "Voice, AI, permissions and comfort.", "These controls stay local until you intentionally set up an integration.", `<button class="button quiet" data-action="hide-to-orbit">Return to desktop Orbit</button><button class="button quiet" data-action="quit-app">Quit Aiyla</button>`)}
    <section class="dashboard-grid two">
      ${card("Comfort and safety", "Owner controls remain available throughout the Command Centre.", `<div class="settings-list"><div class="setting-row"><div><strong>Reduced visual clutter</strong><p>Reduce decorative backgrounds and secondary detail.</p></div><label class="switch"><input id="clutterToggle" type="checkbox" ${state.settings.reducedClutter ? "checked" : ""} /><span class="slider"></span></label></div><div class="setting-row"><div><strong>High contrast</strong><p>Increase contrast while keeping Aiyla’s calm visual hierarchy.</p></div><label class="switch"><input id="contrastToggle" type="checkbox" ${state.settings.highContrast ? "checked" : ""} /><span class="slider"></span></label></div><div class="setting-row"><div><strong>Pause all automation</strong><p>Stops future Computer and Browser Agent execution while preserving your records.</p></div><label class="switch"><input id="automationToggle" type="checkbox" ${state.settings.automationPaused ? "checked" : ""} /><span class="slider"></span></label></div><div class="setting-row"><div><strong>Desktop Orbit</strong><p>Shows the small Ready presence on your desktop.</p></div><button class="button" data-action="hide-to-orbit">Show Orbit</button></div></div>`, "soft-sage")}
      ${card("Aiyla voice", "Windows text-to-speech is available locally. Press-to-talk recognition is activated after the native helper is installed and tested.", `<div class="settings-list"><div class="setting-row"><div><strong>Spoken replies</strong><p>Let Aiyla say short confirmations and responses.</p></div><label class="switch"><input id="voiceToggle" type="checkbox" ${settings.voiceEnabled ? "checked" : ""} /><span class="slider"></span></label></div><div class="setting-row"><div><strong>Mute Aiyla</strong><p>Keep voice choices while making Aiyla silent.</p></div><label class="switch"><input id="muteToggle" type="checkbox" ${settings.voiceMuted ? "checked" : ""} /><span class="slider"></span></label></div><div class="field"><label for="voiceSelect">Windows voice</label><select id="voiceSelect"><option value="">Windows default voice</option>${voiceOptions}</select></div><div class="field"><label for="voiceRate">Speech speed</label><input id="voiceRate" type="range" min="0.75" max="1.25" step="0.05" value="${settings.voiceRate}" /><small id="voiceRateValue">${settings.voiceRate.toFixed(2)}×</small></div><button class="button primary" data-action="test-voice">Play test response</button><button class="button" data-action="open-voice">Test microphone</button></div>`, "soft-sky")}
    </section>
    ${card("Aiyla Brain", "The official OpenAI connection runs only in Electron’s protected main process; no key is exposed to the dashboard renderer.", `<div class="permission-card"><strong>${aiStatus.configured ? `Local key available · ${escapeHtml(aiStatus.model)}` : "Setup required"}</strong><p>${aiStatus.configured ? "Aiyla can now provide text-only conversational reasoning. Computer, Browser, Email and Calendar actions remain separately disabled until you authorise them." : "Create an OpenAI API project, apply a conservative budget limit, then set the local Windows environment variable AIYLA_OPENAI_API_KEY. Do not paste any key into a conversation or this screen."}</p><button class="button" data-action="open-connections">Open Connections</button></div>`, "soft-lilac")}`;
}

function voiceView() {
  return `${topbar("Talk to Aiyla", "Press-to-talk readiness.", "This package includes the Aiyla voice interface and microphone health check. Windows-native speech recognition is activated after the helper is installed and tested on your Snapdragon laptop.", `<button class="button" data-action="go-home">Back to Home</button>`)}
    <section class="dashboard-grid two">${card("Microphone check", "This health check sends no audio anywhere and creates no transcript.", `<div class="meter"><span id="micMeter"></span></div><p class="voice-state" id="voiceState">Microphone is not active.</p><div class="form-actions"><button class="button" data-action="stop-mic">Stop microphone</button><button class="button primary" data-action="start-mic">Start microphone test</button></div>`, "soft-sage")}${card("Conversation flow", "How Aiyla will operate when the Aiyla Brain and speech helper are connected.", `<ol class="flow-list"><li>You press Talk to Aiyla from any page.</li><li>Windows transcribes your words and shows them to you.</li><li>Aiyla Brain interprets the request and prepares an answer or proposed action.</li><li>Aiyla shows the result, asks when approval is needed, and speaks the response.</li></ol><button class="button" data-action="test-voice">Play local Aiyla response</button>`, "soft-sky")}</section>`;
}

function formDialog(type, context = {}) {
  const maps = {
    task: { title: "Add action", collection: "tasks", fields: `<label>Action<input name="title" required placeholder="For example: Book school appointment" /></label><label>Where<select name="bucket"><option value="inbox">Inbox</option><option value="today">Today</option><option value="now">Now</option><option value="later">Later</option></select></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label>Due date (optional)<input name="dueDate" type="date" /></label>` },
    project: { title: "Create project", collection: "projects", fields: `<label>Project outcome<input name="title" required placeholder="For example: Refresh kitchen" /></label><label>Next step (optional)<input name="nextStep" placeholder="For example: Measure cupboards" /></label>` },
    waiting: { title: "Add follow-up", collection: "waiting", fields: `<label>What are you waiting on?<input name="title" required placeholder="For example: School response about Friday" /></label><label>Follow-up date (optional)<input name="followUpDate" type="date" /></label>` },
    decision: { title: "Add decision", collection: "decisions", fields: `<label>Decision needed<input name="title" required placeholder="For example: Choose insurance renewal" /></label><label>Decision date (optional)<input name="decisionDate" type="date" /></label>` },
    calendar: { title: "Add local calendar item", collection: "calendar", fields: `<label>Event title<input name="title" required placeholder="For example: School appointment" /></label><label>Date<input name="start" type="date" required /></label>` },
    run: { title: "Plan Aiyla work", collection: "agentRuns", fields: `<label>What should Aiyla prepare?<input name="title" required placeholder="For example: Find latest participant template" /></label><label>Summary / desired outcome<textarea name="summary" placeholder="Explain the result you want."></textarea></label><label>Scope (optional)<input name="scope" placeholder="For example: Approved Templates folder" /></label>` }
  };
  const config = maps[type];
  if (!config) return;
  dialog.innerHTML = `<form method="dialog" class="dialog-form" id="recordForm"><div class="dialog-head"><div><p class="eyebrow">Aiyla Core</p><h2>${escapeHtml(config.title)}</h2></div><button class="icon-button" type="button" data-dialog-close aria-label="Close">×</button></div><div class="dialog-fields">${config.fields}<label>Context area<select name="areaId"><option value="">Not assigned</option>${state.areas.map((area) => `<option value="${area.id}" ${context.areaId === area.id ? "selected" : ""}>${escapeHtml(area.name)}</option>`).join("")}</select></label><label>Operation (optional)<select name="operationId"><option value="">Not assigned</option>${state.operations.map((operation) => `<option value="${operation.id}">${escapeHtml(operation.name)}</option>`).join("")}</select></label></div><div class="form-actions"><button class="button" type="button" data-dialog-close>Cancel</button><button class="button primary" type="submit">Save</button></div></form>`;
  dialog.showModal();
  const form = dialog.querySelector("#recordForm");
  dialog.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (type === "run") values.agent = context.agent || "Aiyla";
    await window.aiyla.createRecord(config.collection, values);
    dialog.close();
    showToast(`${config.title} saved.`); speak(`${config.title} saved.`);
  });
}

function openCaptureDialog() {
  dialog.innerHTML = `<form method="dialog" class="dialog-form" id="captureForm"><div class="dialog-head"><div><p class="eyebrow">Aiyla Capture</p><h2>Capture this for later</h2></div><button class="icon-button" type="button" data-dialog-close aria-label="Close">×</button></div><div class="dialog-fields"><label>What should Aiyla remember?<textarea name="text" required placeholder="Type a thought, action, reminder, decision or idea…"></textarea></label></div><div class="form-actions"><button class="button" type="button" data-dialog-close>Cancel</button><button class="button primary" type="submit">Save to Capture</button></div></form>`;
  dialog.showModal();
  dialog.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("#captureForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await window.aiyla.createRecord("captures", values);
    dialog.close();
    showToast("Saved to Capture."); speak("Saved to Capture.");
  });
}

function openApprovalEditDialog(approval) {
  dialog.innerHTML = `<form class="dialog-form" id="approvalEditForm"><div class="dialog-head"><div><p class="eyebrow">Aiyla acknowledgement</p><h2>Edit the proposal</h2></div><button class="icon-button" type="button" data-dialog-close aria-label="Close">×</button></div><div class="dialog-fields"><label>Proposed next step<textarea name="target" required>${escapeHtml(approval.target || "")}</textarea></label><label>What Aiyla should understand<textarea name="description" required>${escapeHtml(approval.description || "")}</textarea></label><label>Expected result or boundary<textarea name="consequence">${escapeHtml(approval.consequence || "")}</textarea></label></div><div class="form-actions"><button class="button" type="button" data-dialog-close>Cancel</button><button class="button primary" type="submit">Update proposal</button></div></form>`;
  dialog.showModal();
  dialog.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("#approvalEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const patch = Object.fromEntries(new FormData(event.currentTarget).entries());
    const result = await window.aiyla.respondToApproval(approval.id, "edited", patch);
    dialog.close();
    showToast(result.message); speak(result.message);
  });
}

function openProposalDialog() {
  dialog.innerHTML = `<form class="dialog-form" id="proposalForm"><div class="dialog-head"><div><p class="eyebrow">Aiyla acknowledgement</p><h2>Prepare a proposed action</h2></div><button class="icon-button" type="button" data-dialog-close aria-label="Close">×</button></div><p class="dialog-note">Aiyla will show this as a pending conversational acknowledgement. It will not cause any external action.</p><div class="dialog-fields"><label>Proposal title<input name="title" required placeholder="For example: Send the prepared school email" /></label><label>What Aiyla has understood<textarea name="description" required placeholder="For example: The email is ready as a draft and will be sent only if you approve."></textarea></label><label>Exact next step<textarea name="target" required placeholder="For example: Send the draft to the school office."></textarea></label><label>Expected result or boundary<textarea name="consequence" required placeholder="For example: One email is sent; no other recipients or changes."></textarea></label></div><div class="form-actions"><button class="button" type="button" data-dialog-close>Cancel</button><button class="button primary" type="submit">Prepare for acknowledgement</button></div></form>`;
  dialog.showModal();
  dialog.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("#proposalForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const proposal = await window.aiyla.createProposal(Object.fromEntries(new FormData(event.currentTarget).entries()));
    dialog.close();
    showToast(`Aiyla prepared “${proposal.title}” for your acknowledgement.`); speak("Aiyla has prepared a proposal for your acknowledgement.");
  });
}

function render() {
  if (!state) return;
  const shell = document.getElementById("appShell");
  shell.classList.toggle("reduced-clutter", Boolean(state.settings.reducedClutter));
  shell.classList.toggle("high-contrast", Boolean(state.settings.highContrast));
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  const views = { home: homeView, overview: overviewView, email: emailView, calendar: calendarView, personal: () => contextView("personal"), australia: () => contextView("australia"), uae: () => contextView("uae"), international: () => contextView("international"), projects: projectsView, computer: computerView, browser: browserView, working: workingView, history: historyView, connections: connectionsView, settings: settingsView, voice: voiceView };
  content.innerHTML = (views[activeView] || homeView)();
  wireRenderedView();
}

function navigate(view) { stopMicrophone(); activeView = view; render(); content.focus(); }

function wireRenderedView() {
  document.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", async () => {
    const action = element.dataset.action;
    if (action === "hide-to-orbit") return window.aiyla.hideToOrbit();
    if (action === "quit-app") return window.aiyla.quit();
    if (action === "open-voice") return navigate("voice");
    if (action === "go-home") return navigate("home");
    if (action === "open-connections") return navigate("connections");
    if (action === "propose-action") return openProposalDialog();
    if (action === "stop-work") { const result = await window.aiyla.stopCurrentWork(); showToast(result.message); return; }
    if (action === "set-ready") { const result = await window.aiyla.setReady(); showToast(result.message); return; }
    if (action === "voice-test" || action === "test-voice") { speak("Hello, I am Aiyla. I am ready when you are.", true); showToast("Playing a local Windows voice test."); return; }
    if (action === "start-mic") return startMicrophone();
    if (action === "stop-mic") return stopMicrophone();
    if (action === "add-task") return formDialog("task");
    if (action === "add-project") return formDialog("project");
    if (action === "add-waiting") return formDialog("waiting");
  }));
  document.querySelectorAll("[data-add]").forEach((element) => element.addEventListener("click", () => {
    const context = { areaId: element.dataset.context || "", agent: element.dataset.agent || "" };
    if (element.dataset.add === "capture") return openCaptureDialog();
    formDialog(element.dataset.add, context);
  }));
  document.querySelectorAll("[data-task-toggle]").forEach((element) => element.addEventListener("change", async () => {
    const task = state.tasks.find((item) => item.id === element.dataset.taskToggle);
    await window.aiyla.updateRecord("tasks", task.id, { status: element.checked ? "complete" : "open" });
    const message = element.checked ? `Completed ${task.title}.` : `Reopened ${task.title}.`;
    showToast(message); speak(message);
  }));
  document.querySelectorAll("[data-delete]").forEach((element) => element.addEventListener("click", async () => {
    await window.aiyla.deleteRecord(element.dataset.delete, element.dataset.id);
    showToast("Item removed."); speak("Item removed.");
  }));
  document.querySelectorAll("[data-approval]").forEach((element) => element.addEventListener("click", async () => {
    const approval = state.approvals.find((item) => item.id === element.dataset.approval);
    const action = element.dataset.approvalAction || element.dataset.approvalStatus;
    if (action === "edit") return openApprovalEditDialog(approval);
    const result = await window.aiyla.respondToApproval(approval.id, action);
    showToast(result.message); speak(result.message);
  }));
  const askForm = document.getElementById("askForm");
  if (askForm) askForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("askInput");
    const result = await window.aiyla.askAiyla(input.value);
    input.value = "";
    showToast(result.message); speak(result.message);
  });
  const clutterToggle = document.getElementById("clutterToggle");
  if (clutterToggle) clutterToggle.addEventListener("change", () => window.aiyla.updateSettings({ reducedClutter: clutterToggle.checked }));
  const contrastToggle = document.getElementById("contrastToggle");
  if (contrastToggle) contrastToggle.addEventListener("change", () => window.aiyla.updateSettings({ highContrast: contrastToggle.checked }));
  const automationToggle = document.getElementById("automationToggle");
  if (automationToggle) automationToggle.addEventListener("change", () => window.aiyla.updateSettings({ automationPaused: automationToggle.checked }));
  const voiceToggle = document.getElementById("voiceToggle");
  if (voiceToggle) voiceToggle.addEventListener("change", async () => { await window.aiyla.updateSettings({ voiceEnabled: voiceToggle.checked }); if (voiceToggle.checked) speak("Spoken replies are on.", true); });
  const muteToggle = document.getElementById("muteToggle");
  if (muteToggle) muteToggle.addEventListener("change", async () => { await window.aiyla.updateSettings({ voiceMuted: muteToggle.checked }); if (muteToggle.checked && window.speechSynthesis) window.speechSynthesis.cancel(); else speak("Aiyla is unmuted.", true); });
  const voiceSelect = document.getElementById("voiceSelect");
  if (voiceSelect) voiceSelect.addEventListener("change", async () => { await window.aiyla.updateSettings({ voiceName: voiceSelect.value }); speak("This is the selected Aiyla voice.", true); });
  const voiceRate = document.getElementById("voiceRate");
  if (voiceRate) voiceRate.addEventListener("input", () => { document.getElementById("voiceRateValue").textContent = `${Number(voiceRate.value).toFixed(2)}×`; });
  if (voiceRate) voiceRate.addEventListener("change", () => window.aiyla.updateSettings({ voiceRate: Number(voiceRate.value) }));
}

async function startMicrophone() {
  const stateElement = document.getElementById("voiceState");
  const meter = document.getElementById("micMeter");
  try {
    stopMicrophone();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(micStream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const animate = () => {
      analyser.getByteTimeDomainData(data);
      const average = data.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / data.length;
      if (meter) meter.style.width = `${Math.min(100, Math.max(3, average * 4.4))}%`;
      meterFrame = requestAnimationFrame(animate);
    };
    animate();
    if (stateElement) stateElement.textContent = "Microphone is active. The meter should move when you speak. No transcript is created in this health check.";
    showToast("Microphone is active.");
  } catch {
    if (stateElement) stateElement.textContent = "Aiyla could not access the microphone. Check Windows Settings → Privacy & security → Microphone, then try again.";
    showToast("Microphone access was not available.");
  }
}
function stopMicrophone() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  meterFrame = null;
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
  micStream = null;
  if (audioContext) audioContext.close();
  audioContext = null;
  const meter = document.getElementById("micMeter");
  if (meter) meter.style.width = "0%";
  const stateElement = document.getElementById("voiceState");
  if (stateElement) stateElement.textContent = "Microphone test stopped.";
}

document.getElementById("navigation").addEventListener("click", (event) => { const button = event.target.closest("[data-view]"); if (button) navigate(button.dataset.view); });
document.getElementById("talkAnywhere").addEventListener("click", () => navigate("home"));
if ("speechSynthesis" in window) { loadVoices(); window.speechSynthesis.onvoiceschanged = () => { loadVoices(); if (state && activeView === "settings") render(); }; }
window.aiyla.onStateChanged((nextState) => { state = nextState; render(); });
Promise.all([window.aiyla.getState(), window.aiyla.getAiStatus()]).then(([loaded, status]) => { state = loaded; aiStatus = status; loadVoices(); render(); });
