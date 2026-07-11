import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let getUsageTopologyProviders;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-topology-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  ({ getUsageTopologyProviders } = await import("@/lib/providers/usageTopologyProviders.js"));
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("usage topology providers", () => {
  it("includes every active router connection, regardless of dashboard owner", async () => {
    const firstUser = await db.createUser({ username: "topology-first", password: "password", role: "user" });
    const secondUser = await db.createUser({ username: "topology-second", password: "password", role: "user" });

    await db.createProviderConnection({
      provider: "topology-provider-first",
      authType: "apikey",
      apiKey: "first-key",
      ownerId: firstUser.id,
    });
    await db.createProviderConnection({
      provider: "topology-provider-second",
      authType: "apikey",
      apiKey: "second-key",
      ownerId: secondUser.id,
    });
    await db.createProviderConnection({
      provider: "topology-provider-inactive",
      authType: "apikey",
      apiKey: "inactive-key",
      ownerId: secondUser.id,
      isActive: false,
    });

    const providers = await getUsageTopologyProviders();
    const providerIds = providers.map((provider) => provider.provider);

    expect(providerIds).toContain("topology-provider-first");
    expect(providerIds).toContain("topology-provider-second");
    expect(providerIds).not.toContain("topology-provider-inactive");
  });
});