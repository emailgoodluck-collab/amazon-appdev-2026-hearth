import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { createInitialPlan, createSharePreview, planFromRequest } from "./home-orchestrator.js";

const SERVER_INFO = {
  name: "hearth-evening-relay",
  version: "0.2.0",
  title: "Hearth Evening Relay",
  description: "Privacy-aware household evening planning demo.",
};

let currentPlan = createInitialPlan();

function createToolResult(payload, summary) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: payload,
  };
}

export function resetDemoPlan() {
  currentPlan = createInitialPlan();
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
    return createToolResult({ plan }, `There are ${events.length} moments on tonight's shared plan. Personal reminders are excluded.`);
  });

  server.registerTool("adjust_evening_plan", {
    title: "Adjust the evening plan",
    description: "Adapt the demo evening plan to a change such as a late pickup, Nana arriving, or a request for a quiet moment. This only changes local demo state; it never sends messages or controls real devices.",
    inputSchema: {
      request: z.string().trim().min(1).max(240).describe("A short description of what changed or what help is needed."),
    },
  }, async ({ request }) => {
    const result = planFromRequest(currentPlan, request);
    currentPlan = result.plan;
    const { events, nudge, timer, entryLight, intent } = structuredClone(currentPlan);
    const plan = { events, nudge, timer, entryLight, intent };
    return createToolResult(
      { plan, reply: result.reply, updated: result.updated },
      result.reply,
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
