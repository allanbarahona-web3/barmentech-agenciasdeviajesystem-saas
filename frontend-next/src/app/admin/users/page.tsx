"use client";

import {
  adminCreateUser,
  adminListUsers,
  adminResetPassword,
  adminUpdateUser,
  getStoredSession,
  getStoredToken,
  getHomeRouteForRole,
  type AdminUserListItem,
} from "@/lib/auth-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { ConfirmModal } from "@/components/confirm-modal";
import { PageLoader } from "@/components/loading-spinner";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const roleLabel = (role: string) => {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "CONTADOR") return "CONTADOR";
  if (normalized === "FACTURACION_COBROS") return "FACTURACION_COBROS";
  if (normalized === "VENTAS") return "VENTAS";
  if (normalized === "OPERACIONES") return "OPERACIONES";
  return "AGENT";
};

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES">("AGENT");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Pre-llenar desde query params si viene desde empleados
  useEffect(() => {
    if (searchParams.get('createFrom') === 'employee') {
      const name = searchParams.get('name');
      const emailParam = searchParams.get('email');
      if (name) setFullName(decodeURIComponent(name));
      if (emailParam) setEmail(decodeURIComponent(emailParam));
      
      // Auto-generar password temporal
      const newPassword = generateRandomPassword();
      setPassword(newPassword);
      showSuccess('📋 Datos precargados desde empleado. Asigna un rol y crea el usuario.');
    }
  }, [searchParams]);

  // Generar password temporal aleatorio que cumple requisitos
  const generateRandomPassword = () => {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%&*_-+=";
    
    // Asegurar al menos: 1 mayúscula, 1 minúscula, 1 número, 1 especial
    let pwd = "";
    pwd += uppercase[Math.floor(Math.random() * uppercase.length)];
    pwd += lowercase[Math.floor(Math.random() * lowercase.length)];
    pwd += numbers[Math.floor(Math.random() * numbers.length)];
    pwd += special[Math.floor(Math.random() * special.length)];
    
    // Completar hasta 12 caracteres con caracteres aleatorios
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = pwd.length; i < 12; i++) {
      pwd += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Mezclar el password
    const shuffled = pwd.split('').sort(() => Math.random() - 0.5).join('');
    return shuffled;
  };

  const handleGeneratePassword = () => {
    const newPassword = generateRandomPassword();
    setPassword(newPassword);
    showSuccess("Password generado correctamente");
  };

  const handleCopyPassword = async () => {
    if (!password) {
      showError("No hay password para copiar");
      return;
    }
    
    try {
      await navigator.clipboard.writeText(password);
      setCopiedPassword(true);
      showSuccess("Password copiado al portapapeles");
      setTimeout(() => setCopiedPassword(false), 3000);
    } catch (err) {
      showError("No se pudo copiar el password");
    }
  };

  // Modal de contraseña temporal
  const [resetModalUser, setResetModalUser] = useState<{
    fullName: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);

  // Modal de edición
  const [editModalUser, setEditModalUser] = useState<{
    id: string;
    fullName: string;
    email: string;
  } | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: "primary" | "danger" | "warning";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (config: Omit<typeof confirmModal, "isOpen">) => {
    setConfirmModal({ ...config, isOpen: true });
  };

  const closeConfirm = () => {
    setConfirmModal({ ...confirmModal, isOpen: false });
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const users = await adminListUsers();
      setItems(users);
    } catch (fetchError) {
      showError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;

    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const session = getStoredSession();
    const role = String(session?.user?.role || "").toUpperCase();
    if (role !== "ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, mounted]);

  const onCreate = async () => {
    if (saving) return;

    const trimmedEmail = String(email || "").trim();
    const trimmedFullName = String(fullName || "").trim();
    const trimmedPassword = String(password || "");

    // Validaciones del lado del cliente
    if (!trimmedEmail || !trimmedFullName || !trimmedPassword) {
      showError("Todos los campos son obligatorios");
      return;
    }

    if (trimmedPassword.length < 8) {
      showError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (!/[A-Z]/.test(trimmedPassword)) {
      showError("La contraseña debe incluir al menos una letra mayúscula");
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/`~]/.test(trimmedPassword)) {
      showError("La contraseña debe incluir al menos un carácter especial (!@#$%&*...)");
      return;
    }

    setSaving(true);
    try {
      const newUser = await adminCreateUser({
        email: trimmedEmail,
        fullName: trimmedFullName,
        password: trimmedPassword,
        role: newRole,
      });
      
      // Add new user to the list immediately (at the top since it's newest)
      setItems((prevItems) => [newUser, ...prevItems]);
      
      showSuccess(`Usuario creado correctamente. Se ha enviado un email a ${trimmedEmail} con las credenciales de acceso.`);
      
      // Clear form
      setEmail("");
      setFullName("");
      setPassword("");
      setNewRole("AGENT");
    } catch (createError) {
      showError(createError instanceof Error ? createError.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (item: AdminUserListItem) => {
    const action = item.isActive ? "suspender" : "activar";
    
    const message = action === "suspender"
      ? `¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${item.fullName}?\n\nEl usuario no podrá iniciar sesión pero toda su información se mantendrá intacta (contratos, pagos, historial).`
      : `¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${item.fullName}?\n\nEl usuario podrá volver a iniciar sesión normalmente.`;
    
    showConfirm({
      title: action === "suspender" ? "Suspender Usuario" : "Activar Usuario",
      message,
      confirmText: action === "suspender" ? "Suspender" : "Activar",
      variant: action === "suspender" ? "danger" : "primary",
      onConfirm: async () => {
        closeConfirm();
        await performToggleActive(item, action);
      },
    });
  };

  const performToggleActive = async (item: AdminUserListItem, action: string) => {
    try {
      const updated = await adminUpdateUser(item.id, { isActive: !item.isActive });
      
      // Update the item in the list immediately
      setItems((prevItems) =>
        prevItems.map((i) => (i.id === item.id ? { ...i, isActive: updated.isActive } : i))
      );
      
      showSuccess(`Usuario ${action === "suspender" ? "suspendido" : "activado"} correctamente.`);
    } catch (updateError) {
      const errorMessage = updateError instanceof Error ? updateError.message : "No se pudo actualizar estado.";
      showError(errorMessage);
      
      // Reload to ensure consistency if there was an error
      await load();
    }
  };

  const onChangeRole = async (item: AdminUserListItem, newRole: "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES") => {
    const currentRole = roleLabel(item.role);
    
    if (newRole === currentRole) {
      return; // No hay cambio
    }

    showConfirm({
      title: "Cambiar Rol de Usuario",
      message: `¿Cambiar rol de ${item.fullName} de ${currentRole} a ${newRole}?`,
      confirmText: "Cambiar Rol",
      variant: "primary",
      onConfirm: async () => {
        closeConfirm();
        await performChangeRole(item, newRole);
      },
    });
  };

  const performChangeRole = async (item: AdminUserListItem, newRole: "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES") => {
    try {
      const updated = await adminUpdateUser(item.id, { role: newRole });
      
      // Update the item in the list immediately
      setItems((prevItems) =>
        prevItems.map((i) => (i.id === item.id ? { ...i, role: updated.role } : i))
      );
      
      showSuccess(`Rol cambiado a ${newRole} correctamente.`);
    } catch (updateError) {
      const errorMessage = updateError instanceof Error ? updateError.message : "No se pudo actualizar rol.";
      showError(errorMessage);
      
      // Reload to ensure consistency
      await load();
    }
  };

  const onResetPassword = async (item: AdminUserListItem) => {
    showConfirm({
      title: "Resetear Contraseña",
      message: `¿Generar contraseña temporal para ${item.fullName}?\n\nEl usuario deberá cambiar la contraseña en su próximo inicio de sesión.`,
      confirmText: "Generar Contraseña",
      variant: "warning",
      onConfirm: async () => {
        closeConfirm();
        await performResetPassword(item);
      },
    });
  };

  const performResetPassword = async (item: AdminUserListItem) => {
    try {
      const result = await adminResetPassword(item.id);
      setResetModalUser({
        fullName: result.fullName,
        email: result.email,
        temporaryPassword: result.temporaryPassword,
      });
      showSuccess("Contraseña temporal generada correctamente.");
      // No need to reload - password change doesn't affect visible fields
    } catch (resetError) {
      showError(resetError instanceof Error ? resetError.message : "No se pudo resetear la contraseña.");
    }
  };

  const onEditUser = (item: AdminUserListItem) => {
    setEditModalUser({
      id: item.id,
      fullName: item.fullName,
      email: item.email,
    });
    setEditFullName(item.fullName);
    setEditEmail(item.email);
  };

  const closeEditModal = () => {
    setEditModalUser(null);
    setEditFullName("");
    setEditEmail("");
  };

  const onSaveEdit = async () => {
    if (!editModalUser) return;
    if (saving) return;

    const trimmedName = String(editFullName || "").trim();
    const trimmedEmail = String(editEmail || "").trim();

    if (!trimmedName || !trimmedEmail) {
      showError("Nombre y correo son obligatorios.");
      return;
    }

    setSaving(true);
    try {
      const updated = await adminUpdateUser(editModalUser.id, {
        fullName: trimmedName,
        email: trimmedEmail,
      });

      // Update the item in the list immediately
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === editModalUser.id ? { ...i, fullName: updated.fullName, email: updated.email } : i
        )
      );

      showSuccess("Usuario actualizado correctamente.");
      closeEditModal();
    } catch (updateError) {
      const errorMessage = updateError instanceof Error ? updateError.message : "No se pudo actualizar el usuario.";
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <main className="app-shell">
      {loading && items.length === 0 ? (
        <PageLoader />
      ) : (
        <section className="card contracts-card">
          <h1>Admin - Usuarios</h1>
          <p className="m-0 text-[#4b6790] text-sm">Roles disponibles: ADMIN (acceso total), CONTADOR (facturación y reportes), AGENT (solo formularios).</p>

        <div className="contracts-grid" style={{ marginTop: 12 }}>
          <label>
            Correo
            <input value={email} type="email" onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Nombre completo
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label>
            Password temporal
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input 
                  value={password} 
                  type={showPassword ? "text" : "password"} 
                  onChange={(event) => setPassword(event.target.value)} 
                  placeholder="Mínimo 8 caracteres"
                  style={{ width: "100%", paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.2rem",
                    padding: "4px 8px",
                    color: "#6b7280",
                  }}
                  title={showPassword ? "Ocultar password" : "Mostrar password"}
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
              <button
                type="button"
                onClick={handleGeneratePassword}
                style={{
                  padding: "10px 16px",
                  background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(139, 92, 246, 0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(139, 92, 246, 0.3)";
                }}
                title="Generar password aleatorio seguro"
              >
                🎲 Generar
              </button>
              <button
                type="button"
                onClick={handleCopyPassword}
                disabled={!password}
                style={{
                  padding: "10px 16px",
                  background: copiedPassword 
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" 
                    : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: password ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                  boxShadow: password ? "0 2px 8px rgba(59, 130, 246, 0.3)" : "none",
                  opacity: password ? 1 : 0.5,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (password) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = copiedPassword 
                      ? "0 4px 12px rgba(16, 185, 129, 0.4)"
                      : "0 4px 12px rgba(59, 130, 246, 0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = password 
                    ? (copiedPassword ? "0 2px 8px rgba(16, 185, 129, 0.3)" : "0 2px 8px rgba(59, 130, 246, 0.3)")
                    : "none";
                }}
                title="Copiar password al portapapeles"
              >
                {copiedPassword ? "✓ Copiado" : "📋 Copiar"}
              </button>
            </div>
            <p style={{ 
              fontSize: "0.85rem", 
              color: "#6b7280", 
              marginTop: "6px",
              marginBottom: "0",
              lineHeight: "1.4"
            }}>
              • Mínimo 8 caracteres • Una mayúscula • Un carácter especial (!@#$%&*...)
            </p>
          </label>
          <label>
            Rol
            <select value={newRole} onChange={(event) => setNewRole((event.target.value as "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES") || "AGENT")}>
              <option value="AGENT">AGENT</option>
              <option value="CONTADOR">CONTADOR</option>
              <option value="FACTURACION_COBROS">FACTURACION & COBROS</option>
              <option value="VENTAS">VENTAS</option>
              <option value="OPERACIONES">OPERACIONES</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <div className="actions" style={{ alignItems: "flex-end", marginTop: 22 }}>
            <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" disabled={saving} onClick={() => void onCreate()}>
              {saving ? "Guardando..." : "Crear usuario"}
            </button>
          </div>
        </div>

        <div className="history-table-wrap" style={{ marginTop: 14 }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr><td colSpan={5}><p className="history-empty">No hay usuarios.</p></td></tr>
              ) : null}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.fullName}</td>
                  <td>{item.email}</td>
                  <td>
                    <select
                      value={roleLabel(item.role)}
                      onChange={(e) => void onChangeRole(item, e.target.value as "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES")}
                      style={{
                        padding: "8px 12px",
                        fontSize: "0.9rem",
                        border: "2px solid #e5e7eb",
                        borderRadius: "8px",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 600,
                        color: roleLabel(item.role) === "ADMIN" ? "#7c3aed" : roleLabel(item.role) === "CONTADOR" ? "#2563eb" : roleLabel(item.role) === "FACTURACION_COBROS" ? "#ea580c" : roleLabel(item.role) === "VENTAS" ? "#dc2626" : roleLabel(item.role) === "OPERACIONES" ? "#0891b2" : "#059669",
                        transition: "all 0.2s",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#3b82f6";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <option value="AGENT">AGENTE</option>
                      <option value="CONTADOR">CONTADOR</option>
                      <option value="FACTURACION_COBROS">FACTURACION & COBROS</option>
                      <option value="VENTAS">VENTAS</option>
                      <option value="OPERACIONES">OPERACIONES</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: "12px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        background: item.isActive ? "#d1fae5" : "#fef3c7",
                        color: item.isActive ? "#065f46" : "#92400e",
                      }}
                    >
                      {item.isActive ? "✓ Activo" : "⏸ Suspendido"}
                    </span>
                  </td>
                  <td>
                    <div className="actions" style={{ marginTop: 0, gap: "8px" }}>
                      <button 
                        type="button" 
                        className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" 
                        onClick={() => onEditUser(item)} 
                        title="Editar nombre y correo"
                        style={{
                          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                          color: "white",
                          border: "none",
                        }}
                      >
                        ✏️ Editar
                      </button>
                      <button 
                        type="button" 
                        className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" 
                        onClick={() => void onResetPassword(item)} 
                        title="Generar contraseña temporal"
                        style={{
                          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                          color: "white",
                          border: "none",
                        }}
                      >
                        🔑 Resetear
                      </button>
                      <button 
                        type="button" 
                        className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" 
                        onClick={() => void onToggleActive(item)}
                        style={{
                          background: item.isActive ? "#ef4444" : "#10b981",
                          color: "white",
                          border: "none",
                        }}
                      >
                        {item.isActive ? "⏸ Suspender" : "▶ Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Modal de Edición */}
      {editModalUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={closeEditModal}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              maxWidth: "520px",
              width: "90%",
              padding: "0",
              position: "relative",
              overflow: "hidden",
              animation: "slideUp 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header con gradiente */}
            <div
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                padding: "32px 32px 24px 32px",
                color: "white",
                position: "relative",
              }}
            >
              <button
                onClick={closeEditModal}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "1.5rem",
                  color: "white",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                }}
                aria-label="Cerrar"
              >
                ×
              </button>

              <div
                style={{
                  width: "56px",
                  height: "56px",
                  background: "rgba(255, 255, 255, 0.2)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.8rem",
                  marginBottom: "16px",
                }}
              >
                ✏️
              </div>

              <h2 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>
                Editar Usuario
              </h2>
              <p style={{ margin: "8px 0 0 0", opacity: 0.95, fontSize: "0.95rem", lineHeight: 1.5 }}>
                Actualiza el nombre o correo del usuario.
              </p>
            </div>

            {/* Contenido */}
            <div style={{ padding: "32px" }}>
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    color: "#6b7280",
                    marginBottom: "8px",
                    fontWeight: 600,
                  }}
                >
                  👤 Nombre Completo
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "1rem",
                    border: "2px solid #e5e7eb",
                    borderRadius: "10px",
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div style={{ marginBottom: "28px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    color: "#6b7280",
                    marginBottom: "8px",
                    fontWeight: 600,
                  }}
                >
                  ✉️ Correo Electrónico
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Ej: juan@example.com"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "1rem",
                    border: "2px solid #e5e7eb",
                    borderRadius: "10px",
                    outline: "none",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #3b82f6",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginBottom: "24px",
                }}
              >
                <div style={{ display: "flex", gap: "10px" }}>
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>ℹ️</span>
                  <div style={{ fontSize: "0.9rem", color: "#1e40af", lineHeight: 1.5 }}>
                    <strong>Nota:</strong> Si cambias el email, el usuario deberá iniciar sesión nuevamente con el nuevo correo.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={closeEditModal}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    border: "2px solid #e5e7eb",
                    borderRadius: "10px",
                    background: "white",
                    color: "#6b7280",
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    opacity: saving ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.background = "#f9fafb";
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "white";
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void onSaveEdit()}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    border: "none",
                    borderRadius: "10px",
                    background: saving
                      ? "#9ca3af"
                      : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    color: "white",
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow =
                        "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                  }}
                >
                  {saving ? "Guardando..." : "💾 Guardar Cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Contraseña Temporal */}
      {resetModalUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setResetModalUser(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              maxWidth: "520px",
              width: "90%",
              padding: "0",
              position: "relative",
              overflow: "hidden",
              animation: "slideUp 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header con gradiente */}
            <div
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                padding: "32px 32px 24px 32px",
                color: "white",
                position: "relative",
              }}
            >
              <button
                onClick={() => setResetModalUser(null)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "1.5rem",
                  color: "white",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                }}
                aria-label="Cerrar"
              >
                ×
              </button>

              <div
                style={{
                  width: "56px",
                  height: "56px",
                  background: "rgba(255, 255, 255, 0.2)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.8rem",
                  marginBottom: "16px",
                }}
              >
                🔑
              </div>

              <h2 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>
                Contraseña Temporal Generada
              </h2>
              <p style={{ margin: "8px 0 0 0", opacity: 0.95, fontSize: "0.95rem", lineHeight: 1.5 }}>
                Copia la contraseña y envíala al usuario de forma segura.
              </p>
            </div>

            {/* Contenido */}
            <div style={{ padding: "32px" }}>
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "4px", fontWeight: 600 }}>
                  👤 Usuario
                </div>
                <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 500 }}>
                  {resetModalUser.fullName}
                </div>
                <div style={{ fontSize: "0.9rem", color: "#6b7280", marginTop: "2px" }}>
                  {resetModalUser.email}
                </div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "8px", fontWeight: 600 }}>
                  🔐 Contraseña Temporal
                </div>
                <div
                  style={{
                    background: "#f9fafb",
                    border: "2px solid #10b981",
                    borderRadius: "10px",
                    padding: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <code
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: "#059669",
                      letterSpacing: "2px",
                      userSelect: "all",
                    }}
                  >
                    {resetModalUser.temporaryPassword}
                  </code>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(resetModalUser.temporaryPassword);
                      showSuccess("Contraseña copiada al portapapeles");
                    }}
                    style={{
                      background: "#10b981",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      color: "white",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#059669";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#10b981";
                    }}
                  >
                    📋 Copiar
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fbbf24",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginBottom: "24px",
                }}
              >
                <div style={{ display: "flex", gap: "10px" }}>
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>⚠️</span>
                  <div style={{ fontSize: "0.9rem", color: "#92400e", lineHeight: 1.5 }}>
                    <strong>Importante:</strong> El usuario deberá cambiar esta contraseña al iniciar sesión por primera vez.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setResetModalUser(null)}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "white",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                }}
              >
                ✓ Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
