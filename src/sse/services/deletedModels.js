import { isDeletedModel } from "@/lib/db";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";

/**
 * Return a not-found response when a resolved provider/model pair has been
 * permanently deleted by an administrator.
 */
export async function getDeletedModelResponse(provider, model) {
  try {
    if (!await isDeletedModel(provider, model)) return null;

    return errorResponse(
      HTTP_STATUS.NOT_FOUND,
      `Model ${provider}/${model} has been deleted by an administrator`,
    );
  } catch (error) {
    console.log("Error checking deleted model status:", error);
    return errorResponse(
      HTTP_STATUS.SERVER_ERROR,
      "Unable to verify whether the requested model has been deleted",
    );
  }
}