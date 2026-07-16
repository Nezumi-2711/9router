import { NextResponse } from "next/server";
import { requireCurrentDashboardUser } from "@/lib/auth/currentUser";
import {
  getApiKeyByIdAndOwnerId,
  getCliToolConfig,
  upsertCliToolConfig,
} from "@/lib/db/index.js";
import {
  CliToolConfigValidationError,
  isPersistableCliTool,
  normalizeCliToolConfig,
} from "@/shared/constants/cliToolConfig.js";

export const dynamic = "force-dynamic";

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function errorResponse(error, operation) {
  if (error?.message === "Unauthorized") return json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof CliToolConfigValidationError || error instanceof SyntaxError) {
    return json({ error: error instanceof SyntaxError ? "Invalid JSON payload" : error.message }, { status: 400 });
  }
  console.log(`Error ${operation} CLI tool configuration:`, error);
  return json({ error: `Failed to ${operation} CLI tool configuration` }, { status: 500 });
}

export async function GET(request, { params }) {
  try {
    const user = await requireCurrentDashboardUser();
    const { toolId } = await params;
    if (!isPersistableCliTool(toolId)) {
      return json({ error: "Unsupported CLI tool" }, { status: 404 });
    }

    const saved = await getCliToolConfig(user.id, toolId);
    return json({ config: saved?.config || null, updatedAt: saved?.updatedAt || null });
  } catch (error) {
    return errorResponse(error, "load");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireCurrentDashboardUser();
    const { toolId } = await params;
    if (!isPersistableCliTool(toolId)) {
      return json({ error: "Unsupported CLI tool" }, { status: 404 });
    }

    const config = normalizeCliToolConfig(toolId, await request.json());
    if (config.apiKeyMode === "managed" && config.apiKeyId) {
      const apiKey = await getApiKeyByIdAndOwnerId(config.apiKeyId, user.id);
      if (!apiKey) return json({ error: "API key not found" }, { status: 404 });
    }

    const saved = await upsertCliToolConfig(user.id, toolId, config);
    return json({ config: saved.config, updatedAt: saved.updatedAt });
  } catch (error) {
    return errorResponse(error, "save");
  }
}
