import { NextResponse } from "next/server";
import {
  getUserById,
} from "@/lib/db/index.js";
import { requireAdminUser } from "@/lib/auth/currentUser.js";
import { getUserTokenQuota } from "@/lib/userTokenQuota.js";

export const dynamic = "force-dynamic";

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

export async function GET(_request, { params }) {
  try {
    await requireAdminUser();

    const { userId } = await params;
    const user = await getUserById(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "user") throw new Error("Token usage only applies to user accounts");

    const now = new Date();
    const providers = await getUserTokenQuota(user.id, now);

    return NextResponse.json({
      userId: user.id,
      providers,
      updatedAt: now.toISOString(),
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
