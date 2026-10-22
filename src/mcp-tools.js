import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  addActivity,
  addPrivateNote,
  createInitialPlan,
  createSharePreview,
  deleteLastPrivateNote,
  describePlanChanges,
  planFromRequest,
  removeActivity,
} from "./home-orchestrator.js";

const SERVER_INFO = {
  name: "hearth-evening-relay",
  version: "0.2.0",
  title: "Hearth Evening Relay",
  description: "Privacy-aware household evening planning demo.",
};

let currentPlan = createInitialPlan();
let undoStack = [];
let lastUpdate = null;
const MAX_UNDO_STEPS = 5;

function createToolResult(payload, summary) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: payload,
  };
}

function applyPlanChange(update, summary, changeSummary = null) {
  const previousPlan = currentPlan;
  const result = update(previousPlan);
  if (!result.updated) {
    return createToolResult(
      { reply: result.reply, updated: false },
      result.reply,
    );
  }

  undoStack.push(structuredClone(previousPlan));
  if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
  currentPlan = result.plan;
  const changes = changeSummary
    ? [changeSummary]
    : describePlanChanges(previousPlan, currentPlan);
  lastUpdate = {
    reply: result.reply,
    changes: changes.filter((change) => !/note/i.test(change)),
  };
  const { events, nudge, timer, entryLight, intent } = structuredClone(currentPlan);
  return createToolResult(
    {
      plan: { events, nudge, timer, entryLight, intent },
      reply: result.reply,
      updated: true,
      changes,
      canUndo: undoStack.length > 0,
      ...(summary === "private" ? { notes: structuredClone(currentPlan.privateNotes) } : {}),
    },
    result.reply,
  );
}

export function resetDemoPlan() {
  currentPlan = createInitialPlan();
  undoStack = [];
  lastUpdate = null;
}

export function createHearthMcpServer() {
  const server = new McpServer(SERVER_INFO);

  server.registerTool("get_evening_plan", {
    title: "Get the shared evening plan",
    description: "Read the current household evening timeline and simulated home-device state. Personal reminders are intentionally excluded.",
    inputSchema: {},
  }, async () => {
    const { events, nudge, timer, entryLight, intent } = structuredClone(currentPlan);
    const plan = { events, nudge, timer, entryLight, intent };
    return createToolResult(
      { plan, canUndo: undoStack.length > 0, lastUpdate },
      `There are ${events.length} moments on tonight's shared plan. Personal reminders are excluded.`,
    );
  });

  server.registerTool("adjust_evening_plan", {
    title: "Adjust the evening plan",
    description: "Adapt the demo evening plan to a change such as a late pickup, Nana arriving, or a request for a quiet moment. This only changes local demo state; it never sends messages or controls real devices.",
    inputSchema: {
      request: z.string().trim().min(1).max(240).describe("A short description of what changed or what help is needed."),
    },
  }, async ({ request }) => {
    const result = planFromRequest(currentPlan, request);
    if (!result.updated) return createToolResult({ reply: result.reply, updated: false }, result.reply);
    return applyPlanChange(() => result, "shared");
  });

  server.registerTool("get_private_notes", {
    title: "Read private notes",
    description: "List notes belonging only to the current demo user. These are excluded from shared-plan tools and household update previews.",
    inputSchema: {},
  }, async () => createToolResult(
    { notes: structuredClone(currentPlan.privateNotes) },
    `There are ${currentPlan.privateNotes.length} private notes. They are excluded from shared updates.`,
  ));

  server.registerTool("add_private_note", {
    title: "Add a private note",
    description: "Save a short note for the current demo user. The note is local in-memory demo data and is never included in a shared plan or update preview.",
    inputSchema: {
      note: z.string().trim().min(1).max(240).describe("Private note text, up to 240 characters."),
    },
  }, async ({ note }) => applyPlanChange(
    (plan) => addPrivateNote(plan, note),
    "private",
    "Private note added",
  ));

  server.registerTool("delete_last_private_note", {
    title: "Delete the most recent private note",
    description: "Delete only the current demo user's most recently added private note.",
    inputSchema: {},
  }, async () => applyPlanChange(
    deleteLastPrivateNote,
    "private",
    "Private note removed",
  ));

  server.registerTool("add_activity", {
    title: "Add a demo activity",
    description: "Add a fictional activity to the shared evening timeline. This does not change a real calendar or notify anyone.",
    inputSchema: {
      title: z.string().trim().min(1).max(80).describe("Short activity title."),
      time: z.string().regex(/^\d{2}:\d{2}$/).describe("12-hour clock time, formatted HH:MM."),
      period: z.enum(["AM", "PM"]).describe("Time of day."),
    },
  }, async ({ title, time, period }) => applyPlanChange(
    (plan) => addActivity(plan, { title, time, period }),
    "shared",
  ));

  server.registerTool("remove_activity", {
    title: "Remove a demo activity",
    description: "Remove an activity previously added to the fictional evening plan. Original household events cannot be removed by this tool.",
    inputSchema: {
      title: z.string().trim().min(1).max(80).describe("Exact title of an activity previously added to the demo plan."),
    },
  }, async ({ title }) => applyPlanChange(
    (plan) => removeActivity(plan, title),
    "shared",
  ));

  server.registerTool("undo_last_change", {
    title: "Undo the last plan change",
    description: "Restore the previous fictional evening plan. Up to five recent changes can be undone. This only affects local demo state and never changes real calendars, devices, or people.",
    inputSchema: {},
  }, async () => {
    const previousPlan = undoStack.pop();
    const reply = previousPlan
      ? "Undid the last plan change. Your earlier evening plan is restored."
      : "There isn't a recent plan change to undo.";
    const changes = previousPlan
      ? describePlanChanges(currentPlan, previousPlan)
      : [];
    if (previousPlan) {
      currentPlan = previousPlan;
      lastUpdate = { reply, changes };
    }
    const { events, nudge, timer, entryLight, intent } = structuredClone(currentPlan);
    return createToolResult(
      {
        plan: { events, nudge, timer, entryLight, intent },
        reply,
        changes,
        canUndo: undoStack.length > 0,
      },
      reply,
    );
  });

  server.registerTool("preview_household_update", {
    title: "Preview a household update",
    description: "Prepare a shareable preview of the current shared timeline. It never includes private reminders and does not send anything.",
    inputSchema: {},
  }, async () => {
    const preview = createSharePreview(currentPlan);
    return createToolResult(
      { preview },
      "A reviewable household update is ready. It contains no private reminder and has not been sent.",
    );
  });

  server.registerTool("reset_demo_plan", {
    title: "Reset the demo plan",
    description: "Restore the fictional evening plan to its starting state so the demonstration can be replayed. This does not affect real calendars, devices, or people.",
    inputSchema: {},
  }, async () => {
    resetDemoPlan();
    const { events, nudge, timer, entryLight, intent } = structuredClone(currentPlan);
    const reply = "The fictional evening plan is reset and ready to replay.";
    return createToolResult(
      { plan: { events, nudge, timer, entryLight, intent }, reply },
      reply,
    );
  });

  return server;
}
