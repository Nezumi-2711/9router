import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "OIDC settings are not available" }, { status: 403 });
}
