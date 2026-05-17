"use client";

import { clearStoredToken, getStoredSession, getStoredToken } from "@/lib/auth-api";
import { getPendingApprovalsCount, type PendingCounts } from "@/lib/billing-api";
import { getCurrentExchangeRate, type ExchangeRate } from "@/lib/exchange-rate-api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurrencyCalculator } from "./currency-calculator";
import { SupportModal } from "./support-modal";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  icon: string;
  items: NavItem[];
  adminOnly?: boolean;
};

type NavElement = NavItem | NavGroup;

const isNavGroup = (item: NavElement): item is NavGroup => 'items' in item;

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
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({ pendingReceipts: 0, pendingCreditNotes: 0, contractsPendingSignature: 0 });
  const [mounted, setMounted] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<ReturnType<typeof getStoredSession>>(null);
  const [finanzasOpen, setFinanzasOpen] = useState(false);
  const [empleadosOpen, setEmpleadosOpen] = useState(false);
  const [programarViajesOpen, setProgramarViajesOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Fix hydration - only render on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-leer token y sesion cada vez que cambia la ruta (cubre el caso post-login)
  useEffect(() => {
    setToken(getStoredToken());
    setSession(getStoredSession());
    setNavOpen(false); // Cerrar nav al cambiar de ruta (mobile)
  }, [pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;
    
    // Skip data loading for SUPER_ADMIN
    if (session?.user?.role === "SUPER_ADMIN") return;

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
  }, [token, session]);

  useEffect(() => {
    if (!token) return;
    
    // Skip data loading for SUPER_ADMIN
    if (session?.user?.role === "SUPER_ADMIN") return;

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
  }, [token, session]);

  // Prevent hydration mismatch - only show on client
  if (!mounted) {
    return null;
  }

  if (!token || !session?.user?.id || pathname === "/") {
    return null;
  }

  const role = String(session.user.role || "AGENT").toUpperCase();
  
  // Super Admin has its own layout, hide this nav
  if (role === "SUPER_ADMIN") {
    return null;
  }

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

  const navElements: NavElement[] = [
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
    
    // Migrar Contrato para Agentes
    ...(!isAdminOrContador && !isFacturacionCobros
      ? [
          {
            href: "/contracts?mode=migration",
            label: "Migrar Contrato",
            icon: "📄",
          },
        ]
      : []),
    
    // Viajes Internacionales para Agentes/Ventas/Operaciones
    ...(!isAdminOrContador && !isFacturacionCobros
      ? [
          {
            href: "/trips",
            label: "Viajes Internacionales",
            icon: "✈️",
          },
          {
            href: "/internal-trips-available",
            label: "Viajes Internos",
            icon: "🚌",
          },
        ]
      : []),
    
    // 💰 Menú Finanzas (Admin/Contador/Facturacion)
    ...(isAdminOrContador || isFacturacionCobros
      ? [
          {
            label: "Finanzas",
            icon: "💰",
            adminOnly: true,
            items: [
              {
                href: "/billing",
                label: "Estados de cuenta",
                icon: "💰",
              },
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
            ],
          } as NavGroup,
        ]
      : [
          // Para Agentes: solo Estados de cuenta directo
          {
            href: "/billing",
            label: "Estados de cuenta",
            icon: "💰",
          },
        ]),
    
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
            label: "Programar Viajes",
            icon: "✈️",
            adminOnly: true,
            items: [
              {
                href: "/admin/trips/new",
                label: "Crear Viaje",
                icon: "➕",
                adminOnly: true,
              },
              {
                href: "/admin/travel-packages",
                label: "Viajes Internacionales",
                icon: "🌍",
                adminOnly: true,
              },
              {
                href: "/admin/internal-trips",
                label: "Viajes Internos",
                icon: "🚌",
                adminOnly: true,
              },
            ],
          } as NavGroup,
        ]
      : []),
    
    // 👥 Menú Recursos Humanos / Empleados (solo Admin)
    // ⚠️ MULTI-TENANT: TODOS los módulos deben tener tenantId + RLS
    // Arquitectura propuesta:
    // 1. EMPLEADOS: Datos personales, documentos, salario base [tenantId]
    // 2. USUARIOS: Credenciales, roles, permisos vinculados a empleado [tenantId]
    // 3. PLANILLA: Nómina, provisiones, tasas de pago [tenantId]
    // 4. TIMECLOCK: Control de asistencia, marcajes entrada/salida [tenantId]
    // Flujo: Empleado → Botón "Crear Usuario" → Asignar role en Usuarios
    // RLS Policy: WHERE tenantId = current_setting('app.current_tenant')::uuid
    ...(isAdmin
      ? [
          {
            label: "Recursos Humanos",
            icon: "👥",
            adminOnly: true,
            items: [
              {
                href: "/admin/users",
                label: "Usuarios",
                icon: "🔑",
                adminOnly: true,
              },
              {
                href: "/admin/employees",
                label: "Empleados",
                icon: "🧑‍💼",
                adminOnly: true,
              },
              {
                href: "/admin/payroll",
                label: "Planilla/Nómina",
                icon: "💰",
                adminOnly: true,
              },
              {
                href: "/admin/timeclock",
                label: "Control de Asistencia",
                icon: "⏰",
                adminOnly: true,
              },
            ],
          } as NavGroup,
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

  // Debug: Log navElements para ver badges
  console.log("[VerticalNav] Role:", role, "isAdminOrContador:", isAdminOrContador);
  console.log("[VerticalNav] Pending counts:", pendingCounts);
  const historialItem = navElements.find(item => !isNavGroup(item) && item.href === "/history") as NavItem | undefined;
  if (historialItem) {
    console.log("[VerticalNav] Historial badge:", historialItem.badge);
  }

  return (
    <>
      {/* Botón hamburger para móviles/tablets */}
      <button
        type="button"
        className="nav-hamburger"
        onClick={() => setNavOpen(true)}
        aria-label="Abrir menú"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {/* Overlay para cerrar nav en móviles */}
      {navOpen && (
        <div
          className="nav-overlay"
          onClick={() => setNavOpen(false)}
        />
      )}

      <nav className={`vertical-nav${navOpen ? " open" : ""}`}>
        <div className="vertical-nav-header">
          {/* Botón cerrar para móviles/tablets */}
          <button
            type="button"
            className="nav-close"
            onClick={() => setNavOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
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
          {navElements.map((element, idx) => {
            if (isNavGroup(element)) {
              // Menú desplegable
              const group = element;
              const totalBadge = group.items.reduce((sum, item) => sum + (item.badge || 0), 0);
              const isAnyActive = group.items.some(item => isActive(item.href));
              
              // Determinar qué estado usar según el grupo
              const isOpen = group.label === "Finanzas" 
                ? finanzasOpen 
                : group.label === "Programar Viajes" 
                  ? programarViajesOpen 
                  : empleadosOpen;
              
              const toggleOpen = group.label === "Finanzas" 
                ? () => setFinanzasOpen(!finanzasOpen)
                : group.label === "Programar Viajes"
                  ? () => setProgramarViajesOpen(!programarViajesOpen)
                  : () => setEmpleadosOpen(!empleadosOpen);
              
              return (
                <div key={`group-${idx}`} className="vertical-nav-group">
                  <button
                    type="button"
                    className={`vertical-nav-item vertical-nav-group-header${isAnyActive ? " vertical-nav-item-active" : ""}`}
                    onClick={toggleOpen}
                  >
                    <span className="vertical-nav-icon">{group.icon}</span>
                    <span className="vertical-nav-label">{group.label}</span>
                    {!isOpen && totalBadge > 0 ? (
                      <span className="vertical-nav-badge">{totalBadge}</span>
                    ) : null}
                    <span className="vertical-nav-chevron">{isOpen ? "▼" : "▶"}</span>
                  </button>
                  {isOpen && (
                    <div className="vertical-nav-group-items">
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`vertical-nav-item vertical-nav-subitem${isActive(item.href) ? " vertical-nav-item-active" : ""}`}
                        >
                          <span className="vertical-nav-icon">{item.icon}</span>
                          <span className="vertical-nav-label">{item.label}</span>
                          {item.badge && item.badge > 0 ? (
                            <span className="vertical-nav-badge">{item.badge}</span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            } else {
              // Item individual normal
              const item = element;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`vertical-nav-item${isActive(item.href) ? " vertical-nav-item-active" : ""}`}
                >
                  <span className="vertical-nav-icon">{item.icon}</span>
                  <span className="vertical-nav-label">{item.label}</span>
                  {item.badge && item.badge > 0 ? <span className="vertical-nav-badge">{item.badge}</span> : null}
                </Link>
              );
            }
          })}
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

          {isAdmin && (
            <button
              type="button"
              className="vertical-nav-item vertical-nav-action"
              onClick={() => setShowSupportModal(true)}
              title="Contactar soporte técnico de BarmenTech"
            >
              <span className="vertical-nav-icon">💬</span>
              <span className="vertical-nav-label">Soporte Técnico</span>
            </button>
          )}

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
      <SupportModal 
        isOpen={showSupportModal} 
        onClose={() => setShowSupportModal(false)}
        userName={session?.user?.fullName || ""}
        userEmail={session?.user?.email || ""}
      />
    </>
  );
}
