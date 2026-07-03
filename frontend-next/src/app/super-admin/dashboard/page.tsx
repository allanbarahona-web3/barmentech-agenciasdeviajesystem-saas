"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getStoredSession,
  getHomeRouteForRole,
  superAdminGetAllTenants,
  superAdminGetPlatformStats,
  superAdminCreateTenant,
  superAdminUpdateTenant,
  superAdminUpdateTenantStatus,
  superAdminGetTenantById,
  superAdminVerifyTenantEmail,
  type SuperAdminTenant,
  type PlatformStats,
  type CreateTenantDto,
  type UpdateTenantDto,
  type TenantDetail,
} from "@/lib/auth-api";
import { LoadingModal } from "@/components/loading-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { TenantForm } from "@/features/super-admin/TenantForm";

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<SuperAdminTenant[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<SuperAdminTenant | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  useEffect(() => {
    const session = getStoredSession();
    const role = session?.user?.role;

    if (role !== "SUPER_ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [tenantsData, statsData] = await Promise.all([
        superAdminGetAllTenants(),
        superAdminGetPlatformStats(),
      ]);
      setTenants(tenantsData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendTenant = async (tenantId: string, reason: string) => {
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Suspendiendo tenant...");
    
    try {
      await superAdminUpdateTenantStatus(tenantId, {
        action: "SUSPEND",
        reason: reason,
      });
      await loadData();
      setLoadingModalState("success");
      setLoadingModalMessage("Tenant suspendido exitosamente");
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : "Error al suspender tenant");
    }
  };

  const handleActivateTenant = async (tenantId: string) => {
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Activando tenant...");
    
    try {
      await superAdminUpdateTenantStatus(tenantId, {
        action: "ACTIVATE",
      });
      await loadData();
      setLoadingModalState("success");
      setLoadingModalMessage("Tenant activado exitosamente");
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : "Error al activar tenant");
    }
  };

  const handleVerifyEmail = async (tenantId: string) => {
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Verificando email...");
    
    try {
      await superAdminVerifyTenantEmail(tenantId);
      await loadData();
      setLoadingModalState("success");
      setLoadingModalMessage("Email verificado exitosamente");
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : "Error al verificar email");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl font-semibold text-purple-700">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Super Admin Dashboard</h1>
              <p className="text-gray-600 mt-2">Gestión global de la plataforma</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Email Stats Button */}
              <button
                onClick={() => router.push("/super-admin/email-stats")}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
              >
                📧 Email Stats
              </button>
              
              {/* Email Verification Warning */}
              {tenants.filter(t => (t.fromEmail || t.replyToEmail) && !t.emailVerified).length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-yellow-900">
                      {tenants.filter(t => (t.fromEmail || t.replyToEmail) && !t.emailVerified).length} Email{tenants.filter(t => (t.fromEmail || t.replyToEmail) && !t.emailVerified).length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-yellow-800">Pendiente verificación</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Tenants</p>
                  <p className="text-3xl font-bold text-purple-900 mt-2">{stats.tenants.total}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {stats.tenants.active} activos · {stats.tenants.suspended} suspendidos
                  </p>
                </div>
                <div className="text-5xl">🏢</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Usuarios</p>
                  <p className="text-3xl font-bold text-purple-900 mt-2">{stats.users}</p>
                  <p className="text-xs text-gray-500 mt-1">Todos los tenants</p>
                </div>
                <div className="text-5xl">👥</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Contratos</p>
                  <p className="text-3xl font-bold text-purple-900 mt-2">{stats.contracts}</p>
                  <p className="text-xs text-gray-500 mt-1">{stats.clients} clientes</p>
                </div>
                <div className="text-5xl">📄</div>
              </div>
            </div>
          </div>
        )}

        {/* Panel de Emails Pendientes de Verificación */}
        {tenants.filter(t => (t.fromEmail || t.replyToEmail) && !t.emailVerified).length > 0 && (
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl shadow-md border-2 border-yellow-300">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="text-4xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    📧 Emails Personalizados Configurados
                  </h3>
                  <p className="text-sm text-gray-700 mb-4">
                    Los siguientes tenants han configurado emails personalizados. 
                    <span className="font-semibold"> Debes verificarlos en Resend</span> antes de que puedan usarlos para enviar correos.
                  </p>

                  {/* Lista de tenants con emails */}
                  <div className="space-y-3">
                    {tenants
                      .filter(t => (t.fromEmail || t.replyToEmail) && !t.emailVerified)
                      .map(tenant => (
                        <div key={tenant.id} className="bg-white rounded-lg p-4 shadow-sm border border-yellow-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-semibold text-gray-900">{tenant.name}</span>
                                <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full font-medium">
                                  PENDIENTE VERIFICACIÓN
                                </span>
                              </div>
                              
                              {tenant.fromEmail && (
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-gray-600 w-24">From Email:</span>
                                  <code className="text-xs bg-gray-100 px-2 py-1 rounded border border-gray-300 font-mono">
                                    {tenant.fromEmail}
                                  </code>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(tenant.fromEmail!);
                                      alert('Email copiado al portapapeles');
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                    title="Copiar"
                                  >
                                    📋
                                  </button>
                                </div>
                              )}
                              
                              {tenant.replyToEmail && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-600 w-24">Reply-To:</span>
                                  <code className="text-xs bg-gray-100 px-2 py-1 rounded border border-gray-300 font-mono">
                                    {tenant.replyToEmail}
                                  </code>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(tenant.replyToEmail!);
                                      alert('Email copiado al portapapeles');
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                    title="Copiar"
                                  >
                                    📋
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            {/* Botón para marcar como verificado */}
                            <button
                              onClick={() => handleVerifyEmail(tenant.id)}
                              className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                            >
                              ✅ Marcar Verificado
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Instrucciones */}
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-900 font-semibold mb-2">📝 Qué hacer:</p>
                    <ol className="text-xs text-blue-800 space-y-1 ml-4 list-decimal">
                      <li>Ve a <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium">Resend Dashboard → Domains</a></li>
                      <li>Agrega el dominio del email (ej: si es info@tuempresa.com → agrega tuempresa.com)</li>
                      <li>Configura los DNS records que te proporciona Resend</li>
                      <li>Espera la verificación (usualmente ~10 minutos)</li>
                      <li>Una vez verificado en Resend, haz clic en &quot;✅ Marcar Verificado&quot;</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tenants List */}
        <div className="bg-white rounded-xl shadow-md">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Tenants</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md"
              >
                ➕ Nuevo Tenant
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dominio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estadísticas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                        <div className="text-xs text-gray-500">
                          Prefijo: {tenant.contractPrefix}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {tenant.customDomain || `${tenant.subdomain}.sistema.com`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {tenant.isActive ? (
                        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          ✅ Activo
                        </span>
                      ) : (
                        <div>
                          <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            ❌ Suspendido
                          </span>
                          {tenant.suspendReason && (
                            <div className="text-xs text-red-600 mt-1">{tenant.suspendReason}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="space-y-1">
                        <div>👥 {tenant._count?.users || 0} usuarios</div>
                        <div>📄 {tenant._count?.contracts || 0} contratos</div>
                        <div>👤 {tenant._count?.clients || 0} clientes</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setShowDetailsModal(true);
                          }}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          👁️ Ver
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setShowEditModal(true);
                          }}
                          className="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        {tenant.isActive ? (
                          <button
                            onClick={() => {
                              const reason = window.prompt("Ingresa la razón de suspensión:");
                              if (!reason || !reason.trim()) {
                                return;
                              }
                              setSelectedTenant(tenant);
                              setSuspendReason(reason.trim());
                              setShowSuspendModal(true);
                            }}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                          >
                            🚫 Suspender
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setShowActivateModal(true);
                            }}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                          >
                            ✅ Activar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {/* Loading Modal */}
      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={() => setLoadingModalOpen(false)}
        autoCloseDelay={2000}
      />

      {/* Suspend Confirmation Modal */}
      {showSuspendModal && selectedTenant && (
        <ConfirmModal
          isOpen={showSuspendModal}
          title="Suspender Tenant"
          message={`Se suspendera ${selectedTenant.name}. Razon: ${suspendReason}`}
          confirmText="Suspender"
          cancelText="Cancelar"
          confirmVariant="danger"
          onConfirm={() => {
            setShowSuspendModal(false);
            void handleSuspendTenant(selectedTenant.id, suspendReason);
          }}
          onCancel={() => {
            setShowSuspendModal(false);
            setSuspendReason("");
          }}
        />
      )}

      {/* Activate Confirmation Modal */}
      {showActivateModal && selectedTenant && (
        <ConfirmModal
          isOpen={showActivateModal}
          title="Activar Tenant"
          message={`Se activara ${selectedTenant.name} y recuperara acceso completo.`}
          confirmText="Activar"
          cancelText="Cancelar"
          confirmVariant="primary"
          onConfirm={() => {
            setShowActivateModal(false);
            void handleActivateTenant(selectedTenant.id);
          }}
          onCancel={() => setShowActivateModal(false)}
        />
      )}

      {/* Tenant Details Modal */}
      {showDetailsModal && selectedTenant && (
        <TenantDetailsModal
          tenantId={selectedTenant.id}
          onClose={() => setShowDetailsModal(false)}
        />
      )}

      {/* Edit Tenant Modal */}
      {showEditModal && selectedTenant && (
        <EditTenantModal
          tenant={selectedTenant}
          onClose={() => {
            setShowEditModal(false);
            setSelectedTenant(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedTenant(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function CreateTenantModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: CreateTenantDto) => {
    setIsSubmitting(true);
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Creando tenant...");

    try {
      await superAdminCreateTenant(data);
      setLoadingModalState("success");
      setLoadingModalMessage("¡Tenant creado exitosamente!");
      setTimeout(() => {
        setLoadingModalOpen(false);
        onSuccess();
      }, 2000);
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : "Error al crear tenant");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">🏢 Crear Nuevo Tenant</h2>
        </div>

        <div className="p-6">
          <TenantForm
            mode="create"
            onSubmit={handleSubmit}
            onCancel={onClose}
            isLoading={isSubmitting}
          />
        </div>

        <LoadingModal
          isOpen={loadingModalOpen}
          state={loadingModalState}
          loadingMessage={loadingModalMessage}
          successMessage={loadingModalMessage}
          errorMessage={loadingModalMessage}
          onClose={() => setLoadingModalOpen(false)}
          autoCloseDelay={2000}
        />
      </div>
    </div>
  );
}

function EditTenantModal({ 
  tenant, 
  onClose, 
  onSuccess 
}: { 
  tenant: SuperAdminTenant; 
  onClose: () => void; 
  onSuccess: () => void;
}) {
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialData: UpdateTenantDto = {
    name: tenant.name,
    subdomain: tenant.subdomain || "",
    customDomain: tenant.customDomain || "",
    contractPrefix: tenant.contractPrefix,
  };

  const handleSubmit = async (data: UpdateTenantDto) => {
    setIsSubmitting(true);
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Actualizando tenant...");

    try {
      await superAdminUpdateTenant(tenant.id, data);
      setLoadingModalState("success");
      setLoadingModalMessage("¡Tenant actualizado exitosamente!");
      setTimeout(() => {
        setLoadingModalOpen(false);
        onSuccess();
      }, 2000);
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : "Error al actualizar tenant");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">✏️ Editar Tenant</h2>
          <p className="text-sm text-gray-600 mt-1">
            Editando: <span className="font-semibold">{tenant.name}</span>
          </p>
        </div>

        <div className="p-6">
          <TenantForm
            mode="edit"
            initialData={initialData}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isLoading={isSubmitting}
          />
        </div>

        <LoadingModal
          isOpen={loadingModalOpen}
          state={loadingModalState}
          loadingMessage={loadingModalMessage}
          successMessage={loadingModalMessage}
          errorMessage={loadingModalMessage}
          onClose={() => setLoadingModalOpen(false)}
          autoCloseDelay={2000}
        />
      </div>
    </div>
  );
}

function TenantDetailsModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [details, setDetails] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDetails = async () => {
      try {
        setLoading(true);
        const data = await superAdminGetTenantById(tenantId);
        setDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar detalles");
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <p className="text-red-600 mb-4">{error || "No se encontraron detalles"}</p>
          <button onClick={onClose} className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 pb-4 border-b border-gray-200">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{details.name}</h3>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-semibold">Subdomain:</span> {details.subdomain || "N/A"}
              </p>
              {details.customDomain && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Dominio:</span> {details.customDomain}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Status Badge */}
          <div className="mb-6">
            {details.isActive ? (
              <span className="px-4 py-2 inline-flex text-sm font-semibold rounded-full bg-green-100 text-green-800">
                ✅ Activo
              </span>
            ) : (
              <div>
                <span className="px-4 py-2 inline-flex text-sm font-semibold rounded-full bg-red-100 text-red-800">
                  ❌ Suspendido
                </span>
                {details.suspendReason && (
                  <div className="mt-2 text-sm text-red-600">
                    <span className="font-semibold">Razón:</span> {details.suspendReason}
                  </div>
                )}
                {details.suspendedAt && (
                  <div className="text-xs text-gray-600 mt-1">
                    Suspendido el {formatDate(details.suspendedAt)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* General Info */}
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">📋 Información General</h4>
              <div>
                <p className="text-sm text-gray-600">Contract Prefix</p>
                <p className="font-medium">{details.contractPrefix}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Plan</p>
                <p className="font-medium">{details.planType || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Creado</p>
                <p className="font-medium">{formatDate(details.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Actualizado</p>
                <p className="font-medium">{formatDate(details.updatedAt)}</p>
              </div>
            </div>

            {/* Statistics */}
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">📊 Estadísticas</h4>
              <div>
                <p className="text-sm text-gray-600">👥 Usuarios</p>
                <p className="font-medium text-2xl">{details.counts.users}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">👤 Clientes</p>
                <p className="font-medium text-2xl">{details.counts.clients}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">📄 Contratos</p>
                <p className="font-medium text-2xl">{details.counts.contracts}</p>
              </div>
            </div>

            {/* Admin Users */}
            <div className="space-y-4 md:col-span-2">
              <h4 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">👨‍💼 Administradores</h4>
              {details.admins.length > 0 ? (
                <div className="space-y-2">
                  {details.admins.map((admin) => (
                    <div key={admin.id} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{admin.fullName}</p>
                          <p className="text-sm text-gray-600">{admin.email}</p>
                          <p className="text-xs text-gray-500">
                            Creado: {formatDate(admin.createdAt)}
                          </p>
                        </div>
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          admin.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {admin.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No hay administradores registrados</p>
              )}
            </div>

            {/* Branding */}
            <div className="space-y-4 md:col-span-2">
              <h4 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">🎨 Branding</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Logo</p>
                  {details.logoUrl ? (
                    <div className="border border-gray-200 rounded p-2">
                      <img src={details.logoUrl} alt="Logo" className="max-h-16 mx-auto" />
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No configurado</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Firma</p>
                  {details.signatureUrl ? (
                    <div className="border border-gray-200 rounded p-2">
                      <img src={details.signatureUrl} alt="Firma" className="max-h-16 mx-auto" />
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No configurado</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Colores</p>
                  <div className="flex gap-2">
                    {details.primaryColor && (
                      <div className="flex-1">
                        <div
                          className="h-12 rounded border border-gray-200"
                          style={{ backgroundColor: details.primaryColor }}
                        ></div>
                        <p className="text-xs text-gray-500 mt-1 text-center">Primario</p>
                      </div>
                    )}
                    {details.secondaryColor && (
                      <div className="flex-1">
                        <div
                          className="h-12 rounded border border-gray-200"
                          style={{ backgroundColor: details.secondaryColor }}
                        ></div>
                        <p className="text-xs text-gray-500 mt-1 text-center">Secundario</p>
                      </div>
                    )}
                    {!details.primaryColor && !details.secondaryColor && (
                      <p className="text-xs text-gray-400 italic">No configurados</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
