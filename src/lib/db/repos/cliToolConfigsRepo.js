import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { normalizeCliToolConfig } from "@/shared/constants/cliToolConfig.js";

function rowToConfig(row) {
  if (!row) return null;
  return {
    ownerId: row.ownerId,
    toolId: row.toolId,
    config: parseJson(row.data, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCliToolConfig(ownerId, toolId) {
  const db = await getAdapter();
  return rowToConfig(db.get(
    `SELECT * FROM cliToolConfigs WHERE ownerId = ? AND toolId = ?`,
    [ownerId, toolId],
  ));
}

export async function getCliToolConfigsByOwnerId(ownerId) {
  const db = await getAdapter();
  return db.all(
    `SELECT * FROM cliToolConfigs WHERE ownerId = ? ORDER BY toolId ASC`,
    [ownerId],
  ).map(rowToConfig);
}

export async function upsertCliToolConfig(ownerId, toolId, input) {
  const config = normalizeCliToolConfig(toolId, input);
  const db = await getAdapter();
  const timestamp = new Date().toISOString();
  db.run(
    `INSERT INTO cliToolConfigs(ownerId, toolId, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(ownerId, toolId) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`,
    [ownerId, toolId, stringifyJson(config), timestamp, timestamp],
  );
  return getCliToolConfig(ownerId, toolId);
}

export async function deleteCliToolConfigsByOwnerId(ownerId) {
  const db = await getAdapter();
  const result = db.run(`DELETE FROM cliToolConfigs WHERE ownerId = ?`, [ownerId]);
  return result?.changes ?? 0;
}