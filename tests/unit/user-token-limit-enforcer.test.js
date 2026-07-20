import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const getUserProviderTokenUsageSince = vi.fn();
const getUserProviderEarliestTokenUsageSince = vi.fn();
const getUserTokenQuotaSession = vi.fn();
const ensureUserTokenQuotaSession = vi.fn();
const getUserTokenLimits = vi.fn();

vi.mock("@/lib/db/index.js", () => ({
  getUserById,
  ensureUserTokenQuotaSession,
  getUserProviderEarliestTokenUsageSince,
  getUserProviderTokenUsageSince,
  getUserTokenQuotaSession,
  getUserTokenLimits,
}));

const {
  checkUserTokenLimit,
  getUserTokenLimitWindowStart,
} = await import("@/lib/tokenLimitEnforcer.js");

describe("user token limit enforcement", () => {
  beforeEach(() => {
    getUserById.mockReset();
    ensureUserTokenQuotaSession.mockReset();
    getUserProviderEarliestTokenUsageSince.mockReset();
    getUserProviderTokenUsageSince.mockReset();
    getUserTokenQuotaSession.mockReset();
    getUserTokenLimits.mockReset();
    getUserById.mockResolvedValue({ id: "user-1", role: "user", isActive: true });
    getUserTokenLimits.mockResolvedValue({
      "orbit-provider": { session: 100, weekly: 1000 },
      codex: { session: 200, weekly: 2000 },
    });
    getUserTokenQuotaSession.mockResolvedValue("2026-07-17T06:00:00.000Z");
  });

  it("calculates rolling session and Monday Vietnam weekly window starts", () => {
    const now = new Date("2026-07-17T10:00:00.000Z");

    expect(getUserTokenLimitWindowStart("session", now).toISOString())
      .toBe("2026-07-17T05:00:00.000Z");
    expect(getUserTokenLimitWindowStart("weekly", now).toISOString())
      .toBe("2026-07-12T17:00:00.000Z");
  });

  it("blocks when the rolling session total reaches its limit", async () => {
    getUserProviderTokenUsageSince.mockResolvedValueOnce(100);

    const result = await checkUserTokenLimit(
      "user-1",
      "orbit-provider",
      new Date("2026-07-17T10:00:00.000Z"),
    );

    expect(result).toMatchObject({
      exceeded: true,
      provider: "orbit-provider",
      windowType: "session",
      limit: 100,
      used: 100,
    });
    expect(getUserProviderTokenUsageSince).toHaveBeenCalledTimes(1);
  });

  it("does not block from an expired fixed session until a new request begins one", async () => {
    getUserTokenQuotaSession.mockResolvedValue("2026-07-17T05:00:00.000Z");
    getUserProviderTokenUsageSince.mockResolvedValueOnce(0);

    await expect(checkUserTokenLimit(
      "user-1",
      "orbit-provider",
      new Date("2026-07-17T10:10:00.000Z"),
    )).resolves.toBeNull();

    expect(getUserProviderTokenUsageSince).toHaveBeenCalledWith(
      "user-1",
      "orbit-provider",
      new Date("2026-07-12T17:00:00.000Z"),
    );
  });

  it("checks weekly usage after the session window still has headroom", async () => {
    getUserProviderTokenUsageSince
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(1200);

    const result = await checkUserTokenLimit(
      "user-1",
      "orbit-provider",
      new Date("2026-07-17T10:00:00.000Z"),
    );

    expect(result).toMatchObject({ windowType: "weekly", limit: 1000, used: 1200 });
    expect(getUserProviderTokenUsageSince).toHaveBeenCalledTimes(2);
  });

  it("exempts administrators, unknown users, and unsupported providers", async () => {
    getUserById.mockResolvedValueOnce({ id: "admin-1", role: "admin", isActive: true });
    await expect(checkUserTokenLimit("admin-1", "codex")).resolves.toBeNull();

    getUserById.mockResolvedValueOnce(null);
    await expect(checkUserTokenLimit("missing", "codex")).resolves.toBeNull();

    await expect(checkUserTokenLimit("user-1", "openai")).resolves.toBeNull();
    expect(getUserTokenLimits).not.toHaveBeenCalled();
  });

  it("treats zero limits as unlimited", async () => {
    getUserTokenLimits.mockResolvedValue({
      "orbit-provider": { session: 0, weekly: 0 },
      codex: { session: 0, weekly: 0 },
    });

    await expect(checkUserTokenLimit("user-1", "codex")).resolves.toBeNull();
    expect(getUserProviderTokenUsageSince).not.toHaveBeenCalled();
  });
});
