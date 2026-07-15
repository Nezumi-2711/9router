import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { normalizeKiroExternalIdpAuth } from "@/lib/oauth/kiroExternalIdp";
import { getProviderConnectionAccess } from "@/lib/providers/connectionAccess";

/**
 * POST /api/oauth/kiro/import-cli-proxy
 * Import Kiro CLIProxyAPI auth JSON for Microsoft external_idp accounts.
 */
export async function POST(request) {
  try {
    const { user } = await getProviderConnectionAccess(request);
    const body = await request.json();
    const rawAuth = body?.cliProxyAuth ?? body?.auth ?? body?.json ?? body;
    const tokenData = normalizeKiroExternalIdpAuth(rawAuth);

    const connection = await createProviderConnection({
      provider: "kiro",
      authType: "oauth",
      ownerId: user.id,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      email: tokenData.email || null,
      providerSpecificData: tokenData.providerSpecificData,
      testStatus: "active",
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
      },
    });
  } catch (error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error?.message || "CLIProxyAPI import failed" },
      { status: error?.status || 400 }
    );
  }
}
