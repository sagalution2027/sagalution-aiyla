function extractOpenAiText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const text = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .filter((content) => content?.type === "output_text" && typeof content.text === "string")
      .map((content) => content.text.trim())
      .filter(Boolean)
      .join("\n")
    : "";
  return text.trim();
}

function buildAiylaInstructions() {
  return [
    "You are Aiyla, the calm Executive Assistant for the Sagalution Life & Work Command Centre.",
    "Reply naturally, practically, and briefly in one to four short sentences unless the owner explicitly asks for detail.",
    "Use the supplied local Core summary as reference only. Do not claim you read email, calendar, files, websites, or external systems unless that capability is explicitly connected and supplied.",
    "You cannot send messages, submit forms, book, purchase, upload, modify external systems, browse websites, or control the computer in this text-only conversation. If the request would have a consequential external effect, explain the proposed next step and ask for acknowledgement rather than implying that it happened.",
    "Moonlight Care uses the term participant, never client. Treat Flowlogic as read-only unless explicit permission is later supplied.",
    "Keep specialist systems invisible by default. Present one clear owner-facing recommendation, question, or outcome."
  ].join(" ");
}

function buildSafeCoreContext(state) {
  const compact = (items, map, limit = 12) => (Array.isArray(items) ? items.slice(0, limit).map(map) : []);
  return {
    open_actions: compact(state.tasks?.filter((item) => item.status !== "complete"), (item) => ({ title: item.title, bucket: item.bucket, priority: item.priority, due_date: item.dueDate || null, area: item.areaId || null, operation: item.operationId || null })),
    active_projects: compact(state.projects?.filter((item) => item.status !== "complete"), (item) => ({ title: item.title, next_step: item.nextStep || null, area: item.areaId || null, operation: item.operationId || null })),
    waiting_follow_ups: compact(state.waiting?.filter((item) => item.status === "waiting"), (item) => ({ title: item.title, follow_up_date: item.followUpDate || null })),
    open_decisions: compact(state.decisions?.filter((item) => item.status !== "complete"), (item) => ({ title: item.title, decision_date: item.decisionDate || null }))
  };
}

module.exports = { extractOpenAiText, buildAiylaInstructions, buildSafeCoreContext };
