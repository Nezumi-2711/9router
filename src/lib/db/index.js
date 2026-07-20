// Public API barrel — all DB functions
import { getAdapter } from "./driver.js";
import { stringifyJson, parseJson } from "./helpers/jsonCol.js";
import { normalizeCliToolConfig, isPersistableCliTool } from "@/shared/constants/cliToolConfig.js";
import {
  USER_TOKEN_LIMIT_PROVIDER_IDS,
  USER_TOKEN_LIMIT_WINDOW_IDS,
} from "open-sse/config/userTokenLimits.js";

const userTokenLimitProviderSet = new Set(USER_TOKEN_LIMIT_PROVIDER_IDS);
const userTokenLimitWindowSet = new Set(USER_TOKEN_LIMIT_WINDOW_IDS);

// Settings
export {
  getSettings, updateSettings, updateComboStrategy, isCloudEnabled, getCloudUrl, exportSettings,
} from "./repos/settingsRepo.js";

// Users
export {
  getUsers, getUserById, getUserByUsername, createUser, updateUser, deleteUser,
  countActiveAdmins, verifyUserCredentials, verifyUserPassword, resetAdminPassword,
} from "./repos/usersRepo.js";

// Provider connections
export {
  getProviderConnections, getProviderConnectionById,
  createProviderConnection, updateProviderConnection,
  deleteProviderConnection, deleteProviderConnectionsByProvider,
  reorderProviderConnections, cleanupProviderConnections, countProviderConnectionsByOwnerId,
} from "./repos/connectionsRepo.js";

// Provider nodes
export {
  getProviderNodes, getProviderNodeById,
  createProviderNode, updateProviderNode, deleteProviderNode,
} from "./repos/nodesRepo.js";

// Proxy pools
export {
  getProxyPools, getProxyPoolById,
  createProxyPool, updateProxyPool, deleteProxyPool,
} from "./repos/proxyPoolsRepo.js";

// API keys
export {
  getApiKeys, getApiKeysByOwnerId, getApiKeyById, getApiKeyByIdAndOwnerId,
  getApiKeyByKey, createApiKey, updateApiKey, deleteApiKey, validateApiKey,
} from "./repos/apiKeysRepo.js";

// Combos
export {
  getCombos, getComboById, getComboByName,
  createCombo, updateCombo, deleteCombo,
} from "./repos/combosRepo.js";

// Per-user CLI tool configurations
export {
  getCliToolConfig, getCliToolConfigsByOwnerId,
  upsertCliToolConfig, deleteCliToolConfigsByOwnerId,
} from "./repos/cliToolConfigsRepo.js";

// Per-user provider token limits
export {
  createEmptyUserTokenLimits, getUserTokenLimits,
  replaceUserTokenLimits, getUserProviderTokenUsageSince,
  getUserProviderEarliestTokenUsageSince, getUserTokenQuotaSession,
  ensureUserTokenQuotaSession,
} from "./repos/userTokenLimitsRepo.js";

// Aliases (model + custom + mitm)
export {
  getModelAliases, setModelAlias, deleteModelAlias,
  getCustomModels, addCustomModel, deleteCustomModel,
  getMitmAlias, setMitmAliasAll,
} from "./repos/aliasRepo.js";

// Pricing
export {
  getPricing, getPricingForModel, updatePricing, resetPricing, resetAllPricing,
} from "./repos/pricingRepo.js";

// Permanently deleted models
export {
  getDeletedModels, isDeletedModel, isDeletedModelReference, deleteModelPermanently,
} from "./repos/deletedModelsRepo.js";

// Usage
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, getUsageHistory, getUsageStats, getChartData,
  appendRequestLog, getRecentLogs,
} from "./repos/usageRepo.js";

// Request details
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders,
  purgeRequestDetailBuffer,
} from "./repos/requestDetailsRepo.js";

