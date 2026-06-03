"use client";

export const dynamic = 'force-dynamic';

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TimeclockPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/attendance');
  }, [router]);

  return (
    <div className="container">
      <div style={{
        maxWidth: "600px",
        margin: "80px auto",
        textAlign: "center",
        padding: "40px",
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
      }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>⏰</div>
        <h1 style={{ fontSize: "32px", marginBottom: "16px", color: "#333" }}>
          Redirigiendo...
        </h1>
        <p style={{ fontSize: "18px", color: "#666", marginBottom: "12px" }}>
          Ahora esta sección vive en /admin/attendance
        </p>
        <button
          onClick={() => router.push('/admin/attendance')}
          style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
            transition: "transform 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
          Ir ahora
        </button>
      </div>
    </div>
  );
}
