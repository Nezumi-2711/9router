// Migration registry — append new entries when schema changes.
// Each migration: { version: number, name: string, up(db): void }
// Versions MUST be unique and monotonically increasing.
import m001 from "./001-initial.js";
import m002 from "./002-users-table.js";
import m003 from "./003-api-key-owners.js";
import m004 from "./004-provider-connection-owners.js";
import m005 from "./005-usage-user-attribution.js";
import m006 from "./006-combo-owners.js";
import m007 from "./007-admin-provider-connections.js";
import m008 from "./008-user-token-limits.js";
import m009 from "./009-remove-tunnel-settings.js";
import m010 from "./010-user-token-quota-sessions.js";

export const MIGRATIONS = [m001, m002, m003, m004, m005, m006, m007, m008, m009, m010].sort((a, b) => a.version - b.version);

export function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}
