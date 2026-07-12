import { NextResponse } from "next/server";
import { getComboById, updateComboStrategy } from "@/lib/localDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { resetComboRotation } from "open-sse/services/combo.js";

export const dynamic = "force-dynamic";

const STRATEGIES = new Set(["fallback", "round-robin", "fusion"]);

export async function PATCH(request, { params }) {
  try {
    const user = await requireUsageDashboardUser();
    if (user.role !== "admin") throw new Error("Forbidden");
    const { id } = await params;
    const combo = await getComboById(id);
    if (!combo) return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    const { strategy } = await request.json();
    if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) return NextResponse.json({ error: "Strategy must be an object" }, { status: 400 });
    if (strategy.fallbackStrategy !== undefined && !STRATEGIES.has(strategy.fallbackStrategy)) return NextResponse.json({ error: "Invalid combo strategy" }, { status: 400 });
    if (strategy.judgeModel !== undefined && (typeof strategy.judgeModel !== "string" || strategy.judgeModel.length > 256)) return NextResponse.json({ error: "Invalid combo strategy" }, { status: 400 });
    const normalizedStrategy = {};
    if (strategy.fallbackStrategy !== undefined) normalizedStrategy.fallbackStrategy = strategy.fallbackStrategy;
    if (strategy.judgeModel !== undefined) normalizedStrategy.judgeModel = strategy.judgeModel.trim();
    const settings = await updateComboStrategy(combo.id, normalizedStrategy);
    resetComboRotation(combo.id);
    return NextResponse.json({ strategy: settings.comboStrategies[combo.id] || {} });
  } catch (error) {
    const status = error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to update combo strategy" }, { status });
  }
}