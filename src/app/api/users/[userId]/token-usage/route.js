import { NextResponse } from "next/server";
import {
  getUserById,
  getUserProviderTokenUsageSince,
  getUserTokenLimits,
} from "@/lib/db/index.js";
import { requireAdminUser } from "@/lib/auth/currentUser.js";
import { getUserTokenLimitWindowStart } from "@/lib/tokenLimitEnforcer.js";
import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WINDOW_IDS,
} from "open-sse/config/userTokenLimits.js";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function errorResponse(error) {
  const message = error?.message || "Request failed";
  const status = message === "Unauthorized"
    ? 401
    : message === "Forbidden"
      ? 403
      : message === "User not found"
        ? 404
        : 400;
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

function buildWindowUsage(limit, used, windowStart) {
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  const normalizedUsed = Math.max(0, Number(used) || 0);
  const remaining = normalizedLimit > 0
    ? Math.max(0, normalizedLimit - normalizedUsed)
    : null;
  const remainingPercentage = normalizedLimit > 0
    ? Math.round((remaining / normalizedLimit) * 100)
    : null;

  return {
    limit: normalizedLimit,
    used: normalizedUsed,
    remaining,
    remainingPercentage,
    windowStart: windowStart.toISOString(),
  };
}

export async function GET(_request, { params }) {
  try {
    await requireAdminUser();

    const { userId } = await params;
    const user = await getUserById(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "user") throw new Error("Token usage only applies to user accounts");

    const now = new Date();
    const limits = await getUserTokenLimits(user.id);
    const windows = Object.fromEntries(USER_TOKEN_LIMIT_WINDOW_IDS.map((windowType) => [
      windowType,
      getUserTokenLimitWindowStart(windowType, now),
    ]));

    const usageEntries = await Promise.all(
      USER_TOKEN_LIMIT_PROVIDER_IDS.flatMap((provider) => (
        USER_TOKEN_LIMIT_WINDOW_IDS.map(async (windowType) => {
          const used = await getUserProviderTokenUsageSince(
            user.id,
            provider,
            windows[windowType],
          );
          return [provider, windowType, used];
        })
      )),
    );

    const usageByProvider = Object.fromEntries(
      USER_TOKEN_LIMIT_PROVIDER_IDS.map((provider) => [provider, {}]),
    );
    for (const [provider, windowType, used] of usageEntries) {
      usageByProvider[provider][windowType] = buildWindowUsage(
        limits[provider]?.[windowType],
        used,
        windows[windowType],
      );
    }

    return NextResponse.json({
      userId: user.id,
      providers: usageByProvider,
      updatedAt: now.toISOString(),
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
