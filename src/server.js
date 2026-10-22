import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const rootDir = fileURLToPath(new URL("../", import.meta.url));

function timeLabel(offsetHours = 0) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function buildDashboard() {
  const now = new Date();
  const summary = [
    { label: "Active shipments", value: "12,480", delta: "+4.2% vs yesterday" },
    { label: "On-time delivery", value: "99.94%", delta: "+0.3 pts" },
    { label: "Drivers online", value: "4,860", delta: "91% active" },
    { label: "Hubs covered", value: "18", delta: "8 regions" },
  ];

  const feed = [
    { time: timeLabel(-2), text: "Rotterdam hub cleared customs for EU-2147" },
    { time: timeLabel(-1), text: "Athens control allocated 3 refrigerated loads" },
    { time: timeLabel(0), text: "Chicago lane updated ETA for US-5401" },
    { time: timeLabel(1), text: "Driver D-183 checked in at Milan transfer point" },
  ];

  const shipments = [
    { id: "EU-2147", route: "Athens → Rotterdam", mode: "Road Freight", status: "In transit", eta: new Date(now.getTime() + 2.5 * 60 * 60 * 1000).toISOString(), progress: 74 },
    { id: "US-5401", route: "Chicago → Newark", mode: "Air Priority", status: "Cleared", eta: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(), progress: 63 },
    { id: "GR-1189", route: "Piraeus → Thessaloniki", mode: "Regional LTL", status: "Loading", eta: new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString(), progress: 41 },
    { id: "FR-8840", route: "Paris → Madrid", mode: "Express", status: "Delayed", eta: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(), progress: 52 },
  ];

  const drivers = [
    { name: "Mila Dimas", region: "Athens", status: "Available", vehicle: "Euro 6 Truck", load: "3 pallets" },
    { name: "Leo Kosta", region: "Rotterdam", status: "On route", vehicle: "Container Van", load: "12 pallets" },
    { name: "Nora Voss", region: "Chicago", status: "Available", vehicle: "Linehaul", load: "Full trailer" },
    { name: "Omar Elian", region: "Milan", status: "Break", vehicle: "Express Van", load: "2 pallets" },
  ];

  const allocations = [
    { region: "Greece", assigned: 42, utilization: 88, focus: "Ports, cold chain, last-mile" },
    { region: "Western Europe", assigned: 168, utilization: 94, focus: "Cross-dock and route balancing" },
    { region: "United States", assigned: 244, utilization: 81, focus: "Priority linehaul and priority sectors" },
  ];

  const highlights = [
    "Same-day dispatch coverage from Athens and Rotterdam",
    "Live customs and route visibility for EU/US lanes",
    "Multi-stop control for express freight and warehouse transfer",
  ];

  return {
    generatedAt: now.toISOString(),
    summary,
    feed,
    shipments,
    drivers,
    allocations,
    highlights,
  };
}

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "northstar-logistics" });
});

app.get("/api/dashboard", (_req, res) => {
  res.json(buildDashboard());
});

app.get("/api/shipments", (_req, res) => {
  res.json(buildDashboard().shipments);
});

app.get("/api/drivers", (_req, res) => {
  res.json(buildDashboard().drivers);
});

app.use(express.static(rootDir, {
  fallthrough: true,
  index: "index.html",
  maxAge: 0,
}));

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.use((_req, res) => {
  res.status(404).type("text/plain").send("Not found");
});

const server = app.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : PORT;
  console.log(`NorthStar Logistics running at http://${HOST}:${actualPort}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error("Failed to stop server gracefully:", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
