import { afterAll, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch } from "../helpers/mock-fetch.js";

describe("enableBackup flag plumbing (#18)", () => {
  const fetcher = mockFetch();
  fetcher.install();
  afterAll(() => fetcher.restore());

  it("H-backup-001: enableBackup=false (default) -> no backup tools registered", async () => {
    const { mcp, close } = await startServer({ enableBackup: false });
    try {
      const list = await mcp.listTools();
      const backup = list.tools.filter((t) => /^backup_/.test(t.name));
      expect(backup).toEqual([]);
    } finally {
      await close();
    }
  });

  it("H-backup-002: enableBackup=true -> backup_export and backup_import registered", async () => {
    const { mcp, close } = await startServer({ enableBackup: true });
    try {
      const list = await mcp.listTools();
      const names = list.tools.map((t) => t.name);
      expect(names.length).toBeGreaterThan(0);
      const backup = names.filter((n) => /^backup_/.test(n));
      expect(backup.sort()).toEqual(["backup_export", "backup_import"]);
    } finally {
      await close();
    }
  });

  it("H-backup-003: enableBackup adds exactly 2 tools on top of the base roster", async () => {
    const off = await startServer({ enableBackup: false });
    const on = await startServer({ enableBackup: true });
    try {
      const [offList, onList] = await Promise.all([
        off.mcp.listTools(),
        on.mcp.listTools(),
      ]);
      expect(onList.tools.length).toBe(offList.tools.length + 2);
    } finally {
      await off.close();
      await on.close();
    }
  });
});
