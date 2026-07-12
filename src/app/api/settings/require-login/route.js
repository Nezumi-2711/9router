import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ error: "Login settings are not available" }, { status: 403 });
}
