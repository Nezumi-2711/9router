import { describe, expect, it, vi } from "vitest";

import { getExecutor } from "../../open-sse/executors/index.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { validateConfiguredClaudeApiKey } from "../../src/lib/providers/apiKeyValidation.js";

describe("Orbit Provider", () => {
  const orbit = REGISTRY.find((entry) => entry.id === "orbit-provider");

  it("registers an Anthropic-compatible API-key provider", () => {
    expect(orbit).toBeDefined();
    expect(orbit).toMatchObject({
      alias: "orbit",
      category: "apikey",
      authType: "apikey",
      serviceKinds: ["llm"],
      transport: {
        baseUrl: "https://api.orbit-provider.com/anthropic/v1/messages",
        format: "claude",
      },
    });
  });

  it("builds the Claude transport with default x-api-key authentication", () => {
    expect(PROVIDERS["orbit-provider"]).toMatchObject({
      baseUrl: "https://api.orbit-provider.com/anthropic/v1/messages",
      format: "claude",
      headers: {
        "anthropic-version": "2023-06-01",
      },
    });

    const executor = getExecutor("orbit-provider");
    expect(executor.buildUrl("claude-opus-4-8", true)).toBe(
      "https://api.orbit-provider.com/anthropic/v1/messages",
    );
    expect(executor.buildHeaders({ apiKey: "orbit-test-key" })).toMatchObject({
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "orbit-test-key",
    });
  });

  it("exposes the configured Opus models and thinking controls", () => {
    expect((PROVIDER_MODELS.orbit || []).map((model) => model.id)).toEqual([
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-6-thinking",
    ]);
    expect(orbit.thinkingConfig).toEqual({
      options: ["auto", "on", "off"],
      defaultMode: "auto",
    });
  });

  it("validates its API key against the configured Claude endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 400 });

    await expect(
      validateConfiguredClaudeApiKey("orbit-provider", "orbit-test-key", fetchMock),
    ).resolves.toEqual({ valid: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.orbit-provider.com/anthropic/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "orbit-test-key",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: "claude-opus-4-8",
      max_tokens: 1,
    });
  });

  it.each([401, 403])("rejects authentication status %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue({ status });

    await expect(
      validateConfiguredClaudeApiKey("orbit-provider", "bad-key", fetchMock),
    ).resolves.toEqual({ valid: false, error: "Invalid API key" });
  });
});
