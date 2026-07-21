import { appendFile, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const TERMINAL_STATUSES = new Set(["done", "error", "cancelled"]);
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export class DokployApiError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = "DokployApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function normalizeDokployUrl(value) {
  if (!value?.trim()) {
    throw new Error("DOKPLOY_URL is required");
  }

  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("DOKPLOY_URL must use http or https");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildDeploymentsUrl(dokployUrl, composeId) {
  if (!composeId?.trim()) {
    throw new Error("DOKPLOY_COMPOSE_ID is required");
  }

  const url = new URL(`${normalizeDokployUrl(dokployUrl)}/api/deployment.allByCompose`);
  url.searchParams.set("composeId", composeId.trim());
  return url.toString();
}

function asPositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchComposeDeployments({
  dokployUrl,
  composeId,
  apiToken,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  requestTimeoutMs = 15_000,
  retryDelayMs = 2_000,
  maxRetries = 3,
}) {
  if (!apiToken) {
    throw new Error("DOKPLOY_API_TOKEN is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required");
  }

  const url = buildDeploymentsUrl(dokployUrl, composeId);
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": apiToken,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = RETRYABLE_STATUS_CODES.has(response.status);
        throw new DokployApiError(
          `Dokploy deployment API returned HTTP ${response.status}`,
          { status: response.status, retryable },
        );
      }

      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new DokployApiError("Dokploy deployment API returned an unexpected response");
      }

      return payload;
    } catch (error) {
      const retryable = error instanceof DokployApiError
        ? error.retryable
        : error?.name === "AbortError" || error instanceof TypeError;
      lastError = error instanceof DokployApiError
        ? error
        : new DokployApiError(
          error?.name === "AbortError"
            ? "Dokploy deployment API request timed out"
            : "Unable to reach the Dokploy deployment API",
          { retryable },
        );

      if (!retryable || attempt === maxRetries) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(retryDelayMs);
  }

  throw lastError;
}

export function createDeploymentSnapshot(deployments, capturedAt = new Date().toISOString()) {
  return {
    capturedAt,
    deploymentIds: deployments
      .map((deployment) => deployment?.deploymentId)
      .filter((deploymentId) => typeof deploymentId === "string" && deploymentId.length > 0),
  };
}

export function findNewDeployments(deployments, snapshot) {
  const knownIds = new Set(snapshot?.deploymentIds ?? []);
  return deployments.filter((deployment) => (
    typeof deployment?.deploymentId === "string"
    && deployment.deploymentId.length > 0
    && !knownIds.has(deployment.deploymentId)
  ));
}

