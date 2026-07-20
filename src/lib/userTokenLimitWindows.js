import {
  USER_TOKEN_LIMIT_SESSION_MS,
} from "open-sse/config/userTokenLimits.js";
import {
  getVietnamDateKey,
  shiftVietnamDateKey,
} from "@/shared/utils/dateTime.js";

function toValidDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getRollingSessionWindowStart(now = new Date()) {
  const current = toValidDate(now);
  if (!current) throw new Error("A valid current time is required");
  return new Date(current.getTime() - USER_TOKEN_LIMIT_SESSION_MS);
}

export function getWeeklyTokenLimitWindowStart(now = new Date()) {
  const current = toValidDate(now);
  if (!current) throw new Error("A valid current time is required");

  const dateKey = getVietnamDateKey(current);
  const vietnamNoon = new Date(`${dateKey}T12:00:00+07:00`);
  const daysSinceMonday = (vietnamNoon.getUTCDay() + 6) % 7;
  const mondayKey = shiftVietnamDateKey(dateKey, -daysSinceMonday);
  return new Date(`${mondayKey}T00:00:00+07:00`);
}

export function getSessionResetAt(sessionStartedAt) {
  const sessionStart = toValidDate(sessionStartedAt);
  return sessionStart
    ? new Date(sessionStart.getTime() + USER_TOKEN_LIMIT_SESSION_MS)
    : null;
}

export function getActiveSessionWindowStart(sessionStartedAt, now = new Date()) {
  const current = toValidDate(now);
  const sessionResetAt = getSessionResetAt(sessionStartedAt);
  if (!current || !sessionResetAt || sessionResetAt.getTime() <= current.getTime()) return null;
  return toValidDate(sessionStartedAt);
}