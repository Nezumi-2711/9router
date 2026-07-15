import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-admin-providers-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("administrator provider connections", () => {
  it("rejects provider credentials owned by a regular user", async () => {
    const db = await import("@/lib/db/index.js");
    const user = await db.createUser({ username: "provider-member", password: "password", role: "user" });

    await expect(db.createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "Member key",
      apiKey: "secret",
      ownerId: user.id,
    })).rejects.toMatchObject({
      message: "Provider connections require an administrator owner",
      status: 403,
    });
  });

  it("removes user and orphan credentials while retaining legacy credentials for an administrator", async () => {
    const db = await import("@/lib/db/index.js");
    const { getAdapter } = await import("@/lib/db/driver.js");
    const migration = (await import("@/lib/db/migrations/007-admin-provider-connections.js")).default;
    const admin = await db.createUser({ username: "migration-admin", password: "password", role: "admin" });
    const member = await db.createUser({ username: "migration-member", password: "password", role: "user" });
    const adapter = await getAdapter();
    const now = new Date().toISOString();

    for (const [id, ownerId] of [["legacy", null], ["member", member.id], ["orphan", "missing-user"], ["admin", admin.id]]) {
      adapter.run(
        `INSERT INTO providerConnections(id, provider, authType, ownerId, isActive, data, createdAt, updatedAt)
         VALUES(?, 'openai', 'apikey', ?, 1, '{}', ?, ?)`,
        [id, ownerId, now, now],
      );
    }

    adapter.transaction(() => migration.up(adapter));

    const remaining = await db.getProviderConnections();
    expect(remaining.map((connection) => connection.id).sort()).toEqual(["admin", "legacy"]);
    const firstAdmin = (await db.getUsers()).find((user) => user.role === "admin");
    expect(remaining.find((connection) => connection.id === "legacy")?.ownerId).toBe(firstAdmin.id);
  });
});