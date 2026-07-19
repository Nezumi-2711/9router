"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { CardSkeleton } from "@/shared/components";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { resolveCliToolBaseUrl } from "@/shared/utils/cliToolEndpoint";
import { ConfigGeneratorCard, DefaultToolCard } from "../components";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;
const CONFIGURED_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export default function ToolDetailClient({ toolId, machineId }) {
  const tool = CLI_TOOLS[toolId];
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [initialConfig, setInitialConfig] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [provRes, settingsRes, keysRes, modelsRes, configRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/settings"),
          fetch("/api/keys"),
          fetch("/api/models/connected", { cache: "no-store" }),
          fetch(`/api/cli-tools/config/${encodeURIComponent(toolId)}`, { cache: "no-store" }),
        ]);
        if (!mounted) return;
        if (provRes.ok) {
          const data = await provRes.json();
          setConnections(data.connections || []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setCloudEnabled(data.cloudEnabled || false);
        }
        if (keysRes.ok) {
          const data = await keysRes.json();
          setApiKeys(data.keys || []);
        }
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setAvailableModels(data.models || []);
        }
        if (configRes.ok) {
          const data = await configRes.json();
          setInitialConfig(data.config || null);
        }
      } catch (error) {
        console.log("Error loading tool data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [toolId]);

  const saveConfig = useCallback(async (config) => {
    const response = await fetch(`/api/cli-tools/config/${encodeURIComponent(toolId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to save configuration");
    setInitialConfig(data.config);
    return data.config;
  }, [toolId]);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const getBaseUrl = () => {
    return resolveCliToolBaseUrl({
      appUrl: typeof window !== "undefined" ? window.location.origin : "",
      configuredBaseUrl: CONFIGURED_BASE_URL,
      requiresExternalUrl: tool?.requiresExternalUrl === true,
      cloudEnabled,
      cloudUrl: CLOUD_URL,
    });
  };

  const renderToolCard = () => {
    const commonProps = {
      tool,
      toolId,
      baseUrl: getBaseUrl(),
      apiKeys,
      activeProviders: getActiveProviders(),
      availableModels,
      cloudEnabled,
      initialConfig,
      onSaveConfig: saveConfig,
    };

    if (tool.configType === "guide") return <DefaultToolCard toolId={toolId} {...commonProps} />;
    return <ConfigGeneratorCard {...commonProps} />;
  };

  // Guard removed/unknown tools (e.g. disabled Cowork) to avoid crash on direct URL.
  if (!tool) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:px-0">
        <Link href="/dashboard/cli-tools" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary w-fit">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to CLI Tools
        </Link>
        <p className="text-sm text-text-muted">Tool not found or disabled.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:px-0">
      <Link href="/dashboard/cli-tools" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary w-fit">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to CLI Tools
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-main sm:text-2xl">{tool.name}</h1>
        <p className="text-sm text-text-muted">{tool.description}</p>
      </div>
      {loading ? <CardSkeleton /> : renderToolCard()}
    </div>
  );
}
