import { beforeEach, describe, expect, it, vi } from "vitest";

const getModelAliases = vi.fn();
const getProviderConnections = vi.fn();
const getCustomModels = vi.fn();
const getProviderNodes = vi.fn();
const getUsers = vi.fn();
const getDisabledModels = vi.fn();
const requireUsageDashboardUser = vi.fn();
const getCapabilitiesForModel = vi.fn();

vi.mock("@/models", () => ({
  getCustomModels,
  getModelAliases,
  getProviderConnections,
  getProviderNodes,
}));

vi.mock("@/lib/db", () => ({ getUsers }));

vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels }));
vi.mock("@/lib/auth/currentUser", () => ({
  requireUsageDashboardUser,
}));
vi.mock("@/shared/constants/models", () => ({
  AI_MODELS: [
    { provider: "alpha", model: "enabled", name: "Enabled model" },
    { provider: "alpha", model: "disabled", name: "Disabled model" },
    { provider: "beta", model: "inactive", name: "Inactive provider model" },
  ],
}));
vi.mock("@/shared/constants/providers", () => {
  const providers = {
    alpha: { id: "alpha", alias: "alpha-alias", name: "Alpha", color: "#111111" },
    beta: { id: "beta", alias: "beta-alias", name: "Beta", color: "#222222" },
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
    getDisabledModels.mockReset();
    requireUsageDashboardUser.mockReset();
    getCapabilitiesForModel.mockReset();

    getModelAliases.mockResolvedValue({ "alpha/enabled": "preferred-alpha" });
    getDisabledModels.mockResolvedValue({ "alpha-alias": ["disabled"] });
    getCustomModels.mockResolvedValue([]);
    getProviderNodes.mockResolvedValue([]);
    getUsers.mockResolvedValue([{ id: "admin", role: "admin", isActive: true }]);
    getCapabilitiesForModel.mockReturnValue({ vision: false, search: true, reasoning: true });
    getProviderConnections.mockResolvedValue([
      { provider: "alpha", isActive: true, apiKey: "secret" },
      { provider: "beta", isActive: false, apiKey: "secret" },
    ]);
  });

  it("returns every connected-provider model to an administrator, including disabled rows", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "admin", role: "admin" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      expect.objectContaining({
        fullModel: "alpha/disabled",
        providerAlias: "alpha-alias",
        disabled: true,
      }),
      expect.objectContaining({
        fullModel: "alpha/enabled",
        alias: "preferred-alpha",
        disabled: false,
        caps: { vision: false, search: true, reasoning: true },
      }),
    ]);
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fullModel: "beta/inactive" }),
    ]));
  });

  it("excludes disabled models for non-administrators", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "member", role: "user" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      expect.objectContaining({ fullModel: "alpha/enabled", disabled: false }),
    ]);
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
    getModelAliases.mockResolvedValue({ [`${providerId}/gpt-company`]: "company-chat" });

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

  it("does not expose disabled compatible-provider models to non-administrators", async () => {
    const providerId = "anthropic-compatible-test-node";
    requireUsageDashboardUser.mockResolvedValue({ id: "member", role: "user" });
    getProviderConnections.mockResolvedValue([
      { provider: providerId, isActive: true, apiKey: "admin-secret", ownerId: "admin" },
    ]);
    getProviderNodes.mockResolvedValue([
      { id: providerId, type: "anthropic-compatible", name: "Company Anthropic" },
    ]);
    getCustomModels.mockResolvedValue([
      { providerAlias: providerId, id: "claude-company", type: "llm" },
    ]);
    getDisabledModels.mockResolvedValue({ [providerId]: ["claude-company"] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fullModel: `${providerId}/claude-company` }),
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