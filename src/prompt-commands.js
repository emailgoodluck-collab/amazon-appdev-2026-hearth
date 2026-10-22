export function classifyPrompt(request) {
  const text = String(request ?? "").trim().replace(/[’‘]/g, "'");
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:yes|confirm|confirm reset|yes reset|do it|go ahead)[.!?]*$/i.test(text)) {
    return "confirm-action";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:help|what can you do|what can i say)[.!?]*$/i.test(text)) {
    return "help";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:read|show|list|what are)(?:\s+me)?\s+(?:(?:my|the)\s+)?(?:private\s+)?notes[.!?]*$/i.test(text)) {
    return "list-notes";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:delete|remove|forget)(?:\s+(?:my|the))?\s+(?:last|most recent)\s+note[.!?]*$/i.test(text)) {
    return "delete-note";
  }
  const note = text.match(/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:add|write|save|remember|note)(?:\s+(?:a\s+)?(?:private\s+)?note)?(?:\s+(?:that|saying|to my notes))?\s*[:,-]?\s+(.+)[.!?]*$/i);
  if (note && note[1].trim()) {
    return "add-note";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:add|schedule|put|plan)(?:\s+(?:an?\s+)?(?:activity|event|task))?(?:\s+to\s+(?:the\s+)?plan)?\s*[:,-]?\s+.+$/i.test(text)) {
    return "add-activity";
  }
  if (/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:remove|delete|cancel)(?:\s+(?:the\s+)?activity|(?:\s+the)?\s+event)\s+.+$/i.test(text)) {
    return "remove-activity";
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

export function parseNoteRequest(request) {
  const text = String(request ?? "").trim().replace(/[’‘]/g, "'");
  const match = text.match(/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:add|write|save|remember|note)(?:\s+(?:a\s+)?(?:private\s+)?note)?(?:\s+(?:that|saying|to my notes))?\s*[:,-]?\s+(.+)[.!?]*$/i);
  const note = match?.[1]?.trim() ?? "";
  return text.match(/\bremember\s+to\b/i) ? note.replace(/^to\s+/i, "") : note;
}

export function parseActivityRequest(request) {
  const text = String(request ?? "").trim();
  const match = text.match(/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:add|schedule|put|plan)(?:\s+(?:an?\s+)?(?:activity|event|task))?(?:\s+to\s+(?:the\s+)?plan)?\s*[:,-]?\s+(.+?)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm))?[.!?]*$/i);
  if (!match) return null;

  const title = match[1].trim().replace(/^(?:a|an|the)\s+/i, "").replace(/[.!?]+$/, "");
  if (!title) return null;
  if (!match[2]) return { title, time: null, period: null };

  const hour = Number(match[2]);
  const minute = Number(match[3] ?? "0");
  const period = match[4].toUpperCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return {
    title,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    period,
  };
}

export function parseActivityRemoval(request) {
  const text = String(request ?? "").trim();
  const match = text.match(/^(?:(?:hey\s+)?hearth[,:]?\s*)?(?:remove|delete|cancel)(?:\s+(?:the\s+)?(?:activity|event))\s+(.+?)[.!?]*$/i);
  return match?.[1]?.trim() ?? "";
}

export function summarizeEveningPlan(plan) {
  return [
    "Here’s the shared plan for tonight:",
    ...plan.events.map((event) => `${event.time} ${event.period} — ${event.title} (${event.state})`),
    "",
    "This summary does not include personal reminders.",
  ].join("\n");
}
