// ⚠️ AGENT/DEV: Bump this by +1 EVERY TIME you change the schema below
// (add/remove/alter a table, column, or index in TABLES). It drives the
// pre-change safety backup in migrate.js: when the stored version is lower,
// one lightweight DB backup is taken before applying schema changes. Forgetting
// to bump only skips that backup — it does NOT break the additive auto-sync.
export const SCHEMA_VERSION = 9;

export const PRAGMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

// Declarative current schema. Used by syncSchemaFromTables() to
// auto-add missing tables/columns/indexes after versioned migrations.
// For destructive changes (drop/rename/type-change), write a migration file.
export const TABLES = {
  _meta: {
    columns: {
      key: "TEXT PRIMARY KEY",
      value: "TEXT NOT NULL",
    },
  },
  settings: {
    columns: {
      id: "INTEGER PRIMARY KEY CHECK (id = 1)",
      data: "TEXT NOT NULL",
    },
  },
  users: {
    columns: {
      id: "TEXT PRIMARY KEY",
      username: "TEXT UNIQUE NOT NULL",
      password: "TEXT NOT NULL",
      role: "TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'))",
      isActive: "INTEGER NOT NULL DEFAULT 1",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
      "CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, isActive)",
    ],
  },
  providerConnections: {
    columns: {
      id: "TEXT PRIMARY KEY",
      provider: "TEXT NOT NULL",
      authType: "TEXT NOT NULL",
      name: "TEXT",
      email: "TEXT",
      ownerId: "TEXT",
      priority: "INTEGER",
      isActive: "INTEGER DEFAULT 1",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pc_provider ON providerConnections(provider)",
      "CREATE INDEX IF NOT EXISTS idx_pc_owner ON providerConnections(ownerId)",
      "CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON providerConnections(provider, isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pc_priority ON providerConnections(provider, priority)",
    ],
  },
  providerNodes: {
    columns: {
      id: "TEXT PRIMARY KEY",
      type: "TEXT",
      name: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: ["CREATE INDEX IF NOT EXISTS idx_pn_type ON providerNodes(type)"],
  },
  proxyPools: {
    columns: {
      id: "TEXT PRIMARY KEY",
      isActive: "INTEGER DEFAULT 1",
      testStatus: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pp_active ON proxyPools(isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pp_status ON proxyPools(testStatus)",
    ],
  },
  apiKeys: {
    columns: {
      id: "TEXT PRIMARY KEY",
      key: "TEXT UNIQUE NOT NULL",
      name: "TEXT",
      machineId: "TEXT",
      ownerId: "TEXT",
      isActive: "INTEGER DEFAULT 1",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_ak_key ON apiKeys(key)",
      "CREATE INDEX IF NOT EXISTS idx_ak_owner ON apiKeys(ownerId)",
    ],
  },
  combos: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      ownerId: "TEXT",
      kind: "TEXT",
      models: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_combo_owner_name ON combos(ownerId, name) WHERE ownerId IS NOT NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_combo_global_name ON combos(name) WHERE ownerId IS NULL",
      "CREATE INDEX IF NOT EXISTS idx_combo_owner ON combos(ownerId)",
    ],
  },
  cliToolConfigs: {
    columns: {
      ownerId: "TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE",
      toolId: "TEXT NOT NULL",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    primaryKey: "PRIMARY KEY (ownerId, toolId)",
    indexes: ["CREATE INDEX IF NOT EXISTS idx_cli_tool_configs_owner ON cliToolConfigs(ownerId)"],
  },
  userTokenLimits: {
    columns: {
      userId: "TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE",
      provider: "TEXT NOT NULL",
      windowType: "TEXT NOT NULL",
      tokenLimit: "INTEGER NOT NULL DEFAULT 0",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    primaryKey: "PRIMARY KEY (userId, provider, windowType)",
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_user_token_limits_user ON userTokenLimits(userId)",
    ],
  },
  kv: {
    columns: {
      scope: "TEXT NOT NULL",
      key: "TEXT NOT NULL",
      value: "TEXT NOT NULL",
    },
    primaryKey: "PRIMARY KEY (scope, key)",
    indexes: ["CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv(scope)"],
  },
  usageHistory: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      apiKey: "TEXT",
      userId: "TEXT",
      endpoint: "TEXT",
      promptTokens: "INTEGER DEFAULT 0",
      completionTokens: "INTEGER DEFAULT 0",
      cost: "REAL DEFAULT 0",
      status: "TEXT",
      tokens: "TEXT",
      meta: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_uh_ts ON usageHistory(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_uh_provider ON usageHistory(provider)",
      "CREATE INDEX IF NOT EXISTS idx_uh_model ON usageHistory(model)",
      "CREATE INDEX IF NOT EXISTS idx_uh_conn ON usageHistory(connectionId)",
      "CREATE INDEX IF NOT EXISTS idx_uh_user ON usageHistory(userId)",
      "CREATE INDEX IF NOT EXISTS idx_uh_user_provider_ts ON usageHistory(userId, provider, timestamp)",
    ],
  },
  usageDaily: {
    columns: {
      dateKey: "TEXT PRIMARY KEY",
      data: "TEXT NOT NULL",
    },
  },
  requestDetails: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      status: "TEXT",
      data: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_rd_ts ON requestDetails(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_rd_provider ON requestDetails(provider)",
      "CREATE INDEX IF NOT EXISTS idx_rd_model ON requestDetails(model)",
      "CREATE INDEX IF NOT EXISTS idx_rd_conn ON requestDetails(connectionId)",
    ],
  },
};

export function buildCreateTableSql(name, def) {
  const cols = Object.entries(def.columns).map(([k, v]) => `${k} ${v}`);
  if (def.primaryKey) cols.push(def.primaryKey);
  return `CREATE TABLE IF NOT EXISTS ${name} (${cols.join(", ")})`;
}
