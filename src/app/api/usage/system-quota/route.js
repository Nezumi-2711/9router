// Ensure proxyFetch is loaded to patch globalThis.fetch
import "open-sse/index.js";

import { getProviderConnections } from "@/lib/localDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { USAGE_APIKEY_PROVIDERS, USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { refreshAndUpdateCredentials } from "@/app/api/usage/[connectionId]/route";
import { getUsageForProvider } from "open-sse/services/usage.js";
import {
  getRemainingPercentage,
  parseQuotaData,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 1000;
let cachedSystemQuota = null;

function isUsageEligible(connection) {
  const isApiKey = connection.authType === "apikey" || connection.authType === "api_key";
  return USAGE_SUPPORTED_PROVIDERS.includes(connection.provider) && (
    connection.authType === "oauth" || (isApiKey && USAGE_APIKEY_PROVIDERS.includes(connection.provider))
  );
}

function getProxyOptions(proxyConfig) {
  return {
    connectionProxyEnabled: proxyConfig.connectionProxyEnabled === true,
    connectionProxyUrl: proxyConfig.connectionProxyUrl || "",
    connectionNoProxy: proxyConfig.connectionNoProxy || "",
    vercelRelayUrl: proxyConfig.vercelRelayUrl || "",
    strictProxy: false,
  };
}

function isAuthenticationError(usage) {
  const message = usage?.message || usage?.error || "";
  return /expired|authentication|unauthorized|401|403|re-authorize/i.test(message);
}

function getEarliestFutureReset(currentResetAt, nextResetAt) {
  const currentTime = currentResetAt ? new Date(currentResetAt).getTime() : Number.POSITIVE_INFINITY;
  const nextTime = nextResetAt ? new Date(nextResetAt).getTime() : Number.POSITIVE_INFINITY;
  const now = Date.now();

  if (nextTime > now && nextTime < currentTime) return nextResetAt;
  if (currentTime > now) return currentResetAt;
  return nextResetAt || currentResetAt || null;
}

function sanitizeProviderError(error) {
  const message = String(error?.message || error || "");
  if (/re-authorize|refresh credentials|no codex access token|unauthorized|authentication/i.test(message)) {
    return "An administrator needs to re-authorize this provider connection.";
  }
  if (/temporarily unavailable|rate limit|timeout|fetch/i.test(message)) {
    return "The provider quota service is temporarily unavailable.";
  }
  return "Quota data is temporarily unavailable for this provider.";
}

function hideQuotaResetDetails(data, user) {
  if (user.role === "admin") return data;

  return {
    ...data,
    providers: data.providers.map((provider) => ({
      ...provider,
      quotas: provider.quotas.map(({ resetAt: _resetAt, recurring: _recurring, ...quota }) => quota),
    })),
  };
}

function buildSystemQuotaResponse(connections, results) {
  const providerGroups = new Map();

  for (const connection of connections) {
    if (!providerGroups.has(connection.provider)) {
      providerGroups.set(connection.provider, {
        provider: connection.provider,
        accountCount: 0,
        quotaAccountCount: 0,
        failedAccountCount: 0,
        errorMessage: null,
        quotaGroups: new Map(),
      });
    }
    providerGroups.get(connection.provider).accountCount += 1;
  }

  for (const result of results) {
    const group = providerGroups.get(result.provider);
    if (!group) continue;

    if (result.status !== "fulfilled" || result.value.length === 0) {
      group.failedAccountCount += 1;
      group.errorMessage ||= result.errorMessage || "Quota data is temporarily unavailable for this provider.";
      continue;
    }

    group.quotaAccountCount += 1;
    for (const quota of result.value) {
      if (!quota?.name) continue;

      if (!group.quotaGroups.has(quota.name)) {
        group.quotaGroups.set(quota.name, {
          name: quota.name,
          percentageTotal: 0,
          accountCount: 0,
          resetAt: null,
          recurring: quota.recurring !== false,
        });
      }

      const quotaGroup = group.quotaGroups.get(quota.name);
      quotaGroup.percentageTotal += getRemainingPercentage(quota);
      quotaGroup.accountCount += 1;
      quotaGroup.resetAt = getEarliestFutureReset(quotaGroup.resetAt, quota.resetAt);
      quotaGroup.recurring = quotaGroup.recurring && quota.recurring !== false;
    }
  }

  const providers = Array.from(providerGroups.values())
    .map((group) => ({
      provider: group.provider,
      accountCount: group.accountCount,
      quotaAccountCount: group.quotaAccountCount,
      failedAccountCount: group.failedAccountCount,
      errorMessage: group.errorMessage,
      quotas: Array.from(group.quotaGroups.values()).map((quota) => ({
        name: quota.name,
        remainingPercentage: Math.round(quota.percentageTotal / quota.accountCount),
        accountCount: quota.accountCount,
        resetAt: quota.resetAt,
        recurring: quota.recurring,
      })),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));

  return {
    providers,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchConnectionQuota(connection) {
  const proxyConfig = await resolveConnectionProxyConfig(connection.providerSpecificData);
  const proxyOptions = getProxyOptions(proxyConfig);
  let usableConnection = connection;

  if (connection.authType === "oauth") {
    const refreshed = await refreshAndUpdateCredentials(connection, false, proxyOptions);
    usableConnection = refreshed.connection;
  }

  let usage = await getUsageForProvider(usableConnection, proxyOptions);

  // Match the existing per-connection quota endpoint: a provider can reject an
  // otherwise unexpired OAuth access token, in which case a forced refresh and
  // a single retry is required before declaring the aggregate unavailable.
  if (connection.authType === "oauth" && isAuthenticationError(usage) && connection.refreshToken) {
    const refreshed = await refreshAndUpdateCredentials(usableConnection, true, proxyOptions);
    usableConnection = refreshed.connection;
    usage = await getUsageForProvider(usableConnection, proxyOptions);
  }

  if (usage?.message || usage?.error) {
    throw new Error(usage.message || usage.error);
  }

  return parseQuotaData(connection.provider, usage).filter((quota) => (
    Number.isFinite(getRemainingPercentage(quota))
  ));
}

/**
 * GET /api/usage/system-quota
 *
 * Returns provider-level average quota availability across every eligible system
 * connection. It deliberately excludes all connection, credential, and owner data.
 */
export async function GET(request) {
  try {
    const user = await requireUsageDashboardUser();

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";
    const cacheIsFresh = cachedSystemQuota && Date.now() - cachedSystemQuota.cachedAt < CACHE_TTL_MS;

    if (!forceRefresh && cacheIsFresh) {
      return Response.json({ ...hideQuotaResetDetails(cachedSystemQuota.data, user), cached: true });
    }

    const connections = (await getProviderConnections({})).filter(isUsageEligible);
    const results = await Promise.allSettled(
      connections.map(async (connection) => ({
        provider: connection.provider,
        quotas: await fetchConnectionQuota(connection),
      })),
    );

    const normalizedResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return {
          status: result.status,
          provider: result.value.provider,
          value: result.value.quotas,
        };
      }

      console.warn(`[System quota] ${connections[index].provider}: ${result.reason?.message || "quota fetch failed"}`);
      return {
        status: result.status,
        provider: connections[index].provider,
        value: [],
        errorMessage: sanitizeProviderError(result.reason),
      };
    });

    const data = buildSystemQuotaResponse(connections, normalizedResults);
    cachedSystemQuota = { data, cachedAt: Date.now() };

    return Response.json({ ...hideQuotaResetDetails(data, user), cached: false });
  } catch (error) {
    if (error?.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[System quota] Failed to build aggregate quota:", error);
    return Response.json({ error: "Failed to load system quota" }, { status: 500 });
  }
}
