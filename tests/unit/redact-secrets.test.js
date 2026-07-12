import { describe, expect, it } from "vitest";
import { REDACTED_VALUE, redactSecrets, redactSecretsInText } from "../../src/lib/security/redactSecrets.js";

describe("CLI configuration secret redaction", () => {
  it("redacts nested credential fields without mutating other settings", () => {
    const input = {
      endpoint: "http://localhost:20128/v1",
      env: {
        ANTHROPIC_AUTH_TOKEN: "sk-sensitive",
        CUSTOM_SETTING: "preserved",
      },
      providers: [{ apiKey: "another-secret", baseURL: "https://api.example.com" }],
    };

    expect(redactSecrets(input)).toEqual({
      endpoint: "http://localhost:20128/v1",
      env: {
        ANTHROPIC_AUTH_TOKEN: REDACTED_VALUE,
        CUSTOM_SETTING: "preserved",
      },
      providers: [{ apiKey: REDACTED_VALUE, baseURL: "https://api.example.com" }],
    });
    expect(input.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-sensitive");
  });

  it("redacts TOML, YAML, dotenv, and JSON credential assignments", () => {
    const config = [
      'api_key = "sk-sensitive"',
      "ANTHROPIC_AUTH_TOKEN=token-value",
      '"refresh_token": "refresh-value",',
      "base_url = \"http://localhost:20128/v1\"",
    ].join("\n");

    const result = redactSecretsInText(config);

    expect(result).not.toContain("sk-sensitive");
    expect(result).not.toContain("token-value");
    expect(result).not.toContain("refresh-value");
    expect(result).toContain(`api_key = ${REDACTED_VALUE}`);
    expect(result).toContain(`ANTHROPIC_AUTH_TOKEN=${REDACTED_VALUE}`);
    expect(result).toContain(`"refresh_token": "${REDACTED_VALUE}"`);
    expect(result).toContain('base_url = "http://localhost:20128/v1"');
  });
});
