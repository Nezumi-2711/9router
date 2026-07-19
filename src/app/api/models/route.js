import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias } from "@/models";
import { getDeletedModels, isDeletedModelReference } from "@/lib/db";
import { AI_MODELS } from "@/shared/constants/config";
import { getProviderAlias } from "@/shared/constants/providers";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

// GET /api/models - Get models with aliases
export async function GET() {
  try {
    const modelAliases = await getModelAliases();
    const deleted = await getDeletedModels();

    const models = AI_MODELS
      .filter((m) => {
        const alias = getProviderAlias(m.provider) || m.provider;
        const deletedIds = [...(deleted[alias] || []), ...(deleted[m.provider] || [])];
        return !deletedIds.some((id) => (
          m.model === id || (m.model.startsWith(`${id}(`) && m.model.endsWith(")"))
        ));
      })
      .map((m) => {
        const fullModel = `${m.provider}/${m.model}`;
        const c = getCapabilitiesForModel(m.provider, m.model);
        return {
          ...m,
          fullModel,
          alias: modelAliases[fullModel] || m.model,
          caps: { vision: c.vision, search: c.search, reasoning: c.reasoning },
        };
      });

    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// PUT /api/models - Update model alias
export async function PUT(request) {
  try {
    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    if (await isDeletedModelReference(model)) {
      return NextResponse.json({ error: "This model was permanently deleted" }, { status: 409 });
    }

    const modelAliases = await getModelAliases();

    // Check if alias already exists for different model
    const existingModel = Object.entries(modelAliases).find(
      ([key, val]) => val === alias && key !== model
    );

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    // Update alias
    await setModelAlias(model, alias);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}
