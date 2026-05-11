"use client";

export const dynamic = 'force-dynamic';

import { ContractsForm } from "@/features/contracts-form/ContractsForm";
import { getStoredToken, type AuthSession } from "@/lib/auth-api";
import { AUTH_SESSION_KEY } from "@/lib/runtime-config";
import { useRouter, useSearchParams } from "next/navigation";
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


function ContractsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = String(searchParams.get("draftId") || "").trim();
  const mode = String(searchParams.get("mode") || "").trim();
  const travelPackageId = String(searchParams.get("travelPackageId") || "").trim();
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

    if (String(session?.user?.role || "").toUpperCase() === "ADMIN") {
      router.replace("/billing/admin/reports");
    }
  }, [router, session?.user?.role, token]);

  if (!token) {
    return (
      <main className="app-shell">
        <section className="card contracts-card">
          <p>Validando sesion...</p>
        </section>
      </main>
    );
  }

  if (String(session?.user?.role || "").toUpperCase() === "ADMIN") {
    return (
      <main className="app-shell">
        <section className="card contracts-card">
          <p>Redirigiendo a panel administrativo...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ContractsForm 
        agent={session?.user || null} 
        initialDraftId={draftId || null}
        initialTravelPackageId={travelPackageId || null}
        mode={mode || undefined}
      />
    </main>
  );
}

export default function ContractsPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <section className="card contracts-card">
            <p>Cargando formulario...</p>
          </section>
        </main>
      }
    >
      <ContractsPageContent />
    </Suspense>
  );
}
