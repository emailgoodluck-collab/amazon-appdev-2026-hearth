const PROTOCOL_VERSION = "2025-11-25";
const ACCEPT = "application/json, text/event-stream";

export class HearthMcpClient {
  constructor(endpoint = "/mcp") {
    this.endpoint = endpoint;
    this.requestId = 0;
    this.protocolVersion = null;
  }

  async connect() {
    if (this.protocolVersion) return;
    const result = await this.sendRequest("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "hearth-web-demo", version: "0.2.0" },
    });
    if (result.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(`MCP server negotiated unsupported protocol ${result.protocolVersion}.`);
    }
    this.protocolVersion = result.protocolVersion;
    await this.sendNotification("notifications/initialized");
    const { tools } = await this.sendRequest("tools/list", {});
    const requiredTools = [
      "get_evening_plan",
      "adjust_evening_plan",
      "undo_last_change",
      "preview_household_update",
      "reset_demo_plan",
    ];
    const availableTools = new Set(tools?.map((tool) => tool.name) ?? []);
    const missingTool = requiredTools.find((name) => !availableTools.has(name));
    if (missingTool) throw new Error(`MCP server is missing required tool ${missingTool}.`);
  }

  async listTools() {
    await this.connect();
    return this.sendRequest("tools/list", {});
  }

  async callTool(name, args = {}) {
    await this.connect();
    const result = await this.sendRequest("tools/call", { name, arguments: args });
    if (result.isError) {
      const message = result.content?.find((item) => item.type === "text")?.text;
      throw new Error(message || `MCP tool ${name} failed.`);
    }
    if (result.structuredContent) return result.structuredContent;
    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text) throw new Error(`MCP tool ${name} returned no usable result.`);
    return JSON.parse(text);
  }

  async sendNotification(method, params = undefined) {
    const body = { jsonrpc: "2.0", method };
    if (params !== undefined) body.params = params;
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (response.status !== 202) {
      throw new Error(`MCP notification failed with HTTP ${response.status}.`);
    }
  }

  async sendRequest(method, params) {
    const id = ++this.requestId;
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) {
      throw new Error(`MCP ${method} failed with HTTP ${response.status}.`);
    }

    const message = await parseResponse(response, id);
    if (message.error) {
      throw new Error(message.error.message || `MCP ${method} failed.`);
    }
    if (message.id !== id || !message.result) {
      throw new Error(`MCP ${method} returned an invalid response.`);
    }
    return message.result;
  }

  headers() {
    const headers = {
      Accept: ACCEPT,
      "Content-Type": "application/json",
    };
    if (this.protocolVersion) headers["MCP-Protocol-Version"] = this.protocolVersion;
    return headers;
  }
}

async function parseResponse(response, requestId) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  if (!contentType.includes("text/event-stream")) {
    throw new Error(`MCP server returned unsupported content type ${contentType || "(missing)"}.`);
  }

  const text = await response.text();
  for (const frame of text.split(/\r?\n\r?\n/)) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .join("\n");
    if (!data) continue;
    const message = JSON.parse(data);
    if (message.id === requestId) return message;
  }
  throw new Error("MCP server closed its event stream without the matching response.");
}
