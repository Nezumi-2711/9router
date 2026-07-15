// Provider credentials are shared system infrastructure and may only belong
// to administrators. Remove legacy regular-user/orphaned credentials rather
// than silently preserving credentials a regular user can no longer manage.
const adminProviderConnectionsMigration = {
  version: 7,
  name: "admin-provider-connections",
  up(db) {
    const fallbackAdmin = db.get(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`,
    );

    if (fallbackAdmin) {
      db.run(
        `UPDATE providerConnections
         SET ownerId = ?
         WHERE ownerId IS NULL OR ownerId = ''`,
        [fallbackAdmin.id],
      );
    }

    db.run(
      `DELETE FROM providerConnections
       WHERE NOT EXISTS (
         SELECT 1
         FROM users
         WHERE users.id = providerConnections.ownerId
           AND users.role = 'admin'
       )`,
    );
  },
};

export default adminProviderConnectionsMigration;