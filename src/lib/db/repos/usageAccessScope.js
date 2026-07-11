import { getAdapter } from "../driver.js";

/**
 * Resolve the ownership boundary used by usage and observability queries.
 *
 * Administrators have system-wide visibility. A normal user can only see a
 * request when it is attributable to one of their provider connections or
 * dashboard API keys. Requests without either association are deliberately
 * excluded for normal users rather than being treated as shared usage.
 */
export async function getUsageAccessScope(user) {
  if (user?.role === "admin") {
    return { isAdmin: true, userId: null, connectionIds: [], apiKeys: [] };
  }

  if (!user?.id) {
    return { isAdmin: false, userId: null, connectionIds: [], apiKeys: [] };
  }

  const db = await getAdapter();
  const connectionIds = db.all(
    `SELECT id FROM providerConnections WHERE ownerId = ?`,
    [user.id],
  ).map((row) => row.id);
  const apiKeys = db.all(
    `SELECT key FROM apiKeys WHERE ownerId = ?`,
    [user.id],
  ).map((row) => row.key);

  return { isAdmin: false, userId: user.id, connectionIds, apiKeys };
}

/**
 * Add an ownership predicate to a SQL WHERE clause.
 *
 * @param {string[]} conditions SQL conditions to append to.
 * @param {unknown[]} params Bound parameters corresponding to conditions.
 * @param {{ isAdmin: boolean, userId?: string | null, connectionIds: string[], apiKeys: string[] }} scope
 * @param {{ connectionColumn?: string, apiKeyColumn?: string | null, userColumn?: string | null }} options
 */
export function appendUsageAccessClause(
  conditions,
  params,
  scope,
  { connectionColumn = "connectionId", apiKeyColumn = "apiKey", userColumn = "userId" } = {},
) {
  if (scope?.isAdmin) return;

  // usageHistory records persist the resolved actor. This avoids an API key
  // owned by one user and a provider connection owned by another appearing in
  // both users' dashboards. Repositories without a userId column explicitly
  // pass userColumn: null and retain their resource-level access predicate.
  if (userColumn && scope?.userId) {
    conditions.push(`${userColumn} = ?`);
    params.push(scope.userId);
    return;
  }

  const ownershipConditions = [];
  if (scope?.connectionIds?.length) {
    ownershipConditions.push(`${connectionColumn} IN (${scope.connectionIds.map(() => "?").join(", ")})`);
    params.push(...scope.connectionIds);
  }
  if (apiKeyColumn && scope?.apiKeys?.length) {
    ownershipConditions.push(`${apiKeyColumn} IN (${scope.apiKeys.map(() => "?").join(", ")})`);
    params.push(...scope.apiKeys);
  }

  // A missing ownership relation must never grant access to system usage.
  conditions.push(ownershipConditions.length ? `(${ownershipConditions.join(" OR ")})` : "1 = 0");
}
