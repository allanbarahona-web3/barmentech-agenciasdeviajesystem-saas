"use client";

import { clearStoredToken, getStoredSession, getStoredToken } from "@/lib/auth-api";
import { getPendingApprovalsCount, type PendingCounts } from "@/lib/billing-api";
import { getCurrentExchangeRate, type ExchangeRate } from "@/lib/exchange-rate-api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurrencyCalculator } from "./currency-calculator";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  adminOnly?: boolean;
};

const formatDuration = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export function VerticalNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [tick, setTick] = useState(Date.now());
  const [showCalculator, setShowCalculator] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({ pendingReceipts: 0, pendingCreditNotes: 0, contractsPendingSignature: 0 });
  const [mounted, setMounted] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<ReturnType<typeof getStoredSession>>(null);

  // Fix hydration - only render on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-leer token y sesion cada vez que cambia la ruta (cubre el caso post-login)
  useEffect(() => {
    setToken(getStoredToken());
    setSession(getStoredSession());
  }, [pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;

    const loadPendingCounts = async () => {
      try {
        const counts = await getPendingApprovalsCount();
        console.log("[VerticalNav] Pending counts:", counts);
        setPendingCounts(counts);
      } catch (error) {
        console.error("[VerticalNav] Error loading pending counts:", error);
      }
    };

    void loadPendingCounts();
    const interval = window.setInterval(() => void loadPendingCounts(), 30000); // Refresh every 30s
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const loadExchangeRate = async () => {
      try {
        const rate = await getCurrentExchangeRate();
        setExchangeRate(rate);
      } catch {
        // Silently fail
      }
    };

    void loadExchangeRate();
    const interval = window.setInterval(() => void loadExchangeRate(), 30000); // Refresh every 30s
    return () => window.clearInterval(interval);
  }, [token]);

  // Prevent hydration mismatch - only show on client
  if (!mounted) {
    return null;
  }

  if (!token || !session?.user?.id || pathname === "/") {
    return null;
  }

  const role = String(session.user.role || "AGENT").toUpperCase();
  const isAdmin = role === "ADMIN";
  const isContador = role === "CONTADOR";
  const isFacturacionCobros = role === "FACTURACION_COBROS";
  const isVentas = role === "VENTAS";
  const isOperaciones = role === "OPERACIONES";
  const isAdminOrContador = isAdmin || isContador;
  const connectedSeconds = session.loginAt
    ? Math.max(0, Math.floor((tick - new Date(session.loginAt).getTime()) / 1000))
    : 0;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    return pathname.startsWith(`${href}/`);
  };

  const navItems: NavItem[] = [
    // Dashboard para Admin/Contador (NO Facturacion)
    ...(isAdminOrContador
      ? [
          {
            href: "/admin/dashboard",
            label: "Dashboard",
            icon: "📊",
            adminOnly: true,
          },
        ]
      : []),
    
    // Formulario solo para Agentes
    ...(!isAdminOrContador && !isFacturacionCobros
      ? [
          {
            href: "/contracts",
            label: "Formulario",
            icon: "📝",
          },
        ]
      : []),
    
    // Estados de cuenta (Admin/Contador/Facturacion/Agentes)
    {
      href: "/billing",
      label: "Estados de cuenta",
      icon: "💰",
    },
    
    // Sección de Tareas Pendientes (Admin/Contador/Facturacion)
    ...(isAdminOrContador || isFacturacionCobros
      ? [
          {
            href: "/admin/pending-payments",
            label: "Pagos Pendientes",
            icon: "⏳",
            badge: pendingCounts.pendingReceipts || 0,
            adminOnly: true,
          },
          {
            href: "/admin/pending-receipts",
            label: "Recibos por Enviar",
            icon: "🧾",
            adminOnly: true,
          },
        ]
      : []),
    
    // Notas de Crédito (SOLO Admin)
    ...(isAdmin
      ? [
          {
            href: "/admin/pending-credit-notes",
            label: "Notas de Crédito",
            icon: "📋",
            badge: pendingCounts.pendingCreditNotes || 0,
            adminOnly: true,
          },
        ]
      : []),
    
    // Sección de Administración (SOLO Admin/Contador, NO Facturacion)
    ...(isAdminOrContador
      ? [
          {
            href: "/billing/admin/reports",
            label: "Reportes",
            icon: "📈",
            adminOnly: true,
          },
          {
            href: "/billing/audit",
            label: "Auditoría",
            icon: "🔍",
            adminOnly: true,
          },
        ]
      : []),
    
    // Tipo de Cambio (Admin/Contador/Facturacion)
    ...(isAdmin || isContador || isFacturacionCobros
      ? [
          {
            href: "/admin/exchange-rate",
            label: "Tipo de Cambio",
            icon: "💱",
            adminOnly: true,
          },
        ]
      : []),
    
    // Configuración adicional (solo Admin)
    ...(isAdmin
      ? [
          {
            href: "/admin/bank-accounts",
            label: "Cuentas Bancarias",
            icon: "🏦",
            adminOnly: true,
          },
          {
            href: "/admin/users",
            label: "Usuarios",
            icon: "👥",
            adminOnly: true,
          },
        ]
      : []),
    
    // Historial (todos EXCEPTO Facturacion) — badge de "listos para firmar" SOLO para agentes
    ...(!isFacturacionCobros
      ? [
          {
            href: "/history",
            label: "Historial",
            icon: "📅",
            badge: !isAdminOrContador ? (pendingCounts.contractsPendingSignature || 0) : 0,
          },
        ]
      : []),
  ];

  // Debug: Log navItems para ver badges
  console.log("[VerticalNav] Role:", role, "isAdminOrContador:", isAdminOrContador);
  console.log("[VerticalNav] Pending counts:", pendingCounts);
  const historialItem = navItems.find(item => item.href === "/history");
  if (historialItem) {
    console.log("[VerticalNav] Historial badge:", historialItem.badge);
  }

  return (
    <>
      <nav className="vertical-nav">
        <div className="vertical-nav-header">
          <div className="vertical-nav-user">
            <div className="vertical-nav-avatar">{session.user.fullName.charAt(0).toUpperCase()}</div>
            <div className="vertical-nav-user-info">
              <div className="vertical-nav-user-name">{session.user.fullName}</div>
              <div className="vertical-nav-user-email">{session.user.email}</div>
              <div className="vertical-nav-user-role">{role}</div>
            </div>
          </div>
          <div className="vertical-nav-session-time">
            <span className="session-indicator"></span>
            Sesión: {formatDuration(connectedSeconds)}
          </div>
          {exchangeRate ? (
            <div className="vertical-nav-exchange-rate">
              <div className="exchange-rate-badge">
                <span className="exchange-rate-icon">💱</span>
                <div className="exchange-rate-info">
                  <div className="exchange-rate-label">Tipo de Cambio</div>
                  <div className="exchange-rate-values">
                    <span className="exchange-rate-value">
                      <small>Compra:</small> ₡{exchangeRate.buyRate.toFixed(2)}
                    </span>
                    <span className="exchange-rate-value">
                      <small>Venta:</small> ₡{exchangeRate.sellRate.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="vertical-nav-items">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`vertical-nav-item${isActive(item.href) ? " vertical-nav-item-active" : ""}`}
            >
              <span className="vertical-nav-icon">{item.icon}</span>
              <span className="vertical-nav-label">{item.label}</span>
              {item.badge && item.badge > 0 ? <span className="vertical-nav-badge">{item.badge}</span> : null}
            </Link>
          ))}
        </div>

        <div className="vertical-nav-footer">
          <button
            type="button"
            className="vertical-nav-item vertical-nav-action"
            onClick={() => setShowCalculator(true)}
            title="Calculadora de divisas USD/CRC"
          >
            <span className="vertical-nav-icon">💱</span>
            <span className="vertical-nav-label">Calculadora</span>
          </button>

          <button
            type="button"
            className="vertical-nav-item vertical-nav-action vertical-nav-logout"
            onClick={() => {
              clearStoredToken();
              router.replace("/");
            }}
          >
            <span className="vertical-nav-icon">🚪</span>
            <span className="vertical-nav-label">Cerrar sesión</span>
          </button>
        </div>
      </nav>

      <CurrencyCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />
    </>
  );
}
