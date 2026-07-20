import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WINDOWS,
} from "open-sse/config/userTokenLimits.js";
import {
  ensureUserTokenQuotaSession,
  getUserById,
  getUserProviderEarliestTokenUsageSince,
  getUserProviderTokenUsageSince,
  getUserTokenQuotaSession,
  getUserTokenLimits,
} from "@/lib/db/index.js";
import {
  getActiveSessionWindowStart,
  getRollingSessionWindowStart,
  getWeeklyTokenLimitWindowStart,
} from "@/lib/userTokenLimitWindows.js";

const limitedProviderSet = new Set(USER_TOKEN_LIMIT_PROVIDER_IDS);

export function getUserTokenLimitWindowStart(windowType, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new Error("A valid current time is required");

  if (windowType === USER_TOKEN_LIMIT_WINDOWS.SESSION) {
    return getRollingSessionWindowStart(current);
  }

  if (windowType === USER_TOKEN_LIMIT_WINDOWS.WEEKLY) {
    return getWeeklyTokenLimitWindowStart(current);
  }

  throw new Error("Unsupported token limit window");
}

async function getActiveSessionStart(userId, provider, now) {
  const storedSessionStart = await getUserTokenQuotaSession(userId, provider);
  if (storedSessionStart) {
    return getActiveSessionWindowStart(storedSessionStart, now);
  }

  // Keep active usage for installations created before fixed sessions existed.
  const earliestUsageAt = await getUserProviderEarliestTokenUsageSince(
    userId,
    provider,
    getRollingSessionWindowStart(now),
  );
  const legacySessionStart = getActiveSessionWindowStart(earliestUsageAt, now);
  if (!legacySessionStart) return null;

  const savedSessionStart = await ensureUserTokenQuotaSession(
    userId,
    provider,
    legacySessionStart,
  );
  return getActiveSessionWindowStart(savedSessionStart, now);
}

/**
 * Check whether a dashboard user has exhausted a provider token budget.
 * Returns null when the provider/user is exempt or all configured limits have headroom.
 */
export async function checkUserTokenLimit(userId, provider, now = new Date()) {
  if (!userId || !limitedProviderSet.has(provider)) return null;

  const user = await getUserById(userId);
  if (!user || !user.isActive || user.role !== "user") return null;

  const limits = await getUserTokenLimits(user.id);
  const providerLimits = limits[provider];
  if (!providerLimits) return null;

  for (const windowType of [
    USER_TOKEN_LIMIT_WINDOWS.SESSION,
    USER_TOKEN_LIMIT_WINDOWS.WEEKLY,
  ]) {
    const limit = providerLimits[windowType];
    if (!Number.isSafeInteger(limit) || limit <= 0) continue;

    const windowStart = windowType === USER_TOKEN_LIMIT_WINDOWS.SESSION
      ? await getActiveSessionStart(user.id, provider, now)
      : getWeeklyTokenLimitWindowStart(now);
    const used = windowStart
      ? await getUserProviderTokenUsageSince(user.id, provider, windowStart)
      : 0;
    if (used >= limit) {
      return {
        exceeded: true,
        provider,
        windowType,
        limit,
        used,
        remaining: 0,
        windowStart: windowStart.toISOString(),
      };
    }
  }

  return null;
}
