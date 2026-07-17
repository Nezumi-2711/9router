import { TABLES, buildCreateTableSql } from "../schema.js";

const userTokenLimitsMigration = {
  version: 8,
  name: "user-token-limits",
  up(db) {
    const definition = TABLES.userTokenLimits;
    db.exec(buildCreateTableSql("userTokenLimits", definition));
    for (const index of definition.indexes || []) db.exec(index);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_uh_user_provider_ts ON usageHistory(userId, provider, timestamp)",
    );
  },
};

export default userTokenLimitsMigration;