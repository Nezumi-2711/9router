import { getMachineId } from "@/shared/utils/machine";
import { getCurrentDashboardUser } from "@/lib/auth/currentUser";
import EndpointPageClient from "./EndpointPageClient";

export default async function EndpointPage() {
  const [machineId, user] = await Promise.all([getMachineId(), getCurrentDashboardUser()]);
  return <EndpointPageClient machineId={machineId} isAdmin={user?.role !== "user"} />;
}
