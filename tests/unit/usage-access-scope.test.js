import { describe, expect, it } from "vitest";
import { appendUsageAccessClause } from "../../src/lib/db/repos/usageAccessScope.js";

describe("usage access scope SQL predicates", () => {
  it("does not restrict administrators", () => {
    const conditions = ["timestamp >= ?"];
    const params = ["2026-01-01T00:00:00.000Z"];

    appendUsageAccessClause(conditions, params, {
      isAdmin: true,
      connectionIds: [],
      apiKeys: [],
    });

    expect(conditions).toEqual(["timestamp >= ?"]);
    expect(params).toEqual(["2026-01-01T00:00:00.000Z"]);
  });

  it("limits users to their owned connections and API keys", () => {
    const conditions = [];
    const params = [];

    appendUsageAccessClause(conditions, params, {
      isAdmin: false,
      connectionIds: ["connection-a", "connection-b"],
      apiKeys: ["key-a"],
    });

    expect(conditions).toEqual(["(connectionId IN (?, ?) OR apiKey IN (?))"]);
    expect(params).toEqual(["connection-a", "connection-b", "key-a"]);
  });

  it("uses persisted actor attribution when a user id is available", () => {
    const conditions = [];
    const params = [];

    appendUsageAccessClause(conditions, params, {
      isAdmin: false,
      userId: "user-a",
      connectionIds: ["connection-a"],
      apiKeys: ["key-a"],
    });

    expect(conditions).toEqual(["userId = ?"]);
    expect(params).toEqual(["user-a"]);
  });

  it("denies users with no attributable resources", () => {
    const conditions = [];
    const params = [];

    appendUsageAccessClause(conditions, params, {
      isAdmin: false,
      connectionIds: [],
      apiKeys: [],
    });

    expect(conditions).toEqual(["1 = 0"]);
    expect(params).toEqual([]);
  });

  it("can scope request details by connection only", () => {
    const conditions = [];
    const params = [];

    appendUsageAccessClause(
      conditions,
      params,
      { isAdmin: false, connectionIds: ["connection-a"], apiKeys: ["key-a"] },
      { apiKeyColumn: null },
    );

    expect(conditions).toEqual(["(connectionId IN (?))"]);
    expect(params).toEqual(["connection-a"]);
  });
});
