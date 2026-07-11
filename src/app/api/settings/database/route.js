import { NextResponse } from "next/server";
import { exportDb, getSettings, importDb } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { requireAdminUser, verifyCurrentDashboardUserPassword } from "@/lib/auth/currentUser";
import { clearDashboardAuthCookie } from "@/lib/auth/dashboardSession";

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const PASSWORD_HEADER = "x-9r-password";

// CLI token requests are already trusted (local machine); skip password re-auth.
function isCliRequest(request) {
  return Boolean(request.headers.get(CLI_TOKEN_HEADER));
}

function getAuthorizationErrorResponse(error) {
  if (error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error.message === "Forbidden") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  return null;
}

export async function GET(request) {
  try {
    if (!isCliRequest(request)) {
      await requireAdminUser();
      if (!(await verifyCurrentDashboardUserPassword(request.headers.get(PASSWORD_HEADER)))) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }
    }
    const payload = await exportDb();
    return NextResponse.json(payload);
  } catch (error) {
    const authorizationError = getAuthorizationErrorResponse(error);
    if (authorizationError) return authorizationError;
    console.log("Error exporting database:", error);
    return NextResponse.json({ error: "Failed to export database" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { password, ...payload } = await request.json();
    if (!isCliRequest(request)) {
      await requireAdminUser();
      if (!(await verifyCurrentDashboardUserPassword(password))) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }
    }
    await importDb(payload);

    // Ensure proxy settings take effect immediately after a DB import.
    try {
      const settings = await getSettings();
      applyOutboundProxyEnv(settings);
    } catch (err) {
      console.warn("[Settings][DatabaseImport] Failed to re-apply outbound proxy env:", err);
    }

    const response = NextResponse.json({ success: true, requiresLogin: !isCliRequest(request) });

    // The imported database can replace the current account and permissions.
    // Remove the browser session so all dashboard data is loaded under a new login.
    if (!isCliRequest(request)) {
      clearDashboardAuthCookie(response.cookies);
      response.cookies.delete("oidc_state");
      response.cookies.delete("oidc_nonce");
      response.cookies.delete("oidc_code_verifier");
    }

    return response;
  } catch (error) {
    const authorizationError = getAuthorizationErrorResponse(error);
    if (authorizationError) return authorizationError;
    console.log("Error importing database:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to import database" },
      { status: 400 }
    );
  }
}
