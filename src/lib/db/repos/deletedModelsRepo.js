import { getProviderAlias, getProviderByAlias } from "@/shared/constants/providers";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { invalidatePricingCache } from "./pricingRepo.js";

const SCOPE = "deletedModels";

function normalizeIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === "string" && id) : [];
}

function getRowsChanged(result) {
  return Number(result?.changes || 0);
}

function getProviderAliasesSync(db, providerAlias) {
  const aliases = new Set([providerAlias]);
  const provider = getProviderByAlias(providerAlias);
  if (provider?.id) aliases.add(provider.id);
  if (provider?.alias) aliases.add(provider.alias);

  const nodeRows = db.all(`SELECT id, data FROM providerNodes`);
  for (const node of nodeRows) {
    const nodeData = parseJson(node.data, {}) || {};
    if (node.id === providerAlias || nodeData.prefix === providerAlias || aliases.has(node.id)) {
      aliases.add(node.id);
      if (nodeData.prefix) aliases.add(nodeData.prefix);
    }
  }

  for (const alias of [...aliases]) {
    aliases.add(getProviderAlias(alias) || alias);
  }

  return [...aliases].filter(Boolean);
}

function modelWhereClause(column, modelId) {
  return {
    sql: `(${column} = ? OR (substr(${column}, 1, length(?)) = ? AND substr(${column}, -1) = ?))`,
    params: [modelId, `${modelId}(`, `${modelId}(`, ")"],
  };
}

function removeModelFromKvScopesSync(db, providerAliases, modelId) {
  const aliases = new Set(providerAliases);
  const result = { aliases: 0, customModels: 0, pricing: 0, disabledModels: 0 };

  const modelAliasRows = db.all(`SELECT key, value FROM kv WHERE scope = 'modelAliases'`);
  for (const row of modelAliasRows) {
    const fullModel = parseJson(row.value, null);
    if (!matchesDeletedModelReference(fullModel, providerAliases, modelId)) continue;
    result.aliases += getRowsChanged(db.run(`DELETE FROM kv WHERE scope = 'modelAliases' AND key = ?`, [row.key]));
  }

  const customRows = db.all(`SELECT key, value FROM kv WHERE scope = 'customModels'`);
  for (const row of customRows) {
    const customModel = parseJson(row.value, {}) || {};
    if (!aliases.has(customModel.providerAlias) || !matchesDeletedModelId(customModel.id, modelId)) continue;
    result.customModels += getRowsChanged(db.run(`DELETE FROM kv WHERE scope = 'customModels' AND key = ?`, [row.key]));
  }

  const pricingRows = db.all(`SELECT key, value FROM kv WHERE scope = 'pricing'`);
  for (const row of pricingRows) {
    if (!aliases.has(row.key)) continue;
    const current = parseJson(row.value, {}) || {};
    const next = Object.fromEntries(
      Object.entries(current).filter(([storedModelId]) => !matchesDeletedModelId(storedModelId, modelId)),
    );
    if (Object.keys(next).length === Object.keys(current).length) continue;
    result.pricing += Object.keys(current).length - Object.keys(next).length;
    if (Object.keys(next).length === 0) {
      db.run(`DELETE FROM kv WHERE scope = 'pricing' AND key = ?`, [row.key]);
    } else {
      db.run(`UPDATE kv SET value = ? WHERE scope = 'pricing' AND key = ?`, [stringifyJson(next), row.key]);
    }
  }

  const disabledRows = db.all(`SELECT key, value FROM kv WHERE scope = 'disabledModels'`);
  for (const row of disabledRows) {
    if (!aliases.has(row.key)) continue;
    const current = normalizeIds(parseJson(row.value, []));
    const next = current.filter((storedModelId) => !matchesDeletedModelId(storedModelId, modelId));
    result.disabledModels += current.length - next.length;
    if (next.length === current.length) continue;
    if (next.length === 0) {
      db.run(`DELETE FROM kv WHERE scope = 'disabledModels' AND key = ?`, [row.key]);
    } else {
      db.run(`UPDATE kv SET value = ? WHERE scope = 'disabledModels' AND key = ?`, [stringifyJson(next), row.key]);
    }
  }

  return result;
}

