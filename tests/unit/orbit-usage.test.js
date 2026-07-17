import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";
import { parseOrbitUsage } from "../../open-sse/services/usage/orbit.js";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { USAGE_APIKEY_PROVIDERS, USAGE_SUPPORTED_PROVIDERS } from "../../src/shared/constants/providers.js";
import { parseQuotaData } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const ORBIT_USAGE_RESPONSE = {
  success: true,
  data: {
    plan: "starter",
    usagePercent: 100,
    isExhausted: true,
    resetPeriod: "monthly",
    periodEnd: null,
    tokensUsed: 57288213,
    tokenLimit: 50000000,
    tokensRemaining: 0,
    daily: null,
    credit: {
      balanceMicroUsd: 397891136,
      balanceUsd: 397.891136,
      balanceUsdFormatted: "$397.89",
      grantedMicroUsd: 500000000,
      grantedUsd: 500,
      spentMicroUsd: 102108864,
      spentUsd: 102.108864,
      currency: "USD",
      source: "ledger",
    },
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Orbit Provider usage registry", () => {
  it("exposes its usage endpoint and API-key eligibility", () => {
    expect(PROVIDERS["orbit-provider"].usage?.url).toBe(
      "https://api.orbit-provider.com/v1/usage",
    );
    expect(USAGE_SUPPORTED_PROVIDERS).toContain("orbit-provider");
    expect(USAGE_APIKEY_PROVIDERS).toContain("orbit-provider");
  });
});

describe("parseOrbitUsage", () => {
  it("normalizes exhausted monthly tokens and USD credit", () => {
    const usage = parseOrbitUsage(ORBIT_USAGE_RESPONSE);

    expect(usage).toMatchObject({
      plan: "starter",
      isExhausted: true,
      resetPeriod: "monthly",
    });
    expect(usage.quotas["Tokens (monthly)"]).toMatchObject({
      used: 57288213,
      total: 50000000,
      remaining: 0,
      remainingPercentage: 0,
      resetAt: null,
    });
    expect(usage.quotas["Credit (USD)"]).toMatchObject({
      used: 102.108864,
      total: 500,
      remaining: 397.891136,
    });
    expect(usage.quotas["Credit (USD)"].remainingPercentage).toBeCloseTo(79.5782272);
  });

  it("rejects an unsuccessful or malformed payload", () => {
    expect(parseOrbitUsage({ success: false })).toEqual({
      message: "Orbit Provider usage response was invalid.",
    });
  });
});

describe("getUsageForProvider(orbit-provider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches Orbit usage with the connection API key", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse(ORBIT_USAGE_RESPONSE));
    const proxyOptions = { connectionProxyEnabled: true };

    const usage = await getUsageForProvider({
      provider: "orbit-provider",
      apiKey: "test-orbit-key",
    }, proxyOptions);

    expect(usage.plan).toBe("starter");
    expect(usage.quotas["Tokens (monthly)"].remainingPercentage).toBe(0);
    expect(proxyAwareFetch).toHaveBeenCalledWith(
      "https://api.orbit-provider.com/v1/usage",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer test-orbit-key",
          Accept: "application/json",
        },
      }),
      proxyOptions,
    );
  });

  it("returns an authentication message for an invalid API key", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));

    const usage = await getUsageForProvider({
      provider: "orbit-provider",
      apiKey: "invalid",
    });

    expect(usage.message).toMatch(/invalid or expired/i);
  });
});

describe("parseQuotaData(orbit-provider)", () => {
  it("renders only the credit progress bar", () => {
    const usage = parseOrbitUsage(ORBIT_USAGE_RESPONSE);
    const rows = parseQuotaData("orbit-provider", usage);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Credit (USD)",
      used: 102.108864,
      total: 500,
    });
    expect(rows[0].remainingPercentage).toBeCloseTo(79.5782272);
  });
});
