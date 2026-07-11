import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { TABLES, buildCreateTableSql } from "../schema.js";
import { parseJson } from "../helpers/jsonCol.js";

function getInitialAdminPasswordHash(db) {
  const settingsRow = db.get(`SELECT data FROM settings WHERE id = 1`);
  const settings = settingsRow ? parseJson(settingsRow.data, {}) : {};
  if (settings.password) return settings.password;

  const initialPassword = process.env.INITIAL_PASSWORD || "123456";
  return bcrypt.hashSync(initialPassword, 10);
}

const migration = {
  version: 2,
  name: "users-table",
  up(db) {
    const users = TABLES.users;
    db.exec(buildCreateTableSql("users", users));
    for (const index of users.indexes || []) db.exec(index);

    const existingAdmin = db.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (existingAdmin) return;

    const timestamp = new Date().toISOString();
    db.run(
      `INSERT INTO users(id, username, password, role, isActive, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), "admin", getInitialAdminPasswordHash(db), "admin", 1, timestamp, timestamp]
    );
  },
};

export default migration;