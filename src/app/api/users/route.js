import { NextResponse } from "next/server";
import { createUser, getUsers } from "@/lib/db";
import { requireAdminUser } from "@/lib/auth/currentUser";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function errorResponse(error) {
  const message = error?.message || "Request failed";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function GET() {
  try {
    await requireAdminUser();
    return NextResponse.json({ users: await getUsers() }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    await requireAdminUser();
    const { username, password, role } = await request.json();
    const user = await createUser({ username, password, role });
    return NextResponse.json({ user }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}