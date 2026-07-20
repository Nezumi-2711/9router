"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/shared/components";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import useUserStore from "@/store/userStore";
import { formatVietnamDateTime } from "@/shared/utils/dateTime";
import { USER_TOKEN_LIMIT_WINDOWS } from "open-sse/config/userTokenLimits.js";
import QuotaCell from "./components/QuotaCell";
import TokenLimitsUsage from "./components/TokenLimitsUsage";
import {
  TOKEN_LIMIT_PROVIDER_OPTIONS,
  TOKEN_LIMIT_WINDOW_OPTIONS,
  formatTokenCount,
} from "./components/tokenLimitDisplay.js";

const EMPTY_FORM = { username: "", password: "", role: "user", isActive: true };

function createEmptyTokenLimits() {
  return Object.fromEntries(TOKEN_LIMIT_PROVIDER_OPTIONS.map(({ id }) => [
    id,
    {
      [USER_TOKEN_LIMIT_WINDOWS.SESSION]: 0,
      [USER_TOKEN_LIMIT_WINDOWS.WEEKLY]: 0,
    },
  ]));
}

function formatDate(value) {
  if (!value) return "—";
  return formatVietnamDateTime(value, { dateStyle: "medium", timeStyle: "short" }) || "—";
}

function normalizeTokenLimitInput(value) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function getTokenLimitNumber(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function TokenLimitField({ provider, windowOption, value, onChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const limit = getTokenLimitNumber(value);
  const isUnlimited = limit === 0;
  const inputId = `${provider.id}-${windowOption.id}-token-limit`;
  const descriptionId = `${inputId}-description`;

  const handleChange = (event) => {
    const nextValue = normalizeTokenLimitInput(event.target.value);
    setDraft(nextValue);
    onChange(nextValue);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (!draft) onChange(0);
  };

  return (
    <section className="rounded-xl border border-border-subtle bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <span className="material-symbols-outlined text-[19px]">{windowOption.id === USER_TOKEN_LIMIT_WINDOWS.SESSION ? "schedule" : "date_range"}</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-main">{windowOption.name}</h3>
            <p className="mt-0.5 text-xs text-text-muted">{windowOption.description}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${isUnlimited ? "bg-surface-2 text-text-muted" : "bg-brand-500/10 text-brand-500"}`}>
          {isUnlimited ? "Unlimited" : "Limited"}
        </span>
      </div>

      <div className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={inputId} className="text-sm font-medium text-text-main">Token budget</label>
          <p className="text-xs text-text-muted" aria-live="polite">{isUnlimited ? "No usage cap" : `${formatTokenCount(limit)} tokens`}</p>
        </div>
        <div className="relative mt-1.5">
          <Input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={isEditing ? draft : formatTokenCount(limit)}
            onFocus={() => {
              setDraft(String(value ?? ""));
              setIsEditing(true);
            }}
            onBlur={handleBlur}
            onChange={handleChange}
            aria-describedby={descriptionId}
            aria-label={`${provider.name} ${windowOption.name.toLowerCase()} token limit`}
            inputClassName="h-12 pr-20 font-mono text-lg font-semibold tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-medium text-text-muted">tokens</span>
        </div>
        <p id={descriptionId} className="mt-2 text-xs leading-5 text-text-muted">Enter <span className="font-mono tabular-nums">0</span> to leave this window unlimited.</p>
      </div>
    </section>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const fetchCurrentUser = useUserStore((state) => state.fetchCurrentUser);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [limitEditor, setLimitEditor] = useState(null);
  const [tokenLimits, setTokenLimits] = useState(createEmptyTokenLimits);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [limitsError, setLimitsError] = useState("");
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const activeTokenLimitCount = TOKEN_LIMIT_PROVIDER_OPTIONS.reduce((count, provider) => (
    count + TOKEN_LIMIT_WINDOW_OPTIONS.filter(({ id }) => getTokenLimitNumber(tokenLimits[provider.id]?.[id]) > 0).length
  ), 0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (response.status === 403) {
        router.replace("/dashboard");
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
    } catch (requestError) {
      setError(requestError.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!user) fetchCurrentUser();
  }, [fetchCurrentUser, user]);

  useEffect(() => {
    if (!user) return undefined;
    if (user.role !== "admin") {
      router.replace("/dashboard");
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => { void loadUsers(); });
    return () => window.cancelAnimationFrame(frameId);
  }, [loadUsers, router, user]);

  const openCreate = () => {
    setError("");
    setForm(EMPTY_FORM);
    setEditor({ mode: "create" });
  };

  const openEdit = (target) => {
    setError("");
    setForm({ username: target.username, password: "", role: target.role, isActive: target.isActive });
    setEditor({ mode: "edit", user: target });
  };

  const saveUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isCreate = editor.mode === "create";
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      const response = await fetch(isCreate ? "/api/users" : `/api/users/${editor.user.id}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save user");
      setEditor(null);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete user");
      setDeleteTarget(null);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Failed to delete user");
    } finally {
      setSaving(false);
    }
  };

  const openTokenLimits = async (target) => {
    setLimitEditor(target);
    setTokenLimits(createEmptyTokenLimits());
    setLimitsError("");
    setLimitsLoading(true);
    try {
      const response = await fetch(`/api/users/${target.id}/token-limits`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load token limits");
      setTokenLimits(data.limits || createEmptyTokenLimits());
    } catch (requestError) {
      setLimitsError(requestError.message || "Failed to load token limits");
    } finally {
      setLimitsLoading(false);
    }
  };

  const updateTokenLimit = (provider, windowType, value) => {
    setTokenLimits((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [windowType]: value,
      },
    }));
  };

  const saveTokenLimits = async () => {
    if (!limitEditor) return;
    setLimitsSaving(true);
    setLimitsError("");
    try {
      const normalizedLimits = Object.fromEntries(TOKEN_LIMIT_PROVIDER_OPTIONS.map(({ id }) => [
        id,
        {
          [USER_TOKEN_LIMIT_WINDOWS.SESSION]: Number(tokenLimits[id]?.session || 0),
          [USER_TOKEN_LIMIT_WINDOWS.WEEKLY]: Number(tokenLimits[id]?.weekly || 0),
        },
      ]));
      const response = await fetch(`/api/users/${limitEditor.id}/token-limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limits: normalizedLimits }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save token limits");
      setQuotaRefreshKey((current) => current + 1);
      setLimitEditor(null);
    } catch (requestError) {
      setLimitsError(requestError.message || "Failed to save token limits");
    } finally {
      setLimitsSaving(false);
    }
  };

  if (!user || user.role !== "admin") {
    return <div className="py-12 text-center text-text-muted">Loading user management…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-main">Users</h1>
          <p className="mt-1 text-sm text-text-muted">Manage dashboard accounts and access roles.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Add user
        </Button>
      </div>

      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle bg-surface-2/50 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Quota remaining</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr><td colSpan="6" className="px-5 py-12 text-center text-text-muted">Loading users…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="6" className="px-5 py-12 text-center text-text-muted">No users found.</td></tr>
              ) : users.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-surface-2/40">
                  <td className="px-5 py-4 font-medium text-text-main">{entry.username}{entry.id === user.id ? <span className="ml-2 text-xs font-normal text-text-muted">(you)</span> : null}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${entry.role === "admin" ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted"}`}>{entry.role}</span></td>
                  <td className="px-5 py-4"><span className={entry.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-text-muted"}>{entry.isActive ? "Active" : "Disabled"}</span></td>
                  <td className="px-5 py-4">
                    {entry.role === "user" ? <QuotaCell userId={entry.id} refreshKey={quotaRefreshKey} /> : <span className="text-xs text-text-muted">—</span>}
                  </td>
                  <td className="px-5 py-4 text-text-muted">{formatDate(entry.createdAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {entry.role === "user" ? <Button variant="ghost" size="sm" onClick={() => openTokenLimits(entry)}>Token limits</Button> : null}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeleteTarget(entry)} disabled={entry.id === user.id}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={!!editor}
        onClose={() => !saving && setEditor(null)}
        title={editor?.mode === "create" ? "Add user" : `Edit ${editor?.user?.username || "user"}`}
        footer={<><Button variant="ghost" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button><Button variant="primary" type="submit" form="user-editor" loading={saving}>{editor?.mode === "create" ? "Create user" : "Save changes"}</Button></>}
      >
        <form id="user-editor" className="space-y-4" onSubmit={saveUser}>
          <div className="space-y-2"><label className="text-sm font-medium">Username</label><Input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} minLength="3" required autoFocus /></div>
          <div className="space-y-2"><label className="text-sm font-medium">{editor?.mode === "create" ? "Password" : "New password (optional)"}</label><Input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} minLength="6" required={editor?.mode === "create"} autoComplete="new-password" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Role</label><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-main"><option value="user">User</option><option value="admin">Administrator</option></select></div>
          {editor?.mode === "edit" ? <label className="flex items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Account is active</label> : null}
        </form>
      </Modal>

      <Modal
        isOpen={!!limitEditor}
        onClose={() => !limitsSaving && setLimitEditor(null)}
        title={`Usage & limits · ${limitEditor?.username || "user"}`}
        size="full"
        footer={<><Button variant="ghost" onClick={() => setLimitEditor(null)} disabled={limitsSaving}>Cancel</Button><Button variant="primary" onClick={saveTokenLimits} loading={limitsSaving} disabled={limitsLoading}>Save limits</Button></>}
      >
        <div className="space-y-6">
          <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-brand-500">hourglass_top</span>
              <div>
                <p className="text-sm font-medium text-text-main">Total token budgets</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">Usage includes input and output tokens. A session lasts 5 hours from its first request; weekly usage resets Monday at 00:00 Vietnam time. Enter 0 for unlimited.</p>
              </div>
            </div>
          </div>

          {limitsError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{limitsError}</p> : null}

          {limitEditor ? (
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Current headroom</p>
                <p className="mt-1 text-sm text-text-muted">The lowest active window determines the quota shown in the users table.</p>
              </div>
              <TokenLimitsUsage userId={limitEditor.id} refreshKey={quotaRefreshKey} />
            </section>
          ) : null}

          {limitsLoading ? (
            <div className="py-10 text-center text-sm text-text-muted">Loading token limits…</div>
          ) : (
            <section className="space-y-3 border-t border-border-subtle pt-6">
              <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-2/35 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Budget settings</p>
                  <p className="mt-1 text-sm text-text-muted">Enter an exact token budget for each usage window. Set 0 for unlimited.</p>
                </div>
                <div className="shrink-0 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-right">
                  <p className="font-mono text-lg font-semibold leading-none text-text-main tabular-nums">{activeTokenLimitCount}<span className="text-sm text-text-muted"> / {TOKEN_LIMIT_PROVIDER_OPTIONS.length * TOKEN_LIMIT_WINDOW_OPTIONS.length}</span></p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">active budgets</p>
                </div>
              </div>
              {TOKEN_LIMIT_PROVIDER_OPTIONS.map((provider) => (
                <section key={provider.id} className="rounded-xl border border-border-subtle bg-surface-2/35 p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-border-subtle bg-surface text-brand-500 shadow-sm">
                      <span className="material-symbols-outlined text-[21px]">{provider.icon}</span>
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-text-main">{provider.name}</h2>
                      <p className="text-xs text-text-muted">{provider.description}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {TOKEN_LIMIT_WINDOW_OPTIONS.map((windowOption) => (
                      <TokenLimitField
                        key={windowOption.id}
                        provider={provider}
                        windowOption={windowOption}
                        value={tokenLimits[provider.id]?.[windowOption.id] ?? 0}
                        onChange={(value) => updateTokenLimit(provider.id, windowOption.id, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </section>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !saving && setDeleteTarget(null)}
        onConfirm={deleteUser}
        title="Delete user"
        message={`Delete ${deleteTarget?.username || "this user"}? This cannot be undone.`}
        confirmText="Delete user"
        loading={saving}
      />
    </div>
  );
}