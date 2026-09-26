import "dotenv/config";
import express from "express";
import cors from "cors";
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

// This is a public MCP server meant to be called by any AI platform's
// connector infrastructure, not a fixed set of web origins — without this,
// a CORS-enforcing client's preflight OPTIONS request gets no
// Access-Control-Allow-Origin header, silently fails, and the real POST
// never happens. That's indistinguishable from the server being down to
// whoever's calling it (confirmed: this is exactly what broke ChatGPT's and
// Claude's connectors — OPTIONS was returning 200 with zero CORS headers).
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Mcp-Protocol-Version", "Mcp-Session-Id"],
    exposedHeaders: ["Mcp-Session-Id"],
  })
);
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
