export const USER_TOKEN_LIMIT_PROVIDERS = Object.freeze({
  ORBIT: "orbit-provider",
  CODEX: "codex",
});

export const USER_TOKEN_LIMIT_WINDOWS = Object.freeze({
  SESSION: "session",
  WEEKLY: "weekly",
});

export const USER_TOKEN_LIMIT_PROVIDER_IDS = Object.freeze(
  Object.values(USER_TOKEN_LIMIT_PROVIDERS),
);

export const USER_TOKEN_LIMIT_WINDOW_IDS = Object.freeze(
  Object.values(USER_TOKEN_LIMIT_WINDOWS),
);

export const USER_TOKEN_LIMIT_SESSION_MS = 5 * 60 * 60 * 1000;