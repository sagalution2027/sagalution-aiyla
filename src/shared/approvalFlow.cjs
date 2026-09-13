function buildProposalConversation(proposal) {
  const title = String(proposal?.title || "this proposed action").trim();
  return {
    owner: `You asked Aiyla to prepare: ${title}.`,
    aiyla: "I have prepared the proposed next step below. Nothing will happen outside Aiyla until you acknowledge it."
  };
}

function buildApprovalResponse(title, action) {
  const safeTitle = String(title || "this proposed action").trim();
  const map = {
    approved: {
      owner: `You acknowledged the proposed action: ${safeTitle}.`,
      aiyla: "Thank you. Aiyla will continue only within the approved scope.",
      workState: "working",
      workSummary: "Aiyla is preparing the approved next step."
    },
    deferred: {
      owner: `You deferred the proposed action: ${safeTitle}.`,
      aiyla: "Understood. Aiyla will leave this proposal waiting until you return to it.",
      workState: "complete",
      workSummary: "Aiyla has completed the acknowledgement update."
    },
    cancelled: {
      owner: `You cancelled the proposed action: ${safeTitle}.`,
      aiyla: "Understood. Aiyla has cancelled this proposed action.",
      workState: "complete",
      workSummary: "Aiyla has completed the acknowledgement update."
    }
  };
  return map[action] || null;
}

module.exports = { buildProposalConversation, buildApprovalResponse };
