import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCurrentDashboardUser = vi.fn();
const getApiKeyByIdAndOwnerId = vi.fn();
const getCliToolConfig = vi.fn();
const upsertCliToolConfig = vi.fn();

vi.mock("next/server", () => ({
  NextResponse: {
    json(body, init = {}) {
      return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
}));
vi.mock("@/lib/auth/currentUser", () => ({ requireCurrentDashboardUser }));
vi.mock("@/lib/db/index.js", () => ({
  getApiKeyByIdAndOwnerId,
  getCliToolConfig,
  upsertCliToolConfig,
}));

const { GET, PUT } = await import("@/app/api/cli-tools/config/[toolId]/route.js");
const context = (toolId) => ({ params: Promise.resolve({ toolId }) });
const putRequest = (body) => new Request("https://9router.local/api/cli-tools/config/claude", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("/api/cli-tools/config/[toolId]", () => {
  beforeEach(() => {
    requireCurrentDashboardUser.mockReset();
    getApiKeyByIdAndOwnerId.mockReset();
    getCliToolConfig.mockReset();
    upsertCliToolConfig.mockReset();
    requireCurrentDashboardUser.mockResolvedValue({ id: "user-1", role: "user" });
  });

  it("returns only the authenticated user's saved config without caching", async () => {
    getCliToolConfig.mockResolvedValue({
      config: { apiKeyMode: "custom", apiKeyId: null, selectedModels: ["cc/a"] },
      updatedAt: "2026-07-16T00:00:00.000Z",
    });

    const response = await GET(new Request("https://9router.local"), context("cursor"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getCliToolConfig).toHaveBeenCalledWith("user-1", "cursor");
    await expect(response.json()).resolves.toEqual({
      config: { apiKeyMode: "custom", apiKeyId: null, selectedModels: ["cc/a"] },
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
  });

  it("rejects unauthenticated and MITM tool requests", async () => {
    requireCurrentDashboardUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await GET(new Request("https://9router.local"), context("cursor"))).status).toBe(401);
    expect((await GET(new Request("https://9router.local"), context("kiro"))).status).toBe(404);
    expect(getCliToolConfig).not.toHaveBeenCalled();
  });

  it("validates managed key ownership before saving", async () => {
    getApiKeyByIdAndOwnerId.mockResolvedValue(null);
    const response = await PUT(putRequest({
      baseUrl: "https://router.example/v1",
      apiKeyMode: "managed",
      apiKeyId: "foreign-key",
      claudeModels: {},
      claudeThinking: {},
    }), context("claude"));

    expect(response.status).toBe(404);
    expect(getApiKeyByIdAndOwnerId).toHaveBeenCalledWith("foreign-key", "user-1");
    expect(upsertCliToolConfig).not.toHaveBeenCalled();
  });

  it("normalizes a custom-key config without persisting plaintext", async () => {
    upsertCliToolConfig.mockImplementation(async (ownerId, toolId, config) => ({
      ownerId,
      toolId,
      config,
      updatedAt: "2026-07-16T00:00:00.000Z",
    }));
    const response = await PUT(putRequest({
      baseUrl: "https://router.example/v1/",
      apiKeyMode: "custom",
      apiKeyId: "ignored-key-id",
      claudeModels: { sonnet: "cc/sonnet" },
      claudeThinking: { sonnet: "high" },
    }), context("claude"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config).toMatchObject({ apiKeyMode: "custom", apiKeyId: null });
    expect(JSON.stringify(body)).not.toContain("ignored-key-id");
    expect(getApiKeyByIdAndOwnerId).not.toHaveBeenCalled();
  });

  it("rejects plaintext API keys and malformed JSON", async () => {
    const secretResponse = await PUT(putRequest({
      baseUrl: "https://router.example/v1",
      apiKeyMode: "custom",
      apiKey: "secret-value",
      claudeModels: {},
    }), context("claude"));
    expect(secretResponse.status).toBe(400);
    expect(JSON.stringify(await secretResponse.json())).not.toContain("secret-value");

    const malformedResponse = await PUT(new Request("https://9router.local", {
      method: "PUT",
      body: "{",
    }), context("claude"));
    expect(malformedResponse.status).toBe(400);
    expect(upsertCliToolConfig).not.toHaveBeenCalled();
  });
});
