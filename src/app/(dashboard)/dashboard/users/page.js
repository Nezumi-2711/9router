"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/shared/components";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import useUserStore from "@/store/userStore";
import { formatVietnamDateTime } from "@/shared/utils/dateTime";

const EMPTY_FORM = { username: "", password: "", role: "user", isActive: true };

function formatDate(value) {
  if (!value) return "—";
  return formatVietnamDateTime(value, { dateStyle: "medium", timeStyle: "short" }) || "—";
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
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr><td colSpan="5" className="px-5 py-12 text-center text-text-muted">Loading users…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="5" className="px-5 py-12 text-center text-text-muted">No users found.</td></tr>
              ) : users.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-surface-2/40">
                  <td className="px-5 py-4 font-medium text-text-main">{entry.username}{entry.id === user.id ? <span className="ml-2 text-xs font-normal text-text-muted">(you)</span> : null}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${entry.role === "admin" ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted"}`}>{entry.role}</span></td>
                  <td className="px-5 py-4"><span className={entry.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-text-muted"}>{entry.isActive ? "Active" : "Disabled"}</span></td>
                  <td className="px-5 py-4 text-text-muted">{formatDate(entry.createdAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
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