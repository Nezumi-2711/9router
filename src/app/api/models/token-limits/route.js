import { NextResponse } from "next/server";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

const MODELS_DEV_API_URL = "https://models.dev/api.json";

export const dynamic = "force-dynamic";

function getForbiddenResponse(error) {
  if (error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error.message === "Forbidden") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  return null;
}

function normalizeModelId(modelId) {
  return typeof modelId === "string"
    ? modelId.trim().replace(/\([^()]+\)$/, "").toLowerCase()
    : "";
}

function getModelSuffix(modelId) {
  const normalized = normalizeModelId(modelId);
  return normalized.includes("/") ? normalized.slice(normalized.lastIndexOf("/") + 1) : normalized;
}

function getCatalogEntries(catalog) {
  return Object.values(catalog || {}).flatMap((provider) => Object.values(provider?.models || {}));
}

function getCandidateScore(catalogModelId, requestedModelId) {
  const candidate = normalizeModelId(catalogModelId);
  const requested = normalizeModelId(requestedModelId);
  const suffix = getModelSuffix(requested);

  if (!candidate || !requested || !suffix) return 0;
  if (candidate === requested) return 3;
  if (candidate === suffix) return 2;
  if (candidate.endsWith(`/${suffix}`)) return 1;
  return 0;
}

/**
 * The models.dev catalog can list a model through multiple routers. Select the
 * most common limit pair at the strongest matching level to avoid one router's
 * provider-specific outlier when 9Router uses a different provider alias.
 */
function resolveTokenLimits(entries, modelId) {
  const scored = entries
    .map((model) => ({ model, score: getCandidateScore(model?.id, modelId) }))
    .filter(({ score, model }) => score > 0 && Number.isFinite(model?.limit?.context) && Number.isFinite(model?.limit?.output));

  if (!scored.length) return null;

  const bestScore = Math.max(...scored.map(({ score }) => score));
  const frequencies = new Map();

  for (const { model } of scored.filter(({ score }) => score === bestScore)) {
    const key = `${model.limit.context}:${model.limit.output}`;
    frequencies.set(key, (frequencies.get(key) || 0) + 1);
  }

  const [selectedKey] = [...frequencies.entries()]
    .sort(([firstKey, firstCount], [secondKey, secondCount]) => {
      if (secondCount !== firstCount) return secondCount - firstCount;
      const [firstContext, firstOutput] = firstKey.split(":").map(Number);
      const [secondContext, secondOutput] = secondKey.split(":").map(Number);
      return secondContext - firstContext || secondOutput - firstOutput;
    })[0];
  const [maxInputTokens, maxOutputTokens] = selectedKey.split(":").map(Number);

  return { maxInputTokens, maxOutputTokens };
}

// POST /api/models/token-limits - Resolve selected model limits from models.dev.
export async function POST(request) {
  try {
    await requireUsageDashboardUser();

    const { models } = await request.json();
    if (!Array.isArray(models) || models.some((model) => typeof model !== "string" || !model.trim())) {
      return NextResponse.json({ error: "models must be an array of model IDs" }, { status: 400 });
    }

    const response = await fetch(MODELS_DEV_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`models.dev returned ${response.status}`);

    const entries = getCatalogEntries(await response.json());
    const limits = Object.fromEntries(
      [...new Set(models)]
        .map((modelId) => [modelId, resolveTokenLimits(entries, modelId)])
        .filter(([, value]) => value),
    );

    return NextResponse.json({ limits });
  } catch (error) {
    const accessError = getForbiddenResponse(error);
    if (accessError) return accessError;

    console.log("Error resolving models.dev token limits:", error);
    return NextResponse.json({ error: "Failed to load token limits from models.dev" }, { status: 502 });
  }
}
