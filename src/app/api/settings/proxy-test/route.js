import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Network settings are not available" }, { status: 403 });
}
