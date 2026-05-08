"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";

export default function ReceiptApprovalsPage() {
  return (
    <main className="app-shell">
      <section className="card contracts-card">
        <h1>Aprobar Recibos</h1>
        <p className="m-0 text-[#4b6790] text-sm">
          Esta página está en construcción. Los recibos pendientes se aprueban desde{" "}
          <Link href="/billing" className="text-blue-600 underline">
            Estados de Cuenta
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
