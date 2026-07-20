import { TABLES, buildCreateTableSql } from "../schema.js";

const userTokenQuotaSessionsMigration = {
  version: 10,
  name: "user-token-quota-sessions",
  up(db) {
    const definition = TABLES.userTokenQuotaSessions;
    db.exec(buildCreateTableSql("userTokenQuotaSessions", definition));
    for (const index of definition.indexes || []) db.exec(index);
  },
};

export default userTokenQuotaSessionsMigration;