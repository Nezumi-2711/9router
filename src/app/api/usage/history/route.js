import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

export async function GET() {
  try {
    const user = await requireUsageDashboardUser();
    const stats = await getUsageStats("all", user);
    return NextResponse.json(stats);
  } catch (error) {
    if (error?.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Error fetching usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
