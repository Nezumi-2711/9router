import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const user = await requireUsageDashboardUser();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const stats = await getUsageStats(period, user);
    return NextResponse.json(stats);
  } catch (error) {
    if (error?.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
