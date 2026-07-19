import { NextResponse } from "next/server";
import {
  getCustomModels,
  getModelAliases,
  getProviderConnections,
  getProviderNodes,
} from "@/models";
import { getUsers } from "@/lib/db";
import { disableModels, enableModels, getDisabledModels } from "@/lib/disabledModelsDb";
import { getDeletedModels } from "@/lib/db";
import { requireAdminUser, requireUsageDashboardUser } from "@/lib/auth/currentUser";
import {
  AI_PROVIDERS,
  getProviderAlias,
  getProviderByAlias,
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
} from "@/shared/constants/providers";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

export const dynamic = "force-dynamic";

function isViableConnection(connection) {
  if (!connection.isActive) return false;

  return connection.testStatus === "active"
    || connection.testStatus === "success"
    || connection.testStatus === "ready"
    || Boolean(connection.apiKey)
    || Boolean(connection.accessToken);
}

function getConnectionProviderAliases(connection) {
  const alias = getProviderAlias(connection.provider) || connection.provider;
  return [...new Set([connection.provider, alias])];
}

function getModelType(model) {
  return model?.kind || model?.type || "llm";
}

function getAliasByFullModel(modelAliases) {
  return new Map(
    Object.entries(modelAliases)
      .filter(([, fullModel]) => typeof fullModel === "string")
      .map(([alias, fullModel]) => [fullModel, alias]),
  );
}

function getProviderLabel(providerAlias) {
  const provider = getProviderByAlias(providerAlias) || AI_PROVIDERS[providerAlias];
  return {
    id: provider?.id || providerAlias,
    alias: provider?.alias || providerAlias,
    name: provider?.name || providerAlias,
    color: provider?.color,
    textIcon: provider?.textIcon,
  };
}

function getCompatibleProviderLabel(providerId, node, connection) {
  const isAnthropic = node?.type === "anthropic-compatible"
    || isAnthropicCompatibleProvider(providerId);

  return {
    id: providerId,
    alias: providerId,
    name: node?.name || connection?.providerSpecificData?.nodeName
      || (isAnthropic ? "Anthropic Compatible" : "OpenAI Compatible"),
    color: isAnthropic ? "#D97757" : "#10A37F",
    textIcon: isAnthropic ? "AC" : "OC",
  };
}

function getModelDisabledState(disabledModels, storageAlias, providerEntry, modelId) {
  const disabled = new Set([
    ...(disabledModels[storageAlias] || []),
    ...(disabledModels[providerEntry.providerId] || []),
    ...(disabledModels[providerEntry.providerAlias] || []),
  ]);
  return disabled.has(modelId);
}

function isDeletedModelId(deletedModels, storageAlias, providerEntry, modelId) {
  const deleted = new Set([
    ...(deletedModels[storageAlias] || []),
    ...(deletedModels[providerEntry.providerId] || []),
    ...(deletedModels[providerEntry.providerAlias] || []),
  ]);
  return [...deleted].some((deletedModelId) => (
    modelId === deletedModelId
    || (modelId.startsWith(`${deletedModelId}(`) && modelId.endsWith(")"))
  ));
}

function createConnectedModel({
  disabledModels,
  deletedModels,
  fullModel,
  isCustom,
  modelAliases,
  modelId,
  name,
  providerEntry,
  storageAlias,
}) {
  if (isDeletedModelId(deletedModels, storageAlias, providerEntry, modelId)) return null;
  const caps = getCapabilitiesForModel(providerEntry.providerId, modelId);

  return {
    provider: providerEntry.provider,
    providerAlias: storageAlias,
    model: modelId,
    name: name || modelId,
    fullModel,
    alias: modelAliases.get(fullModel) || modelId,
    disabled: getModelDisabledState(disabledModels, storageAlias, providerEntry, modelId),
    isCustom,
    caps: {
      vision: caps.vision,
      search: caps.search,
      reasoning: caps.reasoning,
    },
  };
}

function getForbiddenResponse(error) {
  if (error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error.message === "Forbidden") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  return null;
}

