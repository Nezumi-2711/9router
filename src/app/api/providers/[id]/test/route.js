import { NextResponse } from "next/server";
import { testSingleConnection } from "./testUtils.js";
import { getProviderConnectionById } from "@/lib/localDb";
import { getProviderConnectionAccess } from "@/lib/providers/connectionAccess";

// POST /api/providers/[id]/test - Test connection
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { ownerId } = await getProviderConnectionAccess(request);
    const connection = await getProviderConnectionById(id, ownerId);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    const result = await testSingleConnection(id);

    if (result.error === "Connection not found") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
    }
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
