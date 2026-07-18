import { getMachineId } from "@/shared/utils/machine";
import { getCurrentDashboardUser } from "@/lib/auth/currentUser";
import DashboardPageClient from "./DashboardPageClient";

export default async function DashboardPage() {
  const user = await getCurrentDashboardUser();
  return <DashboardPageClient isAdmin={user?.role === "admin"} />;
}
