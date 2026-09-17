"use client";

import { clearStoredToken, getStoredSession, getStoredToken } from "@/lib/auth-api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurrencyCalculator } from "./currency-calculator";

type HeaderLink = {
  href: string;
  label: string;
};

const AGENT_LINKS: HeaderLink[] = [
  { href: "/contracts", label: "Formulario" },
  { href: "/billing", label: "Estados de cuenta" },
  { href: "/history", label: "Historial" },
];

const ADMIN_LINKS: HeaderLink[] = [
  { href: "/billing", label: "Estados de cuenta" },
  { href: "/reports", label: "Reportes" },
  { href: "/admin/pending-credit-notes", label: "Notas de Crédito" },
  { href: "/billing/audit", label: "Auditoria" },
  { href: "/admin/exchange-rate", label: "Tipo de Cambio" },
  { href: "/admin/users", label: "Admin usuarios" },
  { href: "/history", label: "Historial" },
];

const FACTURACION_COBROS_LINKS: HeaderLink[] = [
  { href: "/billing", label: "Estados de cuenta" },
];

// Roles sin vistas asignadas aún
const VENTAS_LINKS: HeaderLink[] = [];
const OPERACIONES_LINKS: HeaderLink[] = [];

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

export function AppShellHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [tick, setTick] = useState(Date.now());
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const token = getStoredToken();
  const session = getStoredSession();

  if (!token || !session?.user?.id || pathname === "/") {
    return null;
  }

  const role = String(session.user.role || "AGENT").toUpperCase();
  const links = 
    role === "ADMIN" ? ADMIN_LINKS :
    role === "FACTURACION_COBROS" ? FACTURACION_COBROS_LINKS :
    role === "VENTAS" ? VENTAS_LINKS :
    role === "OPERACIONES" ? OPERACIONES_LINKS :
    AGENT_LINKS;
  const connectedSeconds = session.loginAt
    ? Math.max(0, Math.floor((tick - new Date(session.loginAt).getTime()) / 1000))
    : 0;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    return pathname.startsWith(`${href}/`);
  };

  return (
    <section className="session-bar">
      <div className="session-left">
        <span className="live-pill">Conectado</span>
        <span className="session-meta">
          {session.user.fullName}
          {session.user.email ? ` - ${session.user.email}` : ""}
          {role ? ` - ${role}` : ""}
        </span>
        <span className="session-timer">Tiempo en sesion: {formatDuration(connectedSeconds)}</span>
      </div>

      <div className="actions">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`btn btn-secondary${isActive(item.href) ? " session-link-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={() => setShowCalculator(true)}
          title="Calculadora de divisas USD/CRC"
        >
          💱
        </button>
        <button
          type="button"
          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={() => {
            clearStoredToken();
            router.replace("/");
          }}
        >
          Cerrar sesion
        </button>
      </div>

      <CurrencyCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />
    </section>
  );
}
