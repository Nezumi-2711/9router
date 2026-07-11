// Attribute historic usage to a dashboard user. API-key ownership is the
// request actor and intentionally takes precedence over connection ownership.
const usageUserAttributionMigration = {
  version: 5,
  name: "usage-user-attribution",
  up(db) {
    const columns = db.all("PRAGMA table_info(usageHistory)");
    if (!columns.some((column) => column.name === "userId")) {
      db.exec("ALTER TABLE usageHistory ADD COLUMN userId TEXT");
    }

    db.exec("CREATE INDEX IF NOT EXISTS idx_uh_user ON usageHistory(userId)");
    db.run(
      `UPDATE usageHistory
       SET userId = COALESCE(
         (SELECT ownerId FROM apiKeys WHERE apiKeys.key = usageHistory.apiKey AND ownerId IS NOT NULL),
         (SELECT ownerId FROM providerConnections WHERE providerConnections.id = usageHistory.connectionId AND ownerId IS NOT NULL)
       )
       WHERE userId IS NULL OR userId = ''`,
    );
  },
};

export default usageUserAttributionMigration;