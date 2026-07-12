import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { fetchOidcDiscovery, getPublicOrigin, probeOidcClientSecret } from "@/lib/auth/oidc";
import { requireUsageDashboardUser } from "@/lib/auth/currentUser";

export async function POST(request) {
  try {
    const user = await requireUsageDashboardUser();
    if (user.role !== "admin") throw new Error("Forbidden");
    const body = await request.json().catch(() => ({}));
    const settings = await getSettings();
    const issuerUrl = String(body.issuerUrl || settings.oidcIssuerUrl || "").trim();
    const clientId = String(body.clientId || settings.oidcClientId || "").trim();
    const scopes = String(body.scopes || settings.oidcScopes || "openid profile email").trim() || "openid profile email";
    const clientSecret = String(body.clientSecret || settings.oidcClientSecret || "").trim();
    if (!issuerUrl || !clientId) return NextResponse.json({ error: "Issuer URL and client ID are required" }, { status: 400 });
    const discovery = await fetchOidcDiscovery(issuerUrl);
    const redirectUri = `${getPublicOrigin(request)}/api/auth/oidc/callback`;
    const secretProbe = await probeOidcClientSecret({
      tokenEndpoint: discovery.token_endpoint,
      clientId,
      clientSecret,
      redirectUri,
    });
    return NextResponse.json({ ok: secretProbe.valid !== false, discoveryOk: true, clientSecretTested: secretProbe.tested, clientSecretValid: secretProbe.valid, issuerUrl, clientId, scopes, message: secretProbe.message });
  } catch (error) {
    const status = error.message === "Unauthorized" ? 401 : error.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: error.message || "OIDC test failed" }, { status });
  }
}
