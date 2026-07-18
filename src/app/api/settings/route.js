import { NextResponse } from "next/server";
import { getSettings, getCombos, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import { requireCurrentDashboardUser, requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { updateUser } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password", "mitmSudoEncrypted"];

const USER_RESTRICTED_SETTING_KEYS = [
  "authMode",
  "oidcIssuerUrl",
  "oidcClientId",
  "oidcClientSecret",
  "oidcScopes",
  "oidcLoginLabel",
  "fallbackStrategy",
  "stickyRoundRobinLimit",
  "comboStrategy",
  "comboStickyRoundRobinLimit",
  "comboStrategies",
  "outboundProxyEnabled",
  "outboundProxyUrl",
  "outboundNoProxy",
  "enableObservability",
];

// Token savers change gateway-wide request processing and can start or manage
// local helper processes. They are therefore administrator-only settings.
const TOKEN_SAVER_SETTING_KEYS = [
  "rtkEnabled",
  "headroomEnabled",
  "headroomUrl",
  "headroomCodeAware",
  "headroomKompress",
  "cavemanEnabled",
  "cavemanLevel",
  "ponytailEnabled",
  "ponytailLevel",
  "pxpipeEnabled",
  "pxpipeAutoInstall",
  "pxpipeMinChars",
  "pxpipeTimeoutMs",
];

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    const user = await requireUsageDashboardUser();
    if (user.role !== "admin") {
      for (const key of USER_RESTRICTED_SETTING_KEYS) delete safeSettings[key];
      const ownedComboIds = new Set((await getCombos(user.id)).map((combo) => combo.id));
      safeSettings.comboStrategies = Object.fromEntries(
        Object.entries(safeSettings.comboStrategies || {}).filter(([comboId]) => ownedComboIds.has(comboId))
      );
      for (const key of TOKEN_SAVER_SETTING_KEYS) delete safeSettings[key];
    }
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    if (USER_RESTRICTED_SETTING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      let user;
      try {
        user = await requireUsageDashboardUser();
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "requireApiKey") ||
      TOKEN_SAVER_SETTING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key))
    ) {
      let user;
      try {
        user = await requireCurrentDashboardUser();
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
      }
    }

    // Strip protected secrets before any internal handling sets them
    for (const key of PROTECTED_SETTING_KEYS) delete body[key];

    // An authenticated dashboard session is sufficient to change its own password.
    if (body.newPassword) {
      let user;
      try {
        user = await requireCurrentDashboardUser();
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      await updateUser(user.id, { password: body.newPassword });
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "claudeAutoPing") ||
      Object.prototype.hasOwnProperty.call(body, "codexAutoPing")
    ) {
      // Keep the scheduler absent when no account opted in; load its provider graph only on demand.
      import("@/shared/services/quotaAutoPing")
        .then(({ configureQuotaAutoPing }) => {
          configureQuotaAutoPing(settings);
        })
        .catch((error) => console.warn("[AutoPing] settings update failed:", error.message));
    }

    const { password, oidcClientSecret, ...safeSettings } = settings;
    const user = await requireUsageDashboardUser();
    if (user.role !== "admin") {
      for (const key of USER_RESTRICTED_SETTING_KEYS) delete safeSettings[key];
    }
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
