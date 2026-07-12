import { cookies } from "next/headers";
import { getDashboardAuthSession } from "./dashboardSession.js";
import { getUserById, verifyUserPassword } from "@/lib/db";

export async function getCurrentDashboardUser() {
  const cookieStore = await cookies();
  const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
  if (!session?.userId || !session?.username) return null;
  const persistedUser = await getUserById(String(session.userId));
  if (!persistedUser || !persistedUser.isActive) return null;

  return {
    id: persistedUser.id,
    username: persistedUser.username,
    role: persistedUser.role,
  };
}

export async function requireCurrentDashboardUser() {
  const user = await getCurrentDashboardUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/**
 * Resolve the currently authenticated dashboard user.
 */
export async function requireUsageDashboardUser() {
  const user = await getCurrentDashboardUser();
  if (user) return user;

  throw new Error("Unauthorized");
}

export async function requireAdminUser() {
  const user = await requireCurrentDashboardUser();
  if (user.role !== "admin") throw new Error("Forbidden");
  return user;
}

export async function verifyCurrentDashboardUserPassword(password) {
  const user = await getCurrentDashboardUser();
  if (!user) return false;
  return verifyUserPassword(user.id, password);
}