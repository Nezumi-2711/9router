import {
  ensureUserTokenQuotaSession,
  getUserProviderEarliestTokenUsageSince,
  getUserProviderTokenUsageSince,
  getUserTokenQuotaSession,
  getUserTokenLimits,
} from "@/lib/db/index.js";
import {
  getActiveSessionWindowStart,
  getRollingSessionWindowStart,
  getSessionResetAt,
  getWeeklyTokenLimitWindowStart,
} from "@/lib/userTokenLimitWindows.js";
import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WEEKLY_MS,
  USER_TOKEN_LIMIT_WINDOWS,
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

function getWeeklyResetAt(windowStart) {
  return new Date(windowStart.getTime() + USER_TOKEN_LIMIT_WEEKLY_MS).toISOString();
}

async function getActiveSessionStart(userId, provider, now) {
  const storedSessionStart = await getUserTokenQuotaSession(userId, provider);
  if (storedSessionStart) {
    return getActiveSessionWindowStart(storedSessionStart, now);
  }

  // Seed a fixed-session record for usage logged before the session table.
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
 * Return the configured token-budget usage for a dashboard user.
 * Limits of zero intentionally remain unlimited while still reporting use.
 */
export async function getUserTokenQuota(userId, now = new Date()) {
  if (!userId) {
    throw new Error("User id is required");
  }

  const limits = await getUserTokenLimits(userId);
  const weeklyWindowStart = getWeeklyTokenLimitWindowStart(now);
  const weeklyResetAt = getWeeklyResetAt(weeklyWindowStart);

  const providerEntries = await Promise.all(USER_TOKEN_LIMIT_PROVIDER_IDS.map(async (provider) => {
    const sessionWindowStart = await getActiveSessionStart(userId, provider, now);
    const [sessionUsed, weeklyUsed] = await Promise.all([
      sessionWindowStart
        ? getUserProviderTokenUsageSince(userId, provider, sessionWindowStart)
        : 0,
      getUserProviderTokenUsageSince(userId, provider, weeklyWindowStart),
    ]);

    const session = buildUserTokenQuotaWindow(
      limits[provider]?.[USER_TOKEN_LIMIT_WINDOWS.SESSION],
      sessionUsed,
      sessionWindowStart || now,
    );
    session.windowStart = sessionWindowStart?.toISOString() || null;
    session.resetAt = getSessionResetAt(sessionWindowStart)?.toISOString() || null;

    const weekly = buildUserTokenQuotaWindow(
      limits[provider]?.[USER_TOKEN_LIMIT_WINDOWS.WEEKLY],
      weeklyUsed,
      weeklyWindowStart,
    );
    weekly.resetAt = weeklyResetAt;

    return [provider, {
      [USER_TOKEN_LIMIT_WINDOWS.SESSION]: session,
      [USER_TOKEN_LIMIT_WINDOWS.WEEKLY]: weekly,
    }];
  }));

  return Object.fromEntries(providerEntries);
}
