"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AttendancePageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/my-timesheet");
  }, [router]);

  return (
    <main className="app-shell">
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Redirigiendo a Mi Timesheet...
      </section>
    </main>
  );
}
