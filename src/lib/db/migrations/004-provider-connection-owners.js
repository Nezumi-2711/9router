// Provider connections belong to the dashboard account that created them.
// Existing installations retain their connections under the first admin.
export default {
  version: 4,
  name: "provider-connection-owners",
  up(db) {
    const columns = db.all(`PRAGMA table_info(providerConnections)`);
    if (!columns.some((column) => column.name === "ownerId")) {
      db.exec(`ALTER TABLE providerConnections ADD COLUMN ownerId TEXT`);
    }

    const admin = db.get(`SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`);
    if (admin) {
      db.run(
        `UPDATE providerConnections SET ownerId = ? WHERE ownerId IS NULL OR ownerId = ''`,
        [admin.id],
      );
    }
  },
};