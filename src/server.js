import express from "express";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createHearthMcpServer } from "./mcp-tools.js";

const PORT = Number.parseInt(process.env.PORT ?? "5173", 10);
const HOST = process.env.HOST ?? "127.0.0.1";
const defaultOrigin = `http://localhost:${PORT},http://127.0.0.1:${PORT}`;
const allowedOrigins = new Set(
  (process.env.HEARTH_ALLOWED_ORIGINS ?? defaultOrigin)
    .split(",")
    .map((origin) => new URL(origin.trim()).origin),
);
const allowedHosts = new Set([
  "localhost",
  "127.0.0.1",
  ...[...allowedOrigins]
    .map((origin) => new URL(origin).hostname.toLowerCase()),
]);
const staticDirectory = fileURLToPath(new URL("../", import.meta.url));
const app = express();

app.disable("x-powered-by");
app.use("/mcp", (req, res, next) => {
  const hostHeader = req.get("host")?.toLowerCase();
  const host = hostHeader?.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader?.split(":")[0];
  if (!host || !allowedHosts.has(host)) {
    res.status(403).json({ error: "Host is not authorized." });
    return;
  }
  const origin = req.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "Origin is not authorized." });
    return;
  }
  next();
});
app.use(express.json({ limit: "32kb", type: "application/json" }));

app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "hearth-evening-relay" });
});

app.post("/mcp", async (req, res) => {
  const server = createHearthMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: req.body?.id ?? null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.set("Allow", "POST").status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "This stateless MCP endpoint does not offer a server-initiated stream." },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.set("Allow", "POST").status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "This stateless MCP endpoint does not use sessions." },
    id: null,
  });
});

app.use(express.static(staticDirectory, {
  fallthrough: true,
  etag: true,
  maxAge: 0,
}));

app.use((_req, res) => {
  res.status(404).type("text/plain").send("Not found");
});

const httpServer = app.listen(PORT, HOST, () => {
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`Hearth MCP listening at http://${HOST}:${port}/mcp`);
});

function shutdown() {
  httpServer.close((error) => {
    if (error) {
      console.error("Failed to close Hearth server cleanly:", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
