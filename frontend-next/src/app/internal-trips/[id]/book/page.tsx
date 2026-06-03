"use client";

export const dynamic = 'force-dynamic';

import { ContractsForm } from "@/features/contracts-form/ContractsForm";
import { getStoredToken, type AuthSession } from "@/lib/auth-api";
import { AUTH_SESSION_KEY } from "@/lib/runtime-config";
import { useRouter, useParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useSyncExternalStore } from "react";

const getSessionSnapshotRaw = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return String(window.localStorage.getItem(AUTH_SESSION_KEY) || "");
};

const parseSession = (raw: string): AuthSession | null => {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as Partial<AuthSession>;
    const token = String(parsed?.token || "").trim();
    const loginAt = String(parsed?.loginAt || "").trim();
    const user = parsed?.user;

    if (!token || !loginAt || !user?.id || !user?.email || !user?.fullName) {
      return null;
    }

    return {
      token,
      loginAt,
      user: {
        id: String(user.id),
        email: String(user.email),
        fullName: String(user.fullName),
        role: user.role ? String(user.role) : undefined,
      },
    };
  } catch {
    return null;
  }
};


function InternalTripBookingPageContent() {
  const router = useRouter();
  const params = useParams();
  const internalTripId = String(params.id || "").trim();
  
  const token = useSyncExternalStore(
    () => () => {
      // No external store subscriptions yet; auth token is read-only snapshot here.
    },
    () => getStoredToken(),
    () => "",
  );
  const sessionRaw = useSyncExternalStore(
    () => () => {
      // No external store subscriptions yet; auth UI changes on route transitions.
    },
    () => getSessionSnapshotRaw(),
    () => "",
  );
  const session = useMemo(() => parseSession(sessionRaw), [sessionRaw]);

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }

    const role = String(session?.user?.role || "").toUpperCase();
    if (role === "ADMIN") {
      router.replace("/billing/admin/reports");
    }
  }, [router, session?.user?.role, token]);

  if (!token) {
    return (
      <main className="app-shell">
        <section className="card contracts-card">
          <p>Validando sesión...</p>
        </section>
      </main>
    );
  }

  const role = String(session?.user?.role || "").toUpperCase();
  if (role === "ADMIN") {
    return (
      <main className="app-shell">
        <section className="card contracts-card">
          <p>Redirigiendo a panel administrativo...</p>
        </section>
      </main>
    );
  }

  if (!internalTripId) {
    return (
      <main className="app-shell">
        <section className="card contracts-card">
          <p>❌ ID de viaje no válido</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ContractsForm 
        agent={session?.user || null} 
        initialInternalTripId={internalTripId}
      />
    </main>
  );
}

export default function InternalTripBookingPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <section className="card contracts-card">
            <p>Cargando formulario de reserva...</p>
          </section>
        </main>
      }
    >
      <InternalTripBookingPageContent />
    </Suspense>
  );
}
