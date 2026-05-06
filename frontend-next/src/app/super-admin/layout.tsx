"use client";

import { clearStoredToken, getStoredSession } from "@/lib/auth-api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<ReturnType<typeof getStoredSession>>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const currentSession = getStoredSession();
    setSession(currentSession);

    // Redirect if not SUPER_ADMIN
    if (currentSession?.user?.role !== "SUPER_ADMIN") {
      router.push("/");
    }
  }, [pathname, router]);

  const handleLogout = () => {
    clearStoredToken();
    router.push("/");
  };

  if (!mounted || !session) {
    return null;
  }

  if (session.user.role !== "SUPER_ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Super Admin Header */}
      <header className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-3xl">👑</div>
              <div>
                <h1 className="text-2xl font-bold">Super Admin Panel</h1>
                <p className="text-sm text-purple-200">Platform Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="font-semibold">{session.user.fullName}</p>
                <p className="text-xs text-purple-200">{session.user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-semibold"
              >
                🚪 Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content without side navigation */}
      <main className="w-full">
        {children}
      </main>
    </div>
  );
}
