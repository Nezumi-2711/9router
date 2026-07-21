import { describe, expect, it, vi } from "vitest";

import {
  DokployApiError,
  buildDeploymentsUrl,
  createDeploymentSnapshot,
  escapeGitHubCommandValue,
  fetchComposeDeployments,
  findNewDeployments,
  normalizeDokployUrl,
  waitForDeployment,
} from "../../.github/scripts/dokploy-deployment-tracker.mjs";

const DOKPLOY_URL = "https://dokploy.example.com";
const COMPOSE_ID = "compose/id with spaces";
const API_TOKEN = "super-secret-token";

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function deployment(deploymentId, status = "running", overrides = {}) {
  return {
    deploymentId,
    status,
    title: `Deployment ${deploymentId}`,
    createdAt: "2026-07-21T10:00:00.000Z",
    ...overrides,
  };
}

function createClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: vi.fn(async (ms) => {
      time += ms;
    }),
  };
}

describe("Dokploy deployment tracker", () => {
  it("normalizes the base URL and safely encodes the compose ID", () => {
    expect(normalizeDokployUrl(" https://dokploy.example.com/// ")).toBe(DOKPLOY_URL);

    const url = new URL(buildDeploymentsUrl(`${DOKPLOY_URL}/`, COMPOSE_ID));
    expect(url.pathname).toBe("/api/deployment.allByCompose");
    expect(url.searchParams.get("composeId")).toBe(COMPOSE_ID);
  });

  it("escapes untrusted text before writing a GitHub workflow command", () => {
    expect(escapeGitHubCommandValue("build 50%\r\n::warning::unsafe"))
      .toBe("build 50%25%0D%0A::warning::unsafe");
  });

  it("creates a snapshot and finds only unseen deployments", () => {
    const existing = deployment("existing", "done");
    const snapshot = createDeploymentSnapshot([existing, {}, null], "captured-at");

    expect(snapshot).toEqual({
      capturedAt: "captured-at",
      deploymentIds: ["existing"],
    });
    expect(findNewDeployments([existing, deployment("new")], snapshot))
      .toEqual([deployment("new")]);
  });

  it("sends the API key in a header without exposing it in errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([], { ok: false, status: 403 }));

    await expect(fetchComposeDeployments({
      dokployUrl: DOKPLOY_URL,
      composeId: COMPOSE_ID,
      apiToken: API_TOKEN,
      fetchImpl,
      maxRetries: 0,
    })).rejects.toMatchObject({
      message: "Dokploy deployment API returned HTTP 403",
      status: 403,
    });

    const [, request] = fetchImpl.mock.calls[0];
    expect(request.headers["x-api-key"]).toBe(API_TOKEN);
    expect(fetchImpl.mock.calls[0][0]).not.toContain(API_TOKEN);
  });

  it("retries transient HTTP errors and network failures", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([], { ok: false, status: 503 }))
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockResolvedValueOnce(response([deployment("new")]));

    await expect(fetchComposeDeployments({
      dokployUrl: DOKPLOY_URL,
      composeId: COMPOSE_ID,
      apiToken: API_TOKEN,
      fetchImpl,
      sleep,
      retryDelayMs: 1,
      maxRetries: 2,
    })).resolves.toEqual([deployment("new")]);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication and configuration failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([], { ok: false, status: 401 }));
    const sleep = vi.fn();

    await expect(fetchComposeDeployments({
      dokployUrl: DOKPLOY_URL,
      composeId: COMPOSE_ID,
      apiToken: API_TOKEN,
      fetchImpl,
      sleep,
    })).rejects.toBeInstanceOf(DokployApiError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("tracks a new deployment from running to done", async () => {
    const existing = deployment("existing", "done");
    const running = deployment("new", "running");
    const done = deployment("new", "done", { finishedAt: "finished-at" });
    const fetchDeployments = vi.fn()
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([running, existing])
      .mockResolvedValueOnce([done, existing]);
    const clock = createClock();
    const logger = { info: vi.fn() };

    await expect(waitForDeployment({
      snapshot: createDeploymentSnapshot([existing]),
      fetchDeployments,
      sleep: clock.sleep,
      now: clock.now,
      pollIntervalMs: 10,
      discoveryTimeoutMs: 100,
      deploymentTimeoutMs: 200,
      logger,
    })).resolves.toEqual(done);

    expect(logger.info).toHaveBeenCalledWith("Tracking Dokploy deployment new");
    expect(logger.info).toHaveBeenCalledWith("Dokploy deployment new status: running");
    expect(logger.info).toHaveBeenCalledWith("Dokploy deployment new status: done");
  });

  it("accepts a new deployment that is already done", async () => {
    const done = deployment("new", "done");

    await expect(waitForDeployment({
      snapshot: createDeploymentSnapshot([]),
      fetchDeployments: vi.fn().mockResolvedValue([done]),
      pollIntervalMs: 1,
      discoveryTimeoutMs: 10,
      deploymentTimeoutMs: 20,
      logger: { info: vi.fn() },
    })).resolves.toEqual(done);
  });

  it.each(["error", "cancelled"])("returns terminal %s deployment details", async (status) => {
    const failed = deployment("new", status, { errorMessage: "Build failed" });

    await expect(waitForDeployment({
      snapshot: createDeploymentSnapshot([]),
      fetchDeployments: vi.fn().mockResolvedValue([failed]),
      pollIntervalMs: 1,
      discoveryTimeoutMs: 10,
      deploymentTimeoutMs: 20,
      logger: { info: vi.fn() },
    })).resolves.toEqual(failed);
  });

  it("fails rather than guessing when multiple new deployments appear", async () => {
    await expect(waitForDeployment({
      snapshot: createDeploymentSnapshot([]),
      fetchDeployments: vi.fn().mockResolvedValue([
        deployment("new-a"),
        deployment("new-b"),
      ]),
      logger: { info: vi.fn() },
    })).rejects.toThrow("correlation is ambiguous: new-a, new-b");
  });

  it("times out while waiting for a new deployment record", async () => {
    const clock = createClock();

    await expect(waitForDeployment({
      snapshot: createDeploymentSnapshot([]),
      fetchDeployments: vi.fn().mockResolvedValue([]),
      sleep: clock.sleep,
      now: clock.now,
      pollIntervalMs: 10,
      discoveryTimeoutMs: 20,
      deploymentTimeoutMs: 100,
      logger: { info: vi.fn() },
    })).rejects.toThrow("Timed out waiting for Dokploy to create a deployment record");
  });

  it("times out when a deployment stays running", async () => {
    const clock = createClock();

    await expect(waitForDeployment({
      snapshot: createDeploymentSnapshot([]),
      fetchDeployments: vi.fn().mockResolvedValue([deployment("new")]),
      sleep: clock.sleep,
      now: clock.now,
      pollIntervalMs: 10,
      discoveryTimeoutMs: 20,
      deploymentTimeoutMs: 30,
      logger: { info: vi.fn() },
    })).rejects.toThrow("Timed out waiting for Dokploy deployment new to finish");
  });
});
