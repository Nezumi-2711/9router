import { NextResponse } from "next/server";
import { getChartData } from "@/lib/usageDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d"]);

export async function GET(request) {
  try {
    const user = await requireUsageDashboardUser();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const data = await getChartData(period, user);
    return NextResponse.json(data);
  } catch (error) {
    if (error?.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[API] Failed to get chart data:", error);
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
  }
}
