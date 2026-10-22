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
    privateNotes: [],
  };
}

function eventMinutes(event) {
  const [hour, minute] = event.time.split(":").map(Number);
  const hour24 = event.period === "PM" && hour !== 12
    ? hour + 12
    : event.period === "AM" && hour === 12 ? 0 : hour;
  return hour24 * 60 + minute;
}

function nextActivityId(events) {
  let id = 1;
  while (events.some((event) => event.id === `activity-${id}`)) id += 1;
  return `activity-${id}`;
}

export function addPrivateNote(currentPlan, note) {
  const text = String(note ?? "").trim();
  if (!text) return { plan: currentPlan, updated: false, reply: "Tell me what you want the private note to say." };
  if (text.length > 240) {
    return { plan: currentPlan, updated: false, reply: "Keep the private note under 240 characters, please." };
  }

  const plan = structuredClone(currentPlan);
  plan.privateNotes.push({ id: `note-${Date.now()}-${plan.privateNotes.length}`, text });
  return {
    plan,
    updated: true,
    reply: "I saved that as a private note. It won't appear in the shared plan or family update.",
  };
}

export function deleteLastPrivateNote(currentPlan) {
  if (!currentPlan.privateNotes.length) {
    return { plan: currentPlan, updated: false, reply: "There are no private notes to delete." };
  }
  const plan = structuredClone(currentPlan);
  plan.privateNotes.pop();
  return {
    plan,
    updated: true,
    reply: "I deleted your most recent private note. It wasn't part of the shared plan.",
  };
}

export function addActivity(currentPlan, { title, time, period }) {
  const safeTitle = String(title ?? "").trim();
  if (!safeTitle || safeTitle.length > 80) {
    return { plan: currentPlan, updated: false, reply: "Give the activity a short title, up to 80 characters." };
  }
  if (!time || !period) {
    return { plan: currentPlan, updated: false, needsTime: true, title: safeTitle };
  }

  const plan = structuredClone(currentPlan);
  plan.events.push({
    id: nextActivityId(plan.events),
    time,
    period,
    title: safeTitle,
    detail: "Added to the demo plan",
    tone: "lavender",
    icon: "•",
    state: "Planned",
  });
  plan.events.sort((left, right) => eventMinutes(left) - eventMinutes(right));
  plan.intent = "activity-added";
  return {
    plan,
    updated: true,
    reply: `I added ${safeTitle} at ${time} ${period} to tonight's demo plan.`,
  };
}

export function removeActivity(currentPlan, title) {
  const normalizedTitle = String(title ?? "").trim().toLowerCase();
  const activityIndex = currentPlan.events.findIndex((event) =>
    event.id.startsWith("activity-")
    && event.title.toLowerCase() === normalizedTitle);
  if (activityIndex === -1) {
    return {
      plan: currentPlan,
      updated: false,
      reply: "I couldn't find that added activity. Ask me to show tonight's plan to check its name.",
    };
  }

  const plan = structuredClone(currentPlan);
  const [removed] = plan.events.splice(activityIndex, 1);
  plan.intent = "activity-removed";
  return {
    plan,
    updated: true,
    reply: `I removed ${removed.title} from tonight's demo plan.`,
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

  for (const nextEvent of nextPlan.events) {
    if (!previousPlan.events.some((event) => event.id === nextEvent.id)) {
      changes.push(`Activity added: ${nextEvent.title} at ${nextEvent.time} ${nextEvent.period}`);
    }
  }
  for (const previousEvent of previousPlan.events) {
    if (!nextPlan.events.some((event) => event.id === previousEvent.id)) {
      changes.push(`Activity removed: ${previousEvent.title}`);
    }
  }
  if (previousPlan.privateNotes.length !== nextPlan.privateNotes.length) {
    const difference = nextPlan.privateNotes.length - previousPlan.privateNotes.length;
    changes.push(difference > 0 ? "Private note added" : "Private note removed");
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
