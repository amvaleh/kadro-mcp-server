import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerKadroTools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3100);

function buildServer(): McpServer {
  const server = new McpServer({ name: "kadro-booking", version: "1.0.0" });
  registerKadroTools(server);
  return server;
}

const app = express();
app.use(express.json());

// Stateless mode: a fresh server+transport per request. Simple and correct
// for a thin REST-API wrapper with no cross-call session state of its own —
// all real state (holds, reservations) lives in Kadro's own database.
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET/DELETE aren't meaningful in stateless mode (no session to resume or
// end) — the spec allows returning 405 for them.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed — this server runs stateless (POST only)." },
    id: null,
  });
});

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.listen(PORT, () => {
  console.log(`kadro-mcp-server listening on :${PORT} (POST /mcp)`);
  if (!process.env.KADRO_API_TOKEN) {
    console.warn("KADRO_API_TOKEN is not set — every tool call will fail. Run `npm run register` first.");
  }
});
