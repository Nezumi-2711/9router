import { NextResponse } from "next/server";
import { countActiveAdmins, countProviderConnectionsByOwnerId, deleteUser, getUserById, updateUser } from "@/lib/db";
import { requireCurrentDashboardUser } from "@/lib/auth/currentUser";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const EDITABLE_FIELDS = new Set(["username", "password", "role", "isActive"]);

function errorResponse(error) {
  const message = error?.message || "Request failed";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function getTarget(params) {
  const { userId } = await params;
  const target = await getUserById(userId);
  if (!target) throw new Error("User not found");
  return target;
}

function wouldRemoveLastActiveAdmin(target, updates, activeAdminCount) {
  if (target.role !== "admin" || !target.isActive) return false;
  const nextRole = Object.hasOwn(updates, "role") ? updates.role : target.role;
  const nextActive = Object.hasOwn(updates, "isActive") ? updates.isActive === true : target.isActive;
  return (nextRole !== "admin" || !nextActive) && activeAdminCount <= 1;
}

function wouldDemoteAdmin(target, updates) {
  return target.role === "admin"
    && Object.hasOwn(updates, "role")
    && updates.role !== "admin";
}

export async function PATCH(request, { params }) {
  try {
    const actor = await requireCurrentDashboardUser();
    const target = await getTarget(params);
    const body = await request.json();
    const updates = Object.fromEntries(Object.entries(body).filter(([key]) => EDITABLE_FIELDS.has(key)));

    if (actor.role !== "admin") {
      const forbiddenChange = Object.hasOwn(updates, "username") || Object.hasOwn(updates, "role") || Object.hasOwn(updates, "isActive");
      if (actor.id !== target.id || forbiddenChange) throw new Error("Forbidden");
    }

    if (
      actor.id === target.id &&
      (Object.hasOwn(updates, "role") || Object.hasOwn(updates, "isActive"))
    ) {
      throw new Error("You cannot change your own role or account status");
    }

    if (wouldRemoveLastActiveAdmin(target, updates, await countActiveAdmins())) {
      throw new Error("At least one active administrator is required");
    }
    if (wouldDemoteAdmin(target, updates) && await countProviderConnectionsByOwnerId(target.id) > 0) {
      throw new Error("Delete this administrator's provider connections before changing their role");
    }

    const user = await updateUser(target.id, updates);
    return NextResponse.json({ user }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const actor = await requireCurrentDashboardUser();
    if (actor.role !== "admin") throw new Error("Forbidden");

    const target = await getTarget(params);
    if (target.id === actor.id) throw new Error("You cannot delete your own account");
    if (target.role === "admin" && target.isActive && await countActiveAdmins() <= 1) {
      throw new Error("At least one active administrator is required");
    }
    if (target.role === "admin" && await countProviderConnectionsByOwnerId(target.id) > 0) {
      throw new Error("Delete this administrator's provider connections before deleting their account");
    }

    await deleteUser(target.id);
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}