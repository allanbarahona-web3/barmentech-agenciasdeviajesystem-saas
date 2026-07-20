// Layout para la página pública de firma
// Sin navegación vertical, página completamente pública

import { type Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Firmar contrato – Viajes Alma Nova",
  description: "Página pública para firmar contratos",
};

export default function SignContractLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
