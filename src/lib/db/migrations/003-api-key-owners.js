// API keys are private to the dashboard account that created them. Keys from
// pre-multi-user installations are retained as keys owned by the first admin.
export default {
  version: 3,
  name: "api-key-owners",
  up(db) {
    const columns = db.all(`PRAGMA table_info(apiKeys)`);
    if (!columns.some((column) => column.name === "ownerId")) {
      db.exec(`ALTER TABLE apiKeys ADD COLUMN ownerId TEXT`);
    }

    const admin = db.get(`SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`);
    if (admin) {
      db.run(`UPDATE apiKeys SET ownerId = ? WHERE ownerId IS NULL OR ownerId = ''`, [admin.id]);
    }
  },
};