export async function waitForDeployment({
  snapshot,
  fetchDeployments,
  sleep = defaultSleep,
  now = Date.now,
  pollIntervalMs = 10_000,
  discoveryTimeoutMs = 120_000,
  deploymentTimeoutMs = 1_800_000,
  logger = console,
}) {
  if (typeof fetchDeployments !== "function") {
    throw new Error("fetchDeployments is required");
  }

  const startedAt = now();
  const discoveryDeadline = startedAt + discoveryTimeoutMs;
  const deploymentDeadline = startedAt + deploymentTimeoutMs;
  let trackedDeploymentId;
  let lastStatus;

  while (now() <= deploymentDeadline) {
    const deployments = await fetchDeployments();

    if (!trackedDeploymentId) {
      const newDeployments = findNewDeployments(deployments, snapshot);
      if (newDeployments.length > 1) {
        const ids = newDeployments.map(({ deploymentId }) => deploymentId).join(", ");
        throw new Error(`Multiple new Dokploy deployments were found; correlation is ambiguous: ${ids}`);
      }

      if (newDeployments.length === 1) {
        trackedDeploymentId = newDeployments[0].deploymentId;
        logger.info(`Tracking Dokploy deployment ${trackedDeploymentId}`);
      } else if (now() >= discoveryDeadline) {
        throw new Error("Timed out waiting for Dokploy to create a deployment record");
      }
    }

    if (trackedDeploymentId) {
      const deployment = deployments.find(({ deploymentId }) => deploymentId === trackedDeploymentId);
      if (deployment) {
        const status = deployment.status ?? "unknown";
        if (status !== lastStatus) {
          logger.info(`Dokploy deployment ${trackedDeploymentId} status: ${status}`);
          lastStatus = status;
        }

        if (TERMINAL_STATUSES.has(status)) {
          return deployment;
        }
      }
    }

    const remainingMs = deploymentDeadline - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  throw new Error(
    trackedDeploymentId
      ? `Timed out waiting for Dokploy deployment ${trackedDeploymentId} to finish`
      : "Timed out waiting for a Dokploy deployment",
  );
}

function outputValue(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function escapeGitHubCommandValue(value) {
  return outputValue(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export async function writeGitHubOutputs(filePath, outputs) {
  if (!filePath) return;

  let content = "";
  for (const [name, rawValue] of Object.entries(outputs)) {
    const value = outputValue(rawValue);
    const delimiter = `DOKPLOY_${randomUUID()}`;
    content += `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
  }
  await appendFile(filePath, content, "utf8");
}

function deploymentOutputs(deployment) {
  return {
    deployment_id: deployment?.deploymentId,
    status: deployment?.status,
    title: deployment?.title,
    created_at: deployment?.createdAt,
    started_at: deployment?.startedAt,
    finished_at: deployment?.finishedAt,
    error_message: deployment?.errorMessage,
  };
}

async function runCli() {
  const command = process.argv[2];
  const dokployUrl = process.env.DOKPLOY_URL;
  const composeId = process.env.DOKPLOY_COMPOSE_ID;
  const apiToken = process.env.DOKPLOY_API_TOKEN;
  const snapshotFile = process.env.DOKPLOY_SNAPSHOT_FILE;

  if (!snapshotFile) {
    throw new Error("DOKPLOY_SNAPSHOT_FILE is required");
  }

  const requestOptions = {
    dokployUrl,
    composeId,
    apiToken,
    requestTimeoutMs: asPositiveInteger(process.env.DOKPLOY_REQUEST_TIMEOUT_MS, 15_000, "DOKPLOY_REQUEST_TIMEOUT_MS"),
    retryDelayMs: asPositiveInteger(process.env.DOKPLOY_RETRY_DELAY_MS, 2_000, "DOKPLOY_RETRY_DELAY_MS"),
    maxRetries: asPositiveInteger(process.env.DOKPLOY_MAX_RETRIES, 3, "DOKPLOY_MAX_RETRIES"),
  };

  if (command === "snapshot") {
    const deployments = await fetchComposeDeployments(requestOptions);
    const snapshot = createDeploymentSnapshot(deployments);
    await writeFile(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.info(`Captured ${snapshot.deploymentIds.length} existing Dokploy deployment IDs`);
    return;
  }

  if (command === "wait") {
    const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
    const deployment = await waitForDeployment({
      snapshot,
      fetchDeployments: () => fetchComposeDeployments(requestOptions),
      pollIntervalMs: asPositiveInteger(process.env.DOKPLOY_POLL_INTERVAL_MS, 10_000, "DOKPLOY_POLL_INTERVAL_MS"),
      discoveryTimeoutMs: asPositiveInteger(process.env.DOKPLOY_DISCOVERY_TIMEOUT_MS, 120_000, "DOKPLOY_DISCOVERY_TIMEOUT_MS"),
      deploymentTimeoutMs: asPositiveInteger(process.env.DOKPLOY_DEPLOYMENT_TIMEOUT_MS, 1_800_000, "DOKPLOY_DEPLOYMENT_TIMEOUT_MS"),
    });

    await writeGitHubOutputs(process.env.GITHUB_OUTPUT, deploymentOutputs(deployment));

    if (deployment.status !== "done") {
      const detail = deployment.errorMessage ? `: ${deployment.errorMessage}` : "";
      throw new Error(`Dokploy deployment ${deployment.deploymentId} ended with status ${deployment.status}${detail}`);
    }

    console.info(`Dokploy deployment ${deployment.deploymentId} completed successfully`);
    return;
  }

  throw new Error("Usage: dokploy-deployment-tracker.mjs <snapshot|wait>");
}

const isCliEntry = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  runCli().catch((error) => {
    console.error(
      `::error title=Dokploy deployment tracking failed::${escapeGitHubCommandValue(error.message)}`,
    );
    process.exitCode = 1;
  });
}
