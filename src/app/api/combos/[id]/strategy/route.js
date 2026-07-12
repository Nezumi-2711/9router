import { NextResponse } from "next/server";
import { getComboById, updateComboStrategy } from "@/lib/localDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { resetComboRotation } from "open-sse/services/combo.js";

export const dynamic = "force-dynamic";

const STRATEGIES = new Set(["fallback", "round-robin", "fusion"]);

function normalizeStrategy(strategy) {
  const normalized = {};
  if (strategy.fallbackStrategy !== undefined) {
    if (!STRATEGIES.has(strategy.fallbackStrategy)) return null;
    normalized.fallbackStrategy = strategy.fallbackStrategy;
  }
  if (strategy.judgeModel !== undefined) {
    if (typeof strategy.judgeModel !== "string" || strategy.judgeModel.length > 256) return null;
    normalized.judgeModel = strategy.judgeModel.trim();
  }
  return normalized;
}

export async function PATCH(request, { params }) {
  try {
    const user = await requireUsageDashboardUser();
    const { id } = await params;
    const ownerId = user.role === "admin" ? undefined : user.id;
    const combo = await getComboById(id, ownerId);
    if (!combo) return NextResponse.json({ error: "Combo not found" }, { status: 404 });

    const { strategy } = await request.json();
    if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) {
      return NextResponse.json({ error: "Strategy must be an object" }, { status: 400 });
    }
    const normalizedStrategy = normalizeStrategy(strategy);
    if (!normalizedStrategy) {
      return NextResponse.json({ error: "Invalid combo strategy" }, { status: 400 });
    }

    const settings = await updateComboStrategy(combo.id, normalizedStrategy);
    resetComboRotation(combo.id);
    return NextResponse.json({ strategy: settings.comboStrategies[combo.id] || {} });
  } catch (error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("Error updating combo strategy:", error);
    return NextResponse.json({ error: "Failed to update combo strategy" }, { status: 500 });
  }
}