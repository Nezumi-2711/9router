import TokenSaverClient from "./TokenSaverClient";
import { redirect } from "next/navigation";
import { getCurrentDashboardUser } from "@/lib/auth/currentUser";

export default async function TokenSaverPage() {
  const user = await getCurrentDashboardUser();
  if (user?.role !== "admin") redirect("/dashboard");

  return <TokenSaverClient />;
}
