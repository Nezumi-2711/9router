import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-roles-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("usage role breakdowns", () => {
  it("attributes requests to the API key owner and exposes breakdowns by role", async () => {
    const keyOwner = await db.createUser({ username: "usage-key-owner", password: "password", role: "user" });
    const connectionOwner = await db.createUser({ username: "usage-connection-owner", password: "password", role: "user" });
    const admin = await db.createUser({ username: "usage-admin", password: "password", role: "admin" });
    const apiKey = await db.createApiKey("usage-owned-key", "usage-machine", keyOwner.id);
    const connection = await db.createProviderConnection({
      provider: "usage-test",
      authType: "apikey",
      name: "usage connection",
      apiKey: "upstream-key",
      ownerId: connectionOwner.id,
    });

    await db.saveRequestUsage({
      timestamp: new Date().toISOString(),
      provider: "usage-test",
      model: "test-model",
      connectionId: connection.id,
      apiKey: apiKey.key,
      endpoint: "/v1/chat/completions",
      tokens: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const keyOwnerStats = await db.getUsageStats("24h", keyOwner);
    expect(keyOwnerStats.totalRequests).toBe(1);
    expect(keyOwnerStats.availableTableViews).toEqual(["model", "endpoint"]);
    expect(keyOwnerStats).not.toHaveProperty("byUser");
    expect(keyOwnerStats).not.toHaveProperty("byApiKey");
    expect(keyOwnerStats).not.toHaveProperty("byAccount");

    const connectionOwnerStats = await db.getUsageStats("24h", connectionOwner);
    expect(connectionOwnerStats.totalRequests).toBe(0);

    const adminStats = await db.getUsageStats("24h", admin);
    expect(adminStats.availableTableViews).toEqual(["model", "user", "apiKey", "endpoint"]);
    expect(Object.values(adminStats.byUser)).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: keyOwner.username, requests: 1 }),
    ]));
  });
});