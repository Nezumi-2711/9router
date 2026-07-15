import { requireAdminUser } from "@/lib/auth/currentUser";
import { getUsers } from "@/lib/db";
import { hasValidCliToken } from "@/dashboardGuard";

/**
 * Provider credentials are system-managed. Only administrators may inspect
 * or mutate their connections; request API-key ownership remains separate
 * and is used solely for authentication and usage attribution.
 */
export async function requireProviderAdministrator(request) {
  if (request && await hasValidCliToken(request)) {
    const admin = (await getUsers()).find((user) => user.role === "admin" && user.isActive);
    if (!admin) throw new Error("No active administrator available for provider management");
    return admin;
  }

  return requireAdminUser();
}

export async function getProviderConnectionAccess(request) {
  const user = await requireProviderAdministrator(request);
  return {
    user,
    ownerId: null,
  };
}
