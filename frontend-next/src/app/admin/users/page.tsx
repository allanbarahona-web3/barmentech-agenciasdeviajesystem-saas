"use client";

export const dynamic = 'force-dynamic';

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
import { PageLoader } from "@/components/loading-spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconBadge } from "@/components/ui/icon-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableShell } from "@/components/patterns/data-table-shell";
import { FormField } from "@/components/patterns/form-field";
import { FormSheet } from "@/components/patterns/form-sheet";
import { PageHeader } from "@/components/patterns/page-header";
import { UserRoleBadge } from "@/features/users/components/UserRoleBadge";
import { Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Power, ShieldCheck, UserPlus, Users, WandSparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

const roleLabel = (role: string) => {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "CONTADOR") return "CONTADOR";
  if (normalized === "FACTURACION_COBROS") return "FACTURACION_COBROS";
  if (normalized === "VENTAS") return "VENTAS";
  if (normalized === "OPERACIONES") return "OPERACIONES";
  return "AGENT";
};

type UserRole = "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES";

function AdminUsersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("AGENT");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  // Pre-llenar desde query params si viene desde empleados
  useEffect(() => {
    if (searchParams.get('createFrom') === 'employee') {
      const name = searchParams.get('name');
      const emailParam = searchParams.get('email');
      const employeeIdParam = searchParams.get('employeeId');

      if (employeeIdParam) {  
        setEmployeeId(employeeIdParam);
      }

      if (name) setFullName(decodeURIComponent(name));
      if (emailParam) setEmail(decodeURIComponent(emailParam));
      
      // Auto-generar password temporal
      const newPassword = generateRandomPassword();
      setPassword(newPassword);
      setIsCreateSheetOpen(true);
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
    } catch {
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
  const [roleChangeUser, setRoleChangeUser] = useState<AdminUserListItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("AGENT");
  const actionTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const actionReturnFocusRef = useRef<HTMLButtonElement | null>(null);

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
        employeeId: employeeId || undefined,
      });
      
      // Add new user to the list immediately (at the top since it's newest)
      setItems((prevItems) => [newUser, ...prevItems]);
      
      showSuccess(`Usuario creado correctamente. Se ha enviado un email a ${trimmedEmail} con las credenciales de acceso.`);
      
      // Clear form
      setEmail("");
      setFullName("");
      setPassword("");
      setNewRole("AGENT");
      setIsCreateSheetOpen(false);
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

  const onChangeRole = (item: AdminUserListItem, newRole: UserRole) => {
    const currentRole = roleLabel(item.role);

    if (newRole === currentRole) {
      return;
    }

    void performChangeRole(item, newRole);
  };

  const performChangeRole = async (item: AdminUserListItem, newRole: UserRole) => {
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

  const openEditFromActionMenu = (item: AdminUserListItem) => {
    const trigger = actionTriggerRefs.current[item.id];

    // Let Radix finish closing the menu and restore its focus before opening
    // another modal layer. The edit dialog then owns a stable return target.
    window.requestAnimationFrame(() => {
      actionReturnFocusRef.current = trigger;
      onEditUser(item);
    });
  };

  const openRoleChangeFromActionMenu = (item: AdminUserListItem) => {
    const trigger = actionTriggerRefs.current[item.id];

    window.requestAnimationFrame(() => {
      actionReturnFocusRef.current = trigger;
      setRoleChangeUser(item);
      setSelectedRole(roleLabel(item.role) as UserRole);
    });
  };

  const runAfterActionMenuDismissal = (action: () => void) => {
    window.requestAnimationFrame(action);
  };

  const closeEditModal = () => {
    setEditModalUser(null);
    setEditFullName("");
    setEditEmail("");
  };

  const closeRoleChangeModal = () => {
    setRoleChangeUser(null);
  };

  const submitRoleChange = () => {
    if (!roleChangeUser) return;

    const user = roleChangeUser;
    const nextRole = selectedRole;
    closeRoleChangeModal();
    onChangeRole(user, nextRole);
  };

  const restoreActionFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    actionReturnFocusRef.current?.focus();
    actionReturnFocusRef.current = null;
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
      {loading && items.length === 0 ? <PageLoader /> : (
        <div className="mx-auto max-w-7xl space-y-6">
          <PageHeader
            title={<span className="flex items-center gap-3"><IconBadge tone="primary"><Users aria-hidden="true" /></IconBadge>Administración de usuarios</span>}
            description="Crea y administra el acceso de los usuarios del sistema."
            meta={<Badge variant="info"><Users aria-hidden="true" />{items.length} usuarios</Badge>}
            actions={<Button type="button" onClick={() => setIsCreateSheetOpen(true)}><UserPlus aria-hidden="true" />Nuevo usuario</Button>}
          />

          <DataTableShell toolbar={<div><h2 className="text-base font-semibold">Usuarios registrados</h2><p className="mt-1 text-sm text-muted-foreground">Actualiza roles, credenciales temporales y acceso desde las acciones de cada usuario.</p></div>} state={loading ? <div className="mx-auto grid max-w-sm gap-3" aria-label="Cargando usuarios"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div> : items.length === 0 ? <div><Users aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-medium text-foreground">No hay usuarios.</p><p className="mt-1 text-muted-foreground">Los nuevos usuarios aparecerán aquí.</p></div> : null}>
            <Table className="min-w-[760px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">Nombre</TableHead>
                  <TableHead className="w-[30%]">Correo</TableHead>
                  <TableHead className="w-[18%]">Rol</TableHead>
                  <TableHead className="w-[14%] whitespace-nowrap">Estado</TableHead>
                  <TableHead className="w-[14%] whitespace-nowrap text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="truncate font-medium text-foreground" title={item.fullName}>{item.fullName}</TableCell>
                    <TableCell className="truncate text-muted-foreground" title={item.email}>{item.email}</TableCell>
                    <TableCell>
                      <UserRoleBadge role={item.role} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={item.isActive ? "success" : "destructive"}>{item.isActive ? "Activo" : "Suspendido"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            ref={(node) => {
                              actionTriggerRefs.current[item.id] = node;
                            }}
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Acciones de usuario"
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEditFromActionMenu(item)}>
                            <Pencil aria-hidden="true" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openRoleChangeFromActionMenu(item)}>
                            <ShieldCheck aria-hidden="true" />Cambiar rol
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => runAfterActionMenuDismissal(() => void onResetPassword(item))}>
                            <KeyRound aria-hidden="true" />Resetear contraseña
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => runAfterActionMenuDismissal(() => void onToggleActive(item))}
                            className={item.isActive ? "text-destructive focus:text-destructive" : "text-success focus:text-success"}
                          >
                            <Power aria-hidden="true" />{item.isActive ? "Suspender" : "Activar"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        </div>
      )}

      <FormSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        title="Nuevo usuario"
        description="Define las credenciales temporales y el rol inicial del usuario."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setIsCreateSheetOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="button" disabled={saving} onClick={() => void onCreate()}><UserPlus aria-hidden="true" />{saving ? "Guardando..." : "Crear usuario"}</Button>
          </>
        }
      >
        <div className="grid gap-5">
          <FormField htmlFor="new-user-email" label="Correo" required>
            <Input id="new-user-email" value={email} type="email" onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <FormField htmlFor="new-user-name" label="Nombre completo" required>
            <Input id="new-user-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </FormField>
          <FormField htmlFor="new-user-password" label="Contraseña temporal" required description="Mínimo 8 caracteres, una mayúscula y un carácter especial.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Input id="new-user-password" value={password} type={showPassword ? "text" : "password"} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" className="pr-11" />
                <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
              </div>
              <Button type="button" variant="outline" onClick={handleGeneratePassword} title="Generar contraseña aleatoria segura"><WandSparkles aria-hidden="true" />Generar</Button>
              <Button type="button" variant={copiedPassword ? "secondary" : "outline"} onClick={handleCopyPassword} disabled={!password} title="Copiar contraseña al portapapeles"><Copy aria-hidden="true" />{copiedPassword ? "Copiado" : "Copiar"}</Button>
            </div>
          </FormField>
          <FormField htmlFor="new-user-role" label="Rol" required>
            <Select id="new-user-role" value={newRole} onChange={(event) => setNewRole((event.target.value as UserRole) || "AGENT")}>
              <option value="AGENT">AGENT</option><option value="CONTADOR">CONTADOR</option><option value="FACTURACION_COBROS">FACTURACION & COBROS</option><option value="VENTAS">VENTAS</option><option value="OPERACIONES">OPERACIONES</option><option value="ADMIN">ADMIN</option>
            </Select>
          </FormField>
        </div>
        <Alert variant="info" className="mt-5"><AlertTitle>Requisitos de contraseña</AlertTitle><AlertDescription>La contraseña temporal debe cumplir los requisitos actuales antes de crear el usuario.</AlertDescription></Alert>
      </FormSheet>

      <Dialog open={Boolean(editModalUser)} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
        <DialogContent
          onCloseAutoFocus={restoreActionFocus}
        >
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil aria-hidden="true" className="size-5 text-primary" />Editar usuario</DialogTitle><DialogDescription>Actualiza el nombre o correo del usuario.</DialogDescription></DialogHeader><div className="mt-5 grid gap-5"><FormField htmlFor="edit-user-name" label="Nombre completo" required><Input id="edit-user-name" type="text" value={editFullName} onChange={(event) => setEditFullName(event.target.value)} placeholder="Ej: Juan Pérez" /></FormField><FormField htmlFor="edit-user-email" label="Correo electrónico" required><Input id="edit-user-email" type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} placeholder="Ej: juan@example.com" /></FormField><Alert variant="info"><AlertTitle>Nota</AlertTitle><AlertDescription>Si cambias el email, el usuario deberá iniciar sesión nuevamente con el nuevo correo.</AlertDescription></Alert></div><DialogFooter><Button type="button" variant="outline" onClick={closeEditModal} disabled={saving}>Cancelar</Button><Button type="button" onClick={() => void onSaveEdit()} disabled={saving}><Pencil aria-hidden="true" />{saving ? "Guardando..." : "Guardar cambios"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(roleChangeUser)} onOpenChange={(open) => { if (!open) closeRoleChangeModal(); }}>
        <DialogContent onCloseAutoFocus={restoreActionFocus}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-5 text-primary" />Cambiar rol</DialogTitle>
            <DialogDescription>Actualiza el rol asignado a este usuario.</DialogDescription>
          </DialogHeader>
          {roleChangeUser ? (
            <div className="mt-5 grid gap-5">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs font-medium text-muted-foreground">Usuario</p>
                <p className="mt-1 font-medium text-foreground">{roleChangeUser.fullName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{roleChangeUser.email}</p>
                <div className="mt-3 flex items-center gap-2"><span className="text-sm text-muted-foreground">Rol actual</span><UserRoleBadge role={roleChangeUser.role} /></div>
              </div>
              <FormField htmlFor="change-user-role" label="Nuevo rol" required>
                <Select id="change-user-role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as UserRole)}>
                  <option value="AGENT">AGENTE</option><option value="CONTADOR">CONTADOR</option><option value="FACTURACION_COBROS">FACTURACION & COBROS</option><option value="VENTAS">VENTAS</option><option value="OPERACIONES">OPERACIONES</option><option value="ADMIN">ADMIN</option>
                </Select>
              </FormField>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRoleChangeModal}>Cancelar</Button>
            <Button type="button" onClick={submitRoleChange} disabled={!roleChangeUser || selectedRole === roleLabel(roleChangeUser.role)}><ShieldCheck aria-hidden="true" />Cambiar rol</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetModalUser)} onOpenChange={(open) => { if (!open) setResetModalUser(null); }}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound aria-hidden="true" className="size-5 text-success" />Contraseña temporal generada</DialogTitle><DialogDescription>Copia la contraseña y envíala al usuario de forma segura.</DialogDescription></DialogHeader>{resetModalUser ? <div className="mt-5 grid gap-5"><div className="rounded-lg border border-border bg-muted/40 p-4"><p className="text-xs font-medium text-muted-foreground">Usuario</p><p className="mt-1 font-medium text-foreground">{resetModalUser.fullName}</p><p className="mt-1 text-sm text-muted-foreground">{resetModalUser.email}</p></div><div className="rounded-lg border border-success/25 bg-success/5 p-4"><p className="text-xs font-medium text-success">Contraseña temporal</p><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><code className="break-all text-lg font-semibold tracking-wide text-success">{resetModalUser.temporaryPassword}</code><Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(resetModalUser.temporaryPassword); showSuccess("Contraseña copiada al portapapeles"); }}><Copy aria-hidden="true" />Copiar</Button></div></div><Alert variant="warning"><AlertTitle>Importante</AlertTitle><AlertDescription>El usuario deberá cambiar esta contraseña al iniciar sesión por primera vez.</AlertDescription></Alert></div> : null}<DialogFooter><Button type="button" onClick={() => setResetModalUser(null)}><ShieldCheck aria-hidden="true" />Entendido</Button></DialogFooter></DialogContent></Dialog>

      <ConfirmDialog open={confirmModal.isOpen} onOpenChange={(open) => { if (!open) closeConfirm(); }} title={confirmModal.title} description={<span className="whitespace-pre-line">{confirmModal.message}</span>} confirmLabel={confirmModal.confirmText} variant={confirmModal.variant === "danger" ? "destructive" : "default"} onConfirm={() => confirmModal.onConfirm()} />

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<PageLoader message="Cargando usuarios..." />}>
      <AdminUsersContent />
    </Suspense>
  );
}
