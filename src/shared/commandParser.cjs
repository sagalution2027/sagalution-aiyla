function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCaseSentence(value) {
  const text = cleanText(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function parseCommand(input) {
  const raw = cleanText(input);
  const normalized = raw.toLowerCase();

  if (!raw) {
    return { type: "empty", message: "Say or type what you would like Aiyla to do." };
  }

  const project = /^(?:start|create|add)\s+(?:a\s+)?project\s+(?:called\s+)?(.+)$/i.exec(raw);
  if (project) {
    return { type: "create_project", title: titleCaseSentence(project[1]) };
  }

  const add = /^(?:add|create|remember|capture)\s+(.+?)(?:\s+(?:to|for)\s+(today|now))?$/i.exec(raw);
  if (add) {
    return {
      type: "create_task",
      title: titleCaseSentence(add[1]),
      bucket: (add[2] || "inbox").toLowerCase()
    };
  }

  const complete = /^(?:complete|finish|mark)\s+(.+?)(?:\s+(?:as\s+)?done)?$/i.exec(raw);
  if (complete) {
    return { type: "complete_task", query: cleanText(complete[1]) };
  }

  const defer = /^(?:defer|move|push)\s+(.+?)(?:\s+(?:to|until)\s+(tomorrow|next week|later))?$/i.exec(raw);
  if (defer) {
    return {
      type: "defer_task",
      query: cleanText(defer[1]),
      when: (defer[2] || "later").toLowerCase()
    };
  }

  const prioritise = /^(?:prioritise|prioritize|make)\s+(.+?)(?:\s+(?:high|urgent|top)\s+priority)?$/i.exec(raw);
  if (prioritise && /(prioritis|prioritiz|high priority|urgent|top priority)/i.test(normalized)) {
    return { type: "prioritise_task", query: cleanText(prioritise[1]) };
  }

  return {
    type: "review_required",
    message: "Aiyla has kept your words in command history. Please turn this into a task or use a clearer command."
  };
}

module.exports = { cleanText, parseCommand };
