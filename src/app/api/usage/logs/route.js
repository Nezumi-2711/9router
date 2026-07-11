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
    console.error("Error fetching logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
