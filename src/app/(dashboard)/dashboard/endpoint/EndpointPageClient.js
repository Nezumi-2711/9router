"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { Button, Card, ConfirmModal, Input, Modal, Toggle } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { formatVietnamDateTime } from "@/shared/utils/dateTime";
import EndpointRow from "./components/EndpointRow";
import QuickStatsBar, { QuickStatsBarSkeleton } from "./components/QuickStatsBar";
import QuickConnectSnippet from "./components/QuickConnectSnippet";
import SecurityWarning from "./components/SecurityWarning";
import styles from "../DashboardPage.module.css";

const subscribeToBrowserLocation = () => () => {};
const getBaseUrl = () => `${window.location.origin}/v1`;
const getRemoteHost = () => !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

export default function APIPageClient({ isAdmin }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [requireApiKey, setRequireApiKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(new Set());
  const [quickStats, setQuickStats] = useState(null);
  const [quickStatsLoading, setQuickStatsLoading] = useState(true);
  const [providerSummary, setProviderSummary] = useState(null);

  const baseUrl = useSyncExternalStore(subscribeToBrowserLocation, getBaseUrl, () => "/v1");
  const isRemoteHost = useSyncExternalStore(subscribeToBrowserLocation, getRemoteHost, () => false);
  const { copied, copy } = useCopyToClipboard();

  const loadSettings = useCallback(async () => {
    setSettingsError("");
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error("Failed to load access settings");
      const data = await response.json();
      setRequireApiKey(data.requireApiKey || false);
    } catch (error) {
      console.log("Error loading settings:", error);
      setSettingsError("We couldn't load access settings. Refresh the page to try again.");
    }
  }, []);

  const fetchKeys = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/keys");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to fetch API keys");
      setKeys(data.keys || []);
    } catch (error) {
      console.log("Error fetching API keys:", error);
      setLoadError("We couldn't load your API keys. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQuickStats = useCallback(async () => {
    setQuickStatsLoading(true);
    try {
      const [statsResponse, providersResponse] = await Promise.all([
        fetch("/api/usage/stats?period=today"),
        fetch("/api/providers/client?pageSize=500"),
      ]);

      if (!statsResponse.ok) throw new Error("Failed to fetch usage statistics");

      const statsData = await statsResponse.json();
      setQuickStats(statsData);

      if (providersResponse.ok) {
        const providersData = await providersResponse.json();
        const connections = providersData.connections || [];
        const activeConnections = connections.filter(
          (connection) => connection.isActive && connection.testStatus === "active",
        );
        setProviderSummary({
          active: activeConnections.length,
          total: providersData.pagination?.total ?? connections.length,
        });
      } else {
        setProviderSummary(null);
      }
    } catch {
      setQuickStats(null);
      setProviderSummary(null);
    } finally {
      setQuickStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      void fetchKeys();
      void fetchQuickStats();
      if (isAdmin) void loadSettings();
    }, 0);
    return () => window.clearTimeout(initialize);
  }, [fetchKeys, fetchQuickStats, isAdmin, loadSettings]);

  const handleRequireApiKey = async (value) => {
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApiKey: value }),
      });
      if (response.ok) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create API key");

      setCreatedKey(data.key);
      setNewKeyName("");
      setShowAddModal(false);
      await fetchKeys();
    } catch (error) {
      console.log("Error creating API key:", error);
      setLoadError(error.message || "We couldn't create the API key. Try again.");
    }
  };

  const handleDeleteKey = (id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const response = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (!response.ok) throw new Error("Failed to delete API key");
          setKeys((current) => current.filter((key) => key.id !== id));
          setVisibleKeys((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        } catch (error) {
          console.log("Error deleting API key:", error);
          setLoadError("We couldn't delete the API key. Try again.");
        }
      },
    });
  };

  const handleToggleKey = async (id, isActive) => {
    try {
      const response = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) throw new Error("Failed to update API key");
      setKeys((current) => current.map((key) => (key.id === id ? { ...key, isActive } : key)));
    } catch (error) {
      console.log("Error toggling API key:", error);
      setLoadError("We couldn't update the API key. Try again.");
    }
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys((current) => {
      const next = new Set(current);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const maskKey = (value) => {
    if (!value || value.length <= 10) return value || "";
    return `${value.slice(0, 6)}${"•".repeat(value.length - 10)}${value.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className={styles.skeleton} aria-busy="true" aria-label="Loading gateway settings">
        <div className={styles.skeletonIntro}>
          <div className="flex flex-col gap-3">
            <div className={`${styles.skeletonLine} h-3 w-24`} />
            <div className={`${styles.skeletonLine} h-9 w-72 max-w-full`} />
            <div className={`${styles.skeletonLine} h-4 w-full max-w-md`} />
          </div>
          <div className="flex flex-col gap-3">
            <div className={`${styles.skeletonLine} h-4 w-28`} />
            <div className={`${styles.skeletonLine} h-3 w-full`} />
            <div className={`${styles.skeletonLine} h-3 w-4/5`} />
          </div>
        </div>
        <QuickStatsBarSkeleton />
        <div className={`${styles.skeletonPanel} flex flex-col gap-4`}>
          <div className={`${styles.skeletonLine} h-5 w-40`} />
          <div className={`${styles.skeletonLine} h-14 w-full`} />
        </div>
        <div className={`${styles.skeletonPanel} flex flex-col gap-4`}>
          <div className={`${styles.skeletonLine} h-5 w-32`} />
          <div className={`${styles.skeletonLine} h-16 w-full`} />
        </div>
      </div>
    );
  }

  const postureCopy = !isAdmin
    ? "Use the local gateway and manage the API keys assigned to this account."
    : requireApiKey
      ? "Local access is ready and API key enforcement is enabled."
      : "Local access is ready. Enable API key enforcement to protect requests.";
  const hasActiveApiKey = keys.some((key) => key.isActive !== false);

  return (
    <div className={styles.console}>
      <section className={styles.intro} aria-labelledby="access-control-title">
        <div>
          <p className={styles.sectionKicker}>Gateway control plane</p>
          <h2 id="access-control-title" className={styles.title}>Control how your clients reach 9Router.</h2>
          <p className={styles.description}>Copy the local gateway and create credentials for the tools connected to this machine.</p>
        </div>
        <aside className={styles.posture} aria-label="Current access posture">
          <p className={styles.postureHeading}><span className={styles.postureIndicator} aria-hidden="true" />Access posture</p>
          <p className={styles.postureCopy}>{postureCopy}</p>
        </aside>
      </section>
      <p className="sr-only" role="status" aria-live="polite">{copied ? "Value copied to clipboard." : ""}</p>

      {quickStatsLoading ? (
        <QuickStatsBarSkeleton />
      ) : (
        <QuickStatsBar stats={quickStats} providerSummary={providerSummary} />
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={fetchKeys}>Retry</Button>
        </div>
      )}

      <Card className={styles.accessPanel}>
        <div className={`${styles.panelHeader} flex items-center gap-3`}>
          <div className={styles.panelIcon}>
            <span className="material-symbols-outlined text-[20px]">api</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold leading-tight">Local access</h3>
            <p className="mt-1 text-xs text-text-muted">Use this OpenAI-compatible gateway from applications on this machine.</p>
          </div>
        </div>
        <EndpointRow
          label="Local"
          url={baseUrl}
          copyId="local_url"
          copied={copied}
          onCopy={copy}
          className={`${styles.routeLocal} ${styles.routeInput}`}
        />
        <QuickConnectSnippet
          baseUrl={baseUrl}
          hasApiKey={hasActiveApiKey}
          requireApiKey={requireApiKey}
          copied={copied}
          onCopy={copy}
        />
      </Card>

      <Card id="require-api-key" className={styles.keysPanel}>
        <div className={`${styles.panelHeader} mb-5 flex items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={`${styles.panelIcon} shrink-0`}>
              <span className="material-symbols-outlined text-[20px]">vpn_key</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Credential registry</h3>
              <p className="mt-1 text-xs text-text-muted">Keys assigned to this dashboard account.</p>
            </div>
          </div>
          <Button icon="add" onClick={() => setShowAddModal(true)} className={styles.signalButton}>Create Key</Button>
        </div>

        {isAdmin && (
          <div className={`${styles.securityPolicy} mb-4 flex items-center justify-between gap-4 px-4 py-3`}>
            <div>
              <p className="font-medium">Require API key</p>
              <p className="text-sm text-text-muted">Reject requests that do not include an active key.</p>
            </div>
            <Toggle checked={requireApiKey} onChange={() => handleRequireApiKey(!requireApiKey)} />
          </div>
        )}

        {isAdmin && isRemoteHost && !requireApiKey && (
          <div className="mb-4 -mt-2">
            <SecurityWarning message="Endpoint is exposed without an API key." />
          </div>
        )}

        {settingsError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
            <span>{settingsError}</span>
            <Button size="sm" variant="outline" onClick={loadSettings}>Retry</Button>
          </div>
        )}

        {keys.length === 0 ? (
          <div className={styles.emptyState}>
            <div>
              <div className={`${styles.emptyGlyph} mx-auto mb-4`}>
                <span className="material-symbols-outlined text-[32px]">vpn_key</span>
              </div>
              <p className="mb-1 font-semibold text-text-main">No API keys yet</p>
              <p className="mx-auto mb-4 max-w-sm text-sm leading-6 text-text-muted">Create a named key for each client or environment that connects to this gateway.</p>
              <Button icon="add" onClick={() => setShowAddModal(true)} className={styles.signalButton}>Create Key</Button>
            </div>
          </div>
        ) : (
          <div className={styles.keyRegistry}>
            {keys.map((key) => (
              <div
                key={key.id}
                className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/45 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${key.isActive === false ? "opacity-60" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold">{key.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${key.isActive === false ? "bg-surface-3 text-text-muted" : "bg-primary/10 text-primary"}`}>
                      {key.isActive === false ? "Paused" : "Active"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                    <code className="truncate font-mono text-xs text-text-muted">{visibleKeys.has(key.id) ? key.key : maskKey(key.key)}</code>
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility(key.id)}
                      className={`grid size-6 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-primary/10 hover:text-primary ${styles.actionIcon}`}
                      title={visibleKeys.has(key.id) ? "Hide key" : "Show key"}
                      aria-label={visibleKeys.has(key.id) ? `Hide ${key.name} key` : `Show ${key.name} key`}
                    >
                      <span className="material-symbols-outlined text-[14px]">{visibleKeys.has(key.id) ? "visibility_off" : "visibility"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(key.key, key.id)}
                      className={`grid size-6 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-primary/10 hover:text-primary ${styles.actionIcon}`}
                      title="Copy API key"
                      aria-label={copied === key.id ? `${key.name} key copied` : `Copy ${key.name} key`}
                    >
                      <span className="material-symbols-outlined text-[14px]">{copied === key.id ? "check" : "content_copy"}</span>
                    </button>
                  </div>
                </div>
                <p className="hidden text-right text-xs text-text-muted sm:block">Created<br />{formatVietnamDateTime(key.createdAt, { dateStyle: "medium" }) || "-"}</p>
                <div className="flex items-center gap-1.5">
                  <Toggle
                    size="sm"
                    checked={key.isActive ?? true}
                    onChange={(checked) => {
                      if (key.isActive && !checked) {
                        setConfirmState({
                          title: "Pause API Key",
                          message: `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`,
                          onConfirm: async () => {
                            setConfirmState(null);
                            await handleToggleKey(key.id, checked);
                          },
                        });
                        return;
                      }
                      void handleToggleKey(key.id, checked);
                    }}
                    title={key.isActive ? "Pause key" : "Resume key"}
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(key.id)}
                    className="grid size-8 place-items-center rounded-lg text-red-500 transition-colors hover:bg-red-500/10"
                    title="Delete API key"
                    aria-label={`Delete ${key.name} key`}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input label="Key Name" value={newKeyName} onChange={(event) => setNewKeyName(event.target.value)} placeholder="Production Key" />
          <div className="flex gap-2">
            <Button onClick={handleCreateKey} fullWidth disabled={!newKeyName.trim()}>Create</Button>
            <Button onClick={() => { setShowAddModal(false); setNewKeyName(""); }} variant="ghost" fullWidth>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!createdKey} title="API Key Created" onClose={() => setCreatedKey(null)}>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="mb-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">Store this key securely</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">Copy it now and store it in your client configuration or credential manager.</p>
          </div>
          <div className="flex gap-2">
            <Input value={createdKey || ""} readOnly className="flex-1 font-mono text-sm" />
            <Button variant="secondary" icon={copied === "created_key" ? "check" : "content_copy"} onClick={() => copy(createdKey, "created_key")}>
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setCreatedKey(null)} fullWidth>Done</Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

APIPageClient.propTypes = {
  isAdmin: PropTypes.bool.isRequired,
};
