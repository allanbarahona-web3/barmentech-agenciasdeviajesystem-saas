import { Badge } from "@/components/ui/badge"

type UserRoleBadgeProps = {
  role: string
}

const rolePresentation = {
  ADMIN: { label: "Admin", className: "border-violet-200 bg-violet-50 text-violet-700" },
  CONTADOR: { label: "Contador", className: "border-info/20 bg-info/10 text-info" },
  FACTURACION_COBROS: { label: "Fact. y cobros", className: "border-warning/20 bg-warning/10 text-warning" },
  AGENT: { label: "Agente", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  VENTAS: { label: "Ventas", className: "border-success/20 bg-success/10 text-success" },
  OPERACIONES: { label: "Operaciones", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
} as const

function UserRoleBadge({ role }: UserRoleBadgeProps) {
  const normalizedRole = String(role || "").toUpperCase()
  const presentation = rolePresentation[normalizedRole as keyof typeof rolePresentation] ?? rolePresentation.AGENT

  return <Badge variant="outline" className={presentation.className}>{presentation.label}</Badge>
}

export { UserRoleBadge }
