import { beforeEach, describe, expect, it, vi } from "vitest";

const getCustomModels = vi.fn();
const addCustomModel = vi.fn();
const deleteCustomModel = vi.fn();
const isDeletedModel = vi.fn();
const requireAdminUser = vi.fn();

vi.mock("@/models", () => ({
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
}));
vi.mock("@/lib/db", () => ({ isDeletedModel }));
vi.mock("@/lib/auth/currentUser", () => ({ requireAdminUser }));

const { GET, POST, DELETE } = await import("../../src/app/api/models/custom/route.js");

describe("/api/models/custom", () => {
  beforeEach(() => {
    getCustomModels.mockReset();
    addCustomModel.mockReset();
    deleteCustomModel.mockReset();
    isDeletedModel.mockReset();
    requireAdminUser.mockReset();
    isDeletedModel.mockResolvedValue(false);
  });

  it("keeps the shared catalog readable to authenticated model selectors", async () => {
    getCustomModels.mockResolvedValue([{ providerAlias: "openai", id: "gpt-test", type: "llm" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [{ providerAlias: "openai", id: "gpt-test", type: "llm" }],
    });
    expect(requireAdminUser).not.toHaveBeenCalled();
  });

  it("rejects a non-admin adding a shared custom model", async () => {
    requireAdminUser.mockRejectedValue(new Error("Forbidden"));

    const response = await POST(new Request("http://localhost/api/models/custom", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "openai", id: "gpt-test", type: "llm" }),
    }));

    expect(response.status).toBe(403);
    expect(addCustomModel).not.toHaveBeenCalled();
  });

  it("allows an admin to add a shared custom model", async () => {
    requireAdminUser.mockResolvedValue({ id: "admin", role: "admin" });
    addCustomModel.mockResolvedValue(true);

    const response = await POST(new Request("http://localhost/api/models/custom", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "openai", id: "gpt-test", type: "llm" }),
    }));

    expect(response.status).toBe(200);
    expect(addCustomModel).toHaveBeenCalledWith({
      providerAlias: "openai",
      id: "gpt-test",
      type: "llm",
      name: undefined,
    });
  });

  it("does not let an administrator re-add a permanently deleted model", async () => {
    requireAdminUser.mockResolvedValue({ id: "admin", role: "admin" });
    isDeletedModel.mockResolvedValue(true);

    const response = await POST(new Request("http://localhost/api/models/custom", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "openai", id: "gpt-deleted", type: "llm" }),
    }));

    expect(response.status).toBe(409);
    expect(addCustomModel).not.toHaveBeenCalled();
  });

  it("rejects a non-admin deleting a shared custom model", async () => {
    requireAdminUser.mockRejectedValue(new Error("Forbidden"));

    const response = await DELETE(new Request(
      "http://localhost/api/models/custom?providerAlias=openai&id=gpt-test&type=llm",
      { method: "DELETE" },
    ));

    expect(response.status).toBe(403);
    expect(deleteCustomModel).not.toHaveBeenCalled();
  });
});
