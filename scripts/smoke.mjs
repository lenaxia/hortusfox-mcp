import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], {
  env: {
    ...process.env,
    HORTUSFOX_BASE_URL: "http://localhost:8080",
    HORTUSFOX_API_TOKEN: "test-token-1234567890",
  },
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});

let step = 0;
function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

function handle(msg) {
  if (step === 0 && msg.id === 1) {
    console.log("initialize OK:", msg.result?.serverInfo);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    step = 1;
  } else if (step === 1 && msg.id === 2) {
    const tools = msg.result.tools.map((t) => t.name);
    console.log(`tools (${tools.length}):`, tools.join(", "));
    send({ jsonrpc: "2.0", id: 3, method: "resources/list" });
    step = 2;
  } else if (step === 2 && msg.id === 3) {
    const resources = msg.result.resources.map((r) => `${r.name} -> ${r.uri}`);
    console.log(`resources (${resources.length}):`, resources.join(", "));
    child.kill();
    process.exit(0);
  }
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.1" },
  },
});

setTimeout(() => {
  console.error("TIMEOUT");
  child.kill();
  process.exit(1);
}, 5000);
