import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import test, { after, before } from "node:test";

let serverProcess;
let serverUrl;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));

  serverUrl = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Test server did not start: ${output}`)), 10_000);
    serverProcess.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
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
        reject(new Error(`Test server exited with code ${code}: ${output}`));
      }
    });
  });
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill();
  await Promise.race([once(serverProcess, "exit"), delay(3000)]);
});

test("serves the NorthStar website and health endpoint", async () => {
  const [pageResponse, healthResponse] = await Promise.all([
    fetch(serverUrl),
    fetch(new URL("/health/live", serverUrl)),
  ]);

  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /NorthStar Logistics \| Freight & Shipping/);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: "ok",
    service: "northstar-logistics",
  });
});

test("returns live dashboard data for shipments, drivers, and Greece allocations", async () => {
  const response = await fetch(new URL("/api/dashboard", serverUrl));
  assert.equal(response.status, 200);

  const dashboard = await response.json();
  assert.ok(Number.isFinite(Date.parse(dashboard.generatedAt)));
  assert.ok(dashboard.shipments.length > 0);
  assert.ok(dashboard.drivers.length > 0);
  assert.ok(dashboard.allocations.some((allocation) => allocation.region === "Greece"));
  assert.ok(dashboard.shipments.every((shipment) => Number.isFinite(Date.parse(shipment.eta))));

  const shipmentsResponse = await fetch(new URL("/api/shipments", serverUrl));
  const driversResponse = await fetch(new URL("/api/drivers", serverUrl));
  const shipments = await shipmentsResponse.json();
  const drivers = await driversResponse.json();
  assert.deepEqual(shipments.map((shipment) => shipment.id), dashboard.shipments.map((shipment) => shipment.id));
  assert.deepEqual(drivers.map((driver) => driver.name), dashboard.drivers.map((driver) => driver.name));
});
