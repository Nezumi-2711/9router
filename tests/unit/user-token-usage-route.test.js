import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminUser = vi.fn();
const getUserById = vi.fn();
const getUserTokenQuota = vi.fn();

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
}));
vi.mock("@/lib/userTokenQuota.js", () => ({ getUserTokenQuota }));

const { GET } = await import("@/app/api/users/[userId]/token-usage/route.js");
const context = (userId = "user-1") => ({ params: Promise.resolve({ userId }) });
const request = new Request("https://9router.local/api/users/user-1/token-usage");

const quota = {
  "orbit-provider": {
    session: { limit: 100, used: 25, remaining: 75, remainingPercentage: 75, isUnlimited: false, windowStart: "2026-07-17T05:00:00.000Z" },
    weekly: { limit: 1000, used: 1200, remaining: 0, remainingPercentage: 0, isUnlimited: false, windowStart: "2026-07-13T17:00:00.000Z" },
  },
  codex: {
    session: { limit: 0, used: 12, remaining: null, remainingPercentage: null, isUnlimited: true, windowStart: "2026-07-17T05:00:00.000Z" },
    weekly: { limit: 500, used: 400, remaining: 100, remainingPercentage: 20, isUnlimited: false, windowStart: "2026-07-13T17:00:00.000Z" },
  },
};

describe("/api/users/[userId]/token-usage", () => {
  beforeEach(() => {
    requireAdminUser.mockReset();
    getUserById.mockReset();
    getUserTokenQuota.mockReset();

    requireAdminUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    getUserById.mockResolvedValue({ id: "user-1", role: "user", isActive: true });
    getUserTokenQuota.mockResolvedValue(quota);
  });

  it("returns the shared usage and remaining headroom snapshot", async () => {
    const response = await GET(request, context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toMatchObject({
      userId: "user-1",
      providers: quota,
    });
    expect(payload.updatedAt).toEqual(expect.any(String));
    expect(getUserTokenQuota).toHaveBeenCalledWith("user-1", expect.any(Date));
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
