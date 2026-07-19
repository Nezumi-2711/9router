import { beforeEach, describe, expect, it, vi } from "vitest";

const getDisabledModels = vi.fn();
const getDeletedModels = vi.fn();

vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels }));
vi.mock("@/lib/db", () => ({ getDeletedModels }));
vi.mock("@/shared/constants/providers", () => ({
  getProviderAlias: (provider) => ({ openai: "oa", claude: "claude" })[provider] || provider,
}));

const { getDisabledModelResponse } = await import("../../src/sse/services/disabledModels.js");

describe("getDisabledModelResponse", () => {
  beforeEach(() => {
    getDisabledModels.mockReset();
    getDeletedModels.mockReset();
    getDeletedModels.mockResolvedValue({});
  });

  it("allows an enabled model", async () => {
    getDisabledModels.mockResolvedValue({ oa: ["gpt-disabled"] });

    await expect(getDisabledModelResponse("openai", "gpt-enabled")).resolves.toBeNull();
  });

  it("blocks a model disabled under the provider alias", async () => {
    getDisabledModels.mockResolvedValue({ oa: ["gpt-disabled"] });

    const response = await getDisabledModelResponse("openai", "gpt-disabled");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "model_not_found",
        message: "Model openai/gpt-disabled is disabled by an administrator",
      },
    });
  });

  it("blocks a model disabled under the provider ID", async () => {
    getDisabledModels.mockResolvedValue({ openai: ["gpt-disabled"] });

    const response = await getDisabledModelResponse("openai", "gpt-disabled");

    expect(response.status).toBe(404);
  });

  it("blocks thinking variants when their base model is disabled", async () => {
    getDisabledModels.mockResolvedValue({ codex: ["gpt-5.6-sol"] });

    const response = await getDisabledModelResponse("codex", "gpt-5.6-sol(high)");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "model_not_found",
        message: "Model codex/gpt-5.6-sol(high) is disabled by an administrator",
      },
    });
  });

  it("blocks a permanently deleted model", async () => {
    getDisabledModels.mockResolvedValue({});
    getDeletedModels.mockResolvedValue({ oa: ["gpt-deleted"] });

    const response = await getDisabledModelResponse("openai", "gpt-deleted");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "model_not_found",
        message: "Model openai/gpt-deleted has been deleted by an administrator",
      },
    });
  });

  it("fails closed when disabled-model storage cannot be read", async () => {
    getDisabledModels.mockRejectedValue(new Error("database unavailable"));

    const response = await getDisabledModelResponse("openai", "gpt-enabled");

    expect(response.status).toBe(500);
  });
});
