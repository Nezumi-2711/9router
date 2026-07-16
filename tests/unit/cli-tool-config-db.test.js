import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let ownerOne;
let ownerTwo;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-cli-tool-config-"));
  process.env.DATA_DIR = tempDir;
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  ownerOne = await db.createUser({ username: "cli-owner-one", password: "password", role: "admin" });
  ownerTwo = await db.createUser({ username: "cli-owner-two", password: "password", role: "user" });
});

afterAll(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

const claudeConfig = (model) => ({
  baseUrl: "https://router.example/v1",
  apiKeyMode: "managed",
  apiKeyId: null,
  claudeModels: { sonnet: model, opus: "", haiku: "" },
  claudeThinking: { sonnet: "high" },
});

describe("CLI tool configuration persistence", () => {
  it("round-trips and atomically overwrites one owner/tool row", async () => {
    const created = await db.upsertCliToolConfig(ownerOne.id, "claude", claudeConfig("cc/sonnet-a"));
    expect(created).toMatchObject({ ownerId: ownerOne.id, toolId: "claude", config: claudeConfig("cc/sonnet-a") });

    const updated = await db.upsertCliToolConfig(ownerOne.id, "claude", claudeConfig("cc/sonnet-b"));
    expect(updated.config.claudeModels.sonnet).toBe("cc/sonnet-b");
    expect((await db.getCliToolConfigsByOwnerId(ownerOne.id)).filter((row) => row.toolId === "claude")).toHaveLength(1);
  });

  it("isolates users and permits concurrent saves to different tools", async () => {
    await Promise.all([
      db.upsertCliToolConfig(ownerOne.id, "cursor", {
        apiKeyMode: "custom",
        selectedModels: ["cc/a", "cx/b"],
      }),
      db.upsertCliToolConfig(ownerTwo.id, "cursor", {
        apiKeyMode: "managed",
        apiKeyId: null,
        selectedModels: ["gg/c"],
      }),
      db.upsertCliToolConfig(ownerOne.id, "codex", {
        baseUrl: "https://router.example/v1",
        apiKeyMode: "managed",
        apiKeyId: null,
        codexModel: "cx/gpt",
        codexThinking: "high",
      }),
    ]);

    expect((await db.getCliToolConfig(ownerOne.id, "cursor")).config.selectedModels).toEqual(["cc/a", "cx/b"]);
    expect((await db.getCliToolConfig(ownerTwo.id, "cursor")).config.selectedModels).toEqual(["gg/c"]);
    expect((await db.getCliToolConfig(ownerOne.id, "codex")).config.codexModel).toBe("cx/gpt");
  });

  it("includes valid configurations in export/import and skips malformed rows", async () => {
    const exported = await db.exportDb();
    expect(exported.cliToolConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: ownerOne.id, toolId: "claude" }),
      expect.objectContaining({ ownerId: ownerTwo.id, toolId: "cursor" }),
    ]));

    exported.cliToolConfigs.push({
      ownerId: ownerOne.id,
      toolId: "kiro",
      config: { apiKey: "must-not-import" },
    });
    await db.importDb(exported);

    expect(await db.getCliToolConfig(ownerOne.id, "claude")).not.toBeNull();
    expect(await db.getCliToolConfig(ownerOne.id, "kiro")).toBeNull();
  });

  it("removes configurations when their owner is deleted", async () => {
    const disposable = await db.createUser({ username: "cli-disposable", password: "password", role: "user" });
    await db.upsertCliToolConfig(disposable.id, "cursor", {
      apiKeyMode: "managed",
      apiKeyId: null,
      selectedModels: ["cc/a"],
    });

    expect(await db.deleteUser(disposable.id)).toBe(true);
    expect(await db.getCliToolConfig(disposable.id, "cursor")).toBeNull();
  });
});
