"use client";

import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  TOKEN_LIMIT_PROVIDER_OPTIONS,
  TOKEN_LIMIT_WINDOW_OPTIONS,
  formatTokenCount,
  getProviderRemainingPercentage,
  getQuotaTone,
} from "./tokenLimitDisplay.js";

function UsageWindow({ option, usage }) {
  const hasLimit = usage?.limit > 0;

  if (!hasLimit) {
    return (
      <div className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{option.name}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">{option.description}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium tabular-nums text-text-main">
            {formatTokenCount(usage?.used)} used
          </span>
          <span className="rounded-full border border-border-subtle bg-surface px-2 py-1 text-[11px] font-medium text-text-muted">
            Unlimited
          </span>
        </div>
      </div>
    );
  }

  const tone = getQuotaTone(usage.remainingPercentage);

  return (
    <div className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{option.name}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">{option.description}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          <span className={`font-semibold tabular-nums ${tone.text}`}>
            {usage.remainingPercentage}% remaining
          </span>
          <span className="truncate text-right tabular-nums text-text-muted">
            {formatTokenCount(usage.used)} / {formatTokenCount(usage.limit)} used
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-label={`${option.name} quota remaining`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usage.remainingPercentage}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${tone.bar}`}
            style={{ width: `${usage.remainingPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading token usage">
      {[1, 2].map((key) => (
        <div key={key} className="animate-pulse rounded-xl border border-border-subtle p-4">
          <div className="h-4 w-24 rounded bg-surface-2" />
          <div className="mt-4 h-2 w-full rounded-full bg-surface-2" />
          <div className="mt-4 h-2 w-4/5 rounded-full bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

export default function TokenLimitsUsage({ userId, refreshKey = 0 }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsage() {
      setState((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const response = await fetch(`/api/users/${userId}/token-usage`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Failed to load token usage");
        setState({ status: "ready", data: payload, error: "" });
      } catch (error) {
        if (error?.name !== "AbortError") {
          setState({ status: "error", data: null, error: error?.message || "Failed to load token usage" });
        }
      }
    }

    void loadUsage();
    return () => controller.abort();
  }, [refreshKey, userId]);

  if (state.status === "loading") return <UsageSkeleton />;

  if (state.status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3">
        <span className="material-symbols-outlined mt-0.5 text-[19px] text-red-500">error</span>
        <div>
          <p className="text-sm font-medium text-text-main">Usage data is unavailable</p>
          <p className="mt-0.5 text-xs text-text-muted">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {TOKEN_LIMIT_PROVIDER_OPTIONS.map((provider) => {
        const providerUsage = state.data?.providers?.[provider.id];
        const remainingPercentage = getProviderRemainingPercentage(providerUsage);
        const tone = remainingPercentage === null ? null : getQuotaTone(remainingPercentage);

        return (
          <section key={provider.id} className="overflow-hidden rounded-xl border border-border-subtle bg-surface-2/25">
            <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-brand-500">{provider.icon}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-text-main">{provider.name}</h3>
                  <p className="truncate text-[11px] text-text-muted">{provider.description}</p>
                </div>
              </div>
              {remainingPercentage === null ? (
                <span className="shrink-0 text-xs font-medium text-text-muted">No limits</span>
              ) : (
                <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums ${tone.text}`}>
                  <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                  {remainingPercentage}% min.
                </span>
              )}
            </header>
            <div className="divide-y divide-border-subtle px-4 py-3">
              {TOKEN_LIMIT_WINDOW_OPTIONS.map((option) => (
                <UsageWindow key={option.id} option={option} usage={providerUsage?.[option.id]} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

UsageWindow.propTypes = {
  option: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  }).isRequired,
  usage: PropTypes.shape({
    limit: PropTypes.number,
    used: PropTypes.number,
    remainingPercentage: PropTypes.number,
  }),
};

TokenLimitsUsage.propTypes = {
  userId: PropTypes.string.isRequired,
  refreshKey: PropTypes.number,
};
