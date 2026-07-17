/**
 * Orbit Provider usage handler.
 */

import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U, parseResetTime, toFiniteNumber } from "./shared.js";

const ORBIT_USAGE_URL = U("orbit-provider").url;

function clampPercentage(value) {
  return Math.min(100, Math.max(0, value));
}

function getRemainingPercentage(used, total, upstreamUsagePercent) {
  if (total <= 0) return 0;
  const usagePercent = Number.isFinite(Number(upstreamUsagePercent))
    ? toFiniteNumber(upstreamUsagePercent)
    : (used / total) * 100;
  return clampPercentage(100 - usagePercent);
}

/**
 * Normalize Orbit's usage response into quota rows consumed by the dashboard.
 * @param {object} responseBody Orbit API response.
 * @returns {object} Normalized provider usage.
 */
export function parseOrbitUsage(responseBody) {
  if (responseBody?.success !== true || !responseBody?.data || typeof responseBody.data !== "object") {
    return { message: "Orbit Provider usage response was invalid." };
  }

  const data = responseBody.data;
  const used = Math.max(0, toFiniteNumber(data.tokensUsed));
  const total = Math.max(0, toFiniteNumber(data.tokenLimit));
  const upstreamRemaining = Math.max(0, toFiniteNumber(data.tokensRemaining, Math.max(0, total - used)));
  const remaining = data.isExhausted === true ? 0 : Math.min(total, upstreamRemaining);
  const remainingPercentage = data.isExhausted === true
    ? 0
    : getRemainingPercentage(used, total, data.usagePercent);
  const resetPeriod = typeof data.resetPeriod === "string" && data.resetPeriod.trim()
    ? data.resetPeriod.trim().toLowerCase()
    : "period";
  const resetAt = parseResetTime(data.periodEnd);
  const quotas = {
    [`Tokens (${resetPeriod})`]: {
      used,
      total,
      remaining,
      remainingPercentage,
      resetAt,
      unlimited: false,
    },
  };

  const credit = data.credit;
  if (credit && typeof credit === "object") {
    const balance = Math.max(0, toFiniteNumber(credit.balanceUsd));
    const granted = Math.max(0, toFiniteNumber(credit.grantedUsd));
    const spent = Math.max(0, toFiniteNumber(credit.spentUsd));
    const creditTotal = granted > 0 ? granted : balance + spent;
    const creditRemainingPercentage = creditTotal > 0
      ? clampPercentage((balance / creditTotal) * 100)
      : 0;

    quotas["Credit (USD)"] = {
      used: spent,
      total: creditTotal,
      remaining: balance,
      remainingPercentage: creditRemainingPercentage,
      resetAt: null,
      unlimited: false,
    };
  }

  return {
    plan: typeof data.plan === "string" && data.plan.trim() ? data.plan.trim() : "Unknown",
    quotas,
    isExhausted: data.isExhausted === true,
    resetPeriod,
  };
}

/**
 * Fetch usage for an Orbit Provider API-key connection.
 * @param {string} apiKey Orbit API key.
 * @param {object|null} proxyOptions Connection proxy configuration.
 * @returns {Promise<object>} Normalized usage data.
 */
export async function getOrbitUsage(apiKey, proxyOptions = null) {
  if (!apiKey) {
    return { message: "Orbit Provider API key not available." };
  }

  try {
    const response = await proxyAwareFetch(ORBIT_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }, proxyOptions);

    if (response.status === 401 || response.status === 403) {
      return { message: "Orbit Provider API key invalid or expired." };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const detail = errorText ? `: ${errorText.slice(0, 200)}` : "";
      return { message: `Orbit Provider usage API error (${response.status})${detail}` };
    }

    const body = await response.json().catch(() => null);
    return parseOrbitUsage(body);
  } catch (error) {
    return { message: `Orbit Provider usage error: ${error.message}` };
  }
}
