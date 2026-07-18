import { describe, expect, it } from "vitest";
import {
  ensureCliToolV1Endpoint,
  isLocalCliToolUrl,
  resolveCliToolBaseUrl,
  resolveInitialCliToolBaseUrl,
} from "@/shared/utils/cliToolEndpoint.js";

describe("CLI tool endpoint resolution", () => {
  it("keeps local dashboard origins local, including custom ports", () => {
    expect(resolveCliToolBaseUrl({ appUrl: "http://localhost:30100" })).toBe("http://localhost:30100");
    expect(resolveCliToolBaseUrl({ appUrl: "http://127.0.0.1:20128/" })).toBe("http://127.0.0.1:20128");
    expect(isLocalCliToolUrl("http://app.localhost:20128")).toBe(true);
  });

  it("uses the browser deployment origin instead of localhost or a generic cloud URL", () => {
    expect(resolveCliToolBaseUrl({
      appUrl: "https://router.customer.example",
      cloudEnabled: true,
      cloudUrl: "https://9router.com",
      configuredBaseUrl: "http://localhost:20128",
    })).toBe("https://router.customer.example");
  });

  it("uses the cloud endpoint for externally hosted tools when the dashboard is local", () => {
    expect(resolveCliToolBaseUrl({
      appUrl: "http://localhost:20128",
      requiresExternalUrl: true,
      cloudEnabled: true,
      cloudUrl: "https://cloud.example/",
    })).toBe("https://cloud.example");
  });

  it("adds /v1 exactly once to generated endpoints", () => {
    expect(ensureCliToolV1Endpoint("https://router.example/")).toBe("https://router.example/v1");
    expect(ensureCliToolV1Endpoint("https://router.example/v1/")).toBe("https://router.example/v1");
  });

  it("migrates the old hardcoded localhost default when opened on a deployment", () => {
    expect(resolveInitialCliToolBaseUrl(
      "http://127.0.0.1:20128/v1",
      "https://router.customer.example",
    )).toBe("https://router.customer.example/v1");
  });

  it("preserves an explicit remote saved endpoint and local saved endpoint on local runtime", () => {
    expect(resolveInitialCliToolBaseUrl(
      "https://custom-gateway.example/v1",
      "https://router.customer.example",
    )).toBe("https://custom-gateway.example/v1");
    expect(resolveInitialCliToolBaseUrl(
      "http://localhost:30100/v1",
      "http://localhost:20128",
    )).toBe("http://localhost:30100/v1");
  });
});
