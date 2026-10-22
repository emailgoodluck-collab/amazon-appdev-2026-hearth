export function classifyPrompt(request) {
  const text = String(request ?? "").trim().replace(/[’‘]/g, "'");
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:help|what can you do|what can i say)[.!?]*$/i.test(text)) {
    return "help";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:show|read)(?:\s+me)?\s+(?:the\s+)?(?:tonight'?s?\s+)?(?:plan|schedule|evening)|what(?:'s| is) on(?: tonight)?|what(?:'s| is) happening(?: tonight)?)[.!?]*$/i.test(text)) {
    return "show-plan";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:prepare|preview|draft|compose|show)(?:\s+(?:me\s+)?(?:a\s+)?)?(?:household|family|shared)?\s*(?:update|message|summary)(?:\s+(?:for\s+)?(?:the\s+)?(?:family|household))?[.!?]*$/i.test(text)) {
    return "preview-update";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:reset|start over|restart)(?:\s+(?:the\s+)?(?:demo|plan|evening))?[.!?]*$/i.test(text)) {
    return "reset-demo";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:undo|reverse|roll back)(?:\s+(?:the\s+)?(?:last|most recent)\s+(?:plan\s+)?(?:change|update|adjustment))?(?:\s+please)?[.!?]*$/i.test(text)) {
    return "undo";
  }
  return "adjust-plan";
}

export function summarizeEveningPlan(plan) {
  return [
    "Here’s the shared plan for tonight:",
    ...plan.events.map((event) => `${event.time} ${event.period} — ${event.title} (${event.state})`),
    "",
    "This summary does not include personal reminders.",
  ].join("\n");
}
