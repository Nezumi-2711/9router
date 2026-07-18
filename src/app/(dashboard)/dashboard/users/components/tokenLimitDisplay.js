import {
  USER_TOKEN_LIMIT_PROVIDERS,
  USER_TOKEN_LIMIT_WINDOW_CONFIG,
  USER_TOKEN_LIMIT_WINDOWS,
} from "open-sse/config/userTokenLimits.js";
import { formatTokenCount } from "@/shared/utils/tokenCount.js";

export const TOKEN_LIMIT_PROVIDER_OPTIONS = Object.freeze([
  {
    id: USER_TOKEN_LIMIT_PROVIDERS.ORBIT,
    name: "Orbit Provider",
    shortName: "Orbit",
    description: "Anthropic-compatible traffic routed through Orbit.",
    icon: "orbit",
  },
  {
    id: USER_TOKEN_LIMIT_PROVIDERS.CODEX,
    name: "Codex",
    shortName: "Codex",
    description: "OpenAI Codex responses and coding sessions.",
    icon: "terminal",
  },
]);

export const TOKEN_LIMIT_WINDOW_OPTIONS = Object.freeze([
  {
    id: USER_TOKEN_LIMIT_WINDOWS.SESSION,
    ...USER_TOKEN_LIMIT_WINDOW_CONFIG[USER_TOKEN_LIMIT_WINDOWS.SESSION],
  },
  {
    id: USER_TOKEN_LIMIT_WINDOWS.WEEKLY,
    ...USER_TOKEN_LIMIT_WINDOW_CONFIG[USER_TOKEN_LIMIT_WINDOWS.WEEKLY],
  },
]);

export function getQuotaTone(remainingPercentage) {
  if (remainingPercentage > 70) {
    return {
      bar: "bg-emerald-500",
      dot: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (remainingPercentage >= 30) {
    return {
      bar: "bg-amber-500",
      dot: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    bar: "bg-red-500",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  };
}

export function getProviderRemainingPercentage(providerUsage) {
  const activeWindows = TOKEN_LIMIT_WINDOW_OPTIONS
    .map(({ id }) => providerUsage?.[id])
    .filter((windowUsage) => windowUsage?.limit > 0);

  if (activeWindows.length === 0) return null;
  return Math.min(...activeWindows.map((windowUsage) => windowUsage.remainingPercentage));
}

export { formatTokenCount };
