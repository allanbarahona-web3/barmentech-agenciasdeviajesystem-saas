"use client";

export const dynamic = 'force-dynamic';

import { getHomeRouteForRole, getStoredSession, getStoredToken } from "@/lib/auth-api";
import { ExchangeRateChecker } from "@/components/exchange-rate-checker";
import { AdminDashboardContent } from "@/features/admin-dashboard/admin-dashboard-content";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = getStoredToken();
    const role = String(getStoredSession()?.user?.role || "").toUpperCase();
    const authorized = role === "ADMIN";
    setIsAuthorized(authorized);
    
    if (!token || !authorized) {
      router.replace(token ? getHomeRouteForRole(role) : "/");
      return;
    }
  }, [router]);

  if (!mounted || !isAuthorized) {
    return null;
  }

  return (
    <>
      <ExchangeRateChecker />
      <AdminDashboardContent onOpenSettings={() => router.push("/settings")} />
  </>
  );
}
