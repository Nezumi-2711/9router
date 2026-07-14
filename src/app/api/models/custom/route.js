import { NextResponse } from "next/server";
import {
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
} from "@/models";
import { requireAdminUser } from "@/lib/auth/currentUser";

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

async function requireCustomModelCatalogAdmin() {
  // Custom-model records are a shared catalog, not connection-owned data.
  // Restrict mutations to administrators for every provider so one dashboard
  // user cannot alter models available to other users.
  await requireAdminUser();
}

// GET /api/models/custom - List all custom models
export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

// POST /api/models/custom - Add custom model
export async function POST(request) {
  try {
    const { providerAlias, id, type, name } = await request.json();
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await requireCustomModelCatalogAdmin();
    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name });
    return NextResponse.json({ success: true, added });
  } catch (error) {
    const accessError = getAccessErrorResponse(error);
    if (accessError) return accessError;

    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

// DELETE /api/models/custom?providerAlias=xxx&id=yyy&type=zzz
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await requireCustomModelCatalogAdmin();
    await deleteCustomModel({ providerAlias, id, type });
    return NextResponse.json({ success: true });
  } catch (error) {
    const accessError = getAccessErrorResponse(error);
    if (accessError) return accessError;

    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
