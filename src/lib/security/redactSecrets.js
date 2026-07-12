const SECRET_KEY_PATTERN = /(?:api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization|bearer|cookie|private[_-]?key)/i;
const REDACTED_VALUE = "[REDACTED]";

/**
 * Return a deep copy suitable for an administrative status response.
 * Configuration values are retained, but values stored under known credential
 * keys are redacted before crossing the server-to-browser boundary.
 */
export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? REDACTED_VALUE : redactSecrets(child),
    ]),
  );
}

/** Redact credential assignments embedded in text-based configuration formats. */
export function redactSecretsInText(value) {
  if (typeof value !== "string") return value;

  return value
    .replace(/^(\s*(?:[A-Za-z0-9_.-]*?(?:api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization|private[_-]?key)[A-Za-z0-9_.-]*)\s*[=:]\s*)([^\r\n#]+)/gim, `$1${REDACTED_VALUE}`)
    .replace(/("(?:api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization|private[_-]?key)"\s*:\s*")[^"]*(")/gim, `$1${REDACTED_VALUE}$2`);
}

export { REDACTED_VALUE };
