"use client";

import { useEffect, useState } from "react";
import { getCurrentExchangeRate } from "@/lib/exchange-rate-api";
import { getStoredSession } from "@/lib/auth-api";
import { ExchangeRateAlertModal } from "@/components/exchange-rate-alert-modal";

/**
 * Componente que verifica si existe tipo de cambio para hoy
 * La fuente de verdad SIEMPRE es el Backend/DB
 * Solo se muestra para usuarios ADMIN
 */
export function ExchangeRateChecker() {
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkExchangeRate();
  }, []);

  const checkExchangeRate = async () => {
    try {
      // Verificar si el usuario es ADMIN
      const session = getStoredSession();

      if (!session || session.user.role !== "ADMIN") {
        return;
      }

      // Consultar SIEMPRE el backend
      const currentRate = await getCurrentExchangeRate();

      // Si NO existe TC para hoy, mostrar modal
      if (!currentRate) {
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error al verificar tipo de cambio:", error);
    } finally {
      setChecking(false);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
  };

  // No renderizar nada mientras está verificando
  if (checking) return null;

  return (
    <ExchangeRateAlertModal
      isOpen={showModal}
      onClose={handleModalClose}
    />
  );
}
