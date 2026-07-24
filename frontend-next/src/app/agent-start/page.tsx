"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession } from "@/lib/auth-api";
import { usesAttendance } from "@/lib/attendance-permissions";
import { attendanceCheckIn, getAttendanceStatus } from "@/lib/attendance-api";
import { ShiftModal } from "@/components/shift-modal";
import { PageLoader } from "@/components/loading-spinner";

export default function AgentStartPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [startingShift, setStartingShift] = useState(false);
  const [shiftError, setShiftError] = useState("");

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

      try {
        const attendance = await getAttendanceStatus();
        if (!active) return;

        if (attendance.currentState && attendance.currentState !== "OFF") {
          router.replace(
            role === "FACTURACION_COBROS" ? "/billing" : "/agent-dashboard",
          );
          return;
        }

        setMounted(true);
        setShowShiftModal(true);
      } catch (error) {
        if (!active) return;
        setMounted(true);
        setShiftError(
          error instanceof Error
            ? error.message
            : "No se pudo validar el estado de asistencia.",
        );
        setShowShiftModal(true);
      }
    };

    void validateAttendance();

    return () => {
      active = false;
    };
  }, [router]);

  const handleStartShift = async () => {
    setStartingShift(true);
    setShiftError("");
    try {
      await attendanceCheckIn("WORKING");

      window.dispatchEvent(
        new CustomEvent("attendance-updated")
      );

      setShowShiftModal(false);

      // Check user role to determine next action
      const session = getStoredSession();
      const role = String(session?.user?.role || "").toUpperCase();

      if (role === "FACTURACION_COBROS") {
        router.replace("/billing");
      } else {
        router.replace("/agent-dashboard");
      }
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : "No se pudo iniciar el shift.");
    } finally {
      setStartingShift(false);
    }
  };

  if (!mounted) {
    return <PageLoader />;
  }

  return (
    <>
      {/* Background mientras se muestran los modales */}
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
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>¡Bienvenido!</h1>
          <p style={{ fontSize: "1.1rem", opacity: 0.9 }}>Preparando tu espacio de trabajo...</p>
        </div>
      </main>

      {/* Modales */}
      <ShiftModal
        isOpen={showShiftModal}
        onStart={() => void handleStartShift()}
        isLoading={startingShift}
        error={shiftError}
      />
      
    </>
  );
}
