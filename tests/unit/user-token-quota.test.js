import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserTokenLimits = vi.fn();
const getUserProviderTokenUsageSince = vi.fn();
const getUserProviderEarliestTokenUsageSince = vi.fn();
const getUserTokenLimitWindowStart = vi.fn();

vi.mock("@/lib/db/index.js", () => ({
  getUserTokenLimits,
  getUserProviderTokenUsageSince,
  getUserProviderEarliestTokenUsageSince,
}));
vi.mock("@/lib/tokenLimitEnforcer.js", () => ({ getUserTokenLimitWindowStart }));

const { getUserTokenQuota } = await import("@/lib/userTokenQuota.js");

const sessionStart = new Date("2026-07-17T05:00:00.000Z");
const weeklyStart = new Date("2026-07-13T17:00:00.000Z");

function usageKey(provider, windowType) {
  return `${provider}:${windowType}`;
}

describe("user token quota snapshot", () => {
  beforeEach(() => {
    getUserTokenLimits.mockReset();
    getUserProviderTokenUsageSince.mockReset();
    getUserProviderEarliestTokenUsageSince.mockReset();
    getUserTokenLimitWindowStart.mockReset();

    getUserTokenLimits.mockResolvedValue({
      "orbit-provider": { session: 100, weekly: 1000 },
      codex: { session: 0, weekly: 500 },
    });
    getUserTokenLimitWindowStart.mockImplementation((windowType) => (
      windowType === "session" ? sessionStart : weeklyStart
    ));
    const usage = new Map([
      [usageKey("orbit-provider", "session"), 25],
      [usageKey("orbit-provider", "weekly"), 1200],
      [usageKey("codex", "session"), 12],
      [usageKey("codex", "weekly"), 400],
    ]);
    getUserProviderTokenUsageSince.mockImplementation(async (_userId, provider, since) => {
      const windowType = since.getTime() === sessionStart.getTime() ? "session" : "weekly";
      return usage.get(usageKey(provider, windowType));
    });
    getUserProviderEarliestTokenUsageSince.mockResolvedValue(null);
  });

  it("calculates both provider windows and preserves zero as unlimited", async () => {
    const quota = await getUserTokenQuota("user-1", new Date("2026-07-17T10:00:00.000Z"));

    expect(quota).toMatchObject({
      "orbit-provider": {
        session: { limit: 100, used: 25, remaining: 75, remainingPercentage: 75, isUnlimited: false },
        weekly: { limit: 1000, used: 1200, remaining: 0, remainingPercentage: 0, isUnlimited: false },
      },
      codex: {
        session: { limit: 0, used: 12, remaining: null, remainingPercentage: null, isUnlimited: true },
        weekly: { limit: 500, used: 400, remaining: 100, remainingPercentage: 20, isUnlimited: false },
      },
    });
    expect(quota.codex.session.windowStart).toBe(sessionStart.toISOString());
    expect(quota.codex.session.resetAt).toBeNull();
    expect(quota.codex.weekly.resetAt).toBe("2026-07-20T17:00:00.000Z");
    expect(getUserProviderTokenUsageSince).toHaveBeenCalledTimes(4);
    expect(getUserProviderEarliestTokenUsageSince).toHaveBeenCalledTimes(2);
  });

  it("reports when the next tokens leave a rolling session window", async () => {
    getUserProviderEarliestTokenUsageSince.mockImplementation(async (_userId, provider) => (
      provider === "orbit-provider" ? "2026-07-17T06:30:00.000Z" : null
    ));

    const quota = await getUserTokenQuota("user-1", new Date("2026-07-17T10:00:00.000Z"));

    expect(quota["orbit-provider"].session.resetAt).toBe("2026-07-17T11:30:00.000Z");
    expect(quota.codex.session.resetAt).toBeNull();
  });

  it("requires a user id", async () => {
    await expect(getUserTokenQuota()).rejects.toThrow("User id is required");
  });
});