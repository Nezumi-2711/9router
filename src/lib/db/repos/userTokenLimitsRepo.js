import { getAdapter } from "../driver.js";
import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WINDOW_IDS,
} from "open-sse/config/userTokenLimits.js";

const providerSet = new Set(USER_TOKEN_LIMIT_PROVIDER_IDS);
const windowSet = new Set(USER_TOKEN_LIMIT_WINDOW_IDS);

export function createEmptyUserTokenLimits() {
  return Object.fromEntries(
    USER_TOKEN_LIMIT_PROVIDER_IDS.map((provider) => [
      provider,
      Object.fromEntries(USER_TOKEN_LIMIT_WINDOW_IDS.map((windowType) => [windowType, 0])),
    ]),
  );
}

function assertProvider(provider) {
  if (!providerSet.has(provider)) throw new Error("Unsupported token limit provider");
}

function assertWindowType(windowType) {
  if (!windowSet.has(windowType)) throw new Error("Unsupported token limit window");
}

function normalizeTokenLimit(value) {
  const tokenLimit = Number(value);
  if (!Number.isSafeInteger(tokenLimit) || tokenLimit < 0) {
    throw new Error("Token limit must be a non-negative integer");
  }
  return tokenLimit;
}

function normalizeLimits(limits) {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new Error("Token limits are required");
  }
  for (const provider of Object.keys(limits)) assertProvider(provider);
  for (const providerLimits of Object.values(limits)) {
    if (!providerLimits || typeof providerLimits !== "object" || Array.isArray(providerLimits)) {
      throw new Error("Provider token limits must be an object");
    }
    for (const windowType of Object.keys(providerLimits)) assertWindowType(windowType);
  }

  const normalized = createEmptyUserTokenLimits();
  for (const provider of USER_TOKEN_LIMIT_PROVIDER_IDS) {
    for (const windowType of USER_TOKEN_LIMIT_WINDOW_IDS) {
      normalized[provider][windowType] = normalizeTokenLimit(
        limits?.[provider]?.[windowType] ?? 0,
      );
    }
  }
  return normalized;
}

export async function getUserTokenLimits(userId) {
  if (!userId) return createEmptyUserTokenLimits();
  const db = await getAdapter();
  const limits = createEmptyUserTokenLimits();
  const rows = db.all(
    `SELECT provider, windowType, tokenLimit
     FROM userTokenLimits
     WHERE userId = ?`,
    [userId],
  );

  for (const row of rows) {
    if (!providerSet.has(row.provider) || !windowSet.has(row.windowType)) continue;
    limits[row.provider][row.windowType] = Math.max(0, Number(row.tokenLimit) || 0);
  }
  return limits;
}

export async function replaceUserTokenLimits(userId, limits) {
  if (!userId) throw new Error("User id is required");
  const normalized = normalizeLimits(limits);
  const db = await getAdapter();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.run(`DELETE FROM userTokenLimits WHERE userId = ?`, [userId]);
    for (const provider of USER_TOKEN_LIMIT_PROVIDER_IDS) {
      for (const windowType of USER_TOKEN_LIMIT_WINDOW_IDS) {
        const tokenLimit = normalized[provider][windowType];
        if (tokenLimit === 0) continue;
        db.run(
          `INSERT INTO userTokenLimits(userId, provider, windowType, tokenLimit, createdAt, updatedAt)
           VALUES(?, ?, ?, ?, ?, ?)`,
          [userId, provider, windowType, tokenLimit, now, now],
        );
      }
    }
  });

  return normalized;
}

export async function getUserProviderTokenUsageSince(userId, provider, since) {
  if (!userId) return 0;
  assertProvider(provider);
  if (!(since instanceof Date) || !Number.isFinite(since.getTime())) {
    throw new Error("A valid usage window start is required");
  }

  const db = await getAdapter();
  const row = db.get(
    `SELECT COALESCE(SUM(COALESCE(promptTokens, 0) + COALESCE(completionTokens, 0)), 0) AS totalTokens
     FROM usageHistory
     WHERE userId = ? AND provider = ? AND timestamp >= ?`,
    [userId, provider, since.toISOString()],
  );
  return Math.max(0, Number(row?.totalTokens) || 0);
}