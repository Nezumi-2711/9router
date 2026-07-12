"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Toggle, Input } from "@/shared/components";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LOCALE_FLAGS } from "@/shared/constants/locales";
import useUserStore from "@/store/userStore";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const user = useUserStore((state) => state.user);
  // Only standard user accounts are restricted. Local mode has no dashboard
  // session, so it must retain administrator-level settings controls.
  const isAdmin = user?.role !== "user";
  const fetchCurrentUser = useUserStore((state) => state.fetchCurrentUser);
  const [locale, setLocale] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [settings, setSettings] = useState({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const [dbAuth, setDbAuth] = useState({ open: false, mode: "", password: "" });
  const pendingImportRef = useRef(null);
  const [oidcForm, setOidcForm] = useState({ authMode: "password", oidcIssuerUrl: "", oidcClientId: "", oidcScopes: "openid profile email", oidcLoginLabel: "Sign in with OIDC" });
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcStatus, setOidcStatus] = useState({ type: "", message: "" });
  const [oidcLoading, setOidcLoading] = useState(false);
  const [oidcTestLoading, setOidcTestLoading] = useState(false);
  const [oidcTestStatus, setOidcTestStatus] = useState({ type: "", message: "" });
  const [oidcExpanded, setOidcExpanded] = useState(false);
  const importFileRef = useRef(null);
  const [proxyForm, setProxyForm] = useState({ outboundProxyUrl: "", outboundNoProxy: "" });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  useEffect(() => {
    if (!user) fetchCurrentUser();
  }, [fetchCurrentUser, user]);

  useEffect(() => {
    setLocale(getLocaleFromCookie());
  }, [langOpen]);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setOidcForm({ authMode: data?.authMode || "password", oidcIssuerUrl: data?.oidcIssuerUrl || "", oidcClientId: data?.oidcClientId || "", oidcScopes: data?.oidcScopes || "openid profile email", oidcLoginLabel: data?.oidcLoginLabel || "Sign in with OIDC" });
        setProxyForm({ outboundProxyUrl: data?.outboundProxyUrl || "", outboundNoProxy: data?.outboundNoProxy || "" });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const updateAdminSettings = async (changes) => {
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update settings");
    setSettings((previous) => ({ ...previous, ...data }));
    return data;
  };

  const saveOidcSettings = async () => {
    setOidcLoading(true);
    setOidcStatus({ type: "", message: "" });
    try {
      const payload = { ...oidcForm, oidcIssuerUrl: oidcForm.oidcIssuerUrl.trim(), oidcClientId: oidcForm.oidcClientId.trim(), oidcScopes: oidcForm.oidcScopes.trim() || "openid profile email", oidcLoginLabel: oidcForm.oidcLoginLabel.trim() || "Sign in with OIDC" };
      if (oidcClientSecret.trim()) payload.oidcClientSecret = oidcClientSecret.trim();
      const data = await updateAdminSettings(payload);
      setOidcForm((previous) => ({ ...previous, authMode: data.authMode || previous.authMode }));
      setOidcClientSecret("");
      setOidcStatus({ type: "success", message: "OIDC settings saved" });
    } catch (error) { setOidcStatus({ type: "error", message: error.message }); } finally { setOidcLoading(false); }
  };

  const testOidcConnection = async () => {
    setOidcTestLoading(true);
    setOidcTestStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/auth/oidc/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issuerUrl: oidcForm.oidcIssuerUrl, clientId: oidcForm.oidcClientId, scopes: oidcForm.oidcScopes }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "OIDC connection test failed");
      setOidcTestStatus({ type: "success", message: "OIDC connection successful" });
    } catch (error) { setOidcTestStatus({ type: "error", message: error.message }); } finally { setOidcTestLoading(false); }
  };

  const saveProxySettings = async (event) => {
    event.preventDefault();
    setProxyLoading(true);
    try { await updateAdminSettings(proxyForm); setProxyStatus({ type: "success", message: "Proxy settings applied" }); }
    catch (error) { setProxyStatus({ type: "error", message: error.message }); } finally { setProxyLoading(false); }
  };

  const testOutboundProxy = async () => {
    setProxyTestLoading(true);
    try {
      const res = await fetch("/api/settings/proxy-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proxyUrl: proxyForm.outboundProxyUrl }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Proxy test failed");
      setProxyStatus({ type: "success", message: "Proxy test successful" });
    } catch (error) { setProxyStatus({ type: "error", message: error.message }); } finally { setProxyTestLoading(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch (err) {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const handleExportDatabase = async (password) => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database", {
        headers: { "x-9r-password": password },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }

      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `9router-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = (event) => {
    const file = event.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = "";
    if (!file) return;
    pendingImportRef.current = file;
    setDbStatus({ type: "", message: "" });
    setDbAuth({ open: true, mode: "import", password: "" });
  };

  const runImportDatabase = async (password) => {
    const file = pendingImportRef.current;
    if (!file) return;
    setDbLoading(true);
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);

      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }

      // A backup may replace the current account and its permissions. The API
      // clears the session cookie; redirect immediately to prevent stale data.
      if (data.requiresLogin) {
        window.location.assign("/login");
        return;
      }

      await reloadSettings();
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      pendingImportRef.current = null;
      setDbLoading(false);
    }
  };

  // Confirm password modal, then run export or import.
  const handleDbAuthConfirm = async () => {
    const { mode, password } = dbAuth;
    setDbAuth({ open: false, mode: "", password: "" });
    if (mode === "export") await handleExportDatabase(password);
    else if (mode === "import") await runImportDatabase(password);
  };

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch (e) {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0">
      <div className="flex flex-col gap-6">
        {/* Local Mode Info */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="size-10 sm:size-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl sm:text-2xl">computer</span>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Local Mode</h2>
                <p className="text-sm text-text-muted">Running on your machine</p>
              </div>
            </div>
            <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5 w-full sm:w-auto">
              {["light", "dark", "system"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={cn(
                    "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md font-medium transition-all flex-1 sm:flex-initial",
                    theme === option
                      ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                  </span>
                  <span className="capitalize text-xs sm:text-sm">{option}</span>
                </button>
              ))}
            </div>
          </div>
          {user?.role === "admin" ? (
            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-bg border border-border gap-2">
                <div>
                  <p className="font-medium text-sm sm:text-base">Database Location</p>
                  <p className="text-xs sm:text-sm text-text-muted font-mono break-all">~/.9router/db/data.sqlite</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="secondary"
                  icon="download"
                  onClick={() => setDbAuth({ open: true, mode: "export", password: "" })}
                  loading={dbLoading}
                  className="w-full sm:w-auto"
                >
                  Download Backup
                </Button>
                <Button
                  variant="outline"
                  icon="upload"
                  onClick={() => importFileRef.current?.click()}
                  disabled={dbLoading}
                  className="w-full sm:w-auto"
                >
                  Import Backup
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportDatabase}
                />
              </div>
              <p className="text-xs sm:text-sm text-text-muted">
                Backups include connected-model availability settings from the Models page.
              </p>
              {dbStatus.message && (
                <p className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                  {dbStatus.message}
                </p>
              )}
            </div>
          ) : null}
        </Card>

        {/* Language */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">language</span>
            </div>
            <h3 className="text-base sm:text-lg font-semibold">Language</h3>
          </div>
          <button
            onClick={() => setLangOpen(true)}
            className="flex items-center justify-between w-full p-3 rounded-lg bg-bg border border-border hover:border-primary/50 transition-colors"
            data-i18n-skip="true"
          >
            <span className="text-sm text-text-muted">Display language</span>
            <span className="text-2xl">{LOCALE_FLAGS[locale] || "🌐"}</span>
          </button>
        </Card>

        {isAdmin && (
          <>
            <Card>
              <button type="button" onClick={() => setOidcExpanded((value) => !value)} className="w-full flex items-center gap-3 text-left">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0"><span className="material-symbols-outlined text-[20px]">lock_open</span></div>
                <div className="flex-1"><h3 className="text-base sm:text-lg font-semibold">OIDC Dashboard Login</h3><p className="text-xs text-text-muted">Configure OIDC single sign-on for the dashboard.</p></div>
                <span className="material-symbols-outlined text-text-muted">{oidcExpanded ? "expand_less" : "expand_more"}</span>
              </button>
              {oidcExpanded && (
                <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-border/50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {["password", "oidc", "both"].map((mode) => <Button key={mode} type="button" variant={oidcForm.authMode === mode ? "primary" : "outline"} onClick={() => setOidcForm((previous) => ({ ...previous, authMode: mode }))}>{mode}</Button>)}
                  </div>
                  <Input placeholder="Issuer URL" value={oidcForm.oidcIssuerUrl} onChange={(event) => setOidcForm((previous) => ({ ...previous, oidcIssuerUrl: event.target.value }))} />
                  <Input placeholder="Client ID" value={oidcForm.oidcClientId} onChange={(event) => setOidcForm((previous) => ({ ...previous, oidcClientId: event.target.value }))} />
                  <Input type="password" placeholder="Client Secret (leave blank to keep)" value={oidcClientSecret} onChange={(event) => setOidcClientSecret(event.target.value)} />
                  <Input placeholder="Scopes" value={oidcForm.oidcScopes} onChange={(event) => setOidcForm((previous) => ({ ...previous, oidcScopes: event.target.value }))} />
                  <Input placeholder="Login button label" value={oidcForm.oidcLoginLabel} onChange={(event) => setOidcForm((previous) => ({ ...previous, oidcLoginLabel: event.target.value }))} />
                  <div className="flex gap-2"><Button type="button" variant="primary" loading={oidcLoading} onClick={saveOidcSettings}>Save</Button><Button type="button" variant="outline" loading={oidcTestLoading} onClick={testOidcConnection}>Test connection</Button></div>
                  {[oidcStatus, oidcTestStatus].filter((status) => status.message).map((status, index) => <p key={index} className={`text-sm ${status.type === "error" ? "text-red-500" : "text-green-500"}`}>{status.message}</p>)}
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-4"><div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><span className="material-symbols-outlined text-[20px]">route</span></div><h3 className="text-base sm:text-lg font-semibold">Routing Strategy</h3></div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4"><div><p className="font-medium">Round Robin</p><p className="text-xs text-text-muted">Cycle through accounts to distribute load.</p></div><Toggle checked={settings.fallbackStrategy === "round-robin"} onChange={() => updateAdminSettings({ fallbackStrategy: settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin" })} /></div>
                <div className="flex items-center justify-between gap-4"><div><p className="font-medium">Combo Round Robin</p><p className="text-xs text-text-muted">Cycle through providers in combos.</p></div><Toggle checked={settings.comboStrategy === "round-robin"} onChange={() => updateAdminSettings({ comboStrategy: settings.comboStrategy === "round-robin" ? "fallback" : "round-robin" })} /></div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-4"><div className="p-2 rounded-lg bg-purple-500/10 text-purple-500"><span className="material-symbols-outlined text-[20px]">wifi</span></div><h3 className="text-base sm:text-lg font-semibold">Network</h3></div>
              <div className="flex items-center justify-between gap-4 mb-4"><div><p className="font-medium">Outbound Proxy</p><p className="text-xs text-text-muted">Proxy OAuth and provider outbound requests.</p></div><Toggle checked={settings.outboundProxyEnabled === true} onChange={() => updateAdminSettings({ outboundProxyEnabled: !settings.outboundProxyEnabled })} /></div>
              {settings.outboundProxyEnabled === true && <form onSubmit={saveProxySettings} className="flex flex-col gap-3 pt-4 border-t border-border/50"><Input placeholder="Proxy URL" value={proxyForm.outboundProxyUrl} onChange={(event) => setProxyForm((previous) => ({ ...previous, outboundProxyUrl: event.target.value }))} /><Input placeholder="No Proxy" value={proxyForm.outboundNoProxy} onChange={(event) => setProxyForm((previous) => ({ ...previous, outboundNoProxy: event.target.value }))} /><div className="flex gap-2"><Button type="button" variant="outline" loading={proxyTestLoading} onClick={testOutboundProxy}>Test proxy URL</Button><Button type="submit" variant="primary" loading={proxyLoading}>Apply</Button></div>{proxyStatus.message && <p className={`text-sm ${proxyStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>{proxyStatus.message}</p>}</form>}
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-4"><div className="p-2 rounded-lg bg-orange-500/10 text-orange-500"><span className="material-symbols-outlined text-[20px]">monitoring</span></div><h3 className="text-base sm:text-lg font-semibold">Observability</h3></div>
              <div className="flex items-center justify-between gap-4"><div><p className="font-medium">Enable Observability</p><p className="text-xs text-text-muted">Record request details for the logs view.</p></div><Toggle checked={settings.enableObservability === true} onChange={() => updateAdminSettings({ enableObservability: !settings.enableObservability })} /></div>
            </Card>
          </>
        )}

        {/* Password */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <span className="material-symbols-outlined text-[20px]">password</span>
            </div>
            <h3 className="text-base sm:text-lg font-semibold">Password</h3>
          </div>
          <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
                {settings.hasPassword && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs sm:text-sm font-medium">Current Password</label>
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      required
                    />
                  </div>
                )}
                {/* {!settings.hasPassword && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Setting password for the first time. Leave current password empty or use default: <code className="bg-blue-500/20 px-1 rounded">123456</code>
                    </p>
                  </div>
                )} */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs sm:text-sm font-medium">New Password</label>
                    <Input
                      type="password"
                      placeholder="Enter new password"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs sm:text-sm font-medium">Confirm New Password</label>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {passStatus.message && (
                  <p className={`text-xs sm:text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                    {passStatus.message}
                  </p>
                )}

                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={passLoading} className="w-full sm:w-auto">
                    {settings.hasPassword ? "Update Password" : "Set Password"}
                  </Button>
                </div>
          </form>
        </Card>

        {/* Account actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            fullWidth
            icon="power_settings_new"
            onClick={() => setShutdownOpen(true)}
            className="text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300"
          >
            Shutdown
          </Button>
          <Button
            variant="outline"
            fullWidth
            icon="logout"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>

        {/* App Info */}
        <div className="text-center text-xs sm:text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">Local Mode - All data stored on your machine</p>
        </div>
      </div>

      <LanguageSwitcher
        hideTrigger
        isOpen={langOpen}
        onClose={(next) => {
          setLangOpen(false);
          setLocale(next);
        }}
      />
      <ConfirmModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title="Close Proxy"
        message="Are you sure you want to close the proxy server?"
        confirmText="Close"
        cancelText="Cancel"
        variant="danger"
        loading={isShuttingDown}
      />

      <Modal
        isOpen={dbAuth.open}
        onClose={() => setDbAuth({ open: false, mode: "", password: "" })}
        title="Confirm Password"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDbAuth({ open: false, mode: "", password: "" })} disabled={dbLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDbAuthConfirm} loading={dbLoading} disabled={!dbAuth.password}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-text-muted mb-3 text-sm">
          Enter your current password to {dbAuth.mode === "export" ? "export" : "import"} the database.
        </p>
        <Input
          type="password"
          value={dbAuth.password}
          onChange={(e) => setDbAuth((s) => ({ ...s, password: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter" && dbAuth.password) handleDbAuthConfirm(); }}
          placeholder="Current password"
          autoFocus
        />
      </Modal>
    </div>
  );
}
