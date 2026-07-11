import { beforeEach, describe, expect, it, vi } from "vitest";

const getDisabledModels = vi.fn();

vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels }));
vi.mock("@/shared/constants/providers", () => ({
  getProviderAlias: (provider) => ({ openai: "oa", claude: "claude" })[provider] || provider,
}));

const { getDisabledModelResponse } = await import("../../src/sse/services/disabledModels.js");

describe("getDisabledModelResponse", () => {
  beforeEach(() => {
    getDisabledModels.mockReset();
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

  it("fails closed when disabled-model storage cannot be read", async () => {
    getDisabledModels.mockRejectedValue(new Error("database unavailable"));

    const response = await getDisabledModelResponse("openai", "gpt-enabled");

    expect(response.status).toBe(500);
  });
});
