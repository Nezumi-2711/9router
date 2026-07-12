import { NextResponse } from "next/server";
import { getComboById, updateCombo, deleteCombo, getComboByName } from "@/lib/localDb";
import { resetComboRotation } from "open-sse/services/combo.js";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// GET /api/combos/[id] - Get combo by ID
export async function GET(request, { params }) {
  try {
    const user = await requireUsageDashboardUser();
    const { id } = await params;
    const combo = await getComboById(id, user.role === "admin" ? undefined : user.id);
    
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }
    
    return NextResponse.json(combo);
  } catch (error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("Error fetching combo:", error);
    return NextResponse.json({ error: "Failed to fetch combo" }, { status: 500 });
  }
}

// PUT /api/combos/[id] - Update combo
export async function PUT(request, { params }) {
  try {
    const user = await requireUsageDashboardUser();
    const { id } = await params;
    const body = await request.json();
    const ownerId = user.role === "admin" ? undefined : user.id;
    // Read before name validation so administrators validate uniqueness within
    // the target combo's owner scope rather than across every user's combos.
    const prev = await getComboById(id, ownerId);
    if (!prev) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }
    
    // Validate name format if provided
    if (body.name) {
      if (!VALID_NAME_REGEX.test(body.name)) {
        return NextResponse.json({ error: "Name can only contain letters, numbers, -, _ and ." }, { status: 400 });
      }
      
      // Check if name already exists (exclude current combo)
      const existing = await getComboByName(body.name, prev.ownerId);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
      }
    }
    
    // Capture previous name to invalidate rotation state on rename
    const combo = await updateCombo(id, body, ownerId);
    
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    // Invalidate rotation state (models/strategy/name may have changed)
    if (prev?.id) resetComboRotation(prev.id);
    if (combo.id && combo.id !== prev?.id) resetComboRotation(combo.id);

    return NextResponse.json(combo);
  } catch (error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
    }
    console.log("Error updating combo:", error);
    return NextResponse.json({ error: "Failed to update combo" }, { status: 500 });
  }
}

// DELETE /api/combos/[id] - Delete combo
export async function DELETE(request, { params }) {
  try {
    const user = await requireUsageDashboardUser();
    const { id } = await params;
    const ownerId = user.role === "admin" ? undefined : user.id;
    const prev = await getComboById(id, ownerId);
    const success = await deleteCombo(id, ownerId);
    
    if (!success) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    if (prev?.id) resetComboRotation(prev.id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("Error deleting combo:", error);
    return NextResponse.json({ error: "Failed to delete combo" }, { status: 500 });
  }
}
