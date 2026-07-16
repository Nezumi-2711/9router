"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CardSkeleton } from "@/shared/components";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { ConfigGeneratorCard, DefaultToolCard } from "../components";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function ToolDetailClient({ toolId, machineId }) {
  const tool = CLI_TOOLS[toolId];
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tailscaleEnabled, setTailscaleEnabled] = useState(false);
  const [tailscaleUrl, setTailscaleUrl] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [provRes, settingsRes, tunnelRes, keysRes, modelsRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/settings"),
          fetch("/api/tunnel/status"),
          fetch("/api/keys"),
          fetch("/api/models/connected", { cache: "no-store" }),
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
        if (tunnelRes.ok) {
          const data = await tunnelRes.json();
          setTunnelEnabled(!!(data.tunnel?.enabled || data.tunnel?.settingsEnabled));
          setTunnelPublicUrl(data.tunnel?.publicUrl || "");
          setTailscaleEnabled(!!(data.tailscale?.enabled || data.tailscale?.settingsEnabled));
          setTailscaleUrl(data.tailscale?.tunnelUrl || "");
        }
        if (keysRes.ok) {
          const data = await keysRes.json();
          setApiKeys(data.keys || []);
        }
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setAvailableModels((data.models || []).filter((model) => !model.disabled));
        }
      } catch (error) {
        console.log("Error loading tool data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const getBaseUrl = () => {
    if (tunnelEnabled && tunnelPublicUrl) return tunnelPublicUrl;
    if (cloudEnabled && CLOUD_URL) return CLOUD_URL;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:20128";
  };

  const renderToolCard = () => {
    const commonProps = {
      tool,
      toolId,
      baseUrl: getBaseUrl(),
      apiKeys,
      tunnelEnabled,
      tunnelPublicUrl,
      tailscaleEnabled,
      tailscaleUrl,
      activeProviders: getActiveProviders(),
      availableModels,
      cloudEnabled,
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
