import { NextResponse } from "next/server";
import {
  deleteModelPermanently,
  getDeletedModels,
  purgeRequestDetailBuffer,
} from "@/lib/db";
import { requireAdminUser } from "@/lib/auth/currentUser";
import { resetComboRotation } from "open-sse/services/combo.js";

export const dynamic = "force-dynamic";

function getAccessErrorResponse(error) {
  if (error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error.message === "Forbidden") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  return null;
}

// GET /api/models/delete?providerAlias=xxx
// Returns permanent-deletion tombstones for clients that render a provider catalog.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const deleted = await getDeletedModels();
    if (providerAlias) return NextResponse.json({ ids: deleted[providerAlias] || [] });
    return NextResponse.json({ deleted });
  } catch (error) {
    console.log("Error fetching permanently deleted models:", error);
    return NextResponse.json({ error: "Failed to fetch deleted models" }, { status: 500 });
  }
}

// POST /api/models/delete  body: { providerAlias, modelId }
// Permanently removes a model from selectable catalogs and saved routing configuration.
// Usage history is intentionally retained for accurate token reporting.
export async function POST(request) {
  try {
    await requireAdminUser();

    const body = await request.json();
    const providerAlias = typeof body.providerAlias === "string" ? body.providerAlias.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    if (!providerAlias || !modelId) {
      return NextResponse.json({ error: "providerAlias and modelId are required" }, { status: 400 });
    }

    const result = await deleteModelPermanently(providerAlias, modelId);
    for (const comboId of [...result.updatedComboIds, ...result.deletedComboIds]) {
      resetComboRotation(comboId);
    }
    purgeRequestDetailBuffer(result.providerAliases, result.modelId);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const accessError = getAccessErrorResponse(error);
    if (accessError) return accessError;

    console.log("Error permanently deleting model:", error);
    return NextResponse.json({ error: "Failed to permanently delete model" }, { status: 500 });
  }
}
