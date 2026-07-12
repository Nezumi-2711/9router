import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCombos(ownerId = undefined) {
  const db = await getAdapter();
  const hasOwnerScope = ownerId !== undefined;
  const rows = hasOwnerScope
    ? db.all(`SELECT * FROM combos WHERE ownerId IS ? ORDER BY createdAt ASC`, [ownerId])
    : db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  return rows.map(rowToCombo);
}

export async function getComboById(id, ownerId = undefined) {
  const db = await getAdapter();
  const hasOwnerScope = ownerId !== undefined;
  const row = hasOwnerScope
    ? db.get(`SELECT * FROM combos WHERE id = ? AND ownerId IS ?`, [id, ownerId])
    : db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
  return rowToCombo(row);
}

export async function getComboByName(name, ownerId = undefined) {
  const db = await getAdapter();
  const hasOwnerScope = ownerId !== undefined;
  const row = hasOwnerScope
    ? db.get(`SELECT * FROM combos WHERE name = ? AND ownerId IS ?`, [name, ownerId])
    : db.get(`SELECT * FROM combos WHERE name = ? ORDER BY createdAt ASC LIMIT 1`, [name]);
  return rowToCombo(row);
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    ownerId: data.ownerId ?? null,
    kind: data.kind || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO combos(id, name, ownerId, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.ownerId, combo.kind, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]
  );
  return combo;
}

export async function updateCombo(id, data, ownerId = undefined) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const hasOwnerScope = ownerId !== undefined;
    const row = hasOwnerScope
      ? db.get(`SELECT * FROM combos WHERE id = ? AND ownerId IS ?`, [id, ownerId])
      : db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    db.run(
      `UPDATE combos SET name = ?, kind = ?, models = ?, updatedAt = ? WHERE id = ?${hasOwnerScope ? " AND ownerId IS ?" : ""}`,
      hasOwnerScope
        ? [merged.name, merged.kind, stringifyJson(merged.models || []), merged.updatedAt, id, ownerId]
        : [merged.name, merged.kind, stringifyJson(merged.models || []), merged.updatedAt, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteCombo(id, ownerId = undefined) {
  const db = await getAdapter();
  const hasOwnerScope = ownerId !== undefined;
  const res = hasOwnerScope
    ? db.run(`DELETE FROM combos WHERE id = ? AND ownerId IS ?`, [id, ownerId])
    : db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}
