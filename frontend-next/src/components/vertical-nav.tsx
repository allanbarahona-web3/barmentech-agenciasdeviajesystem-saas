"use client";

import { clearStoredToken, getStoredSession, getStoredToken, logout } from "@/lib/auth-api";
import { getAttendanceStatus } from "@/lib/attendance-api";
import { usesAttendance } from "@/lib/attendance-permissions";
import { getPendingApprovalsCount, type PendingCounts } from "@/lib/billing-api";
import { getCurrentExchangeRate, type ExchangeRate } from "@/lib/exchange-rate-api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AttendanceWidget } from "./attendance-widget";
import { CurrencyCalculator } from "./currency-calculator";
import { LoadingModal } from "./loading-modal";
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

export function VerticalNav() {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicPage =
  pathname.startsWith("/sign-contract") ||
  pathname.startsWith("/commercial-proposals") ||
  pathname.startsWith("/reset-password");
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
  const [configuracionOperativaOpen, setConfiguracionOperativaOpen] = useState(false);
  const [comercialOpen, setComercialOpen] = useState(false);
  const [adicionalesOpen, setAdicionalesOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [logoutErrorModalOpen, setLogoutErrorModalOpen] = useState(false);
  const [logoutErrorMessage, setLogoutErrorMessage] = useState("");

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

  if (
  isPublicPage ||
  !token ||
  !session?.user?.id ||
  pathname === "/"
) {
  return null;
}

  const role = String(session.user.role || "AGENT").toUpperCase();
  
  // Super Admin has its own layout, hide this nav
  if (role === "SUPER_ADMIN") {
    return null;
  }

  const isAdmin = role === "ADMIN";
  const isContador = role === "CONTADOR";
  const isAdminOrContador = isAdmin || isContador;
  
  // Attendance functionality - determines who uses the Attendance system
  const needsAttendanceWidget = usesAttendance(role);
  
  // Business module access - separate from Attendance participation
  const hasOperationalAccess = ["AGENT", "OPERACIONES", "VENTAS"].includes(role);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    return pathname.startsWith(`${href}/`);
  };

  const navElements: NavElement[] = [
    // Dashboard para Admin/Contador (NO roles operacionales)
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

    ...(role === "AGENT"
      ? [
          {
            href: "/agent-dashboard",
            label: "Dashboard",
            icon: "📊",
          },
        ]
      : []),
    
    // My Timesheet - para roles que usan Attendance
    ...(needsAttendanceWidget
      ? [
          {
            href: "/my-timesheet",
            label: "Mi Timesheet",
            icon: "📋",
          },
        ]
      : []),
    
    // Contratos de Migración - solo para roles operacionales (AGENT, OPERACIONES, VENTAS)
    ...(hasOperationalAccess
      ? [
          {
            href: "/trips?travelType=MIGRATION",
            label: "Contratos de Migración",
            icon: "📄",
          },
        ]
      : []),
    
    // Viajes - solo para roles operacionales (AGENT, OPERACIONES, VENTAS)
    ...(hasOperationalAccess
      ? [
          {
            href: "/trips?travelType=INTERNATIONAL",
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

    ...(isAdmin || role === "AGENT" || role === "OPERACIONES"
      ? [
          {
            label: "Adicionales",
            icon: "➕",
            items: [
              {
                href: "/additional-services",
                label: "Nueva Orden",
                icon: "➕",
              },
              {
                href: "/additional-services/orders",
                label: "Órdenes",
                icon: "📋",
              },
            ],
          } as NavGroup,
        ]
      : []),

    ...(isAdmin || role === "AGENT" || role === "OPERACIONES"
      ? [
          {
            href: "/sales-orders",
            label: "Órdenes de Venta",
            icon: "🧾",
          },
        ]
      : []),
    
    // 💰 Menú Finanzas (Admin/Contador/Facturacion)
    ...(isAdminOrContador || role === "FACTURACION_COBROS"
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
    
    // Clientes (Admin/Agent/Facturacion)
    ...(isAdmin || role === "AGENT" || role === "FACTURACION_COBROS"
      ? [
          {
            href: "/admin/customers",
            label: "Clientes",
            icon: "👥",
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
    
    // Configuración Operativa (mantiene permisos existentes por opción)
    ...(isAdmin || isContador || role === "FACTURACION_COBROS"
      ? [
          {
            label: "Configuración",
            icon: "⚙️",
            adminOnly: true,
            items: [
              {
                href: "/admin/exchange-rate",
                label: "Tipo de Cambio",
                icon: "💱",
                adminOnly: true,
              },
              ...(isAdmin
                ? [
                    {
                      href: "/admin/bank-accounts",
                      label: "Cuentas Bancarias",
                      icon: "🏦",
                      adminOnly: true,
                    },
                  ]
                : []),
            ],
          } as NavGroup,
        ]
      : []),

    ...(isAdmin
      ? [
          {
            label: "Comercial",
            icon: "🤝",
            adminOnly: true,
            items: [
              {
                href: "/admin/pricing-configurations",
                label: "Margen Adicionales",
                icon: "🧮",
                adminOnly: true,
              },
              {
                href: "/admin/suppliers",
                label: "Proveedores",
                icon: "🏢",
                adminOnly: true,
              },
            ],
          } as NavGroup,
        ]
      : []),

    // Configuración adicional (solo Admin)
    ...(isAdmin
      ? [
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
              {
                href: "/admin/migration-trips",
                label: "Viajes de Migración",
                icon: "🛂",
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
                href: "/admin/attendance",
                label: "Control de Asistencia",
                icon: "⏰",
                adminOnly: true,
              },
            ],
          } as NavGroup,
        ]
      : []),
    
    // Historial (todos EXCEPTO Facturacion) — badge de "listos para firmar" SOLO para agentes
    ...(role !== "FACTURACION_COBROS"
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
          {needsAttendanceWidget ? <AttendanceWidget /> : null}
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
              const activeItemHref = group.items
                .filter((item) => isActive(item.href))
                .sort((left, right) => right.href.length - left.href.length)[0]
                ?.href;
              
              // Determinar qué estado usar según el grupo
              const isOpen = group.label === "Finanzas" 
                ? finanzasOpen 
                : group.label === "Programar Viajes" 
                  ? programarViajesOpen 
                  : group.label === "Configuración"
                    ? configuracionOperativaOpen
                    : group.label === "Comercial"
                      ? comercialOpen
                      : group.label === "Adicionales"
                        ? adicionalesOpen
                    : empleadosOpen;
              
              const toggleOpen = group.label === "Finanzas" 
                ? () => setFinanzasOpen(!finanzasOpen)
                : group.label === "Programar Viajes"
                  ? () => setProgramarViajesOpen(!programarViajesOpen)
                  : group.label === "Configuración"
                    ? () => setConfiguracionOperativaOpen(!configuracionOperativaOpen)
                    : group.label === "Comercial"
                      ? () => setComercialOpen(!comercialOpen)
                      : group.label === "Adicionales"
                        ? () => setAdicionalesOpen(!adicionalesOpen)
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
                          className={`vertical-nav-item vertical-nav-subitem${activeItemHref === item.href ? " vertical-nav-item-active" : ""}`}
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

            onClick={async () => {

              try {

                // Attendance validation - roles that participate in attendance must mark OFF
                if (needsAttendanceWidget) {
                  const attendance = await getAttendanceStatus();

                if (
                  attendance.currentState &&
                  attendance.currentState !== "OFF"
                ) {
                  throw new Error(
                    "Debe marcar OFF antes de cerrar sesión."
                        );
                    }
                  }

                  await logout();

                  clearStoredToken();

                  router.replace("/");

              } catch (error) {
                const message = error instanceof Error ? error.message : "Error al cerrar sesión";
                setLogoutErrorMessage(message);
                setLogoutErrorModalOpen(true);
              }
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

      <LoadingModal
        isOpen={logoutErrorModalOpen}
        state="error"
        errorMessage={logoutErrorMessage || "No se pudo cerrar sesión."}
        onClose={() => setLogoutErrorModalOpen(false)}
      />
    </>
  );
}
