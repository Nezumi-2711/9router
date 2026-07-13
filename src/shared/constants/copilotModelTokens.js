/**
 * Shared presentation helpers for GitHub Copilot token-limit controls.
 *
 * Per-model limits are deliberately not stored here. They are resolved from
 * models.dev at runtime by /api/models/token-limits so the dashboard follows
 * the upstream catalog without application releases.
 */

const TOKEN_PRESETS = [4096, 8192, 16384, 32768, 65536, 100000, 128000, 200000, 256000, 400000, 500000, 1000000];

/** Used only while the remote catalog is loading or has no matching model. */
export const DEFAULT_MODEL_TOKEN_LIMITS = {
  maxInputTokens: 128000,
  maxOutputTokens: 32768,
};

function buildOptions(maxValue) {
  const options = TOKEN_PRESETS.filter((value) => value <= maxValue);
  if (!options.length || options[options.length - 1] !== maxValue) {
    options.push(maxValue);
  }
  return options;
}

/** Get select-option choices for a resolved max input-token limit. */
export function getInputTokenOptions({ maxInputTokens } = DEFAULT_MODEL_TOKEN_LIMITS) {
  return buildOptions(maxInputTokens).map((value) => ({ value, label: formatToken(value) }));
}

/** Get select-option choices for a resolved max output-token limit. */
export function getOutputTokenOptions({ maxOutputTokens } = DEFAULT_MODEL_TOKEN_LIMITS) {
  return buildOptions(maxOutputTokens).map((value) => ({ value, label: formatToken(value) }));
}

/** Human-readable token count (for example, "128,000" or "1.05M"). */
function formatToken(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 2)}M`;
  if (value >= 1000) return value.toLocaleString("en-US");
  return String(value);
}