// GET /api/models/connected - List LLMs available through providers with a
// usable active connection. Registry models are available immediately, while
// customModels records extend the catalog and can provide administrator names.
export async function GET() {
  try {
    const user = await requireUsageDashboardUser();

    const [connections, customModels, disabledModels, deletedModels, modelAliases, providerNodes, users] = await Promise.all([
      getProviderConnections(),
      getCustomModels(),
      getDisabledModels(),
      getDeletedModels(),
      getModelAliases(),
      getProviderNodes(),
      getUsers(),
    ]);

    const connectedProviderByAlias = new Map();
    const connectedProviderById = new Map();
    for (const connection of connections) {
      if (!isViableConnection(connection)) continue;

      if (
        isOpenAICompatibleProvider(connection.provider)
        || isAnthropicCompatibleProvider(connection.provider)
      ) {
        continue;
      }

      const providerEntry = {
        providerId: connection.provider,
        providerAlias: getProviderAlias(connection.provider) || connection.provider,
        provider: getProviderLabel(connection.provider),
      };
      connectedProviderById.set(connection.provider, providerEntry);

      for (const alias of getConnectionProviderAliases(connection)) {
        if (!connectedProviderByAlias.has(alias)) {
          connectedProviderByAlias.set(alias, providerEntry);
        }
      }
    }

    // Compatible providers are dynamic and therefore absent from AI_MODELS.
    // Their catalog is the explicit list maintained by an administrator on the
    // provider detail page. The provider-node ID is retained as the alias so
    // combo model values route directly to the correct credential pool.
    const adminOwnerIds = new Set(
      users
        .filter((entry) => entry.role === "admin" && entry.isActive !== false)
        .map((entry) => entry.id),
    );
    const nodeById = new Map(providerNodes.map((node) => [node.id, node]));
    const viableCompatibleConnections = new Map();
    for (const connection of connections) {
      if (!isViableConnection(connection)) continue;
      if (!adminOwnerIds.has(connection.ownerId)) continue;
      if (
        !isOpenAICompatibleProvider(connection.provider)
        && !isAnthropicCompatibleProvider(connection.provider)
      ) {
        continue;
      }
      if (!viableCompatibleConnections.has(connection.provider)) {
        viableCompatibleConnections.set(connection.provider, connection);
      }
    }

    const compatibleProviderByAlias = new Map();
    for (const [providerId, connection] of viableCompatibleConnections) {
      const provider = getCompatibleProviderLabel(providerId, nodeById.get(providerId), connection);
      compatibleProviderByAlias.set(providerId, {
        providerId,
        providerAlias: providerId,
        provider,
      });
    }

    const aliasByFullModel = getAliasByFullModel(modelAliases);
    const seenFullModels = new Set();
    const models = [];
    const addModel = ({ isCustom, modelId, name, providerEntry, storageAlias }) => {
      const fullModel = `${storageAlias}/${modelId}`;
      if (seenFullModels.has(fullModel)) return;
      seenFullModels.add(fullModel);
      const connectedModel = createConnectedModel({
        disabledModels,
        deletedModels,
        fullModel,
        isCustom,
        modelAliases: aliasByFullModel,
        modelId,
        name,
        providerEntry,
        storageAlias,
      });
      if (connectedModel) models.push(connectedModel);
    };

    // Custom registrations can supply an administrator-defined name. Add them
    // first so they take precedence when a model is also present in the registry.
    for (const customModel of customModels) {
      if (!customModel?.id || getModelType(customModel) !== "llm") continue;

      const storageAlias = customModel.providerAlias;
      const providerEntry = connectedProviderByAlias.get(storageAlias)
        || connectedProviderById.get(storageAlias)
        || compatibleProviderByAlias.get(storageAlias);
      const modelId = String(customModel.id).trim();
      if (!providerEntry || !modelId) continue;

      addModel({
        isCustom: true,
        modelId,
        name: customModel.name,
        providerEntry,
        storageAlias,
      });
    }

    // Standard providers declare their model catalogs in the registry. Expose
    // those models after a usable connection exists; compatible providers stay
    // custom-model-only because their available models are runtime-defined.
    for (const providerEntry of connectedProviderById.values()) {
      const storageAlias = providerEntry.providerAlias;
      for (const model of getModelsByProviderId(providerEntry.providerId)) {
        if (!model?.id || getModelType(model) !== "llm") continue;
        addModel({
          isCustom: false,
          modelId: model.id,
          name: model.name,
          providerEntry,
          storageAlias,
        });
      }
    }

    const visibleModels = models
      .filter((model) => user.role === "admin" || !model.disabled)
      .sort((a, b) => (
        a.provider.name.localeCompare(b.provider.name)
        || a.name.localeCompare(b.name)
        || a.model.localeCompare(b.model)
      ));

    return NextResponse.json({ models: visibleModels });
  } catch (error) {
    const accessError = getForbiddenResponse(error);
    if (accessError) return accessError;

    console.log("Error fetching connected models:", error);
    return NextResponse.json({ error: "Failed to fetch connected models" }, { status: 500 });
  }
}

// PUT /api/models/connected - Enable or disable one or more models for a provider.
export async function PUT(request) {
  try {
    await requireAdminUser();

    const { providerAlias, modelId, modelIds, disabled } = await request.json();
    const ids = Array.isArray(modelIds)
      ? modelIds
      : modelId
        ? [modelId]
        : [];

    if (!providerAlias || typeof disabled !== "boolean" || ids.length === 0 || ids.some((id) => typeof id !== "string" || !id)) {
      return NextResponse.json(
        { error: "providerAlias, disabled, and modelId or modelIds[] are required" },
        { status: 400 },
      );
    }

    if (disabled) {
      await disableModels(providerAlias, ids);
    } else {
      await enableModels(providerAlias, ids);
    }

    return NextResponse.json({ success: true, providerAlias, ids, disabled });
  } catch (error) {
    const accessError = getForbiddenResponse(error);
    if (accessError) return accessError;

    console.log("Error updating connected models:", error);
    return NextResponse.json({ error: "Failed to update connected models" }, { status: 500 });
  }
}