"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button, Card, ManualConfigModal, ModelSelectModal } from "@/shared/components";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import BaseUrlSelect from "./BaseUrlSelect";
import ApiKeySelect from "./ApiKeySelect";

const DEFAULT_MODEL = "provider/model-id";

const normalizeV1 = (url) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const toJson = (value) => JSON.stringify(value, null, 2);

const withThinkingLevel = (model, thinkingLevel) => (
  model && thinkingLevel ? `${model}(${thinkingLevel})` : model
);

function buildConfigs(toolId, { baseUrl, apiKey, models, claudeModels = {}, claudeThinking = {}, codexModel = "", codexThinking = "", opencodeModels = [], opencodeDefaultModel = "", coworkThinking = {} }) {
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
        content: toJson(selectedModels.map((id) => ({
          name: id,
          vendor: "9Router",
          model: id,
          apiBase: endpoint,
          apiKey,
        }))),
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
  cloudEnabled,
  tunnelEnabled,
  tunnelPublicUrl,
  tailscaleEnabled,
  tailscaleUrl,
}) {
  const [selectedApiKey, setSelectedApiKey] = useState(() => apiKeys?.[0]?.key || "");
  const [selectedModels, setSelectedModels] = useState([]);
  const [claudeModels, setClaudeModels] = useState({ sonnet: "", opus: "", haiku: "" });
  const [claudeThinking, setClaudeThinking] = useState({ sonnet: "", opus: "", haiku: "" });
  const [claudeModelSlot, setClaudeModelSlot] = useState("");
  const [codexModel, setCodexModel] = useState("");
  const [codexThinking, setCodexThinking] = useState("");
  const [opencodeModels, setOpencodeModels] = useState([]);
  const [opencodeDefaultModel, setOpencodeDefaultModel] = useState("");
  const [coworkThinking, setCoworkThinking] = useState({});
  const [connectedModels, setConnectedModels] = useState(null);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const effectiveBaseUrl = customBaseUrl || baseUrl;
  const apiKey = selectedApiKey.trim() || (cloudEnabled ? "<API_KEY_FROM_DASHBOARD>" : "sk_9router");
  const configs = useMemo(
    () => buildConfigs(toolId, { baseUrl: effectiveBaseUrl, apiKey, models: selectedModels, claudeModels, claudeThinking, codexModel, codexThinking, opencodeModels, opencodeDefaultModel, coworkThinking }),
    [toolId, effectiveBaseUrl, apiKey, selectedModels, claudeModels, claudeThinking, codexModel, codexThinking, opencodeModels, opencodeDefaultModel, coworkThinking]
  );

  const getThinkingLevelsForModel = (fullModel) => {
    const connectedModel = connectedModels?.find((model) => model.fullModel === fullModel);
    if (!connectedModel?.provider?.id || !connectedModel.model) return null;
    return getThinkingLevels(connectedModel.provider.id, connectedModel.model);
  };

  useEffect(() => {
    if (toolId !== "claude" && toolId !== "codex" && toolId !== "opencode" && toolId !== "cowork") return;

    let cancelled = false;
    const loadConnectedModels = async () => {
      try {
        const response = await fetch("/api/models/connected", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load connected models");
        const data = await response.json();
        if (!cancelled) setConnectedModels(data.models || []);
      } catch (error) {
        console.log(`Error loading connected models for ${tool.name}:`, error);
        if (!cancelled) setConnectedModels([]);
      }
    };

    loadConnectedModels();
    return () => { cancelled = true; };
  }, [toolId, tool.name]);

  const addModel = (selected) => {
    if (!selected?.value || selectedModels.includes(selected.value)) return;
    setSelectedModels((current) => [...current, selected.value]);
    if (toolId === "cowork") setCoworkThinking((current) => ({ ...current, [selected.value]: "" }));
  };

  const removeCoworkModel = (model) => {
    setSelectedModels((current) => current.filter((item) => item !== model));
    setCoworkThinking((current) => {
      const remainingThinking = { ...current };
      delete remainingThinking[model];
      return remainingThinking;
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
            value={customBaseUrl || baseUrl}
            onChange={setCustomBaseUrl}
            tunnelEnabled={tunnelEnabled}
            tunnelPublicUrl={tunnelPublicUrl}
            tailscaleEnabled={tailscaleEnabled}
            tailscaleUrl={tailscaleUrl}
            cloudEnabled={cloudEnabled}
            cloudUrl={process.env.NEXT_PUBLIC_CLOUD_URL}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
          API key
          <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
        </label>
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
        <Button onClick={() => setConfigModalOpen(true)} className="w-full sm:w-auto sm:self-start">
          <span className="material-symbols-outlined mr-1 text-[16px]">code</span>
          Show configuration file
        </Button>
        <p className="text-xs text-text-muted">9Router cannot inspect, modify, or apply files on your device from a deployed dashboard.</p>
      </div>

      <ModelSelectModal
        isOpen={modelModalOpen}
        onClose={() => { setModelModalOpen(false); setClaudeModelSlot(""); }}
        onSelect={toolId === "claude" ? selectClaudeModel : toolId === "codex" ? selectCodexModel : toolId === "opencode" ? selectOpenCodeModel : addModel}
        selectedModel=""
        activeProviders={activeProviders}
        title={toolId === "claude" && claudeModelSlot ? `Select ${claudeModelSlot} model` : toolId === "codex" ? "Select Codex model" : toolId === "opencode" ? "Add OpenCode model" : `Add model for ${tool.name}`}
        closeOnSelect={toolId === "claude" || toolId === "codex"}
        addedModelValues={toolId === "claude" ? Object.values(claudeModels).filter(Boolean) : toolId === "codex" ? [codexModel].filter(Boolean) : toolId === "opencode" ? opencodeModels : selectedModels}
        availableModels={toolId === "claude" || toolId === "codex" || toolId === "opencode" || toolId === "cowork" ? connectedModels : null}
      />
      <ManualConfigModal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} title={`${tool.name} configuration`} configs={configs} />
    </Card>
  );
}
