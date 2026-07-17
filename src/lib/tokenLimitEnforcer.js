import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_SESSION_MS,
  USER_TOKEN_LIMIT_WINDOWS,
} from "open-sse/config/userTokenLimits.js";
import {
  getUserById,
  getUserProviderTokenUsageSince,
  getUserTokenLimits,
} from "@/lib/db/index.js";
import {
  getVietnamDateKey,
  shiftVietnamDateKey,
} from "@/shared/utils/dateTime.js";

const limitedProviderSet = new Set(USER_TOKEN_LIMIT_PROVIDER_IDS);

export function getUserTokenLimitWindowStart(windowType, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new Error("A valid current time is required");

  if (windowType === USER_TOKEN_LIMIT_WINDOWS.SESSION) {
    return new Date(current.getTime() - USER_TOKEN_LIMIT_SESSION_MS);
  }

  if (windowType === USER_TOKEN_LIMIT_WINDOWS.WEEKLY) {
    const dateKey = getVietnamDateKey(current);
    const vietnamNoon = new Date(`${dateKey}T12:00:00+07:00`);
    const daysSinceMonday = (vietnamNoon.getUTCDay() + 6) % 7;
    const mondayKey = shiftVietnamDateKey(dateKey, -daysSinceMonday);
    return new Date(`${mondayKey}T00:00:00+07:00`);
  }

  throw new Error("Unsupported token limit window");
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

    const windowStart = getUserTokenLimitWindowStart(windowType, now);
    const used = await getUserProviderTokenUsageSince(user.id, provider, windowStart);
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
