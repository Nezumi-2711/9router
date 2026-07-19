"use client";

import { useState, useEffect } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";

export default function MitmPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [availableModels, setAvailableModels] = useState([]);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/providers"),
      fetch("/api/keys"),
      fetch("/api/models/alias"),
      fetch("/api/models/connected", { cache: "no-store" }),
      fetch("/api/settings"),
    ]).then(async ([connectionsRes, keysRes, aliasesRes, modelsRes, settingsRes]) => {
      const [connectionsData, keysData, aliasesData, modelsData, settingsData] = await Promise.all([
        connectionsRes.ok ? connectionsRes.json() : {},
        keysRes.ok ? keysRes.json() : {},
        aliasesRes.ok ? aliasesRes.json() : {},
        modelsRes.ok ? modelsRes.json() : {},
        settingsRes.ok ? settingsRes.json() : {},
      ]);
      if (cancelled) return;

      setConnections(connectionsData.connections || []);
      setApiKeys(keysData.keys || []);
      setModelAliases(aliasesData.aliases || {});
      setAvailableModels(modelsData.models || []);
      setCloudEnabled(settingsData.cloudEnabled || false);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const hasActiveProviders = () => availableModels.length > 0;

  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
        <span className="material-symbols-outlined text-[16px] text-yellow-500 mt-0.5 shrink-0">warning</span>
        <p className="text-xs text-red-600 dark:text-yellow-400 leading-relaxed">
          ⚠️ MITM intercepts HTTPS traffic of IDE tools (Antigravity, GitHub Copilot, Kiro) via local CA to redirect requests to your providers. May violate ToS → account ban. Use at your own risk.
        </p>
      </div>

      {/* MITM Server Card */}
      <MitmServerCard
        apiKeys={apiKeys}
        cloudEnabled={cloudEnabled}
        onStatusChange={setMitmStatus}
      />

      {/* Tool Cards */}
      <div className="grid gap-3 sm:gap-4">
        {mitmTools.map(([toolId, tool]) => (
          <MitmToolCard
            key={toolId}
            tool={tool}
            isExpanded={expandedTool === toolId}
            onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)}
            serverRunning={mitmStatus.running}
            dnsActive={mitmStatus.dnsStatus?.[toolId] || false}
            hasCachedPassword={mitmStatus.hasCachedPassword || false}
            needsSudoPassword={mitmStatus.needsSudoPassword !== false}
            isWin={mitmStatus.isWin === true}
            apiKeys={apiKeys}
            activeProviders={getActiveProviders()}
            availableModels={availableModels}
            hasActiveProviders={hasActiveProviders()}
            modelAliases={modelAliases}
            cloudEnabled={cloudEnabled}
            onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))}
          />
        ))}
      </div>
    </div>
  );
}
