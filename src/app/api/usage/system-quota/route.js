// Ensure proxyFetch is loaded to patch globalThis.fetch
import "open-sse/index.js";

import { getProviderConnections } from "@/lib/localDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { USAGE_APIKEY_PROVIDERS, USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { refreshAndUpdateCredentials } from "@/app/api/usage/[connectionId]/route";
import { getUsageForProvider } from "open-sse/services/usage.js";
import { getUserTokenQuota } from "@/lib/userTokenQuota.js";
import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WINDOW_CONFIG,
  USER_TOKEN_LIMIT_WINDOW_IDS,
} from "open-sse/config/userTokenLimits.js";
import {
  getRemainingPercentage,
  parseQuotaData,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 1000;
const cachedSystemQuotas = new Map();
const userTokenQuotaProviderSet = new Set(USER_TOKEN_LIMIT_PROVIDER_IDS);
const CACHE_KEYS = Object.freeze({
  ALL_PROVIDERS: "all-providers",
  NON_TOKEN_PROVIDERS: "non-token-providers",
});

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

function sanitizeQuotaForUser(data, user) {
  if (user.role === "admin") return data;

  return {
    ...data,
    providers: data.providers.map(({
      accountCount: _accountCount,
      quotaAccountCount: _quotaAccountCount,
      failedAccountCount,
      ...provider
    }) => ({
      ...provider,
      hasFailedQuotaChecks: failedAccountCount > 0,
      quotas: provider.quotas.map(({ resetAt: _resetAt, recurring: _recurring, ...quota }) => quota),
    })),
  };
}

function getCacheKey(user) {
  return user.role === "admin" ? CACHE_KEYS.ALL_PROVIDERS : CACHE_KEYS.NON_TOKEN_PROVIDERS;
}

function getUpstreamConnections(connections, user) {
  const eligibleConnections = connections.filter(isUsageEligible);
  if (user.role === "admin") return eligibleConnections;

  return eligibleConnections.filter((connection) => (
    !userTokenQuotaProviderSet.has(connection.provider)
  ));
}

function getActiveTokenQuotaConnectionCounts(connections) {
  const counts = Object.fromEntries(USER_TOKEN_LIMIT_PROVIDER_IDS.map((provider) => [provider, 0]));

  for (const connection of connections) {
    if (!connection.isActive || !isUsageEligible(connection)) continue;
    if (!userTokenQuotaProviderSet.has(connection.provider)) continue;
    counts[connection.provider] += 1;
  }

  return counts;
}

function buildUserTokenQuotaProviders(tokenQuota, activeConnectionCounts) {
  return USER_TOKEN_LIMIT_PROVIDER_IDS.flatMap((provider) => {
    const accountCount = activeConnectionCounts[provider] || 0;
    if (accountCount === 0) return [];

    return [{
      provider,
      accountCount,
      quotaAccountCount: 1,
      failedAccountCount: 0,
      errorMessage: null,
      quotaSource: "user-token-limit",
      quotas: USER_TOKEN_LIMIT_WINDOW_IDS.map((windowType) => {
        const quota = tokenQuota[provider]?.[windowType];
        return {
          name: USER_TOKEN_LIMIT_WINDOW_CONFIG[windowType].name,
          windowType,
          tokenBudget: true,
          limit: quota?.limit || 0,
          used: quota?.used || 0,
          remaining: quota?.remaining ?? null,
          remainingPercentage: quota?.remainingPercentage ?? null,
          isUnlimited: quota?.isUnlimited === true,
          windowStart: quota?.windowStart || null,
        };
      }),
    }];
  });
}

function overlayUserTokenQuota(data, tokenQuota, activeConnectionCounts) {
  const personalProviders = buildUserTokenQuotaProviders(tokenQuota, activeConnectionCounts);

  return {
    ...data,
    providers: [...data.providers, ...personalProviders]
      .sort((a, b) => a.provider.localeCompare(b.provider)),
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
    const cacheKey = getCacheKey(user);
    const cachedSystemQuota = cachedSystemQuotas.get(cacheKey);
    const cacheIsFresh = cachedSystemQuota && Date.now() - cachedSystemQuota.cachedAt < CACHE_TTL_MS;

    if (!forceRefresh && cacheIsFresh) {
      if (user.role === "admin") {
        return Response.json({ ...sanitizeQuotaForUser(cachedSystemQuota.data, user), cached: true });
      }

      const connections = await getProviderConnections({});
      const tokenQuota = await getUserTokenQuota(user.id);
      const data = overlayUserTokenQuota(
        cachedSystemQuota.data,
        tokenQuota,
        getActiveTokenQuotaConnectionCounts(connections),
      );
      return Response.json({ ...sanitizeQuotaForUser(data, user), cached: true });
    }

    const connections = await getProviderConnections({});
    const upstreamConnections = getUpstreamConnections(connections, user);
    const results = await Promise.allSettled(
      upstreamConnections.map(async (connection) => ({
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

      console.warn(`[System quota] ${upstreamConnections[index].provider}: ${result.reason?.message || "quota fetch failed"}`);
      return {
        status: result.status,
        provider: upstreamConnections[index].provider,
        value: [],
        errorMessage: sanitizeProviderError(result.reason),
      };
    });

    const upstreamData = buildSystemQuotaResponse(upstreamConnections, normalizedResults);
    cachedSystemQuotas.set(cacheKey, { data: upstreamData, cachedAt: Date.now() });

    const data = user.role === "admin"
      ? upstreamData
      : overlayUserTokenQuota(
        upstreamData,
        await getUserTokenQuota(user.id),
        getActiveTokenQuotaConnectionCounts(connections),
      );

    return Response.json({ ...sanitizeQuotaForUser(data, user), cached: false });
  } catch (error) {
    if (error?.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[System quota] Failed to build aggregate quota:", error);
    return Response.json({ error: "Failed to load system quota" }, { status: 500 });
  }
}
