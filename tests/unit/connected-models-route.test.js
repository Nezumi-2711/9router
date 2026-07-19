import { beforeEach, describe, expect, it, vi } from "vitest";

const getModelAliases = vi.fn();
const getProviderConnections = vi.fn();
const getCustomModels = vi.fn();
const getProviderNodes = vi.fn();
const getUsers = vi.fn();
const getDeletedModels = vi.fn();
const requireUsageDashboardUser = vi.fn();
const getCapabilitiesForModel = vi.fn();

vi.mock("@/models", () => ({
  getCustomModels,
  getModelAliases,
  getProviderConnections,
  getProviderNodes,
}));

vi.mock("@/lib/db", () => ({ getUsers, getDeletedModels }));

vi.mock("@/lib/auth/currentUser", () => ({
  requireUsageDashboardUser,
}));
vi.mock("open-sse/config/providerModels.js", () => ({
  getModelsByProviderId: (providerId) => ({
    alpha: [
      { id: "enabled", name: "Enabled model" },
      { id: "alternative", name: "Alternative model" },
    ],
    beta: [{ id: "inactive", name: "Inactive provider model" }],
    "orbit-provider": [
      { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    ],
  }[providerId] || []),
}));
vi.mock("@/shared/constants/providers", () => {
  const providers = {
    alpha: { id: "alpha", alias: "alpha-alias", name: "Alpha", color: "#111111" },
    beta: { id: "beta", alias: "beta-alias", name: "Beta", color: "#222222" },
    "orbit-provider": { id: "orbit-provider", alias: "orbit", name: "Orbit Provider", color: "#8B5CF6" },
  };

  return {
    AI_PROVIDERS: providers,
    getProviderAlias: (providerId) => providers[providerId]?.alias || providerId,
    getProviderByAlias: (providerId) => providers[providerId],
    isOpenAICompatibleProvider: (providerId) => providerId.startsWith("openai-compatible-"),
    isAnthropicCompatibleProvider: (providerId) => providerId.startsWith("anthropic-compatible-"),
  };
});
vi.mock("open-sse/providers/capabilities.js", () => ({ getCapabilitiesForModel }));

const { GET } = await import("../../src/app/api/models/connected/route.js");

describe("GET /api/models/connected", () => {
  beforeEach(() => {
    getModelAliases.mockReset();
    getProviderConnections.mockReset();
    getCustomModels.mockReset();
    getProviderNodes.mockReset();
    getUsers.mockReset();
    getDeletedModels.mockReset();
    requireUsageDashboardUser.mockReset();
    getCapabilitiesForModel.mockReset();

    getModelAliases.mockResolvedValue({ "preferred-alpha": "alpha-alias/enabled" });
    getDeletedModels.mockResolvedValue({});
    getCustomModels.mockResolvedValue([
      { providerAlias: "alpha-alias", id: "enabled", name: "Enabled model", type: "llm" },
      { providerAlias: "alpha-alias", id: "alternative", name: "Alternative model", type: "llm" },
      { providerAlias: "alpha-alias", id: "embedding", name: "Embedding model", type: "embedding" },
      { providerAlias: "beta-alias", id: "inactive", name: "Inactive provider model", type: "llm" },
    ]);
    getProviderNodes.mockResolvedValue([]);
    getUsers.mockResolvedValue([{ id: "admin", role: "admin", isActive: true }]);
    getCapabilitiesForModel.mockReturnValue({ vision: false, search: true, reasoning: true });
    getProviderConnections.mockResolvedValue([
      { provider: "alpha", isActive: true, apiKey: "secret" },
      { provider: "beta", isActive: false, apiKey: "secret" },
    ]);
  });

  it("returns added models for a connected provider", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "admin", role: "admin" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      expect.objectContaining({
        fullModel: "alpha-alias/alternative",
        providerAlias: "alpha-alias",
      }),
      expect.objectContaining({
        fullModel: "alpha-alias/enabled",
        alias: "preferred-alpha",
        caps: { vision: false, search: true, reasoning: true },
      }),
    ]);
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "embedding" }),
      expect.objectContaining({ fullModel: "beta-alias/inactive" }),
    ]));
  });

  it("includes registry models from a viable standard provider connection", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "admin", role: "admin" });
    getCustomModels.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fullModel: "alpha-alias/enabled",
        providerAlias: "alpha-alias",
        isCustom: false,
      }),
      expect.objectContaining({
        fullModel: "alpha-alias/alternative",
        isCustom: false,
      }),
    ]));
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fullModel: "beta-alias/inactive" }),
    ]));
  });

  it("uses the storage alias for registry models when a provider ID differs from its alias", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "admin", role: "admin" });
    getCustomModels.mockResolvedValue([
      { providerAlias: "orbit", id: "claude-opus-4-8", name: "Preferred Orbit Opus", type: "llm" },
    ]);
    getProviderConnections.mockResolvedValue([
      { provider: "orbit-provider", isActive: true, apiKey: "secret" },
    ]);
    getModelAliases.mockResolvedValue({ "orbit-opus": "orbit/claude-opus-4-8" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: expect.objectContaining({ id: "orbit-provider", name: "Orbit Provider" }),
        providerAlias: "orbit",
        model: "claude-opus-4-8",
        name: "Preferred Orbit Opus",
        fullModel: "orbit/claude-opus-4-8",
        alias: "orbit-opus",
        isCustom: true,
      }),
      expect.objectContaining({
        providerAlias: "orbit",
        model: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        fullModel: "orbit/claude-opus-4-6",
        isCustom: false,
      }),
    ]));
    expect(body.models.filter((model) => model.fullModel === "orbit/claude-opus-4-8")).toHaveLength(1);
  });

  it("returns the same catalog to non-administrators", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "member", role: "user" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ fullModel: "alpha-alias/enabled" }),
      expect.objectContaining({ fullModel: "alpha-alias/alternative" }),
    ]));
  });

  it("includes administrator-managed compatible-provider models for non-administrators", async () => {
    const providerId = "openai-compatible-test-node";
    requireUsageDashboardUser.mockResolvedValue({ id: "member", role: "user" });
    getProviderConnections.mockResolvedValue([
      {
        provider: providerId,
        isActive: true,
        apiKey: "admin-secret",
        ownerId: "admin",
        providerSpecificData: { nodeName: "Company Gateway" },
      },
    ]);
    getProviderNodes.mockResolvedValue([
      { id: providerId, type: "openai-compatible", name: "Company Gateway" },
    ]);
    getCustomModels.mockResolvedValue([
      { providerAlias: providerId, id: "gpt-company", name: "Company GPT", type: "llm" },
      { providerAlias: providerId, id: "company-embed", name: "Company Embed", type: "embedding" },
    ]);
    getModelAliases.mockResolvedValue({ "company-chat": `${providerId}/gpt-company` });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      expect.objectContaining({
        provider: expect.objectContaining({ id: providerId, name: "Company Gateway" }),
        providerAlias: providerId,
        model: "gpt-company",
        name: "Company GPT",
        fullModel: `${providerId}/gpt-company`,
        alias: "company-chat",
        isCustom: true,
      }),
    ]);
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "company-embed" }),
    ]));
  });

  it("does not expose permanently deleted models to administrators", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "admin", role: "admin" });
    getDeletedModels.mockResolvedValue({ "alpha-alias": ["alternative", "enabled"] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fullModel: "alpha-alias/alternative" }),
      expect.objectContaining({ fullModel: "alpha-alias/enabled" }),
    ]));
  });

  it("does not treat a non-admin compatible-provider connection as shared", async () => {
    const providerId = "openai-compatible-user-node";
    requireUsageDashboardUser.mockResolvedValue({ id: "member-b", role: "user" });
    getUsers.mockResolvedValue([
      { id: "admin", role: "admin", isActive: true },
      { id: "member-a", role: "user", isActive: true },
    ]);
    getProviderConnections.mockResolvedValue([
      { provider: providerId, isActive: true, apiKey: "member-secret", ownerId: "member-a" },
    ]);
    getProviderNodes.mockResolvedValue([
      { id: providerId, type: "openai-compatible", name: "Member Gateway" },
    ]);
    getCustomModels.mockResolvedValue([
      { providerAlias: providerId, id: "member-only-model", type: "llm" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fullModel: `${providerId}/member-only-model` }),
    ]));
  });
});