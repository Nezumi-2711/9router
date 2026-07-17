import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { PROVIDERS } from "open-sse/config/providers.js";

function setAuthHeader(headers, auth, apiKey) {
  if (!auth?.header) return false;
  headers[auth.header] = auth.scheme === "bearer" ? `Bearer ${apiKey}` : apiKey;
  return true;
}

function buildClaudeValidationHeaders(config, apiKey) {
  const headers = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };
  const auth = config.auth;

  if (auth?.combined) {
    setAuthHeader(headers, auth, apiKey);
  } else if (auth?.apiKey) {
    setAuthHeader(headers, auth.apiKey, apiKey);
  } else if (!setAuthHeader(headers, auth, apiKey)) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

/**
 * Validate an API key for a registry-backed Claude-format provider.
 * A non-auth error still confirms that the upstream accepted the credential.
 *
 * @returns {Promise<{valid: boolean, error: string|null}|null>} null when the
 * provider is not backed by a Claude transport.
 */
export async function validateConfiguredClaudeApiKey(provider, apiKey, fetchImpl = fetch) {
  const config = PROVIDERS[provider];
  if (!config?.baseUrl || config.format !== "claude") return null;
  const model = getModelsByProviderId(provider)?.[0]?.id;

  const response = await fetchImpl(config.baseUrl, {
    method: "POST",
    headers: buildClaudeValidationHeaders(config, apiKey),
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  const valid = response.status !== 401 && response.status !== 403;

  return {
    valid,
    error: valid ? null : "Invalid API key",
  };
}
