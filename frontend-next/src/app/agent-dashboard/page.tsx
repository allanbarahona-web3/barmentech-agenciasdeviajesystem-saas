"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenuModal } from "@/components/action-menu-modal";
import { PageLoader } from "@/components/loading-spinner";
import { getAttendanceStatus } from "@/lib/attendance-api";
import { usesAttendance } from "@/lib/attendance-permissions";
import { getStoredSession } from "@/lib/auth-api";
import { AirfareDailyTaskDialog } from "@/features/cost-engine/airfare-daily-task-dialog";
import { getAgentAirfareDailyStatus, type AirfareDailyStatus } from "@/lib/cost-engine-api";

export default function AgentDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [airfareStatus, setAirfareStatus] = useState<AirfareDailyStatus | null>(null);
  const [airfareStatusLoading, setAirfareStatusLoading] = useState(false);
  const [airfareStatusError, setAirfareStatusError] = useState("");
  const [showAirfareTasks, setShowAirfareTasks] = useState(false);

  useEffect(() => {
    let active = true;

    const validateAttendance = async () => {
      const session = getStoredSession();
      if (!session?.user?.id) {
        router.replace("/");
        return;
      }

      const role = String(session.user.role || "").toUpperCase();
      if (!usesAttendance(role)) {
        router.replace("/contracts");
        return;
      }
      if (role === "FACTURACION_COBROS") {
        router.replace("/billing");
        return;
      }

      try {
        const attendance = await getAttendanceStatus();
        if (!active) return;

        if (!attendance.currentState || attendance.currentState === "OFF") {
          router.replace("/agent-start");
          return;
        }

        setAuthorized(true);
        setIsAgent(role === "AGENT");
      } catch {
        if (active) {
          router.replace("/agent-start");
        }
      }
    };

    void validateAttendance();

    return () => {
      active = false;
    };
  }, [router]);

  const refreshAirfareStatus = useCallback(async () => {
    if (!isAgent) return;
    setAirfareStatusLoading(true);
    setAirfareStatusError("");
    try {
      setAirfareStatus(await getAgentAirfareDailyStatus());
    } catch (error) {
      setAirfareStatusError(error instanceof Error ? error.message : "No se pudo verificar el estado de tarifas aéreas.");
    } finally {
      setAirfareStatusLoading(false);
    }
  }, [isAgent]);

  useEffect(() => {
    if (authorized && isAgent) void refreshAirfareStatus();
  }, [authorized, isAgent, refreshAirfareStatus]);

  if (!authorized) {
    return <PageLoader />;
  }

  return (
    <>
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <div style={{ textAlign: "center", color: "white" }}>
          <div style={{ fontSize: "4rem", marginBottom: 16 }}>👋</div>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>
            ¡Bienvenido!
          </h1>
          <p style={{ fontSize: "1.1rem", opacity: 0.9 }}>
            Selecciona tu espacio de trabajo.
          </p>
        </div>
      </main>

      <ActionMenuModal
        isOpen={!showAirfareTasks}
        onSelectTrips={() => router.push("/trips?travelType=INTERNATIONAL")}
        onSelectMigration={() => router.push("/trips?travelType=MIGRATION")}
        onSelectGroups={() => router.push("/groups")}
        onSelectInternalTrips={() => router.push("/internal-trips-available")}
        onSelectCustomers={() => router.push("/admin/customers")}
        onSelectAdditionalServices={() => router.push("/additional-services/orders")}
        onSelectQuote={() => {
          router.push('/custom-quotations');
        }}
        onSelectCustom={() => {
          console.log("Viaje personalizado seleccionado (futuro)");
        }}
        airfareStatus={isAgent ? airfareStatus : null}
        airfareStatusLoading={isAgent && airfareStatusLoading}
        airfareStatusError={isAgent ? airfareStatusError : null}
        onSelectAirfare={isAgent ? () => setShowAirfareTasks(true) : undefined}
      />

      {isAgent ? (
        <AirfareDailyTaskDialog
          isOpen={showAirfareTasks}
          status={airfareStatus}
          onClose={() => setShowAirfareTasks(false)}
          onChanged={refreshAirfareStatus}
        />
      ) : null}
    </>
  );
}
