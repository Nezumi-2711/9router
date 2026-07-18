"use client";

import { useState, useEffect } from "react";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";
import { Skeleton } from "@/shared/components/Loading";

function LoginLoadingState() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-bg px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl flex-col justify-center py-10">
        <div className="mb-8 space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-12 w-64 max-w-full" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Card elev padding="lg" className="space-y-7">
          <div className="space-y-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          </div>
          <div className="space-y-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full bg-brand-500/25" />
          </div>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
        } else {
          // Safe fallback on non-OK response to avoid infinite loading state.
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError("We couldn't sign you in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Force a new password before entering the dashboard (default + remote).
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("We couldn't set your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const oidcAvailable = oidcConfigured && ["oidc", "both"].includes(authMode);
  const passwordAvailable = authMode !== "oidc" || !oidcConfigured;

  // Show loading state while checking password
  if (hasPassword === null) {
    return <LoginLoadingState />;
  }

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-bg px-4 py-8 sm:px-6 lg:px-8">
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl flex-col justify-center py-10">
        <header className="mb-8">
          <p className="mb-5 text-sm font-semibold tracking-[-0.02em] text-text-main">9Router (Remake)</p>
          <h1 className="max-w-none text-[clamp(2.125rem,6vw,3rem)] font-semibold leading-[0.96] tracking-[-0.065em] text-text-main">
            Route your models from one secure workspace.
          </h1>
          <p className="mt-4 max-w-[38ch] text-pretty text-sm leading-6 text-text-muted sm:text-base">
            {authMode === "oidc" && oidcConfigured
              ? "Sign in with your identity provider to access the dashboard."
              : "Enter your administrator credentials to access the dashboard."}
          </p>
        </header>

        <Card elev padding="lg">
          <div className="mb-7">
            <div>
              <p className="text-sm font-medium text-text-muted">Dashboard access</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-text-main">
                {mustChange ? "Set a new password" : "Sign in"}
              </h2>
            </div>
          </div>

          {mustChange ? (
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-5">
              <div className="rounded-[10px] border border-warning/25 bg-warning/10 p-3 text-sm leading-5 text-warning">
                <p>Set a new password before accessing the dashboard remotely.</p>
              </div>
              <div>
                <Input
                  label="New password"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  error={error || undefined}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" variant="primary" fullWidth loading={loading} disabled={!newPassword}>
                Set password
              </Button>
            </form>
          ) : (
          <div className="flex flex-col gap-5">
            {oidcAvailable && (
              <Button
                type="button"
                variant={passwordAvailable ? "outline" : "primary"}
                fullWidth
                onClick={handleOidcLogin}
              >
                {oidcLoginLabel}
              </Button>
            )}

            {oidcAvailable && passwordAvailable && (
              <div className="flex items-center gap-3" aria-hidden="true">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-subtle">or use a password</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {passwordAvailable ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-5">
                {((authMode === "oidc" && !oidcConfigured) || (authMode === "both" && !oidcConfigured)) && (
                  <div className="rounded-[10px] border border-warning/25 bg-warning/10 p-3 text-xs leading-5 text-warning">
                    <p>OIDC is enabled but not configured. Password login remains available for recovery.</p>
                  </div>
                )}

                {authMode === "both" && oidcConfigured && (
                  <p className="text-xs leading-5 text-text-muted">
                    Password and identity-provider sign-in are both available.
                  </p>
                )}

                <Input
                  label="Username"
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  autoFocus={!oidcAvailable}
                />

                <div className="space-y-2">
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={error || undefined}
                    required
                    autoComplete="current-password"
                  />
                  {retryAfter > 0 && (
                    <p className="text-xs text-warning" role="status" aria-live="polite">
                      Locked. Retry in <span className="font-mono tabular-nums">{retryAfter}s</span>.
                    </p>
                  )}
                  {resetHint && (
                    <div className="rounded-[10px] border border-border-subtle bg-surface-2/70 p-3 text-xs leading-5 text-text-muted">
                      <p>
                        Reset the password from the host: open <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-text-main">9router</code>, then go to <strong className="font-medium text-text-main">Settings</strong> and select <strong className="font-medium text-text-main">Reset Password to Default</strong>.
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={retryAfter > 0}
                >
                  {retryAfter > 0 ? `Wait ${retryAfter}s` : "Sign in"}
                </Button>

                {hasPassword === false && (
                  <div className="rounded-[10px] border border-warning/25 bg-warning/10 p-3 text-xs leading-5 text-warning">
                    <p>No password is set. Remote sign-in requires you to create one before accessing the dashboard.</p>
                  </div>
                )}
              </form>
            ) : (
              error && <p className="text-xs text-danger" role="alert">{error}</p>
            )}
          </div>
          )}
        </Card>
        <footer className="mt-6 max-w-md text-xs leading-5 text-text-subtle">
          Forked from the official 9Router project and remade by Nezumi.
        </footer>
      </div>
    </main>
  );
}
