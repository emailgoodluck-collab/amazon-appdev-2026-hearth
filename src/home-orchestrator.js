const BASE_EVENTS = [
  {
    id: "pickup",
    time: "5:15",
    period: "PM",
    title: "School pickup",
    detail: "Nora · East gate",
    tone: "lavender",
    icon: "↗",
    state: "On the way",
  },
  {
    id: "dinner",
    time: "5:30",
    period: "PM",
    title: "Dinner together",
    detail: "Kitchen · 18 min left",
    tone: "peach",
    icon: "◒",
    state: "In progress",
  },
  {
    id: "nana",
    time: "6:00",
    period: "PM",
    title: "Nana comes by",
    detail: "A little time together",
    tone: "mint",
    icon: "⌂",
    state: "Planned",
  },
];

export function createInitialPlan() {
  return {
    intent: "welcome",
    events: structuredClone(BASE_EVENTS),
    nudge: "The plan is full, but it doesn't have to feel rushed.",
    timer: "18 min remaining",
    entryLight: "Standby · not yet needed",
    messages: [],
    privateReminder: "Take a quiet moment before dinner.",
  };
}

export function planFromRequest(currentPlan, request) {
  const text = String(request ?? "").trim();
  if (!text) return { plan: currentPlan, reply: null };

  const plan = structuredClone(currentPlan);
  const message = text.toLowerCase();

  if (/\b(bus|late|pickup|pick-up|running behind)\b/.test(message)) {
    plan.intent = "late-pickup";
    plan.events = plan.events.map((event) => {
      if (event.id === "pickup") {
        return {
          ...event,
          time: "5:27",
          title: "Pickup is running late",
          detail: "Nora · about 12 minutes",
          state: "Updated",
        };
      }
      if (event.id === "dinner") {
        return {
          ...event,
          time: "5:42",
          title: "Dinner, when you’re ready",
          detail: "Kitchen · timer adjusted",
          state: "Flexible",
        };
      }
      return event;
    });
    plan.timer = "Paused · ready when you are";
    plan.nudge = "I moved dinner back 12 minutes. You have room to meet Nora first.";
    return {
      plan,
      updated: true,
      reply: "Got it. Nora’s pickup is about 12 minutes late, so I shifted dinner to 5:42 and paused the kitchen timer. You can focus on meeting her; the rest of the plan can wait.",
    };
  }

  if (/\b(nana|grandma|arrival|arriv|visit|coming|guest)\b/.test(message)) {
    plan.intent = "nana-arrival";
    plan.entryLight = "On · arrival at 6";
    plan.events = plan.events.map((event) => event.id === "nana"
      ? { ...event, detail: "Front light ready · arrival at 6", state: "Ready" }
      : event);
    plan.nudge = "The entry light is ready for Nana. Your private reminder stays just yours.";
    return {
      plan,
      updated: true,
      reply: "I’ve got Nana arriving at six. The entry light is ready, and your personal reminders stay private.",
    };
  }

  if (/\b(quiet|break|rest|pause|overwhelmed|minute|moment)\b/.test(message)) {
    plan.intent = "quiet-minute";
    plan.events = plan.events.map((event) => event.id === "dinner"
      ? { ...event, time: "5:40", title: "A quiet moment, then dinner", detail: "Kitchen · timer paused", state: "No rush" }
      : event);
    plan.timer = "Paused · 10-minute reset";
    plan.nudge = "I made ten quiet minutes for you. Nothing else needs your attention right now.";
    return {
      plan,
      updated: true,
      reply: "Of course. I’ve paused the kitchen timer and made ten quiet minutes for you before dinner. I won’t share this personal reminder with anyone.",
    };
  }

  return {
    plan: currentPlan,
    updated: false,
    reply: "I’m here. In this demo, try telling me the bus is late, that Nana is coming, or that you need a quiet moment. I’ll adjust the plan without sending anything.",
  };
}

export function describePlanChanges(previousPlan, nextPlan) {
  const changes = [];
  for (const nextEvent of nextPlan.events) {
    const previousEvent = previousPlan.events.find((event) => event.id === nextEvent.id);
    if (!previousEvent) continue;

    const details = [];
    if (previousEvent.time !== nextEvent.time || previousEvent.period !== nextEvent.period) {
      details.push(
        `${previousEvent.time} ${previousEvent.period} → ${nextEvent.time} ${nextEvent.period}`,
      );
    }
    if (previousEvent.state !== nextEvent.state) {
      details.push(`${previousEvent.state} → ${nextEvent.state}`);
    }
    if (details.length) {
      const title = previousEvent.title === nextEvent.title
        ? nextEvent.title
        : `${previousEvent.title} → ${nextEvent.title}`;
      changes.push(`${title}: ${details.join(" · ")}`);
    }
  }

  if (previousPlan.timer !== nextPlan.timer) {
    changes.push(`Kitchen timer: ${previousPlan.timer} → ${nextPlan.timer}`);
  }
  if (previousPlan.entryLight !== nextPlan.entryLight) {
    changes.push(`Entry light: ${previousPlan.entryLight} → ${nextPlan.entryLight}`);
  }
  return changes;
}

export function createSharePreview(plan) {
  const events = plan.events.map(({ time, period, title }) => `${time} ${period} — ${title}`);
  return [
    "A small update to tonight’s plan:",
    ...events,
    "",
    "Review this before sharing.",
  ].join("\n");
}
