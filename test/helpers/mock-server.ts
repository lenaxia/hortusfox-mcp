import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../../src/config.js";
import { HortusFoxClient } from "../../src/client.js";
import { registerAllResources } from "../../src/resources/index.js";
import { registerAllTools } from "../../src/tools/index.js";

export interface TestServer {
  server: McpServer;
  client: HortusFoxClient;
  mcp: Client;
  close(): Promise<void>;
}

export async function startServer(
  configOverrides: Partial<Config> = {},
): Promise<TestServer> {
  const config: Config = {
    baseUrl: "http://mock.test",
    apiToken: "test-token-abcdef",
    verifyTls: true,
    timeoutMs: 10_000,
    enableWrites: true,
    enableBackup: false,
    maxRatePerSec: 1000,
    ...configOverrides,
  };
  const hortusfox = new HortusFoxClient(config);
  const server = new McpServer({ name: "hortusfox-test", version: "0.0.0" });
  registerAllResources(server, hortusfox);
  registerAllTools(server, hortusfox, config);

  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcp = new Client({ name: "test-client", version: "0.0.0" });
  await mcp.connect(clientTransport);

  return {
    server,
    client: hortusfox,
    mcp,
    async close() {
      await mcp.close();
    },
  };
}
