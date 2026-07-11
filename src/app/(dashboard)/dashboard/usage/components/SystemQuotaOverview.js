"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { Button, Card, CardSkeleton } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { formatResetTime, REFRESH_INTERVAL_MS } from "./ProviderLimits/utils";

function getProviderInfo(providerId) {
  return AI_PROVIDERS[providerId] || {
    name: providerId,
    color: "#6b7280",
  };
}

function formatUpdatedAt(value) {
  if (!value) return "Not updated yet";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not updated yet";

  return `Updated ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatResetAt(value) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `today at ${time}`;
  if (isTomorrow) return `tomorrow at ${time}`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getQuotaTone(percentage) {
  if (percentage > 70) {
    return { bar: "bg-green-500", dot: "bg-green-500", text: "text-green-500" };
  }
  if (percentage >= 30) {
    return { bar: "bg-yellow-500", dot: "bg-yellow-500", text: "text-yellow-500" };
  }
  return { bar: "bg-red-500", dot: "bg-red-500", text: "text-red-500" };
}

function QuotaListRow({ quota }) {
  const tone = getQuotaTone(quota.remainingPercentage);
  const resetIn = formatResetTime(quota.resetAt);
  const resetAt = formatResetAt(quota.resetAt);
  const resetLabel = quota.recurring === false ? "Expires" : "Resets";

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-text-main">{quota.name}</span>
        <span className={`inline-flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums ${tone.text}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
          {quota.remainingPercentage}%
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={`${quota.name} quota remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quota.remainingPercentage}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${tone.bar}`}
          style={{ width: `${Math.min(Math.max(quota.remainingPercentage, 0), 100)}%` }}
        />
      </div>
      {(resetIn !== "-" || resetAt) && (
        <p className="mt-2 text-xs text-text-muted">
          {resetIn !== "-" && <span>{resetLabel} in {resetIn}</span>}
          {resetIn !== "-" && resetAt && <span className="px-1.5 text-text-muted/60"> · </span>}
          {resetAt && <span>{resetAt}</span>}
        </p>
      )}
    </li>
  );
}

function ProviderQuotaListItem({ provider }) {
  const providerInfo = getProviderInfo(provider.provider);
  const providerName = providerInfo.name || provider.provider;
  const hasQuotaData = provider.quotas.length > 0;

  return (
    <article className="flex flex-col gap-5 px-4 py-5 sm:flex-row sm:gap-8 sm:px-6 sm:py-6">
      <header className="flex shrink-0 items-start justify-between gap-4 sm:w-52 sm:flex-col sm:gap-3 lg:w-60">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${providerInfo.color || "#6b7280"}1A` }}
          >
            <ProviderIcon
              src={`/providers/${provider.provider}.png`}
              alt={`${providerName} logo`}
              size={30}
              className="rounded-md"
              fallbackText={providerName.slice(0, 1).toUpperCase()}
              fallbackColor={providerInfo.color}
            />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-text-main">{providerName}</h2>
            <p className="text-sm text-text-muted">
              {provider.accountCount} {provider.accountCount === 1 ? "account" : "accounts"} connected
            </p>
          </div>
        </div>
      </header>

      {hasQuotaData ? (
        <ul className="min-w-0 flex-1 divide-y divide-border-subtle">
          {provider.quotas.map((quota) => <QuotaListRow key={quota.name} quota={quota} />)}
        </ul>
      ) : (
        <div className="flex-1 rounded-lg border border-dashed border-border-subtle bg-bg px-4 py-4 text-sm text-text-muted">
          {provider.failedAccountCount > 0
            ? provider.errorMessage || "Quota data is temporarily unavailable for this provider."
            : "This provider does not currently report quota data."}
        </div>
      )}

      {provider.failedAccountCount > 0 && hasQuotaData && (
        <p className="self-end text-xs text-text-muted sm:max-w-44">
          Some account quota checks could not be completed.
        </p>
      )}
    </article>
  );
}

function OverviewSkeleton() {
  return (
    <Card padding="none" className="overflow-hidden">
      {[1, 2, 3].map((key) => (
        <div key={key} className="border-b border-border-subtle p-4 last:border-b-0 sm:p-6">
          <CardSkeleton />
        </div>
      ))}
    </Card>
  );
}

export default function SystemQuotaOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadQuota = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/usage/system-quota${forceRefresh ? "?refresh=true" : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load system quota");
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError.message || "Failed to load system quota");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => loadQuota(), 0);
    const intervalId = window.setInterval(() => loadQuota(true), REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadQuota]);

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="material-symbols-outlined text-4xl text-red-500">error</span>
        <div>
          <h1 className="font-semibold text-text-main">Unable to load system quota</h1>
          <p className="mt-1 text-sm text-text-muted">{error}</p>
        </div>
        <Button variant="secondary" icon="refresh" onClick={() => loadQuota(true)}>
          Try again
        </Button>
      </Card>
    );
  }

  const providers = data?.providers || [];

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-500">data_usage</span>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">System quota</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-main sm:text-2xl">Available provider capacity</h1>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs text-text-muted">{formatUpdatedAt(data?.updatedAt)}</span>
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            loading={refreshing}
            onClick={() => loadQuota(true)}
          >
            Refresh
          </Button>
        </div>
      </div>

      {providers.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-text-muted">cloud_off</span>
          <div>
            <h2 className="font-semibold text-text-main">No quota-capable providers connected</h2>
            <p className="mt-1 text-sm text-text-muted">
              System quota will appear when an administrator connects a provider that supports usage tracking.
            </p>
          </div>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          {providers.map((provider, index) => (
            <div key={provider.provider} className={index > 0 ? "border-t border-border-subtle" : ""}>
              <ProviderQuotaListItem provider={provider} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
