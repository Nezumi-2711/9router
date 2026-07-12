import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function PATCH() {
  return NextResponse.json({ error: "Routing strategy settings are not available" }, { status: 403 });
}