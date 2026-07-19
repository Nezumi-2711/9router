import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteModelPermanently = vi.fn();
const getDeletedModels = vi.fn();
const purgeRequestDetailBuffer = vi.fn();
const requireAdminUser = vi.fn();
const resetComboRotation = vi.fn();

vi.mock("@/lib/db", () => ({
  deleteModelPermanently,
  getDeletedModels,
  purgeRequestDetailBuffer,
}));
vi.mock("@/lib/auth/currentUser", () => ({ requireAdminUser }));
vi.mock("open-sse/services/combo.js", () => ({ resetComboRotation }));

const { GET, POST } = await import("../../src/app/api/models/delete/route.js");

describe("/api/models/delete", () => {
  beforeEach(() => {
    deleteModelPermanently.mockReset();
    getDeletedModels.mockReset();
    purgeRequestDetailBuffer.mockReset();
    requireAdminUser.mockReset();
    resetComboRotation.mockReset();
  });

  it("rejects non-admin permanent deletion", async () => {
    requireAdminUser.mockRejectedValue(new Error("Forbidden"));

    const response = await POST(new Request("http://localhost/api/models/delete", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "alpha", modelId: "model-a" }),
    }));

    expect(response.status).toBe(403);
    expect(deleteModelPermanently).not.toHaveBeenCalled();
  });

  it("validates model deletion input", async () => {
    requireAdminUser.mockResolvedValue({ id: "admin", role: "admin" });

    const response = await POST(new Request("http://localhost/api/models/delete", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "alpha" }),
    }));

    expect(response.status).toBe(400);
    expect(deleteModelPermanently).not.toHaveBeenCalled();
  });

  it("cascades an admin deletion without purging usage history", async () => {
    requireAdminUser.mockResolvedValue({ id: "admin", role: "admin" });
    deleteModelPermanently.mockResolvedValue({
      providerAliases: ["alpha", "alpha-id"],
      modelId: "model-a",
      updatedComboIds: ["combo-updated"],
      deletedComboIds: ["combo-deleted"],
    });

    const response = await POST(new Request("http://localhost/api/models/delete", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "alpha", modelId: "model-a" }),
    }));

    expect(response.status).toBe(200);
    expect(deleteModelPermanently).toHaveBeenCalledWith("alpha", "model-a");
    expect(resetComboRotation).toHaveBeenCalledWith("combo-updated");
    expect(resetComboRotation).toHaveBeenCalledWith("combo-deleted");
    expect(purgeRequestDetailBuffer).toHaveBeenCalledWith(["alpha", "alpha-id"], "model-a");
  });

  it("returns permanent-deletion tombstones for catalog readers", async () => {
    getDeletedModels.mockResolvedValue({ alpha: ["model-a"] });

    const response = await GET(new Request("http://localhost/api/models/delete?providerAlias=alpha"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ids: ["model-a"] });
  });
});
