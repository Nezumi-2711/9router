import { NextResponse } from "next/server";
import {
  getUserById,
  getUserTokenLimits,
  replaceUserTokenLimits,
} from "@/lib/db/index.js";
import { requireAdminUser } from "@/lib/auth/currentUser.js";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function errorResponse(error) {
  const message = error?.message || "Request failed";
  const status = message === "Unauthorized"
    ? 401
    : message === "Forbidden"
      ? 403
      : message === "User not found"
        ? 404
        : 400;
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function getTargetUser(params) {
  const { userId } = await params;
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");
  return user;
}

export async function GET(_request, { params }) {
  try {
    await requireAdminUser();
    const user = await getTargetUser(params);
    const limits = await getUserTokenLimits(user.id);
    return NextResponse.json({ limits }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request, { params }) {
  try {
    await requireAdminUser();
    const user = await getTargetUser(params);
    if (user.role !== "user") throw new Error("Token limits only apply to user accounts");

    const body = await request.json();
    if (!body?.limits || typeof body.limits !== "object" || Array.isArray(body.limits)) {
      throw new Error("Token limits are required");
    }
    const limits = await replaceUserTokenLimits(user.id, body?.limits);
    return NextResponse.json({ limits }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
