import { NextResponse } from "next/server";
import { getSettings, getCombos, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import { runQuotaAutoPingTick } from "@/shared/services/quotaAutoPing";
import { requireCurrentDashboardUser, requireUsageDashboardUser } from "@/lib/auth/currentUser";
import { updateUser, verifyUserPassword } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password", "mitmSudoEncrypted"];

// These capabilities are intentionally not configurable through the dashboard.
// Keep the server-side policy here so callers cannot bypass the hidden UI.
const RESTRICTED_SETTING_KEYS = [
  "requireLogin",
  "authMode",
  "oidcIssuerUrl",
  "oidcClientId",
  "oidcClientSecret",
  "oidcScopes",
  "oidcLoginLabel",
  "oidcConfigured",
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
    for (const key of RESTRICTED_SETTING_KEYS) delete safeSettings[key];
    const user = await requireUsageDashboardUser();
    if (user.role !== "admin") {
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

    if (RESTRICTED_SETTING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      return NextResponse.json({ error: "This setting is not available" }, { status: 403 });
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "requireApiKey") ||
      Object.prototype.hasOwnProperty.call(body, "tunnelDashboardAccess") ||
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

    // If updating password, hash it
    if (body.newPassword) {
      let user;
      try {
        user = await requireCurrentDashboardUser();
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (!body.currentPassword) {
        return NextResponse.json({ error: "Current password required" }, { status: 400 });
      }
      if (!(await verifyUserPassword(user.id, body.currentPassword))) {
        return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
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
      // Run once immediately after opt-in changes so users don't wait for the next scheduler tick.
      runQuotaAutoPingTick().catch((error) => {
        console.warn("[AutoPing] settings-triggered tick failed:", error.message);
      });
    }

    const { password, oidcClientSecret, ...safeSettings } = settings;
    for (const key of RESTRICTED_SETTING_KEYS) delete safeSettings[key];
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
