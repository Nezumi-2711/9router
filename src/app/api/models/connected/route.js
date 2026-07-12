import { NextResponse } from "next/server";
import { getModelAliases, getProviderConnections } from "@/models";
import { disableModels, enableModels, getDisabledModels } from "@/lib/disabledModelsDb";
import { requireAdminUser, requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { AI_MODELS } from "@/shared/constants/models";
import { AI_PROVIDERS, getProviderAlias, getProviderByAlias } from "@/shared/constants/providers";
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

function getForbiddenResponse(error) {
  if (error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error.message === "Forbidden") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  return null;
}

// GET /api/models/connected - List models from providers with a usable active connection.
export async function GET() {
  try {
    const user = await requireUsageDashboardUser();

    const [connections, disabledModels, modelAliases] = await Promise.all([
      getProviderConnections(),
      getDisabledModels(),
      getModelAliases(),
    ]);

    const connectionCountByAlias = new Map();
    for (const connection of connections) {
      if (!isViableConnection(connection)) continue;

      for (const alias of getConnectionProviderAliases(connection)) {
        connectionCountByAlias.set(alias, (connectionCountByAlias.get(alias) || 0) + 1);
      }
    }

    const models = AI_MODELS
      .filter((model) => connectionCountByAlias.has(model.provider))
      .map((model) => {
        const providerAlias = getProviderAlias(model.provider) || model.provider;
        const disabled = disabledModels[providerAlias] || disabledModels[model.provider] || [];
        const caps = getCapabilitiesForModel(model.provider, model.model);

        return {
          ...model,
          provider: getProviderLabel(model.provider),
          providerAlias,
          fullModel: `${model.provider}/${model.model}`,
          alias: modelAliases[`${model.provider}/${model.model}`] || model.model,
          disabled: disabled.includes(model.model),
          caps: {
            vision: caps.vision,
            search: caps.search,
            reasoning: caps.reasoning,
          },
        };
      })
      .filter((model) => user.role === "admin" || !model.disabled)
      .sort((a, b) => (
        a.provider.name.localeCompare(b.provider.name)
        || a.name.localeCompare(b.name)
        || a.model.localeCompare(b.model)
      ));

    return NextResponse.json({ models });
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