import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/usageDb";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

export async function GET() {
  try {
    const user = await requireUsageDashboardUser();
    const logs = await getRecentLogs(200, user);
    return NextResponse.json(logs);
  } catch (error) {
    if (error?.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[API ERROR] /api/usage/logs failed:", error);
    console.error("[API ERROR] Stack:", error?.stack);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
