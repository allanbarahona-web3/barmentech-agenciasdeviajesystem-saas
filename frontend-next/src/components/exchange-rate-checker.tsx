"use client";

import { useEffect, useState } from "react";
import { getCurrentExchangeRate } from "@/lib/exchange-rate-api";
import { getStoredSession } from "@/lib/auth-api";
import { ExchangeRateAlertModal } from "@/components/exchange-rate-alert-modal";

const SESSION_KEY = "exchange_rate_checked";

/**
 * Componente que verifica si existe tipo de cambio para hoy
 * Solo se ejecuta UNA VEZ por sesión después del login
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
      // 1. Verificar si el usuario es ADMIN
      const session = getStoredSession();
      if (!session || session.user.role !== "ADMIN") {
        setChecking(false);
        return;
      }

      // 2. Verificar si ya se revisó en esta sesión
      const alreadyChecked = sessionStorage.getItem(SESSION_KEY);
      if (alreadyChecked === "true") {
        setChecking(false);
        return;
      }

      // 3. Verificar si existe tipo de cambio para hoy
      const currentRate = await getCurrentExchangeRate();

      // 4. Marcar como verificado para no preguntar de nuevo en esta sesión
      sessionStorage.setItem(SESSION_KEY, "true");

      // 5. Si NO existe, mostrar modal
      if (!currentRate) {
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error al verificar tipo de cambio:", error);
      // Marcar como verificado incluso con error para no saturar con requests
      sessionStorage.setItem(SESSION_KEY, "true");
    } finally {
      setChecking(false);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
  };

  // No renderizar nada mientras está verificando
  if (checking) return null;

  return <ExchangeRateAlertModal isOpen={showModal} onClose={handleModalClose} />;
}
