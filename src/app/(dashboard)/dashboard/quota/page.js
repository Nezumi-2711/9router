"use client";

import { Suspense, useEffect } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";
import SystemQuotaOverview from "../usage/components/SystemQuotaOverview";
import useUserStore from "@/store/userStore";

export default function QuotaPage() {
  const user = useUserStore((state) => state.user);
  const loading = useUserStore((state) => state.loading);
  const fetchCurrentUser = useUserStore((state) => state.fetchCurrentUser);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  if (!user || loading) return <CardSkeleton />;

  return (
    <Suspense fallback={<CardSkeleton />}>
      {user.role === "admin" ? <ProviderLimits /> : <SystemQuotaOverview />}
    </Suspense>
  );
}
