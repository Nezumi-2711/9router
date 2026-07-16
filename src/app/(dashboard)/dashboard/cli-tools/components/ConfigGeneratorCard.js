"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button, Card, ManualConfigModal, ModelSelectModal } from "@/shared/components";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { DEFAULT_MODEL_TOKEN_LIMITS, getInputTokenOptions, getOutputTokenOptions } from "@/shared/constants/copilotModelTokens.js";
import { resolveInitialCliToolBaseUrl } from "@/shared/utils/cliToolEndpoint";
import BaseUrlSelect from "./BaseUrlSelect";
import ApiKeySelect from "./ApiKeySelect";

const DEFAULT_MODEL = "provider/model-id";
const COPILOT_API_KEY_INPUT = "${input:chat.lm.secret.9router}";

const normalizeV1 = (url) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const toJson = (value) => JSON.stringify(value, null, 2);

const withThinkingLevel = (model, thinkingLevel) => (
  model && thinkingLevel ? `${model}(${thinkingLevel})` : model
);

const MODEL_NAME_TERMS = {
  ai: "AI",
  claude: "Claude",
  codex: "Codex",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  glm: "GLM",
  gpt: "GPT",
  kimi: "Kimi",
  minimax: "MiniMax",
  mistral: "Mistral",
  qwen: "Qwen",
};

