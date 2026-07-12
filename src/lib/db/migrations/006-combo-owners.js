import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// Combos are private to dashboard users. Rebuild the table because the legacy
// `name TEXT UNIQUE` constraint is column-level and cannot be dropped in place.
const comboOwnersMigration = {
  version: 6,
  name: "combo-owners",
  up(db) {
    const columns = db.all(`PRAGMA table_info(combos)`);
    const hasOwnerId = columns.some((column) => column.name === "ownerId");

    // A database already rebuilt by a prior interrupted/manual migration only
    // needs the indexes and owner backfill below.
    if (!hasOwnerId) {
      db.exec(`
        CREATE TABLE combos_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          ownerId TEXT,
          kind TEXT,
          models TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `);
      db.exec(`
        INSERT INTO combos_new(id, name, kind, models, createdAt, updatedAt)
        SELECT id, name, kind, models, createdAt, updatedAt FROM combos
      `);
      db.exec(`DROP TABLE combos`);
      db.exec(`ALTER TABLE combos_new RENAME TO combos`);
    }

    const admin = db.get(`SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`);
    if (admin) {
      db.run(`UPDATE combos SET ownerId = ? WHERE ownerId IS NULL OR ownerId = ''`, [admin.id]);
    }

    // Legacy strategy settings were keyed by globally unique combo names.
    // Move them to stable IDs before allowing different users to reuse names.
    const settings = db.get(`SELECT data FROM settings WHERE id = 1`);
    const settingsData = parseJson(settings?.data, {});
    const legacyStrategies = settingsData.comboStrategies;
    if (legacyStrategies && typeof legacyStrategies === "object" && !Array.isArray(legacyStrategies)) {
      const combos = db.all(`SELECT id, name FROM combos`);
      const migratedStrategies = { ...legacyStrategies };
      for (const combo of combos) {
        if (legacyStrategies[combo.name] !== undefined && migratedStrategies[combo.id] === undefined) {
          migratedStrategies[combo.id] = legacyStrategies[combo.name];
          delete migratedStrategies[combo.name];
        }
      }
      db.run(`UPDATE settings SET data = ? WHERE id = 1`, [stringifyJson({ ...settingsData, comboStrategies: migratedStrategies })]);
    }

    db.exec(`DROP INDEX IF EXISTS idx_combo_owner_name`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_combo_owner_name ON combos(ownerId, name) WHERE ownerId IS NOT NULL`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_combo_global_name ON combos(name) WHERE ownerId IS NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_combo_owner ON combos(ownerId)`);
  },
};

export default comboOwnersMigration;