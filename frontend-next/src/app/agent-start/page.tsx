"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession } from "@/lib/auth-api";
import { ShiftModal } from "@/components/shift-modal";
import { ActionMenuModal } from "@/components/action-menu-modal";
import { PageLoader } from "@/components/loading-spinner";

export default function AgentStartPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();

    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    const role = String(session.user.role || "").toUpperCase();
    // Solo agentes deberían ver esta página
    if (!["AGENT", "AGENTE", "OPERATIONS", "OPERACIONES", "VENTAS"].includes(role)) {
      router.replace("/contracts");
      return;
    }

    // Mostrar el shift modal después de un pequeño delay
    setTimeout(() => setShowShiftModal(true), 300);
  }, [router]);

  const handleStartShift = () => {
    setShowShiftModal(false);
    // Pequeño delay para transición suave
    setTimeout(() => setShowMenuModal(true), 200);
  };

  const handleSelectTrips = () => {
    setShowMenuModal(false);
    // Redirigir a la página de viajes
    setTimeout(() => router.push("/trips"), 100);
  };

  const handleSelectMigration = () => {
    setShowMenuModal(false);
    // Redirigir al formulario de contrato en modo migración
    setTimeout(() => router.push("/contracts?mode=migration"), 100);
  };

  const handleSelectQuote = () => {
    // Futuro: Redirigir a página de cotización
    console.log("Cotización seleccionada (futuro)");
  };

  const handleSelectCustom = () => {
    // Futuro: Redirigir a página de viaje personalizado
    console.log("Viaje personalizado seleccionado (futuro)");
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
      <ShiftModal isOpen={showShiftModal} onStart={handleStartShift} />
      
      <ActionMenuModal
        isOpen={showMenuModal}
        onSelectTrips={handleSelectTrips}
        onSelectMigration={handleSelectMigration}
        onSelectQuote={handleSelectQuote}
        onSelectCustom={handleSelectCustom}
      />
    </>
  );
}
