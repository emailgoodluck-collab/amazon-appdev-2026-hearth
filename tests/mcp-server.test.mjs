import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import test, { after, before } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let serverProcess;
let serverUrl;
let client;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));

  serverUrl = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`MCP test server did not start: ${output}`)), 10_000);
    serverProcess.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/);
      if (match) {
        clearTimeout(timer);
        resolve(new URL(match[0]));
      }
    });
    serverProcess.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    serverProcess.once("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`MCP test server exited with code ${code}: ${output}`));
      }
    });
  });

  client = new Client({ name: "hearth-mcp-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(serverUrl));
});

after(async () => {
  if (client) await client.close();
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill();
  await Promise.race([once(serverProcess, "exit"), delay(3000)]);
});

test("serves the required MCP tools over Streamable HTTP and preserves safe shared state", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["adjust_evening_plan", "get_evening_plan", "preview_household_update", "reset_demo_plan", "undo_last_change"],
  );

  const initial = await client.callTool({ name: "get_evening_plan", arguments: {} });
  assert.equal(initial.structuredContent.plan.events[0].time, "5:15");
  assert.equal("privateReminder" in initial.structuredContent.plan, false);
  assert.equal(initial.structuredContent.canUndo, false);

  const adjusted = await client.callTool({
    name: "adjust_evening_plan",
    arguments: { request: "The bus is running 12 minutes late." },
  });
  assert.notEqual(adjusted.isError, true);
  assert.equal(adjusted.structuredContent.updated, true);
  assert.equal(adjusted.structuredContent.plan.events[1].time, "5:42");
  assert.equal(adjusted.structuredContent.canUndo, true);
  assert.match(adjusted.structuredContent.changes.join(" "), /Dinner together.*5:30 PM.*5:42 PM/);
  assert.equal("privateReminder" in adjusted.structuredContent, false);

  const persisted = await client.callTool({ name: "get_evening_plan", arguments: {} });
  assert.equal(persisted.structuredContent.plan.events[0].time, "5:27");
  assert.doesNotMatch(
    JSON.stringify(persisted.structuredContent.lastUpdate),
    /quiet moment|private reminder/i,
  );

  const share = await client.callTool({ name: "preview_household_update", arguments: {} });
  assert.match(share.structuredContent.preview, /Pickup is running late/);
  assert.doesNotMatch(share.structuredContent.preview, /quiet moment|private/i);

  const secondChange = await client.callTool({
    name: "adjust_evening_plan",
    arguments: { request: "Nana is coming at six." },
  });
  assert.equal(secondChange.structuredContent.canUndo, true);

  const undoArrival = await client.callTool({ name: "undo_last_change", arguments: {} });
  assert.equal(undoArrival.structuredContent.plan.entryLight, "Standby · not yet needed");
  assert.equal(undoArrival.structuredContent.plan.events[0].time, "5:27");
  assert.equal(undoArrival.structuredContent.canUndo, true);

  const undoPickup = await client.callTool({ name: "undo_last_change", arguments: {} });
  assert.equal(undoPickup.structuredContent.plan.events[0].time, "5:15");
  assert.equal(undoPickup.structuredContent.canUndo, false);
  assert.equal("privateReminder" in undoPickup.structuredContent.plan, false);

  const reset = await client.callTool({ name: "reset_demo_plan", arguments: {} });
  assert.equal(reset.structuredContent.plan.events[0].time, "5:15");
  assert.match(reset.structuredContent.reply, /reset and ready to replay/);
  assert.equal("privateReminder" in reset.structuredContent.plan, false);
  const noOpUndo = await client.callTool({ name: "undo_last_change", arguments: {} });
  assert.equal(noOpUndo.structuredContent.canUndo, false);
  assert.deepEqual(noOpUndo.structuredContent.changes, []);

  for (const request of [
    "The bus is running late.",
    "Nana is coming at six.",
    "I need ten quiet minutes.",
    "The bus is running late.",
    "Nana is coming at six.",
    "I need ten quiet minutes.",
  ]) {
    await client.callTool({ name: "adjust_evening_plan", arguments: { request } });
  }
  let boundedUndo;
  for (let change = 0; change < 5; change += 1) {
    boundedUndo = await client.callTool({ name: "undo_last_change", arguments: {} });
  }
  assert.equal(boundedUndo.structuredContent.canUndo, false);
  assert.equal(boundedUndo.structuredContent.plan.events[0].time, "5:27");
});

test("rejects untrusted browser origins before processing MCP traffic", async () => {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "origin-test", version: "1.0.0" },
      },
    }),
  });

  assert.equal(response.status, 403);
});
