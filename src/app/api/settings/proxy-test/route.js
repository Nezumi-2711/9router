import { NextResponse } from "next/server";
import { testProxyUrl } from "@/lib/network/proxyTest";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

export async function POST(request) {
  try {
    const user = await requireUsageDashboardUser();
    if (user.role !== "admin") throw new Error("Forbidden");
    const body = await request.json();
    const result = await testProxyUrl({ proxyUrl: body?.proxyUrl, testUrl: body?.testUrl, timeoutMs: body?.timeoutMs });
    if (result?.ok) return NextResponse.json(result);
    return NextResponse.json({ ok: false, error: result?.error || "Proxy test failed" }, { status: result?.status || 500 });
  } catch (error) {
    const status = error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message || "Proxy test failed" }, { status });
  }
}
