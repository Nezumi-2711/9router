import { VIETNAM_TIME_ZONE } from "../../../open-sse/config/time.js";

export { VIETNAM_TIME_ZONE };

export const VIETNAM_LOCALE = "vi-VN";

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getPartMap(value) {
  const date = toValidDate(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function getVietnamDateKey(value = new Date()) {
  const parts = getPartMap(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function getVietnamStartOfDay(value = new Date()) {
  const dateKey = getVietnamDateKey(value);
  return dateKey ? new Date(`${dateKey}T00:00:00+07:00`) : null;
}

export function shiftVietnamDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return getVietnamDateKey(date);
}

export function isSameVietnamDay(first, second = new Date()) {
  const firstKey = getVietnamDateKey(first);
  return firstKey !== null && firstKey === getVietnamDateKey(second);
}

export function formatVietnamDateTime(value, options = {}) {
  const date = toValidDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(VIETNAM_LOCALE, { timeZone: VIETNAM_TIME_ZONE, ...options }).format(date);
}

export function formatVietnamTime(value, options = {}) {
  return formatVietnamDateTime(value, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    ...options,
  });
}