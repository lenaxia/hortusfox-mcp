#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, type Config } from "./config.js";
import { HortusFoxClient } from "./client.js";
import { HortusFoxError } from "./errors.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";

export interface AssembledServer {
  server: McpServer;
  client: HortusFoxClient;
  config: Config;
}

export function createServer(config: Config): AssembledServer {
  const client = new HortusFoxClient(config);
  const server = new McpServer({
    name: "hortusfox",
    version: "0.1.0",
  });
  registerAllResources(server, client);
  registerAllTools(server, client, config);
  server.server.onerror = (err) => {
    if (err instanceof HortusFoxError) {
      console.error(`[hortusfox-mcp] ${err.kind}: ${err.message}`);
    } else {
      console.error(`[hortusfox-mcp] error:`, err);
    }
  };
  return { server, client, config };
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const { server } = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[hortusfox-mcp] fatal:", err);
    process.exit(1);
  });
}
