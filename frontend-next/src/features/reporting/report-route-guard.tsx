"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getHomeRouteForRole, getStoredSession } from "@/lib/auth-api";
import { canAccessReport, reportsForRole, type ReportKey } from "./report-registry";

type ReportRouteGuardProps = {
  reportKey?: ReportKey;
  children: ReactNode;
};

export function ReportRouteGuard({ reportKey, children }: ReportRouteGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }
    const role = String(session.user.role ?? "").toUpperCase();
    const canAccess = reportKey ? canAccessReport(role, reportKey) : reportsForRole(role).length > 0;
    if (!canAccess) {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    setAuthorized(true);
  }, [reportKey, router]);

  if (!authorized) {
    return <main className="app-shell"><div className="grid min-h-[300px] place-items-center"><LoadingSpinner message="Validando acceso a Reportes…" /></div></main>;
  }

  return <>{children}</>;
}
