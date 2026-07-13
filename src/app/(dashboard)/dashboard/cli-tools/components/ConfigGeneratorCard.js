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

function buildConfigs(toolId, { baseUrl, apiKey, models, claudeModels = {}, claudeThinking = {}, codexModel = "", codexThinking = "" }) {
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
      const modelEntries = Object.fromEntries(selectedModels.map((id) => [id, {
        name: id,
        modalities: { input: ["text", "image"], output: ["text"] },
      }]));
      return [{
        filename: "~/.config/opencode/opencode.json",
        content: toJson({
          provider: { "9router": {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: endpoint, apiKey },
            models: modelEntries,
          } },
          model: `9router/${model}`,
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
        filename: "Claude Desktop third-party inference configuration.json",
        content: toJson({ baseUrl: endpoint, apiKey, models: selectedModels }),
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
  const [connectedModels, setConnectedModels] = useState(null);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const effectiveBaseUrl = customBaseUrl || baseUrl;
  const apiKey = selectedApiKey.trim() || (cloudEnabled ? "<API_KEY_FROM_DASHBOARD>" : "sk_9router");
  const configs = useMemo(
    () => buildConfigs(toolId, { baseUrl: effectiveBaseUrl, apiKey, models: selectedModels, claudeModels, claudeThinking, codexModel, codexThinking }),
    [toolId, effectiveBaseUrl, apiKey, selectedModels, claudeModels, claudeThinking, codexModel, codexThinking]
  );

  const getThinkingLevelsForModel = (fullModel) => {
    const connectedModel = connectedModels?.find((model) => model.fullModel === fullModel);
    if (!connectedModel?.provider?.id || !connectedModel.model) return null;
    return getThinkingLevels(connectedModel.provider.id, connectedModel.model);
  };

  useEffect(() => {
    if (toolId !== "claude" && toolId !== "codex") return;

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
        onSelect={toolId === "claude" ? selectClaudeModel : toolId === "codex" ? selectCodexModel : addModel}
        selectedModel=""
        activeProviders={activeProviders}
        title={toolId === "claude" && claudeModelSlot ? `Select ${claudeModelSlot} model` : toolId === "codex" ? "Select Codex model" : `Add model for ${tool.name}`}
        closeOnSelect={toolId === "claude" || toolId === "codex"}
        addedModelValues={toolId === "claude" ? Object.values(claudeModels).filter(Boolean) : toolId === "codex" ? [codexModel].filter(Boolean) : selectedModels}
        availableModels={toolId === "claude" || toolId === "codex" ? connectedModels : null}
      />
      <ManualConfigModal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} title={`${tool.name} configuration`} configs={configs} />
    </Card>
  );
}
