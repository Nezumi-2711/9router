import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminUser = vi.fn();
const getUserById = vi.fn();
const getUserTokenLimits = vi.fn();
const getUserProviderTokenUsageSince = vi.fn();
const getUserTokenLimitWindowStart = vi.fn();

vi.mock("next/server", () => ({
  NextResponse: {
    json(body, init = {}) {
      return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      });
    },
  },
}));
vi.mock("@/lib/auth/currentUser.js", () => ({ requireAdminUser }));
vi.mock("@/lib/db/index.js", () => ({
  getUserById,
  getUserTokenLimits,
  getUserProviderTokenUsageSince,
}));
vi.mock("@/lib/tokenLimitEnforcer.js", () => ({ getUserTokenLimitWindowStart }));

const { GET } = await import("@/app/api/users/[userId]/token-usage/route.js");
const context = (userId = "user-1") => ({ params: Promise.resolve({ userId }) });
const request = new Request("https://9router.local/api/users/user-1/token-usage");

const sessionStart = new Date("2026-07-17T05:00:00.000Z");
const weeklyStart = new Date("2026-07-13T17:00:00.000Z");
const limits = {
  "orbit-provider": { session: 100, weekly: 1000 },
  codex: { session: 0, weekly: 500 },
};

function usageKey(provider, since) {
  return `${provider}|${since.toISOString()}`;
}

describe("/api/users/[userId]/token-usage", () => {
  beforeEach(() => {
    requireAdminUser.mockReset();
    getUserById.mockReset();
    getUserTokenLimits.mockReset();
    getUserProviderTokenUsageSince.mockReset();
    getUserTokenLimitWindowStart.mockReset();

    requireAdminUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    getUserById.mockResolvedValue({ id: "user-1", role: "user", isActive: true });
    getUserTokenLimits.mockResolvedValue(limits);
    getUserTokenLimitWindowStart.mockImplementation((windowType) => (
      windowType === "session" ? sessionStart : weeklyStart
    ));

    const usage = new Map([
      [usageKey("orbit-provider", sessionStart), 25],
      [usageKey("orbit-provider", weeklyStart), 1200],
      [usageKey("codex", sessionStart), 12],
      [usageKey("codex", weeklyStart), 400],
    ]);
    getUserProviderTokenUsageSince.mockImplementation(async (_userId, provider, since) => (
      usage.get(usageKey(provider, since)) || 0
    ));
  });

  it("returns usage and remaining headroom for every provider window", async () => {
    const response = await GET(request, context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toMatchObject({
      userId: "user-1",
      providers: {
        "orbit-provider": {
          session: {
            limit: 100,
            used: 25,
            remaining: 75,
            remainingPercentage: 75,
            windowStart: sessionStart.toISOString(),
          },
          weekly: {
            limit: 1000,
            used: 1200,
            remaining: 0,
            remainingPercentage: 0,
            windowStart: weeklyStart.toISOString(),
          },
        },
        codex: {
          session: {
            limit: 0,
            used: 12,
            remaining: null,
            remainingPercentage: null,
            windowStart: sessionStart.toISOString(),
          },
          weekly: {
            limit: 500,
            used: 400,
            remaining: 100,
            remainingPercentage: 20,
            windowStart: weeklyStart.toISOString(),
          },
        },
      },
    });
    expect(payload.updatedAt).toEqual(expect.any(String));
    expect(getUserProviderTokenUsageSince).toHaveBeenCalledTimes(4);
  });

  it("requires an administrator and an existing regular user", async () => {
    requireAdminUser.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await GET(request, context())).status).toBe(403);

    getUserById.mockResolvedValueOnce(null);
    expect((await GET(request, context("missing-user"))).status).toBe(404);

    getUserById.mockResolvedValueOnce({ id: "admin-2", role: "admin", isActive: true });
    expect((await GET(request, context("admin-2"))).status).toBe(400);
  });
});
