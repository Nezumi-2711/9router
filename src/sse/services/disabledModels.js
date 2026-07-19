import { getDisabledModels } from "@/lib/disabledModelsDb";
import { getDeletedModels } from "@/lib/db";
import { getProviderAlias } from "@/shared/constants/providers";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { stripThinkingSuffix } from "open-sse/translator/concerns/thinkingUnified.js";

/**
 * Return an error response when a resolved provider/model pair has been
 * disabled by an administrator. The check uses both the provider's persisted
 * alias and ID to preserve compatibility with existing disabled-model data.
 *
 * A storage read failure blocks execution rather than risking an accidental
 * bypass of an administrator's disabled-model policy.
 */
export async function getDisabledModelResponse(provider, model) {
  try {
    const [disabledModels, deletedModels] = await Promise.all([getDisabledModels(), getDeletedModels()]);
    const providerAlias = getProviderAlias(provider) || provider;
    // Thinking variants use a client-facing suffix, e.g. `gpt-5.6-sol(high)`,
    // but dispatch to the base upstream model. Evaluate the disabled policy
    // against that base ID as well so a suffix cannot bypass an admin disable.
    const baseModel = stripThinkingSuffix(model);
    const disabledIds = new Set([
      ...(disabledModels[providerAlias] || []),
      ...(disabledModels[provider] || []),
    ]);
    const deletedIds = new Set([
      ...(deletedModels[providerAlias] || []),
      ...(deletedModels[provider] || []),
    ]);

    const matchesDeletedModel = [...deletedIds].some((modelId) => (
      model === modelId
      || baseModel === modelId
      || (model.startsWith(`${modelId}(`) && model.endsWith(")"))
    ));
    if (!matchesDeletedModel && !disabledIds.has(model) && !disabledIds.has(baseModel)) return null;

    return errorResponse(
      HTTP_STATUS.NOT_FOUND,
      matchesDeletedModel
        ? `Model ${provider}/${model} has been deleted by an administrator`
        : `Model ${provider}/${model} is disabled by an administrator`,
    );
  } catch (error) {
    console.log("Error checking disabled model status:", error);
    return errorResponse(
      HTTP_STATUS.SERVER_ERROR,
      "Unable to verify whether the requested model is enabled",
    );
  }
}