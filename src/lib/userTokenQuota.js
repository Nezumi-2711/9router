import {
  getUserProviderTokenUsageSince,
  getUserTokenLimits,
} from "@/lib/db/index.js";
import { getUserTokenLimitWindowStart } from "@/lib/tokenLimitEnforcer.js";
import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WINDOW_IDS,
} from "open-sse/config/userTokenLimits.js";

function normalizeNonNegativeNumber(value) {
  return Math.max(0, Number(value) || 0);
}

export function buildUserTokenQuotaWindow(limit, used, windowStart) {
  const normalizedLimit = normalizeNonNegativeNumber(limit);
  const normalizedUsed = normalizeNonNegativeNumber(used);
  const isUnlimited = normalizedLimit === 0;
  const remaining = isUnlimited
    ? null
    : Math.max(0, normalizedLimit - normalizedUsed);
  const remainingPercentage = isUnlimited
    ? null
    : Math.round((remaining / normalizedLimit) * 100);

  return {
    limit: normalizedLimit,
    used: normalizedUsed,
    remaining,
    remainingPercentage,
    isUnlimited,
    windowStart: windowStart.toISOString(),
  };
}

/**
 * Return the configured token-budget usage for a dashboard user.
 * Limits of zero intentionally remain unlimited while still reporting use.
 */
export async function getUserTokenQuota(userId, now = new Date()) {
  if (!userId) {
    throw new Error("User id is required");
  }

  const windows = Object.fromEntries(USER_TOKEN_LIMIT_WINDOW_IDS.map((windowType) => [
    windowType,
    getUserTokenLimitWindowStart(windowType, now),
  ]));
  const limits = await getUserTokenLimits(userId);

  const usageEntries = await Promise.all(
    USER_TOKEN_LIMIT_PROVIDER_IDS.flatMap((provider) => (
      USER_TOKEN_LIMIT_WINDOW_IDS.map(async (windowType) => [
        provider,
        windowType,
        await getUserProviderTokenUsageSince(userId, provider, windows[windowType]),
      ])
    )),
  );

  const providers = Object.fromEntries(
    USER_TOKEN_LIMIT_PROVIDER_IDS.map((provider) => [provider, {}]),
  );
  for (const [provider, windowType, used] of usageEntries) {
    providers[provider][windowType] = buildUserTokenQuotaWindow(
      limits[provider]?.[windowType],
      used,
      windows[windowType],
    );
  }

  return providers;
}
