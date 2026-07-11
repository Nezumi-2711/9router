import { requireCurrentDashboardUser } from "@/lib/auth/currentUser";

export async function getProviderConnectionAccess() {
  const user = await requireCurrentDashboardUser();
  return {
    user,
    ownerId: user.role === "admin" ? null : user.id,
  };
}