// Export/import full DB
export async function exportDb() {
  const db = await getAdapter();
  const { exportSettings } = await import("./repos/settingsRepo.js");

  const out = {
    settings: await exportSettings(),
    users: db.all(`SELECT id, username, password, role, isActive, createdAt, updatedAt FROM users`).map((r) => ({ ...r, isActive: r.isActive === 1 || r.isActive === true })),
    providerConnections: db.all(`SELECT * FROM providerConnections`).map((r) => ({ ...parseJson(r.data, {}), id: r.id, provider: r.provider, authType: r.authType, name: r.name, email: r.email, ownerId: r.ownerId, priority: r.priority, isActive: r.isActive === 1, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    providerNodes: db.all(`SELECT * FROM providerNodes`).map((r) => ({ ...parseJson(r.data, {}), id: r.id, type: r.type, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    proxyPools: db.all(`SELECT * FROM proxyPools`).map((r) => ({ ...parseJson(r.data, {}), id: r.id, isActive: r.isActive === 1, testStatus: r.testStatus, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    apiKeys: db.all(`SELECT * FROM apiKeys`).map((r) => ({ id: r.id, key: r.key, name: r.name, machineId: r.machineId, ownerId: r.ownerId, isActive: r.isActive === 1, createdAt: r.createdAt })),
    combos: db.all(`SELECT * FROM combos`).map((r) => ({ id: r.id, name: r.name, ownerId: r.ownerId, kind: r.kind, models: parseJson(r.models, []), createdAt: r.createdAt, updatedAt: r.updatedAt })),
    cliToolConfigs: db.all(`SELECT * FROM cliToolConfigs`).map((r) => ({ ownerId: r.ownerId, toolId: r.toolId, config: parseJson(r.data, {}), createdAt: r.createdAt, updatedAt: r.updatedAt })),
    userTokenLimits: db.all(`SELECT userId, provider, windowType, tokenLimit, createdAt, updatedAt FROM userTokenLimits`),
    modelAliases: {},
    customModels: [],
    mitmAlias: {},
    pricing: {},
    deletedModels: {},
  };

  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'modelAliases'`)) out.modelAliases[r.key] = parseJson(r.value);
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'customModels'`)) out.customModels.push(parseJson(r.value));
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'mitmAlias'`)) out.mitmAlias[r.key] = parseJson(r.value);
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'pricing'`)) out.pricing[r.key] = parseJson(r.value);
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'deletedModels'`)) out.deletedModels[r.key] = parseJson(r.value, []);

  return out;
}

export async function importDb(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid database payload");
  }
  if (Array.isArray(payload.users)) {
    const validUsers = payload.users.filter(
      (user) => user?.id && user?.username && user?.password && ["admin", "user"].includes(user.role)
    );
    if (validUsers.length !== payload.users.length) throw new Error("Invalid users data in database payload");
    if (!validUsers.some((user) => user.role === "admin" && user.isActive !== false)) {
      throw new Error("Database import requires at least one active administrator");
    }
  }
  const db = await getAdapter();

  db.transaction(() => {
    // Wipe all tables (keep _meta)
    db.run(`DELETE FROM settings`);
    db.run(`DELETE FROM cliToolConfigs`);
    db.run(`DELETE FROM userTokenLimits`);
    // Old backups predate multi-user authentication. Preserve the local
    // administrator unless the payload explicitly carries a users array.
    if (Array.isArray(payload.users)) db.run(`DELETE FROM users`);
    db.run(`DELETE FROM providerConnections`);
    db.run(`DELETE FROM providerNodes`);
    db.run(`DELETE FROM proxyPools`);
    db.run(`DELETE FROM apiKeys`);
    db.run(`DELETE FROM combos`);
    db.run(`DELETE FROM kv WHERE scope IN ('modelAliases', 'customModels', 'mitmAlias', 'pricing', 'deletedModels')`);

    // Settings
    if (payload.settings) {
      db.run(`INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`, [stringifyJson(payload.settings)]);
    }

    if (Array.isArray(payload.users)) {
      for (const user of payload.users) {
        if (!user?.id || !user?.username || !user?.password || !["admin", "user"].includes(user.role)) continue;
        db.run(
          `INSERT OR REPLACE INTO users(id, username, password, role, isActive, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
          [user.id, user.username, user.password, user.role, user.isActive === false ? 0 : 1, user.createdAt || new Date().toISOString(), user.updatedAt || new Date().toISOString()]
        );
      }
    }

    const importedUserIds = new Set(db.all(`SELECT id FROM users`).map((user) => user.id));
    for (const limit of payload.userTokenLimits || []) {
      if (!importedUserIds.has(limit?.userId)) continue;
      if (!userTokenLimitProviderSet.has(limit.provider) || !userTokenLimitWindowSet.has(limit.windowType)) continue;
      const tokenLimit = Number(limit.tokenLimit);
      if (!Number.isSafeInteger(tokenLimit) || tokenLimit <= 0) continue;
      db.run(
        `INSERT OR REPLACE INTO userTokenLimits(userId, provider, windowType, tokenLimit, createdAt, updatedAt)
         VALUES(?, ?, ?, ?, ?, ?)`,
        [limit.userId, limit.provider, limit.windowType, tokenLimit, limit.createdAt || new Date().toISOString(), limit.updatedAt || new Date().toISOString()],
      );
    }

    const adminOwnerIds = new Set(
      db.all(`SELECT id FROM users WHERE role = 'admin'`).map((user) => user.id),
    );
    const fallbackOwnerId = db.get(`SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`)?.id || null;
    if (!fallbackOwnerId) throw new Error("Database import requires an administrator owner for provider connections");
    for (const c of payload.providerConnections || []) {
      const { id, provider, authType, name, email, ownerId, priority, isActive, createdAt, updatedAt, ...rest } = c;
      if (ownerId && !adminOwnerIds.has(ownerId)) continue;
      db.run(
        `INSERT OR REPLACE INTO providerConnections(id, provider, authType, name, email, ownerId, priority, isActive, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, provider, authType || "oauth", name || null, email || null, ownerId || fallbackOwnerId, priority || null, isActive === false ? 0 : 1, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const n of payload.providerNodes || []) {
      const { id, type, name, createdAt, updatedAt, ...rest } = n;
      db.run(
        `INSERT OR REPLACE INTO providerNodes(id, type, name, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [id, type || null, name || null, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const p of payload.proxyPools || []) {
      const { id, isActive, testStatus, createdAt, updatedAt, ...rest } = p;
      db.run(
        `INSERT OR REPLACE INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [id, isActive === false ? 0 : 1, testStatus || "unknown", stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    const defaultKeyOwner = db.get(`SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1`)?.id || null;
    for (const k of payload.apiKeys || []) {
      db.run(
        `INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, ownerId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [k.id, k.key, k.name || null, k.machineId || null, k.ownerId || defaultKeyOwner, k.isActive === false ? 0 : 1, k.createdAt || new Date().toISOString()]
      );
    }
    for (const c of payload.combos || []) {
      db.run(
        `INSERT OR REPLACE INTO combos(id, name, ownerId, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.ownerId || fallbackOwnerId, c.kind || null, stringifyJson(c.models || []), c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()]
      );
    }
    const userOwnerIds = new Set(db.all(`SELECT id FROM users`).map((user) => user.id));
    const apiKeyOwners = new Map(db.all(`SELECT id, ownerId FROM apiKeys`).map((key) => [key.id, key.ownerId]));
    for (const row of payload.cliToolConfigs || []) {
      if (!row?.ownerId || !userOwnerIds.has(row.ownerId) || !isPersistableCliTool(row.toolId)) continue;
      try {
        const config = normalizeCliToolConfig(row.toolId, row.config);
        if (config.apiKeyMode === "managed" && config.apiKeyId && apiKeyOwners.get(config.apiKeyId) !== row.ownerId) continue;
        const timestamp = new Date().toISOString();
        db.run(
          `INSERT OR REPLACE INTO cliToolConfigs(ownerId, toolId, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)`,
          [row.ownerId, row.toolId, stringifyJson(config), row.createdAt || timestamp, row.updatedAt || timestamp],
        );
      } catch {
        // Skip malformed or secret-bearing configuration rows from backups.
      }
    }
    for (const [a, m] of Object.entries(payload.modelAliases || {})) {
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('modelAliases', ?, ?)`, [a, stringifyJson(m)]);
    }
    for (const m of payload.customModels || []) {
      const k = `${m.providerAlias}|${m.id}|${m.type || "llm"}`;
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, stringifyJson(m)]);
    }
    for (const [tool, mappings] of Object.entries(payload.mitmAlias || {})) {
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('mitmAlias', ?, ?)`, [tool, stringifyJson(mappings || {})]);
    }
    for (const [provider, models] of Object.entries(payload.pricing || {})) {
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('pricing', ?, ?)`, [provider, stringifyJson(models || {})]);
    }
    for (const [providerAlias, modelIds] of Object.entries(payload.deletedModels || {})) {
      const validModelIds = Array.isArray(modelIds)
        ? modelIds.filter((modelId) => typeof modelId === "string" && modelId)
        : [];
      if (providerAlias && validModelIds.length > 0) {
        db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('deletedModels', ?, ?)`, [providerAlias, stringifyJson([...new Set(validModelIds)])]);
      }
    }
  });

  return await exportDb();
}

// Eager init helper (optional)
export async function initDb() {
  await getAdapter();
}
