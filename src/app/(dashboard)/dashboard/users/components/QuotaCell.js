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

function buildQuotaSummary(providerUsage) {
  return TOKEN_LIMIT_WINDOW_OPTIONS
    .map(({ id, name }) => {
      const usage = providerUsage?.[id];
      if (!usage?.limit) return null;
      return `${name}: ${formatTokenCount(usage.remaining)} of ${formatTokenCount(usage.limit)} tokens left`;
    })
    .filter(Boolean)
    .join(" · ");
}

export default function QuotaCell({ userId, refreshKey = 0 }) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsage() {
      setState((current) => ({ ...current, status: "loading" }));
      try {
        const response = await fetch(`/api/users/${userId}/token-usage`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Failed to load token usage");
        setState({ status: "ready", data: payload });
      } catch (error) {
        if (error?.name !== "AbortError") setState({ status: "error", data: null });
      }
    }

    void loadUsage();
    return () => controller.abort();
  }, [refreshKey, userId]);

  if (state.status === "loading") {
    return (
      <div className="flex w-24 flex-col gap-1.5" aria-label="Loading quota">
        <span className="h-2.5 w-20 animate-pulse rounded-full bg-surface-2" />
        <span className="h-2.5 w-14 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-text-muted" title="Quota data is unavailable">
        <span className="size-1.5 rounded-full bg-text-muted/50" aria-hidden="true" />
        Unavailable
      </span>
    );
  }

  const configuredProviders = TOKEN_LIMIT_PROVIDER_OPTIONS.flatMap((provider) => {
    const usage = state.data?.providers?.[provider.id];
    const remainingPercentage = getProviderRemainingPercentage(usage);
    return remainingPercentage === null ? [] : [{ ...provider, usage, remainingPercentage }];
  });

  if (configuredProviders.length === 0) {
    return <span className="text-xs text-text-muted">Unlimited</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {configuredProviders.map((provider) => {
        const tone = getQuotaTone(provider.remainingPercentage);
        const title = `${provider.name} · ${buildQuotaSummary(provider.usage)}`;
        return (
          <span
            key={provider.id}
            className="inline-flex items-center gap-2 whitespace-nowrap text-xs"
            title={title}
          >
            <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
            <span className="w-10 text-text-muted">{provider.shortName}</span>
            <strong className={`min-w-8 text-right font-semibold tabular-nums ${tone.text}`}>
              {provider.remainingPercentage}%
            </strong>
          </span>
        );
      })}
    </div>
  );
}

QuotaCell.propTypes = {
  userId: PropTypes.string.isRequired,
  refreshKey: PropTypes.number,
};
