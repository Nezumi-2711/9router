import { CLI_TOOLS } from "./cliTools.js";

const SUPPORTED_TOOL_IDS = new Set(Object.keys(CLI_TOOLS));
const TOOLS_WITH_API_KEYS = new Set(["claude", "codex", "opencode", "cowork", "cursor"]);
const TOOLS_WITH_BASE_URLS = new Set(["claude", "codex", "opencode", "cowork", "copilot"]);
const CLAUDE_SLOTS = ["sonnet", "opus", "haiku"];
const MAX_MODEL_COUNT = 100;
const MAX_MODEL_ID_LENGTH = 512;
const MAX_URL_LENGTH = 2048;
const MAX_THINKING_LENGTH = 32;
const MAX_TOKEN_LIMIT = 10_000_000;

export class CliToolConfigValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliToolConfigValidationError";
    this.status = 400;
  }
}

export function isPersistableCliTool(toolId) {
  return typeof toolId === "string" && SUPPORTED_TOOL_IDS.has(toolId);
}

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliToolConfigValidationError("Configuration must be an object");
  }
  if (Object.hasOwn(value, "apiKey") || Object.hasOwn(value, "customApiKey") || Object.hasOwn(value, "key")) {
    throw new CliToolConfigValidationError("Plaintext API keys cannot be saved");
  }
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CliToolConfigValidationError("Endpoint is required");
  }
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new CliToolConfigValidationError("Endpoint is too long");
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CliToolConfigValidationError("Endpoint must be a valid HTTP(S) URL");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new CliToolConfigValidationError("Endpoint must use HTTP or HTTPS");
  }
  return trimmed;
}

function normalizeOptionalString(value, field, maxLength = MAX_MODEL_ID_LENGTH) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new CliToolConfigValidationError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new CliToolConfigValidationError(`${field} is too long`);
  return normalized;
}

function normalizeModels(value, field = "selectedModels") {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new CliToolConfigValidationError(`${field} must be an array`);
  if (value.length > MAX_MODEL_COUNT) throw new CliToolConfigValidationError(`${field} has too many models`);
  const models = value.map((model) => {
    const normalized = normalizeOptionalString(model, field);
    if (!normalized) throw new CliToolConfigValidationError(`${field} cannot contain empty model IDs`);
    return normalized;
  });
  return models;
}

function normalizeThinking(value, field) {
  return normalizeOptionalString(value, field, MAX_THINKING_LENGTH);
}

function normalizeThinkingMap(value, allowedKeys, field) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliToolConfigValidationError(`${field} must be an object`);
  }
  const normalized = {};
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) continue;
    const thinking = normalizeThinking(value[key], `${field}.${key}`);
    if (thinking) normalized[key] = thinking;
  }
  return normalized;
}

function normalizeTokenLimits(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliToolConfigValidationError(`${field} must be an object`);
  }
  const normalized = {};
  for (const tokenField of ["maxInputTokens", "maxOutputTokens"]) {
    if (value[tokenField] === undefined || value[tokenField] === null || value[tokenField] === "") continue;
    const number = Number(value[tokenField]);
    if (!Number.isSafeInteger(number) || number <= 0 || number > MAX_TOKEN_LIMIT) {
      throw new CliToolConfigValidationError(`${tokenField} must be a positive integer no greater than ${MAX_TOKEN_LIMIT}`);
    }
    normalized[tokenField] = number;
  }
  return normalized;
}

function normalizeApiKeyReference(input) {
  const mode = input.apiKeyMode === undefined ? "managed" : input.apiKeyMode;
  if (!['managed', 'custom'].includes(mode)) {
    throw new CliToolConfigValidationError("apiKeyMode must be managed or custom");
  }
  const apiKeyId = normalizeOptionalString(input.apiKeyId, "apiKeyId", 128) || null;
  return { apiKeyMode: mode, apiKeyId: mode === "managed" ? apiKeyId : null };
}

