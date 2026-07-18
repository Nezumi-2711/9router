import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnections = vi.fn();
const requireUsageDashboardUser = vi.fn();
const resolveConnectionProxyConfig = vi.fn();
const refreshAndUpdateCredentials = vi.fn();
const getUsageForProvider = vi.fn();
const getUserTokenQuota = vi.fn();

vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/localDb", () => ({ getProviderConnections }));
vi.mock("@/lib/auth/currentUser", () => ({ requireUsageDashboardUser }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig }));
vi.mock("@/app/api/usage/[connectionId]/route", () => ({ refreshAndUpdateCredentials }));
vi.mock("open-sse/services/usage.js", () => ({ getUsageForProvider }));
vi.mock("@/lib/userTokenQuota.js", () => ({ getUserTokenQuota }));

const { GET } = await import("@/app/api/usage/system-quota/route.js");

const proxyConfig = {
  connectionProxyEnabled: false,
  connectionProxyUrl: "",
  connectionNoProxy: "",
  vercelRelayUrl: "",
};

const connections = [
  { id: "codex-1", provider: "codex", authType: "oauth", isActive: true, accessToken: "codex-token" },
  { id: "orbit-1", provider: "orbit-provider", authType: "apikey", isActive: true, apiKey: "orbit-key" },
  { id: "claude-1", provider: "claude", authType: "oauth", isActive: true, accessToken: "claude-token" },
];

function quota(sessionLimit, sessionUsed, weeklyLimit, weeklyUsed) {
  const buildWindow = (limit, used, windowStart) => ({
    limit,
    used,
    remaining: limit > 0 ? Math.max(0, limit - used) : null,
    remainingPercentage: limit > 0 ? Math.round((Math.max(0, limit - used) / limit) * 100) : null,
    isUnlimited: limit === 0,
    windowStart,
  });

  return {
    "orbit-provider": {
      session: buildWindow(sessionLimit, sessionUsed, "2026-07-17T05:00:00.000Z"),
      weekly: buildWindow(weeklyLimit, weeklyUsed, "2026-07-13T17:00:00.000Z"),
    },
    codex: {
      session: buildWindow(sessionLimit, sessionUsed, "2026-07-17T05:00:00.000Z"),
      weekly: buildWindow(weeklyLimit, weeklyUsed, "2026-07-13T17:00:00.000Z"),
    },
  };
}

function request(search = "") {
  return new Request(`https://9router.local/api/usage/system-quota${search}`);
}

function providerById(payload, provider) {
  return payload.providers.find((entry) => entry.provider === provider);
}

describe("/api/usage/system-quota personal token quota overlay", () => {
  beforeEach(() => {
    getProviderConnections.mockReset();
    requireUsageDashboardUser.mockReset();
    resolveConnectionProxyConfig.mockReset();
    refreshAndUpdateCredentials.mockReset();
    getUsageForProvider.mockReset();
    getUserTokenQuota.mockReset();

    getProviderConnections.mockResolvedValue(connections);
    resolveConnectionProxyConfig.mockResolvedValue(proxyConfig);
    refreshAndUpdateCredentials.mockImplementation(async (connection) => ({ connection, refreshed: false }));
    getUsageForProvider.mockImplementation(async (connection) => ({
      quotas: { "Primary quota": { used: connection.provider === "claude" ? 30 : 10, total: 100 } },
    }));
  });

  it("overrides Codex and Orbit with a regular user's token budgets without fetching upstream usage", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "user-1", role: "user" });
    getUserTokenQuota.mockResolvedValue(quota(100, 25, 1000, 200));

    const response = await GET(request("?refresh=true"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(providerById(payload, "claude").quotas).toMatchObject([
      { name: "Primary quota", remainingPercentage: 70 },
    ]);
    expect(providerById(payload, "codex")).toMatchObject({ quotaSource: "user-token-limit" });
    expect(providerById(payload, "codex").accountCount).toBeUndefined();
    expect(providerById(payload, "codex").quotaAccountCount).toBeUndefined();
    expect(providerById(payload, "codex").quotas).toMatchObject([
      { name: "Session", tokenBudget: true, limit: 100, used: 25, remaining: 75, remainingPercentage: 75 },
      { name: "Weekly", tokenBudget: true, limit: 1000, used: 200, remaining: 800, remainingPercentage: 80 },
    ]);
    expect(providerById(payload, "orbit-provider").quotas).toMatchObject([
      { name: "Session", tokenBudget: true, limit: 100, used: 25 },
      { name: "Weekly", tokenBudget: true, limit: 1000, used: 200 },
    ]);
    expect(getUsageForProvider).toHaveBeenCalledTimes(1);
    expect(getUsageForProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "claude" }),
      expect.any(Object),
    );
  });

  it("overlays fresh personal usage over the shared upstream cache for each regular user", async () => {
    requireUsageDashboardUser.mockResolvedValueOnce({ id: "user-1", role: "user" });
    getUserTokenQuota.mockResolvedValueOnce(quota(100, 20, 0, 80));
    const first = await (await GET(request("?refresh=true"))).json();

    requireUsageDashboardUser.mockResolvedValueOnce({ id: "user-2", role: "user" });
    getUserTokenQuota.mockResolvedValueOnce(quota(200, 30, 1000, 900));
    const second = await (await GET(request())).json();

    expect(providerById(first, "codex").quotas).toMatchObject([
      { name: "Session", limit: 100, used: 20, remainingPercentage: 80 },
      { name: "Weekly", limit: 0, used: 80, isUnlimited: true },
    ]);
    expect(providerById(second, "codex").quotas).toMatchObject([
      { name: "Session", limit: 200, used: 30, remainingPercentage: 85 },
      { name: "Weekly", limit: 1000, used: 900, remainingPercentage: 10 },
    ]);
    expect(getUsageForProvider).toHaveBeenCalledTimes(1);
    expect(getUserTokenQuota).toHaveBeenNthCalledWith(1, "user-1");
    expect(getUserTokenQuota).toHaveBeenNthCalledWith(2, "user-2");
  });

  it("omits a token-budget provider when it has no active eligible connection", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "user-1", role: "user" });
    getProviderConnections.mockResolvedValue([
      { ...connections[0], isActive: false },
      connections[2],
    ]);
    getUserTokenQuota.mockResolvedValue(quota(100, 25, 1000, 200));

    const payload = await (await GET(request("?refresh=true"))).json();

    expect(providerById(payload, "codex")).toBeUndefined();
    expect(providerById(payload, "orbit-provider")).toBeUndefined();
    expect(providerById(payload, "claude")).toBeDefined();
  });

  it("keeps upstream Codex and Orbit quota data for administrators", async () => {
    requireUsageDashboardUser.mockResolvedValue({ id: "admin-1", role: "admin" });

    const payload = await (await GET(request("?refresh=true"))).json();

    expect(providerById(payload, "codex").quotaSource).toBeUndefined();
    expect(providerById(payload, "orbit-provider").quotaSource).toBeUndefined();
    expect(providerById(payload, "codex").quotas).toMatchObject([{ name: "Primary quota" }]);
    expect(getUserTokenQuota).not.toHaveBeenCalled();
    expect(getUsageForProvider).toHaveBeenCalledTimes(3);
  });
});
