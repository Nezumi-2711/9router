import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnectionById = vi.fn();
const getProxyPoolById = vi.fn();
const updateProviderConnection = vi.fn();
const deleteProviderConnection = vi.fn();
const getProviderConnectionAccess = vi.fn();

vi.mock("@/models", () => ({
  getProviderConnectionById,
  getProxyPoolById,
  updateProviderConnection,
  deleteProviderConnection,
}));
vi.mock("@/lib/providers/connectionAccess", () => ({ getProviderConnectionAccess }));
vi.mock("@/shared/constants/providers", () => ({
  isOpenAICompatibleProvider: (provider) => provider.startsWith("openai-compatible-"),
  isAnthropicCompatibleProvider: (provider) => provider.startsWith("anthropic-compatible-"),
  isCustomEmbeddingProvider: (provider) => provider.startsWith("custom-embedding-"),
}));

const { PUT, DELETE } = await import("../../src/app/api/providers/[id]/route.js");

const memberAccess = {
  user: { id: "member", role: "user" },
  ownerId: "member",
};
const adminAccess = {
  user: { id: "admin", role: "admin" },
  ownerId: null,
};

describe("provider connection administrator-only access", () => {
  beforeEach(() => {
    getProviderConnectionById.mockReset();
    getProxyPoolById.mockReset();
    updateProviderConnection.mockReset();
    deleteProviderConnection.mockReset();
    getProviderConnectionAccess.mockReset();
  });

  it("prevents a member from updating a provider connection", async () => {
    getProviderConnectionAccess.mockResolvedValue(memberAccess);
    getProviderConnectionById.mockResolvedValue({
      id: "legacy-compatible",
      provider: "openai-compatible-chat-node",
      ownerId: "member",
    });

    const response = await PUT(new Request("http://localhost/api/providers/legacy-compatible", {
      method: "PUT",
      body: JSON.stringify({ name: "Changed" }),
    }), { params: Promise.resolve({ id: "legacy-compatible" }) });

    expect(response.status).toBe(403);
    expect(updateProviderConnection).not.toHaveBeenCalled();
  });

  it("prevents a member from deleting a provider connection", async () => {
    getProviderConnectionAccess.mockResolvedValue(memberAccess);
    getProviderConnectionById.mockResolvedValue({
      id: "legacy-compatible",
      provider: "anthropic-compatible-node",
      ownerId: "member",
    });

    const response = await DELETE(new Request("http://localhost/api/providers/legacy-compatible", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "legacy-compatible" }) });

    expect(response.status).toBe(403);
    expect(deleteProviderConnection).not.toHaveBeenCalled();
  });

  it("allows an administrator to delete a compatible connection", async () => {
    getProviderConnectionAccess.mockResolvedValue(adminAccess);
    getProviderConnectionById.mockResolvedValue({
      id: "compatible",
      provider: "custom-embedding-node",
      ownerId: "admin",
    });
    deleteProviderConnection.mockResolvedValue(true);

    const response = await DELETE(new Request("http://localhost/api/providers/compatible", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "compatible" }) });

    expect(response.status).toBe(200);
    expect(deleteProviderConnection).toHaveBeenCalledWith("compatible");
  });

  it("prevents a member from updating a non-compatible connection", async () => {
    getProviderConnectionAccess.mockResolvedValue(memberAccess);
    getProviderConnectionById.mockResolvedValue({
      id: "openai-connection",
      provider: "openai",
      ownerId: "member",
      providerSpecificData: {},
      authType: "apikey",
    });
    const response = await PUT(new Request("http://localhost/api/providers/openai-connection", {
      method: "PUT",
      body: JSON.stringify({ name: "Changed" }),
    }), { params: Promise.resolve({ id: "openai-connection" }) });

    expect(response.status).toBe(403);
    expect(updateProviderConnection).not.toHaveBeenCalled();
  });
});