function normalizeCoworkModelSettings(value, selectedModels, legacyThinking) {
  if (value !== undefined && !Array.isArray(value)) {
    throw new CliToolConfigValidationError("coworkModelSettings must be an array");
  }
  const legacySettings = normalizeThinkingMap(legacyThinking, selectedModels, "coworkThinking");
  return selectedModels.map((model, index) => {
    const setting = value?.[index];
    if (setting !== undefined && (!setting || typeof setting !== "object" || Array.isArray(setting))) {
      throw new CliToolConfigValidationError(`coworkModelSettings.${index} must be an object`);
    }
    const thinking = normalizeThinking(setting?.thinking ?? legacySettings[model], `coworkModelSettings.${index}.thinking`);
    return thinking ? { thinking } : {};
  });
}

function normalizeCopilotModelSettings(value, selectedModels, legacyThinking, legacyTokens) {
  if (value !== undefined && !Array.isArray(value)) {
    throw new CliToolConfigValidationError("copilotModelSettings must be an array");
  }
  const legacyThinkingSettings = normalizeThinkingMap(legacyThinking, selectedModels, "copilotThinking");
  const legacyTokenSettings = legacyTokens === undefined ? {} : legacyTokens;
  if (!legacyTokenSettings || typeof legacyTokenSettings !== "object" || Array.isArray(legacyTokenSettings)) {
    throw new CliToolConfigValidationError("copilotTokens must be an object");
  }
  return selectedModels.map((model, index) => {
    const setting = value?.[index];
    if (setting !== undefined && (!setting || typeof setting !== "object" || Array.isArray(setting))) {
      throw new CliToolConfigValidationError(`copilotModelSettings.${index} must be an object`);
    }
    const thinking = normalizeThinking(setting?.thinking ?? legacyThinkingSettings[model], `copilotModelSettings.${index}.thinking`);
    const tokensSource = setting?.tokens ?? legacyTokenSettings[model];
    const tokens = tokensSource === undefined ? {} : normalizeTokenLimits(tokensSource, `copilotModelSettings.${index}.tokens`);
    return {
      ...(thinking ? { thinking } : {}),
      ...(Object.keys(tokens).length ? { tokens } : {}),
    };
  });
}

export function normalizeCliToolConfig(toolId, input) {
  if (!isPersistableCliTool(toolId)) {
    throw new CliToolConfigValidationError("Unsupported CLI tool");
  }
  assertObject(input);

  const config = {};
  if (TOOLS_WITH_BASE_URLS.has(toolId)) config.baseUrl = normalizeBaseUrl(input.baseUrl);
  if (TOOLS_WITH_API_KEYS.has(toolId)) Object.assign(config, normalizeApiKeyReference(input));

  if (toolId === "claude") {
    const modelsInput = input.claudeModels === undefined ? {} : input.claudeModels;
    if (!modelsInput || typeof modelsInput !== "object" || Array.isArray(modelsInput)) {
      throw new CliToolConfigValidationError("claudeModels must be an object");
    }
    config.claudeModels = Object.fromEntries(CLAUDE_SLOTS.map((slot) => [
      slot,
      normalizeOptionalString(modelsInput[slot], `claudeModels.${slot}`),
    ]));
    config.claudeThinking = normalizeThinkingMap(input.claudeThinking, CLAUDE_SLOTS, "claudeThinking");
  } else if (toolId === "codex") {
    config.codexModel = normalizeOptionalString(input.codexModel, "codexModel");
    config.codexThinking = normalizeThinking(input.codexThinking, "codexThinking");
  } else if (toolId === "opencode") {
    config.opencodeModels = normalizeModels(input.opencodeModels, "opencodeModels");
    const requestedDefault = normalizeOptionalString(input.opencodeDefaultModel, "opencodeDefaultModel");
    config.opencodeDefaultModel = config.opencodeModels.includes(requestedDefault)
      ? requestedDefault
      : (config.opencodeModels[0] || "");
  } else if (toolId === "cowork") {
    config.selectedModels = normalizeModels(input.selectedModels);
    config.coworkModelSettings = normalizeCoworkModelSettings(input.coworkModelSettings, config.selectedModels, input.coworkThinking);
  } else if (toolId === "cursor") {
    config.selectedModels = normalizeModels(input.selectedModels);
  } else if (toolId === "copilot") {
    config.selectedModels = normalizeModels(input.selectedModels);
    config.copilotModelSettings = normalizeCopilotModelSettings(input.copilotModelSettings, config.selectedModels, input.copilotThinking, input.copilotTokens);
  }

  return config;
}