import { NextResponse } from "next/server";
import { resetAdminPassword } from "@/lib/db";

// Reset the bootstrap administrator password. Local-only (enforced by dashboardGuard).
export async function POST() {
  try {
    await resetAdminPassword(process.env.INITIAL_PASSWORD || "123456");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
