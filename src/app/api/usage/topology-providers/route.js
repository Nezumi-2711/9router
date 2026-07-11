import { NextResponse } from "next/server";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { getUsageTopologyProviders } from "@/lib/providers/usageTopologyProviders";

export const dynamic = "force-dynamic";

/**
 * GET /api/usage/topology-providers
 * Returns provider types that the request router can currently select.
 */
export async function GET() {
  try {
    await requireUsageDashboardUser();
    const providers = await getUsageTopologyProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[API] Failed to get usage topology providers:", error);
    return NextResponse.json({ error: "Failed to fetch topology providers" }, { status: 500 });
  }
}