"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenuModal } from "@/components/action-menu-modal";
import { PageLoader } from "@/components/loading-spinner";
import { getAttendanceStatus } from "@/lib/attendance-api";
import { usesAttendance } from "@/lib/attendance-permissions";
import { getStoredSession } from "@/lib/auth-api";

export default function AgentDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

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
        isOpen
        onSelectTrips={() => router.push("/trips?travelType=INTERNATIONAL")}
        onSelectMigration={() => router.push("/trips?travelType=MIGRATION")}
        onSelectInternalTrips={() => router.push("/internal-trips-available")}
        onSelectCustomers={() => router.push("/admin/customers")}
        onSelectAdditionalServices={() => router.push("/additional-services")}
        onSelectQuote={() => {
          console.log("Cotización seleccionada (futuro)");
        }}
        onSelectCustom={() => {
          console.log("Viaje personalizado seleccionado (futuro)");
        }}
      />
    </>
  );
}
