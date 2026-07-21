import { beforeEach, describe, expect, it, vi } from "vitest";

const getCustomModels = vi.fn();
const addCustomModel = vi.fn();
const deleteCustomModel = vi.fn();
const restoreDeletedModel = vi.fn();
const requireAdminUser = vi.fn();

vi.mock("@/models", () => ({
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
}));
vi.mock("@/lib/db", () => ({ restoreDeletedModel }));
vi.mock("@/lib/auth/currentUser", () => ({ requireAdminUser }));

const { GET, POST, DELETE } = await import("../../src/app/api/models/custom/route.js");

describe("/api/models/custom", () => {
  beforeEach(() => {
    getCustomModels.mockReset();
    addCustomModel.mockReset();
    deleteCustomModel.mockReset();
    restoreDeletedModel.mockReset();
    requireAdminUser.mockReset();
    restoreDeletedModel.mockResolvedValue(false);
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

  it("restores a permanently deleted model when an administrator adds it again", async () => {
    requireAdminUser.mockResolvedValue({ id: "admin", role: "admin" });
    restoreDeletedModel.mockResolvedValue(true);
    addCustomModel.mockResolvedValue(true);

    const response = await POST(new Request("http://localhost/api/models/custom", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "openai", id: "gpt-deleted", type: "llm" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, added: true, restored: true });
    expect(restoreDeletedModel).toHaveBeenCalledWith("openai", "gpt-deleted");
    expect(addCustomModel).toHaveBeenCalledWith({
      providerAlias: "openai",
      id: "gpt-deleted",
      type: "llm",
      name: undefined,
    });
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
