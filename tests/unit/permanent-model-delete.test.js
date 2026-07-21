import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-model-delete-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  delete global._pendingRequests;
  delete global._pendingTimers;
  delete global._recentRing;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("permanent model deletion", () => {
  it("removes dependent catalog, combo, pricing, and observability data while retaining usage history", async () => {
    const db = await import("@/lib/db/index.js");
    const providerId = "openai-compatible-cascade-test";
    const providerPrefix = "cascade";
    const modelId = "gpt-delete";

    await db.createProviderNode({
      id: providerId,
      type: "openai-compatible",
      name: "Cascade Test Provider",
      prefix: providerPrefix,
      baseUrl: "https://example.invalid/v1",
    });
    await db.setModelAlias("deleted-alias", `${providerPrefix}/${modelId}`);
    await db.setModelAlias("keep-alias", `${providerPrefix}/gpt-keep`);
    await db.addCustomModel({ providerAlias: providerPrefix, id: modelId, type: "llm" });
    await db.addCustomModel({ providerAlias: providerPrefix, id: "gpt-keep", type: "llm" });
    await db.updatePricing({
      [providerPrefix]: {
        [modelId]: { prompt: 1, completion: 2 },
        "gpt-keep": { prompt: 3, completion: 4 },
      },
    });

    const mixedCombo = await db.createCombo({
      name: "cascade-mixed",
      models: [`${providerPrefix}/${modelId}`, `${providerPrefix}/gpt-keep`],
    });
    const aliasCombo = await db.createCombo({
      name: "cascade-alias-only",
      models: ["deleted-alias"],
    });
    await db.updateSettings({
      comboStrategies: {
        [mixedCombo.id]: {
          fallbackStrategy: "fusion",
          judgeModel: "deleted-alias",
        },
        [aliasCombo.id]: { fallbackStrategy: "round-robin" },
      },
    });
    const cliUser = await db.createUser({ username: "cascade-cli-user", password: "password", role: "user" });
    await db.upsertCliToolConfig(cliUser.id, "codex", {
      baseUrl: "http://127.0.0.1:20127",
      codexModel: "deleted-alias",
      codexThinking: "high",
    });
    await db.upsertCliToolConfig(cliUser.id, "cowork", {
      baseUrl: "http://127.0.0.1:20127",
      selectedModels: ["deleted-alias", "deleted-alias", `${providerPrefix}/gpt-keep`],
      coworkThinking: { "deleted-alias": "high", [`${providerPrefix}/gpt-keep`]: "low" },
    });

    await db.saveRequestUsage({
      timestamp: "2026-07-18T10:00:00.000Z",
      provider: providerId,
      model: modelId,
      connectionId: "cascade-connection",
      tokens: { prompt_tokens: 10, completion_tokens: 5 },
      endpoint: "/v1/chat/completions",
    });
    await db.saveRequestUsage({
      timestamp: "2026-07-18T10:01:00.000Z",
      provider: providerPrefix,
      model: `${modelId}(high)`,
      connectionId: "cascade-connection",
      tokens: { prompt_tokens: 20, completion_tokens: 10 },
      endpoint: "/v1/chat/completions",
    });
    await db.saveRequestUsage({
      timestamp: "2026-07-18T10:02:00.000Z",
      provider: providerId,
      model: "gpt-keep",
      connectionId: "cascade-connection",
      tokens: { prompt_tokens: 30, completion_tokens: 15 },
      endpoint: "/v1/chat/completions",
    });

    await db.updateSettings({ enableObservability: true, observabilityBatchSize: 1 });
    await db.saveRequestDetail({
      id: "cascade-deleted-detail",
      provider: providerPrefix,
      model: modelId,
      status: "ok",
      request: {},
      response: {},
    });
    await db.saveRequestDetail({
      id: "cascade-keep-detail",
      provider: providerId,
      model: "gpt-keep",
      status: "ok",
      request: {},
      response: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await db.deleteModelPermanently(providerId, modelId);
    db.purgeRequestDetailBuffer(result.providerAliases, result.modelId);

    expect(result).toMatchObject({
      deleted: true,
      removedAliases: 1,
      removedCustomModels: 1,
      removedPricingEntries: 1,
      removedRequestDetails: 1,
      updatedCliToolConfigs: 2,
      updatedComboIds: [mixedCombo.id],
      deletedComboIds: [aliasCombo.id],
    });
    expect(result.providerAliases).toEqual(expect.arrayContaining([providerId, providerPrefix]));
    expect(await db.isDeletedModel(providerId, modelId)).toBe(true);
    expect(await db.isDeletedModel(providerId, `${modelId}(high)`)).toBe(true);
    expect((await db.getDeletedModels())[providerId]).toContain(modelId);

    expect(await db.getModelAliases()).toEqual({ "keep-alias": `${providerPrefix}/gpt-keep` });
    expect(await db.getCustomModels()).toEqual([
      expect.objectContaining({ providerAlias: providerPrefix, id: "gpt-keep" }),
    ]);
    expect((await db.getPricing())[providerPrefix]).toEqual({
      "gpt-keep": { prompt: 3, completion: 4 },
    });

    expect(await db.getComboById(mixedCombo.id)).toMatchObject({
      models: [`${providerPrefix}/gpt-keep`],
    });
    expect(await db.getComboById(aliasCombo.id)).toBeNull();
    expect((await db.getSettings()).comboStrategies).toEqual({
      [mixedCombo.id]: { fallbackStrategy: "fusion" },
    });
    expect((await db.getCliToolConfig(cliUser.id, "codex")).config).toMatchObject({
      codexModel: "",
      codexThinking: "",
    });
    expect((await db.getCliToolConfig(cliUser.id, "cowork")).config).toMatchObject({
      selectedModels: [`${providerPrefix}/gpt-keep`],
      coworkModelSettings: [{ thinking: "low" }],
    });

    const history = await db.getUsageHistory({});
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: providerId, model: modelId }),
      expect.objectContaining({ provider: providerPrefix, model: `${modelId}(high)` }),
      expect.objectContaining({ provider: providerId, model: "gpt-keep" }),
    ]));
    expect(history).toHaveLength(3);
    const stats = await db.getUsageStats("all");
    expect(stats.totalRequests).toBe(3);
    expect(stats.byModel).toMatchObject({
      [`${modelId} (${providerId})`]: expect.objectContaining({ requests: 1, promptTokens: 10, completionTokens: 5 }),
      [`${modelId}(high) (${providerPrefix})`]: expect.objectContaining({ requests: 1, promptTokens: 20, completionTokens: 10 }),
      [`gpt-keep (${providerId})`]: expect.objectContaining({ requests: 1 }),
    });

    expect(await db.getRequestDetailById("cascade-deleted-detail")).toBeNull();
    expect(await db.getRequestDetailById("cascade-keep-detail")).toMatchObject({ id: "cascade-keep-detail" });

    await db.saveRequestUsage({
      timestamp: "2026-07-18T10:03:00.000Z",
      provider: providerId,
      model: modelId,
      tokens: { prompt_tokens: 100, completion_tokens: 100 },
    });
    await db.saveRequestDetail({
      id: "cascade-deleted-detail-after-tombstone",
      provider: providerId,
      model: modelId,
      status: "ok",
      request: {},
      response: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const historyAfterTombstone = await db.getUsageHistory({});
    expect(historyAfterTombstone).toHaveLength(4);
    expect(historyAfterTombstone).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: providerId,
        model: modelId,
        tokens: expect.objectContaining({ prompt_tokens: 100, completion_tokens: 100 }),
      }),
    ]));
    const statsAfterTombstone = await db.getUsageStats("all");
    expect(statsAfterTombstone.totalRequests).toBe(4);
    expect(statsAfterTombstone.byModel[`${modelId} (${providerId})`]).toMatchObject({
      requests: 2,
      promptTokens: 110,
      completionTokens: 105,
    });
    expect(await db.getRequestDetailById("cascade-deleted-detail-after-tombstone")).toBeNull();

    const backup = await db.exportDb();
    expect(backup.deletedModels).toMatchObject({ [providerId]: [modelId] });

    expect(await db.restoreDeletedModel(providerPrefix, `${modelId}(high)`)).toBe(true);
    expect(await db.isDeletedModel(providerId, modelId)).toBe(false);
    expect(await db.isDeletedModel(providerPrefix, `${modelId}(high)`)).toBe(false);
    expect((await db.getDeletedModels())[providerId]).toBeUndefined();
  });
});
