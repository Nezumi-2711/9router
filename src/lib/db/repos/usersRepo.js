import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

const USER_ROLES = new Set(["admin", "user"]);

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim() : "";
}

function rowToUser(row, includePassword = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includePassword) user.password = row.password;
  return user;
}

function assertRole(role) {
  if (!USER_ROLES.has(role)) throw new Error("Invalid user role");
}

export async function getUsers() {
  const db = await getAdapter();
  return db.all(`SELECT * FROM users ORDER BY createdAt ASC`).map((row) => rowToUser(row));
}

export async function getUserById(id, includePassword = false) {
  const db = await getAdapter();
  return rowToUser(db.get(`SELECT * FROM users WHERE id = ?`, [id]), includePassword);
}

export async function getUserByUsername(username, includePassword = false) {
  const db = await getAdapter();
  return rowToUser(
    db.get(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`, [normalizeUsername(username)]),
    includePassword
  );
}

export async function createUser({ username, password, role = "user" }) {
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername.length < 3) throw new Error("Username must be at least 3 characters");
  if (typeof password !== "string" || password.length < 6) throw new Error("Password must be at least 6 characters");
  assertRole(role);

  const db = await getAdapter();
  const duplicate = db.get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, [normalizedUsername]);
  if (duplicate) throw new Error("Username is already in use");

  const timestamp = new Date().toISOString();
  const user = {
    id: uuidv4(),
    username: normalizedUsername,
    password: await bcrypt.hash(password, 10),
    role,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.run(
    `INSERT INTO users(id, username, password, role, isActive, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.username, user.password, user.role, 1, user.createdAt, user.updatedAt]
  );
  return rowToUser(user);
}

export async function updateUser(id, updates = {}) {
  const db = await getAdapter();
  let result = null;
  let passwordHash = null;

  if (Object.hasOwn(updates, "password")) {
    if (typeof updates.password !== "string" || updates.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    passwordHash = await bcrypt.hash(updates.password, 10);
  }

  db.transaction(() => {
    const row = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!row) return;
    const current = rowToUser(row, true);
    const username = Object.hasOwn(updates, "username") ? normalizeUsername(updates.username) : current.username;
    const role = Object.hasOwn(updates, "role") ? updates.role : current.role;
    const isActive = Object.hasOwn(updates, "isActive") ? updates.isActive === true : current.isActive;
    let password = current.password;

    if (username.length < 3) throw new Error("Username must be at least 3 characters");
    assertRole(role);
    if (passwordHash) password = passwordHash;

    const duplicate = db.get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?`, [username, id]);
    if (duplicate) throw new Error("Username is already in use");

    const updatedAt = new Date().toISOString();
    db.run(
      `UPDATE users SET username = ?, password = ?, role = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
      [username, password, role, isActive ? 1 : 0, updatedAt, id]
    );
    result = { ...current, username, password, role, isActive, updatedAt };
  });

  return rowToUser(result);
}

export async function countActiveAdmins() {
  const db = await getAdapter();
  return db.get(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND isActive = 1`)?.count || 0;
}

export async function deleteUser(id) {
  const db = await getAdapter();
  const result = db.run(`DELETE FROM users WHERE id = ?`, [id]);
  return (result?.changes ?? 0) > 0;
}

export async function verifyUserCredentials(username, password) {
  if (typeof password !== "string" || !password) return null;
  const user = await getUserByUsername(username, true);
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) return null;
  return rowToUser(user);
}

export async function verifyUserPassword(id, password) {
  if (typeof password !== "string" || !password) return false;
  const user = await getUserById(id, true);
  if (!user || !user.isActive) return false;
  return bcrypt.compare(password, user.password);
}

export async function resetAdminPassword(password) {
  if (typeof password !== "string" || !password) throw new Error("Password is required");
  const db = await getAdapter();
  const admin = db.get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, ["admin"])
    || db.get(`SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`);
  if (!admin) throw new Error("No administrator account exists");
  return updateUser(admin.id, { password, isActive: true });
}