const formatModelName = (modelId) => {
  const unprefixedModelId = modelId.replace(/^.*\//, "");
  const [, baseModelId, aliasSuffix] = unprefixedModelId.match(/^(.*?)(?:\(([^()]+)\))?$/) || [];
  const formatTerms = (value) => value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => MODEL_NAME_TERMS[part.toLowerCase()] || `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  const modelName = formatTerms(baseModelId || unprefixedModelId);

  return aliasSuffix ? `${modelName} (${formatTerms(aliasSuffix)})` : modelName;
};

function buildConfigs(toolId, { baseUrl, apiKey, models, claudeModels = {}, claudeThinking = {}, codexModel = "", codexThinking = "", opencodeModels = [], opencodeDefaultModel = "", coworkThinking = {}, copilotTokens = {}, copilotThinking = {}, connectedModels = [] }) {
  const endpoint = normalizeV1(baseUrl);
  const selectedModels = models.length ? models : [DEFAULT_MODEL];
  const model = selectedModels[0];

  switch (toolId) {
    case "claude":
      return [{
        filename: "~/.claude/settings.json",
        content: toJson({
          hasCompletedOnboarding: true,
          env: {
            ANTHROPIC_BASE_URL: endpoint,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_DEFAULT_SONNET_MODEL: withThinkingLevel(claudeModels.sonnet || DEFAULT_MODEL, claudeThinking.sonnet),
            ANTHROPIC_DEFAULT_OPUS_MODEL: withThinkingLevel(claudeModels.opus || DEFAULT_MODEL, claudeThinking.opus),
            ANTHROPIC_DEFAULT_HAIKU_MODEL: withThinkingLevel(claudeModels.haiku || DEFAULT_MODEL, claudeThinking.haiku),
          },
        }),
      }];
    case "codex":
      return [
        {
          filename: "~/.codex/config.toml",
          content: `model = "${withThinkingLevel(codexModel || DEFAULT_MODEL, codexThinking)}"\nmodel_provider = "9router"\n\n[model_providers.9router]\nname = "9Router"\nbase_url = "${endpoint}"\nwire_api = "responses"\n`,
        },
        { filename: "~/.codex/auth.json", content: toJson({ auth_mode: "apikey", OPENAI_API_KEY: apiKey }) },
      ];
    case "opencode": {
      // OpenCode identifies a default model as <provider-id>/<model-id>. Our
      // custom provider is "9router", while the 9Router model ID itself keeps
      // its upstream provider prefix (for example, "cc/claude-sonnet-5").
      const configuredModels = opencodeModels.length ? opencodeModels : [DEFAULT_MODEL];
      const modelId = configuredModels.includes(opencodeDefaultModel)
        ? opencodeDefaultModel
        : configuredModels[0];
      return [{
        filename: "~/.config/opencode/opencode.json",
        content: toJson({
          $schema: "https://opencode.ai/config.json",
          provider: {
            "9router": {
              npm: "@ai-sdk/openai-compatible",
              name: "9Router",
              options: { baseURL: endpoint, apiKey },
              models: Object.fromEntries(configuredModels.map((id) => [id, { name: id }])),
            },
          },
          model: `9router/${modelId}`,
        }),
      }];
    }
    case "copilot":
      return [{
        filename: "chatLanguageModels.json",
        content: toJson(Object.values(selectedModels.reduce((groups, id) => {
          const connectedModel = connectedModels.find((item) => item.fullModel === id);
          const providerId = connectedModel?.providerAlias || id.split("/")[0] || "9router";
          const providerName = connectedModel?.provider?.name || formatModelName(providerId);
          const group = groups[providerId] || {
            name: providerName,
            vendor: "customendpoint",
            apiType: "chat-completions",
            // VS Code resolves this input lazily, prompting the user for their
            // 9Router key before the custom model can service a chat request.
            apiKey: COPILOT_API_KEY_INPUT,
            models: [],
          };
          const tokens = copilotTokens[id] || {};
          const modelId = withThinkingLevel(id, copilotThinking[id]);
          const entry = {
            id: modelId,
            name: formatModelName(modelId),
            url: `${endpoint}/chat/completions`,
            toolCalling: true,
            vision: true,
            streaming: true,
          };
          if (copilotThinking[id]) {
            entry.thinking = true;
            entry.reasoningEffortFormat = "chat-completions";
          }
          if (tokens.maxInputTokens) entry.maxInputTokens = tokens.maxInputTokens;
          if (tokens.maxOutputTokens) entry.maxOutputTokens = tokens.maxOutputTokens;
          group.models.push(entry);
          groups[providerId] = group;
          return groups;
        }, {}))),
      }];
    case "cowork":
      return [{
        // Claude Desktop reads third-party inference profiles from its 3P
        // config library. Unlike Claude Code, Cowork does not support named
        // Sonnet/Opus/Haiku environment-variable slots: every entry here is
        // exposed directly in Claude Desktop's model picker.
        filename: "Claude-3p/configLibrary/<appliedId>.json",
        content: toJson({
          inferenceProvider: "gateway",
          inferenceGatewayBaseUrl: endpoint,
          inferenceGatewayApiKey: apiKey,
          inferenceModels: selectedModels.map((name) => ({
            name: withThinkingLevel(name, coworkThinking[name]),
          })),
        }),
      }];
    default:
      return [{ filename: "config.json", content: toJson({ baseUrl: endpoint, apiKey, model }) }];
  }
}

export default function ConfigGeneratorCard({
  tool,
  toolId,
  baseUrl,
  apiKeys,
  activeProviders,
  availableModels = [],
  cloudEnabled,
  tunnelEnabled,
  tunnelPublicUrl,
  tailscaleEnabled,
  tailscaleUrl,
  initialConfig,
  onSaveConfig,
}) {
  const restoredApiKey = initialConfig?.apiKeyId
    ? apiKeys.find((key) => key.id === initialConfig.apiKeyId)?.key || ""
    : "";
  const [selectedApiKey, setSelectedApiKey] = useState(() => (
    initialConfig?.apiKeyMode === "custom"
      ? ""
      : initialConfig?.apiKeyId ? restoredApiKey : apiKeys?.[0]?.key || ""
  ));
  const [apiKeyMode, setApiKeyMode] = useState(() => initialConfig?.apiKeyMode || "managed");
  const [selectedModels, setSelectedModels] = useState(() => initialConfig?.selectedModels || []);
  const [claudeModels, setClaudeModels] = useState(() => initialConfig?.claudeModels || { sonnet: "", opus: "", haiku: "" });
  const [claudeThinking, setClaudeThinking] = useState(() => initialConfig?.claudeThinking || { sonnet: "", opus: "", haiku: "" });
  const [claudeModelSlot, setClaudeModelSlot] = useState("");
  const [codexModel, setCodexModel] = useState(() => initialConfig?.codexModel || "");
  const [codexThinking, setCodexThinking] = useState(() => initialConfig?.codexThinking || "");
  const [opencodeModels, setOpencodeModels] = useState(() => initialConfig?.opencodeModels || []);
  const [opencodeDefaultModel, setOpencodeDefaultModel] = useState(() => initialConfig?.opencodeDefaultModel || "");
  const [coworkThinking, setCoworkThinking] = useState(() => initialConfig?.coworkThinking || {});
  const [copilotTokens, setCopilotTokens] = useState(() => initialConfig?.copilotTokens || {});
  const [copilotThinking, setCopilotThinking] = useState(() => initialConfig?.copilotThinking || {});
  const connectedModels = availableModels;
  const [customBaseUrl, setCustomBaseUrl] = useState(() => resolveInitialCliToolBaseUrl(initialConfig?.baseUrl, baseUrl));
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const initializedSaveState = useRef(false);

  const effectiveBaseUrl = customBaseUrl || baseUrl;
  const apiKey = toolId === "copilot"
    ? COPILOT_API_KEY_INPUT
    : selectedApiKey.trim() || (cloudEnabled ? "<API_KEY_FROM_DASHBOARD>" : "sk_9router");
  const configs = useMemo(
    () => buildConfigs(toolId, { baseUrl: effectiveBaseUrl, apiKey, models: selectedModels, claudeModels, claudeThinking, codexModel, codexThinking, opencodeModels, opencodeDefaultModel, coworkThinking, copilotTokens, copilotThinking, connectedModels: connectedModels || [] }),
    [toolId, effectiveBaseUrl, apiKey, selectedModels, claudeModels, claudeThinking, codexModel, codexThinking, opencodeModels, opencodeDefaultModel, coworkThinking, copilotTokens, copilotThinking, connectedModels]
  );

  const buildPersistableConfig = () => {
    const config = { baseUrl: effectiveBaseUrl };
    if (toolId !== "copilot") {
      config.apiKeyMode = apiKeyMode;
      config.apiKeyId = apiKeyMode === "managed"
        ? apiKeys.find((key) => key.key === selectedApiKey)?.id || null
        : null;
    }
    if (toolId === "claude") Object.assign(config, { claudeModels, claudeThinking });
    if (toolId === "codex") Object.assign(config, { codexModel, codexThinking });
    if (toolId === "opencode") Object.assign(config, { opencodeModels, opencodeDefaultModel });
    if (toolId === "cowork") Object.assign(config, { selectedModels, coworkThinking });
    if (toolId === "copilot") Object.assign(config, { selectedModels, copilotThinking, copilotTokens });
    return config;
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError("");
    try {
      await onSaveConfig(buildPersistableConfig());
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error.message || "Failed to save configuration");
    }
  };

  useEffect(() => {
    if (!initializedSaveState.current) {
      initializedSaveState.current = true;
      return;
    }
    setSaveStatus((current) => current === "saving" ? current : "dirty");
    setSaveError("");
  }, [effectiveBaseUrl, apiKeyMode, selectedApiKey, selectedModels, claudeModels, claudeThinking, codexModel, codexThinking, opencodeModels, opencodeDefaultModel, coworkThinking, copilotTokens, copilotThinking]);

  const getThinkingLevelsForModel = (fullModel) => {
    const connectedModel = connectedModels?.find((model) => model.fullModel === fullModel);
    if (!connectedModel?.provider?.id || !connectedModel.model) return null;
    return getThinkingLevels(connectedModel.provider.id, connectedModel.model);
  };

  const loadCopilotTokenLimits = async (modelIds) => {
    try {
      const response = await fetch("/api/models/token-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: modelIds }),
      });
      if (!response.ok) throw new Error("Failed to load models.dev token limits");

      const { limits = {} } = await response.json();
      setCopilotTokens((current) => Object.entries(limits).reduce((next, [model, limit]) => {
        const currentLimit = current[model];
        const hasUserOverride = currentLimit
          && (currentLimit.maxInputTokens !== DEFAULT_MODEL_TOKEN_LIMITS.maxInputTokens
            || currentLimit.maxOutputTokens !== DEFAULT_MODEL_TOKEN_LIMITS.maxOutputTokens);
        next[model] = hasUserOverride ? currentLimit : limit;
        return next;
      }, { ...current }));
    } catch (error) {
      console.log("Error loading models.dev token limits:", error);
    }
  };

  const addModel = (selected) => {
    if (!selected?.value || selectedModels.includes(selected.value)) return;
    setSelectedModels((current) => [...current, selected.value]);
    if (toolId === "cowork") setCoworkThinking((current) => ({ ...current, [selected.value]: "" }));
    if (toolId === "copilot") {
      setCopilotThinking((current) => ({ ...current, [selected.value]: "" }));
      setCopilotTokens((current) => ({ ...current, [selected.value]: DEFAULT_MODEL_TOKEN_LIMITS }));
      loadCopilotTokenLimits([selected.value]);
    }
  };

  const removeCoworkModel = (model) => {
    setSelectedModels((current) => current.filter((item) => item !== model));
    setCoworkThinking((current) => {
      const remainingThinking = { ...current };
      delete remainingThinking[model];
      return remainingThinking;
    });
  };

  const removeCopilotModel = (model) => {
    setSelectedModels((current) => current.filter((item) => item !== model));
    setCopilotThinking((current) => {
      const remaining = { ...current };
      delete remaining[model];
      return remaining;
    });
    setCopilotTokens((current) => {
      const remaining = { ...current };
      delete remaining[model];
      return remaining;
    });
  };

  const selectClaudeModel = (selected) => {
    if (!selected?.value || !claudeModelSlot) return;
    setClaudeModels((current) => ({ ...current, [claudeModelSlot]: selected.value }));
    setClaudeThinking((current) => ({ ...current, [claudeModelSlot]: "" }));
    setClaudeModelSlot("");
  };

  const openClaudeModelSelector = (slot) => {
    setClaudeModelSlot(slot);
    setModelModalOpen(true);
  };

  const selectCodexModel = (selected) => {
    if (!selected?.value) return;
    setCodexModel(selected.value);
    setCodexThinking("");
  };

  const selectOpenCodeModel = (selected) => {
    if (!selected?.value || opencodeModels.includes(selected.value)) return;
    setOpencodeModels((current) => [...current, selected.value]);
    if (!opencodeDefaultModel) setOpencodeDefaultModel(selected.value);
  };

  const removeOpenCodeModel = (model) => {
    const remainingModels = opencodeModels.filter((item) => item !== model);
    setOpencodeModels(remainingModels);
    if (opencodeDefaultModel === model) setOpencodeDefaultModel(remainingModels[0] || "");
  };

  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="flex items-start gap-3 sm:items-center">
        <div className="size-9 shrink-0">
          <Image src={tool.image} alt={tool.name} width={36} height={36} className="size-9 rounded-lg object-contain" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-text-main">{tool.name}</h3>
          <p className="text-xs text-text-muted">Generate a configuration file to copy to your own machine.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
          Endpoint
          <BaseUrlSelect
            value={customBaseUrl}
            onChange={setCustomBaseUrl}
            appUrl={baseUrl}
            tunnelEnabled={tunnelEnabled}
            tunnelPublicUrl={tunnelPublicUrl}
            tailscaleEnabled={tailscaleEnabled}
            tailscaleUrl={tailscaleUrl}
            cloudEnabled={cloudEnabled}
            cloudUrl={process.env.NEXT_PUBLIC_CLOUD_URL}
          />
        </label>
        {toolId !== "copilot" && (
          <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
            API key
            <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} mode={apiKeyMode} onModeChange={setApiKeyMode} />
          </label>
        )}
        {toolId === "claude" ? (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-text-muted">Default Claude models</span>
            {[
              { slot: "sonnet", label: "Sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL" },
              { slot: "opus", label: "Opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL" },
              { slot: "haiku", label: "Haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL" },
            ].map(({ slot, label, envKey }) => {
              const thinkingLevels = getThinkingLevelsForModel(claudeModels[slot]);
              return (
                <div key={slot} className="flex flex-col gap-1.5">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
                    <span>{label} <code className="font-normal">({envKey})</code></span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={claudeModels[slot]}
                        placeholder={DEFAULT_MODEL}
                        aria-label={`Default ${label} model`}
                        onClick={() => openClaudeModelSelector(slot)}
                        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-main outline-none transition-colors hover:border-primary/60 focus:border-primary"
                      />
                      <Button type="button" variant="secondary" size="sm" onClick={() => openClaudeModelSelector(slot)}>Select</Button>
                      {claudeModels[slot] && <Button type="button" variant="ghost" size="sm" onClick={() => { setClaudeModels((current) => ({ ...current, [slot]: "" })); setClaudeThinking((current) => ({ ...current, [slot]: "" })); }}>Clear</Button>}
                    </div>
                  </label>
                  {thinkingLevels && (
                    <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                      Reasoning / thinking
                      <select
                        value={claudeThinking[slot]}
                        onChange={(event) => setClaudeThinking((current) => ({ ...current, [slot]: event.target.value }))}
                        className="min-w-36 rounded-lg border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                      >
                        <option value="">Default</option>
                        {thinkingLevels.map((level) => <option key={level} value={level}>{level === "none" ? "Disabled" : level}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-text-muted">Choose a model for each Claude Code alias. Empty fields use <code>{DEFAULT_MODEL}</code> as a placeholder.</p>
          </div>
        ) : toolId === "codex" ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
              Default model <code className="font-normal">(model)</code>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={codexModel}
                  placeholder={DEFAULT_MODEL}
                  aria-label="Default Codex model"
                  onClick={() => setModelModalOpen(true)}
                  className="min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-main outline-none transition-colors hover:border-primary/60 focus:border-primary"
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => setModelModalOpen(true)}>Select</Button>
                {codexModel && <Button type="button" variant="ghost" size="sm" onClick={() => { setCodexModel(""); setCodexThinking(""); }}>Clear</Button>}
              </div>
            </label>
            {getThinkingLevelsForModel(codexModel) && (
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                Reasoning / thinking
                <select
                  value={codexThinking}
                  onChange={(event) => setCodexThinking(event.target.value)}
                  className="min-w-36 rounded-lg border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                >
                  <option value="">Default</option>
                  {getThinkingLevelsForModel(codexModel).map((level) => <option key={level} value={level}>{level === "none" ? "Disabled" : level}</option>)}
                </select>
              </label>
            )}
            <p className="text-xs text-text-muted">The selected reasoning level is appended to the model ID, for example <code>cx/gpt-5.6-sol(high)</code>.</p>
          </div>
        ) : toolId === "opencode" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-text-muted">Models</span>
              <Button variant="secondary" size="sm" onClick={() => setModelModalOpen(true)}>
                <span className="material-symbols-outlined mr-1 text-[16px]">add</span>
                Add model
              </Button>
            </div>
            {opencodeModels.length ? (
              <div className="flex flex-wrap gap-2">
                {opencodeModels.map((model) => {
                  const isDefault = model === opencodeDefaultModel;
                  return (
                    <div key={model} className={`inline-flex items-center gap-1 rounded-full border bg-bg-secondary pr-1 text-xs text-text-main ${isDefault ? "border-primary" : "border-border"}`}>
                      <button type="button" onClick={() => setOpencodeDefaultModel(model)} className="rounded-full px-2 py-1 hover:text-primary" title="Set as default model">
                        {model}{isDefault && <span className="ml-1 text-primary">default</span>}
                      </button>
                      <button type="button" onClick={() => removeOpenCodeModel(model)} className="rounded-full p-1 hover:text-red-500" title="Remove model" aria-label={`Remove ${model}`}>
                        <span className="material-symbols-outlined block text-[14px]">close</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-text-muted">No model selected. The generated file uses <code>{DEFAULT_MODEL}</code> as a placeholder.</p>}
            <p className="text-xs text-text-muted">Add every model to expose in OpenCode, then click a model to make it the default.</p>
          </div>
        ) : toolId === "cowork" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-text-muted">Models</span>
              <Button variant="secondary" size="sm" onClick={() => setModelModalOpen(true)}>
                <span className="material-symbols-outlined mr-1 text-[16px]">add</span>
                Add model
              </Button>
            </div>
            {selectedModels.length ? (
              <div className="flex flex-col gap-2">
                {selectedModels.map((model) => {
                  const thinkingLevels = getThinkingLevelsForModel(model);
                  return (
                    <div key={model} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2">
                      <span className="min-w-0 flex-1 break-all text-xs text-text-main">{model}</span>
                      {thinkingLevels && (
                        <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                          Reasoning / thinking
                          <select
                            value={coworkThinking[model] || ""}
                            onChange={(event) => setCoworkThinking((current) => ({ ...current, [model]: event.target.value }))}
                            className="min-w-28 rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                          >
                            <option value="">Default</option>
                            {thinkingLevels.map((level) => <option key={level} value={level}>{level === "none" ? "Disabled" : level}</option>)}
                          </select>
                        </label>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeCoworkModel(model)} aria-label={`Remove ${model}`}>Remove</Button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-text-muted">No model selected. The generated file uses <code>{DEFAULT_MODEL}</code> as a placeholder.</p>}
            <p className="text-xs text-text-muted">Cowork exposes every configured model in its picker. For models that support it, select a reasoning level to append it to the routed model ID.</p>
          </div>
        ) : toolId === "copilot" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-text-muted">Models</span>
              <Button variant="secondary" size="sm" onClick={() => setModelModalOpen(true)}>
                <span className="material-symbols-outlined mr-1 text-[16px]">add</span>
                Add model
              </Button>
            </div>
            {selectedModels.length ? (
              <div className="flex flex-col gap-2">
                {selectedModels.map((model) => {
                  const thinkingLevels = getThinkingLevelsForModel(model);
                  const tokens = copilotTokens[model] || DEFAULT_MODEL_TOKEN_LIMITS;
                  const inputOptions = getInputTokenOptions(tokens);
                  const outputOptions = getOutputTokenOptions(tokens);
                  return (
                    <div key={model} className="flex flex-col gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 break-all text-xs font-medium text-text-main">{model}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeCopilotModel(model)} aria-label={`Remove ${model}`}>Remove</Button>
                      </div>
                      {thinkingLevels && (
                        <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                          Reasoning / thinking
                          <select
                            value={copilotThinking[model] || ""}
                            onChange={(event) => setCopilotThinking((current) => ({ ...current, [model]: event.target.value }))}
                            className="min-w-28 rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                          >
                            <option value="">Default</option>
                            {thinkingLevels.map((level) => <option key={level} value={level}>{level === "none" ? "Disabled" : level}</option>)}
                          </select>
                        </label>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
                          maxInputTokens
                          <select
                            value={tokens.maxInputTokens || ""}
                            onChange={(event) => setCopilotTokens((current) => ({
                              ...current,
                              [model]: { ...current[model], maxInputTokens: event.target.value ? Number(event.target.value) : undefined },
                            }))}
                            className="min-w-20 rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                          >
                            {inputOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
                          maxOutputTokens
                          <select
                            value={tokens.maxOutputTokens || ""}
                            onChange={(event) => setCopilotTokens((current) => ({
                              ...current,
                              [model]: { ...current[model], maxOutputTokens: event.target.value ? Number(event.target.value) : undefined },
                            }))}
                            className="min-w-20 rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                          >
                            {outputOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No model selected. The generated file uses <code>{DEFAULT_MODEL}</code> as a placeholder.</p>
            )}
            <p className="text-xs text-text-muted">Select models to expose in VS Code Copilot, then copy the generated <code>chatLanguageModels.json</code> to your VS Code user settings folder. VS Code prompts for your 9Router API key when you first chat with one of these models.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-text-muted">Models</span>
              <Button variant="secondary" size="sm" onClick={() => setModelModalOpen(true)}>
                <span className="material-symbols-outlined mr-1 text-[16px]">add</span>
                Add model
              </Button>
            </div>
            {selectedModels.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedModels.map((model) => (
                  <button key={model} type="button" onClick={() => setSelectedModels((current) => current.filter((item) => item !== model))} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-secondary px-2 py-1 text-xs text-text-main hover:border-red-500/50" title="Remove model">
                    {model}<span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                ))}
              </div>
            ) : <p className="text-xs text-text-muted">No model selected. The generated file uses <code>{DEFAULT_MODEL}</code> as a placeholder.</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={saveStatus === "saving"} variant="secondary" className="w-full sm:w-auto">
            <span className="material-symbols-outlined mr-1 text-[16px]">{saveStatus === "saving" ? "progress_activity" : "save"}</span>
            {saveStatus === "saving" ? "Saving..." : "Save"}
          </Button>
          <Button onClick={() => setConfigModalOpen(true)} className="w-full sm:w-auto">
            <span className="material-symbols-outlined mr-1 text-[16px]">code</span>
            Show configuration file
          </Button>
          {saveStatus === "saved" && <span className="text-xs text-green-600 dark:text-green-400">Configuration saved.</span>}
          {saveStatus === "dirty" && <span className="text-xs text-text-muted">Unsaved changes</span>}
          {saveStatus === "error" && <span className="text-xs text-red-600 dark:text-red-400">{saveError}</span>}
        </div>
        {apiKeyMode === "custom" && toolId !== "copilot" && <p className="text-xs text-amber-600 dark:text-amber-400">The custom API key is never saved and must be entered again after reload.</p>}
        <p className="text-xs text-text-muted">9Router cannot inspect, modify, or apply files on your device from a deployed dashboard.</p>
      </div>

      <ModelSelectModal
        isOpen={modelModalOpen}
        onClose={() => { setModelModalOpen(false); setClaudeModelSlot(""); }}
        onSelect={toolId === "claude" ? selectClaudeModel : toolId === "codex" ? selectCodexModel : toolId === "opencode" ? selectOpenCodeModel : toolId === "copilot" ? addModel : addModel}
        selectedModel=""
        activeProviders={activeProviders}
        title={toolId === "claude" && claudeModelSlot ? `Select ${claudeModelSlot} model` : toolId === "codex" ? "Select Codex model" : toolId === "opencode" ? "Add OpenCode model" : `Add model for ${tool.name}`}
        closeOnSelect={toolId === "claude" || toolId === "codex"}
        addedModelValues={toolId === "claude" ? Object.values(claudeModels).filter(Boolean) : toolId === "codex" ? [codexModel].filter(Boolean) : toolId === "opencode" ? opencodeModels : selectedModels}
        availableModels={availableModels}
      />
      <ManualConfigModal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} title={`${tool.name} configuration`} configs={configs} />
    </Card>
  );
}