function cleanCombosSync(db, providerAliases, modelId) {
  const aliasRows = db.all(`SELECT key, value FROM kv WHERE scope = 'modelAliases'`);
  const aliases = Object.fromEntries(aliasRows.map((row) => [row.key, parseJson(row.value, null)]));
  const updatedComboIds = [];
  const deletedComboIds = [];
  const comboRows = db.all(`SELECT id, models FROM combos`);

  for (const row of comboRows) {
    const parsedModels = parseJson(row.models, []);
    const models = Array.isArray(parsedModels) ? parsedModels : [];
    const keptModels = models.filter((reference) => {
      const resolvedReference = typeof reference === "string" ? aliases[reference] : null;
      return !matchesDeletedModelReference(reference, providerAliases, modelId)
        && !matchesDeletedModelReference(resolvedReference, providerAliases, modelId);
    });
    if (keptModels.length === models.length) continue;

    if (keptModels.length === 0) {
      db.run(`DELETE FROM combos WHERE id = ?`, [row.id]);
      deletedComboIds.push(row.id);
      continue;
    }

    db.run(
      `UPDATE combos SET models = ?, updatedAt = ? WHERE id = ?`,
      [stringifyJson(keptModels), new Date().toISOString(), row.id],
    );
    updatedComboIds.push(row.id);
  }

  const settingsRow = db.get(`SELECT data FROM settings WHERE id = 1`);
  const settings = settingsRow ? (parseJson(settingsRow.data, {}) || {}) : {};
  const comboStrategies = { ...(settings.comboStrategies || {}) };
  let settingsChanged = false;

  for (const comboId of deletedComboIds) {
    if (comboStrategies[comboId] === undefined) continue;
    delete comboStrategies[comboId];
    settingsChanged = true;
  }

  for (const [comboId, strategy] of Object.entries(comboStrategies)) {
    const resolvedJudgeModel = typeof strategy?.judgeModel === "string"
      ? aliases[strategy.judgeModel]
      : null;
    if (
      !strategy
      || (
        !matchesDeletedModelReference(strategy.judgeModel, providerAliases, modelId)
        && !matchesDeletedModelReference(resolvedJudgeModel, providerAliases, modelId)
      )
    ) continue;
    const { judgeModel, ...nextStrategy } = strategy;
    if (Object.keys(nextStrategy).length === 0) delete comboStrategies[comboId];
    else comboStrategies[comboId] = nextStrategy;
    if (!updatedComboIds.includes(comboId)) updatedComboIds.push(comboId);
    settingsChanged = true;
  }

  if (settingsChanged) {
    db.run(
      `INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [stringifyJson({ ...settings, comboStrategies })],
    );
  }

  return { updatedComboIds, deletedComboIds };
}

function isDeletedReference(reference, modelAliases, providerAliases, modelId) {
  const resolvedReference = typeof reference === "string" ? modelAliases[reference] : null;
  return matchesDeletedModelReference(reference, providerAliases, modelId)
    || matchesDeletedModelReference(resolvedReference, providerAliases, modelId);
}

function cleanCliToolConfigsSync(db, providerAliases, modelId) {
  const aliasRows = db.all(`SELECT key, value FROM kv WHERE scope = 'modelAliases'`);
  const modelAliases = Object.fromEntries(aliasRows.map((row) => [row.key, parseJson(row.value, null)]));
  const configRows = db.all(`SELECT ownerId, toolId, data FROM cliToolConfigs`);
  let updatedConfigs = 0;

  for (const row of configRows) {
    const config = parseJson(row.data, {}) || {};
    let changed = false;
    const deleted = (reference) => isDeletedReference(reference, modelAliases, providerAliases, modelId);

    if (config.claudeModels && typeof config.claudeModels === "object") {
      const claudeModels = { ...config.claudeModels };
      const claudeThinking = { ...(config.claudeThinking || {}) };
      for (const [slot, reference] of Object.entries(claudeModels)) {
        if (!deleted(reference)) continue;
        claudeModels[slot] = "";
        delete claudeThinking[slot];
        changed = true;
      }
      if (changed) {
        config.claudeModels = claudeModels;
        config.claudeThinking = claudeThinking;
      }
    }

    if (deleted(config.codexModel)) {
      config.codexModel = "";
      config.codexThinking = "";
      changed = true;
    }

    for (const field of ["opencodeModels", "selectedModels"]) {
      if (!Array.isArray(config[field])) continue;
      const removedModels = config[field].filter(deleted);
      if (removedModels.length === 0) continue;
      config[field] = config[field].filter((reference) => !deleted(reference));
      for (const mapField of ["coworkThinking", "copilotThinking", "copilotTokens"]) {
        if (!config[mapField] || typeof config[mapField] !== "object") continue;
        const nextMap = { ...config[mapField] };
        for (const reference of removedModels) delete nextMap[reference];
        config[mapField] = nextMap;
      }
      changed = true;
    }

    if (deleted(config.opencodeDefaultModel)) {
      config.opencodeDefaultModel = config.opencodeModels?.[0] || "";
      changed = true;
    }

    if (!changed) continue;
    db.run(
      `UPDATE cliToolConfigs SET data = ?, updatedAt = ? WHERE ownerId = ? AND toolId = ?`,
      [stringifyJson(config), new Date().toISOString(), row.ownerId, row.toolId],
    );
    updatedConfigs += 1;
  }

  return updatedConfigs;
}

export function matchesDeletedModelId(candidate, modelId) {
  if (typeof candidate !== "string" || typeof modelId !== "string") return false;
  if (candidate === modelId) return true;
  return candidate.startsWith(`${modelId}(`) && candidate.endsWith(")");
}

export function matchesDeletedModelReference(reference, providerAliases, modelId) {
  if (typeof reference !== "string" || !Array.isArray(providerAliases)) return false;

  return providerAliases.some((providerAlias) => {
    if (typeof providerAlias !== "string" || !providerAlias) return false;
    const prefix = `${providerAlias}/`;
    return reference.startsWith(prefix)
      && matchesDeletedModelId(reference.slice(prefix.length), modelId);
  });
}

export function matchesDeletedModelUsage(provider, model, providerAliases, modelId) {
  return Array.isArray(providerAliases)
    && providerAliases.includes(provider)
    && matchesDeletedModelId(model, modelId);
}

export function isDeletedModelSync(db, provider, model) {
  if (!db || !provider || !model) return false;

  const providerAliases = getProviderAliasesSync(db, provider);

  for (const alias of providerAliases) {
    const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, alias]);
    const modelIds = normalizeIds(row ? parseJson(row.value, []) : []);
    if (modelIds.some((modelId) => matchesDeletedModelId(model, modelId))) return true;
  }

  return false;
}

export function markDeletedModelSync(db, providerAlias, modelId) {
  if (!db || !providerAlias || !modelId) return false;

  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, providerAlias]);
  const current = normalizeIds(row ? parseJson(row.value, []) : []);
  if (current.includes(modelId)) return false;

  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, providerAlias, stringifyJson([...current, modelId])],
  );
  return true;
}

export async function getDeletedModels() {
  const db = await getAdapter();
  const rows = db.all(`SELECT key, value FROM kv WHERE scope = ?`, [SCOPE]);
  const deleted = {};
  for (const row of rows) deleted[row.key] = normalizeIds(parseJson(row.value, []));
  return deleted;
}

export async function isDeletedModel(provider, model) {
  const db = await getAdapter();
  return isDeletedModelSync(db, provider, model);
}

export async function isDeletedModelReference(reference) {
  if (typeof reference !== "string") return false;
  const separatorIndex = reference.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === reference.length - 1) return false;

  const providerAlias = reference.slice(0, separatorIndex);
  const modelId = reference.slice(separatorIndex + 1);
  const db = await getAdapter();
  const providerAliases = getProviderAliasesSync(db, providerAlias);

  return providerAliases.some((alias) => {
    const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, alias]);
    const deletedModels = normalizeIds(row ? parseJson(row.value, []) : []);
    return deletedModels.some((deletedModelId) => matchesDeletedModelId(modelId, deletedModelId));
  });
}

export async function deleteModelPermanently(providerAlias, modelId) {
  if (!providerAlias || !modelId) return null;

  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const providerAliases = getProviderAliasesSync(db, providerAlias);
    const storageAlias = getProviderAlias(providerAlias) || providerAlias;
    const deleted = markDeletedModelSync(db, storageAlias, modelId);
    const combos = cleanCombosSync(db, providerAliases, modelId);
    const updatedCliToolConfigs = cleanCliToolConfigsSync(db, providerAliases, modelId);
    const kv = removeModelFromKvScopesSync(db, providerAliases, modelId);
    const where = modelWhereClause("model", modelId);
    const providerPlaceholders = providerAliases.map(() => "?").join(", ");
    const requestDetails = getRowsChanged(db.run(
      `DELETE FROM requestDetails WHERE provider IN (${providerPlaceholders}) AND ${where.sql}`,
      [...providerAliases, ...where.params],
    ));

    result = {
      deleted,
      providerAliases,
      modelId,
      removedAliases: kv.aliases,
      removedCustomModels: kv.customModels,
      removedPricingEntries: kv.pricing,
      removedDisabledModels: kv.disabledModels,
      updatedComboIds: combos.updatedComboIds,
      deletedComboIds: combos.deletedComboIds,
      updatedCliToolConfigs,
      removedRequestDetails: requestDetails,
    };
  });

  invalidatePricingCache();

  return result;
}
