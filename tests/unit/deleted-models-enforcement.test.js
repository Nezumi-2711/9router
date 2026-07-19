import { beforeEach, describe, expect, it, vi } from "vitest";

const isDeletedModel = vi.fn();

vi.mock("@/lib/db", () => ({ isDeletedModel }));

const { getDeletedModelResponse } = await import("../../src/sse/services/deletedModels.js");

describe("getDeletedModelResponse", () => {
  beforeEach(() => {
    isDeletedModel.mockReset();
  });

  it("allows a model that has not been permanently deleted", async () => {
    isDeletedModel.mockResolvedValue(false);

    await expect(getDeletedModelResponse("openai", "gpt-available")).resolves.toBeNull();
    expect(isDeletedModel).toHaveBeenCalledWith("openai", "gpt-available");
  });

  it("blocks a permanently deleted model", async () => {
    isDeletedModel.mockResolvedValue(true);

    const response = await getDeletedModelResponse("openai", "gpt-deleted");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "model_not_found",
        message: "Model openai/gpt-deleted has been deleted by an administrator",
      },
    });
  });

  it("blocks permanently deleted thinking variants", async () => {
    isDeletedModel.mockResolvedValue(true);

    const response = await getDeletedModelResponse("codex", "gpt-deleted(high)");

    expect(response.status).toBe(404);
    expect(isDeletedModel).toHaveBeenCalledWith("codex", "gpt-deleted(high)");
  });

  it("fails closed when deleted-model storage cannot be read", async () => {
    isDeletedModel.mockRejectedValue(new Error("database unavailable"));

    const response = await getDeletedModelResponse("openai", "gpt-available");

    expect(response.status).toBe(500);
  });
});