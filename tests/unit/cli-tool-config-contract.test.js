import { describe, expect, it } from "vitest";
import {
  CliToolConfigValidationError,
  isPersistableCliTool,
  normalizeCliToolConfig,
} from "@/shared/constants/cliToolConfig.js";

describe("CLI tool configuration contract", () => {
  it("allows every non-MITM CLI tool and rejects MITM tool IDs", () => {
    for (const toolId of ["claude", "codex", "opencode", "cowork", "cursor", "copilot"]) {
      expect(isPersistableCliTool(toolId)).toBe(true);
    }
    for (const toolId of ["antigravity", "kiro", "unknown", ""]) {
      expect(isPersistableCliTool(toolId)).toBe(false);
    }
  });

  it("normalizes Claude config and strips unknown fields", () => {
    expect(normalizeCliToolConfig("claude", {
      baseUrl: "https://router.example/v1/",
      apiKeyMode: "managed",
      apiKeyId: "key-1",
      claudeModels: { sonnet: " cc/sonnet ", opus: "cc/opus", haiku: "" },
      claudeThinking: { sonnet: "high", opus: "", ignored: "max" },
      transientModalOpen: true,
    })).toEqual({
      baseUrl: "https://router.example/v1",
      apiKeyMode: "managed",
      apiKeyId: "key-1",
      claudeModels: { sonnet: "cc/sonnet", opus: "cc/opus", haiku: "" },
      claudeThinking: { sonnet: "high" },
    });
  });

  it("normalizes tool-specific model selections", () => {
    expect(normalizeCliToolConfig("codex", {
      baseUrl: "http://localhost:20128/v1",
      apiKeyMode: "custom",
      apiKeyId: "must-be-removed",
      codexModel: "cx/gpt",
      codexThinking: "xhigh",
    })).toMatchObject({ apiKeyMode: "custom", apiKeyId: null, codexModel: "cx/gpt", codexThinking: "xhigh" });

    expect(normalizeCliToolConfig("opencode", {
      baseUrl: "https://router.example",
      apiKeyMode: "managed",
      apiKeyId: null,
      opencodeModels: ["cc/a", "cc/a", "cx/b"],
      opencodeDefaultModel: "missing/model",
    })).toMatchObject({ opencodeModels: ["cc/a", "cx/b"], opencodeDefaultModel: "cc/a" });

    expect(normalizeCliToolConfig("cowork", {
      baseUrl: "https://router.example",
      apiKeyMode: "managed",
      selectedModels: ["cc/a"],
      coworkThinking: { "cc/a": "high", "stale/model": "low" },
    })).toMatchObject({ selectedModels: ["cc/a"], coworkThinking: { "cc/a": "high" } });

    expect(normalizeCliToolConfig("cursor", {
      apiKeyMode: "managed",
      apiKeyId: "key-1",
      selectedModels: ["cc/a", "cx/b"],
    })).toEqual({ apiKeyMode: "managed", apiKeyId: "key-1", selectedModels: ["cc/a", "cx/b"] });

    expect(normalizeCliToolConfig("copilot", {
      baseUrl: "https://router.example/v1",
      selectedModels: ["cc/a"],
      copilotThinking: { "cc/a": "high", "stale/model": "low" },
      copilotTokens: {
        "cc/a": { maxInputTokens: 100000, maxOutputTokens: 32000 },
        "stale/model": { maxInputTokens: 1 },
      },
    })).toEqual({
      baseUrl: "https://router.example/v1",
      selectedModels: ["cc/a"],
      copilotThinking: { "cc/a": "high" },
      copilotTokens: { "cc/a": { maxInputTokens: 100000, maxOutputTokens: 32000 } },
    });
  });

  it("rejects plaintext secrets, invalid URLs, and invalid token limits", () => {
    expect(() => normalizeCliToolConfig("claude", {
      baseUrl: "https://router.example",
      apiKey: "secret",
    })).toThrowError(CliToolConfigValidationError);

    expect(() => normalizeCliToolConfig("codex", {
      baseUrl: "file:///tmp/socket",
      apiKeyMode: "managed",
    })).toThrow("Endpoint must use HTTP or HTTPS");

    expect(() => normalizeCliToolConfig("copilot", {
      baseUrl: "https://router.example",
      selectedModels: ["cc/a"],
      copilotTokens: { "cc/a": { maxInputTokens: -1 } },
    })).toThrow("maxInputTokens must be a positive integer");
  });
});
