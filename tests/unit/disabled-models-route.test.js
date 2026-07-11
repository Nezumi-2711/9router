import { beforeEach, describe, expect, it, vi } from "vitest";

const getDisabledModels = vi.fn();
const disableModels = vi.fn();
const enableModels = vi.fn();
const requireAdminUser = vi.fn();

vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels,
  disableModels,
  enableModels,
}));
vi.mock("@/lib/auth/currentUser", () => ({ requireAdminUser }));

const { GET, POST, DELETE } = await import("../../src/app/api/models/disabled/route.js");

describe("/api/models/disabled", () => {
  beforeEach(() => {
    getDisabledModels.mockReset();
    disableModels.mockReset();
    enableModels.mockReset();
    requireAdminUser.mockReset();
  });

  it("keeps disabled model reads available for model selectors", async () => {
    getDisabledModels.mockResolvedValue({ claude: ["claude-disabled"] });

    const response = await GET(new Request("http://localhost/api/models/disabled?providerAlias=claude"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ids: ["claude-disabled"] });
    expect(requireAdminUser).not.toHaveBeenCalled();
  });

  it("rejects a non-admin disable request", async () => {
    requireAdminUser.mockRejectedValue(new Error("Forbidden"));

    const response = await POST(new Request("http://localhost/api/models/disabled", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "claude", ids: ["claude-disabled"] }),
    }));

    expect(response.status).toBe(403);
    expect(disableModels).not.toHaveBeenCalled();
  });

  it("allows an admin to disable models", async () => {
    requireAdminUser.mockResolvedValue({ role: "admin" });

    const response = await POST(new Request("http://localhost/api/models/disabled", {
      method: "POST",
      body: JSON.stringify({ providerAlias: "claude", ids: ["claude-disabled"] }),
    }));

    expect(response.status).toBe(200);
    expect(disableModels).toHaveBeenCalledWith("claude", ["claude-disabled"]);
  });

  it("rejects a non-admin enable request", async () => {
    requireAdminUser.mockRejectedValue(new Error("Forbidden"));

    const response = await DELETE(new Request("http://localhost/api/models/disabled?providerAlias=claude&id=claude-disabled", {
      method: "DELETE",
    }));

    expect(response.status).toBe(403);
    expect(enableModels).not.toHaveBeenCalled();
  });
});
