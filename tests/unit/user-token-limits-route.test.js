import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminUser = vi.fn();
const getUserById = vi.fn();
const getUserTokenLimits = vi.fn();
const replaceUserTokenLimits = vi.fn();

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
  replaceUserTokenLimits,
}));

const { GET, PUT } = await import("@/app/api/users/[userId]/token-limits/route.js");
const context = (userId = "user-1") => ({ params: Promise.resolve({ userId }) });
const putRequest = (body) => new Request("https://9router.local/api/users/user-1/token-limits", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const limits = {
  "orbit-provider": { session: 100, weekly: 1000 },
  codex: { session: 200, weekly: 2000 },
};

describe("/api/users/[userId]/token-limits", () => {
  beforeEach(() => {
    requireAdminUser.mockReset();
    getUserById.mockReset();
    getUserTokenLimits.mockReset();
    replaceUserTokenLimits.mockReset();
    requireAdminUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    getUserById.mockResolvedValue({ id: "user-1", role: "user", isActive: true });
    getUserTokenLimits.mockResolvedValue(limits);
    replaceUserTokenLimits.mockResolvedValue(limits);
  });

  it("returns an administrator-only no-store response", async () => {
    const response = await GET(new Request("https://9router.local"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ limits });
    expect(getUserTokenLimits).toHaveBeenCalledWith("user-1");
  });

  it("replaces all limits for a regular user", async () => {
    const response = await PUT(putRequest({ limits }), context());

    expect(response.status).toBe(200);
    expect(replaceUserTokenLimits).toHaveBeenCalledWith("user-1", limits);
  });

  it("rejects non-admin access and administrator targets", async () => {
    requireAdminUser.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await GET(new Request("https://9router.local"), context())).status).toBe(403);

    getUserById.mockResolvedValueOnce({ id: "admin-2", role: "admin", isActive: true });
    const response = await PUT(putRequest({ limits }), context("admin-2"));
    expect(response.status).toBe(400);
    expect(replaceUserTokenLimits).not.toHaveBeenCalled();
  });

  it("requires an explicit limits object", async () => {
    const response = await PUT(putRequest({}), context());

    expect(response.status).toBe(400);
    expect(replaceUserTokenLimits).not.toHaveBeenCalled();
  });
});
