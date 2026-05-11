"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";

// 📊 TIPOS DE DATOS (Preparados para cuando se implemente el backend)
type TenantEmailStats = {
  tenantId: string;
  tenantName: string;
  subdomain: string;
  isActive: boolean;
  emailVerified: boolean;
  
  // Quotas configuradas
  emailQuotaDaily: number;
  emailQuotaMonthly: number;
  
  // Contadores actuales
  emailsSentToday: number;
  emailsSentMonth: number;
  lastEmailResetDate: string | null;
  
  // Calculados
  usagePercentageDaily: number;
  usagePercentageMonthly: number;
  
  // Email config
  fromEmail: string | null;
  replyToEmail: string | null;
};

type PlatformEmailStats = {
  totalEmailsSentToday: number;
  totalEmailsSentMonth: number;
  totalQuotaDaily: number;
  totalQuotaMonthly: number;
  platformUsagePercentageDaily: number;
  platformUsagePercentageMonthly: number;
  activeTenantsWithEmail: number;
  tenantsNearQuota: number; // Tenants con >80% uso
  lastUpdated: string;
};

export default function EmailStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tenantStats, setTenantStats] = useState<TenantEmailStats[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformEmailStats | null>(null);
  const [error, setError] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantEmailStats | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [newDailyQuota, setNewDailyQuota] = useState(1000);
  const [newMonthlyQuota, setNewMonthlyQuota] = useState(30000);

  useEffect(() => {
    const session = getStoredSession();
    const role = session?.user?.role;

    if (role !== "SUPER_ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    loadEmailStats();
  }, [router]);

  const loadEmailStats = async () => {
    try {
      setLoading(true);
      setError("");
      
      // 🚧 TODO: Implementar endpoints backend
      // const [tenantData, platformData] = await Promise.all([
      //   superAdminGetTenantEmailStats(),
      //   superAdminGetPlatformEmailStats(),
      // ]);
      
      // 🎭 MOCK DATA para visualización
      const mockTenantStats: TenantEmailStats[] = [
        {
          tenantId: "cmot69nd7000111yyq5kk0drm",
          tenantName: "Viajes Alma Nova",
          subdomain: "almanova",
          isActive: true,
          emailVerified: true,
          emailQuotaDaily: 1000,
          emailQuotaMonthly: 30000,
          emailsSentToday: 45,
          emailsSentMonth: 890,
          lastEmailResetDate: new Date().toISOString(),
          usagePercentageDaily: 4.5,
          usagePercentageMonthly: 3.0,
          fromEmail: "noreply@viajesalmanova.com",
          replyToEmail: "info@viajesalmanova.com",
        },
        {
          tenantId: "cmot69nlo000211yy6d6gieqs",
          tenantName: "Lucitours",
          subdomain: "lucitours",
          isActive: true,
          emailVerified: false,
          emailQuotaDaily: 1000,
          emailQuotaMonthly: 30000,
          emailsSentToday: 0,
          emailsSentMonth: 0,
          lastEmailResetDate: null,
          usagePercentageDaily: 0,
          usagePercentageMonthly: 0,
          fromEmail: null,
          replyToEmail: null,
        },
        {
          tenantId: "cmotakbux0001uzac059ra42g",
          tenantName: "Empresa De Prueba Suspencion",
          subdomain: "empresa",
          isActive: true,
          emailVerified: false,
          emailQuotaDaily: 1000,
          emailQuotaMonthly: 30000,
          emailsSentToday: 12,
          emailsSentMonth: 234,
          lastEmailResetDate: new Date().toISOString(),
          usagePercentageDaily: 1.2,
          usagePercentageMonthly: 0.8,
          fromEmail: "contacto@empresa.com",
          replyToEmail: null,
        },
      ];

      const mockPlatformStats: PlatformEmailStats = {
        totalEmailsSentToday: 57,
        totalEmailsSentMonth: 1124,
        totalQuotaDaily: 3000,
        totalQuotaMonthly: 90000,
        platformUsagePercentageDaily: 1.9,
        platformUsagePercentageMonthly: 1.2,
        activeTenantsWithEmail: 2,
        tenantsNearQuota: 0,
        lastUpdated: new Date().toISOString(),
      };

      setTenantStats(mockTenantStats);
      setPlatformStats(mockPlatformStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar estadísticas");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuota = async (tenantId: string) => {
    // 🚧 TODO: Implementar endpoint backend
    console.log(`Actualizar cuotas para tenant ${tenantId}:`, {
      dailyQuota: newDailyQuota,
      monthlyQuota: newMonthlyQuota,
    });
    
    setShowQuotaModal(false);
    // Recargar datos después de actualizar
    // await loadEmailStats();
  };

  const handleResetCounters = async (tenantId: string) => {
    // 🚧 TODO: Implementar endpoint backend
    console.log(`Resetear contadores para tenant ${tenantId}`);
    // await superAdminResetTenantEmailCounters(tenantId);
    // await loadEmailStats();
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 70) return "text-orange-600";
    if (percentage >= 50) return "text-yellow-600";
    return "text-green-600";
  };

  const getUsageBgColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-100";
    if (percentage >= 70) return "bg-orange-100";
    if (percentage >= 50) return "bg-yellow-100";
    return "bg-green-100";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando estadísticas de emails...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              📧 Email Rate Limiting & Stats
            </h1>
            <p className="text-gray-600 mt-2">
              Monitoreo de uso de emails por tenant y plataforma
            </p>
          </div>
          <button
            onClick={() => router.push("/super-admin/dashboard")}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ← Volver al Dashboard
          </button>
        </div>

        {/* 🚧 MVP Warning Badge */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <span className="font-semibold">🚧 MVP - Solo Visualización:</span> Los contadores están preparados pero no se está validando ni bloqueando. 
                Los datos mostrados son informativos. La lógica de enforcement se implementará cuando se tengan &gt;10 tenants.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Platform Stats Overview */}
      {platformStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="text-blue-600 text-sm font-semibold mb-2">📨 Hoy</div>
            <div className="text-3xl font-bold text-blue-900">
              {platformStats.totalEmailsSentToday.toLocaleString()}
            </div>
            <div className="text-sm text-blue-600 mt-1">
              de {platformStats.totalQuotaDaily.toLocaleString()} cuota diaria
            </div>
            <div className="mt-2">
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(platformStats.platformUsagePercentageDaily, 100)}%` }}
                />
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {platformStats.platformUsagePercentageDaily.toFixed(1)}% usado
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <div className="text-purple-600 text-sm font-semibold mb-2">📅 Este Mes</div>
            <div className="text-3xl font-bold text-purple-900">
              {platformStats.totalEmailsSentMonth.toLocaleString()}
            </div>
            <div className="text-sm text-purple-600 mt-1">
              de {platformStats.totalQuotaMonthly.toLocaleString()} cuota mensual
            </div>
            <div className="mt-2">
              <div className="w-full bg-purple-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(platformStats.platformUsagePercentageMonthly, 100)}%` }}
                />
              </div>
              <div className="text-xs text-purple-600 mt-1">
                {platformStats.platformUsagePercentageMonthly.toFixed(1)}% usado
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <div className="text-green-600 text-sm font-semibold mb-2">✅ Tenants Activos</div>
            <div className="text-3xl font-bold text-green-900">
              {platformStats.activeTenantsWithEmail}
            </div>
            <div className="text-sm text-green-600 mt-1">con email verificado</div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
            <div className="text-orange-600 text-sm font-semibold mb-2">⚠️ Cerca de Límite</div>
            <div className="text-3xl font-bold text-orange-900">
              {platformStats.tenantsNearQuota}
            </div>
            <div className="text-sm text-orange-600 mt-1">&gt;80% de cuota usada</div>
          </div>
        </div>
      )}

      {/* Tenant Stats Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">📊 Estadísticas por Tenant</h2>
          <p className="text-sm text-gray-600 mt-1">
            Uso de cuotas de emails y configuración por tenant
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Email Config
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Uso Diario
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Uso Mensual
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Cuotas
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tenantStats.map((tenant) => (
                <tr key={tenant.tenantId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-gray-900">{tenant.tenantName}</div>
                      <div className="text-sm text-gray-500">@{tenant.subdomain}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {tenant.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            ✓ Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            ✗ Suspendido
                          </span>
                        )}
                        {tenant.emailVerified ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            📧 Verificado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            📧 Sin verificar
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <div className="text-gray-700">
                        <span className="font-medium">From:</span>{" "}
                        {tenant.fromEmail || <span className="text-gray-400 italic">No configurado</span>}
                      </div>
                      {tenant.replyToEmail && (
                        <div className="text-gray-600 text-xs mt-1">
                          <span className="font-medium">Reply:</span> {tenant.replyToEmail}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="text-lg font-bold text-gray-900">
                      {tenant.emailsSentToday}
                    </div>
                    <div className="text-xs text-gray-500">
                      / {tenant.emailQuotaDaily}
                    </div>
                    <div className={`text-xs font-semibold mt-1 ${getUsageColor(tenant.usagePercentageDaily)}`}>
                      {tenant.usagePercentageDaily.toFixed(1)}%
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="text-lg font-bold text-gray-900">
                      {tenant.emailsSentMonth}
                    </div>
                    <div className="text-xs text-gray-500">
                      / {tenant.emailQuotaMonthly}
                    </div>
                    <div className={`text-xs font-semibold mt-1 ${getUsageColor(tenant.usagePercentageMonthly)}`}>
                      {tenant.usagePercentageMonthly.toFixed(1)}%
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedTenant(tenant);
                        setNewDailyQuota(tenant.emailQuotaDaily);
                        setNewMonthlyQuota(tenant.emailQuotaMonthly);
                        setShowQuotaModal(true);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      title="Modificar cuotas"
                    >
                      ⚙️ Configurar
                    </button>
                  </td>

                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleResetCounters(tenant.tenantId)}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md transition-colors font-medium"
                      title="Resetear contadores (manual override)"
                    >
                      🔄 Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quota Configuration Modal */}
      {showQuotaModal && selectedTenant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              ⚙️ Configurar Cuotas de Email
            </h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Tenant: <span className="font-semibold">{selectedTenant.tenantName}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cuota Diaria (emails/día)
                </label>
                <input
                  type="number"
                  value={newDailyQuota}
                  onChange={(e) => setNewDailyQuota(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="0"
                  step="100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Uso actual: {selectedTenant.emailsSentToday} ({selectedTenant.usagePercentageDaily.toFixed(1)}%)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cuota Mensual (emails/mes)
                </label>
                <input
                  type="number"
                  value={newMonthlyQuota}
                  onChange={(e) => setNewMonthlyQuota(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="0"
                  step="1000"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Uso actual: {selectedTenant.emailsSentMonth} ({selectedTenant.usagePercentageMonthly.toFixed(1)}%)
                </p>
              </div>

              {/* 🚧 MVP Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-xs text-yellow-800">
                  <span className="font-semibold">⚠️ MVP:</span> Cambios solo actualizan la base de datos. 
                  No hay validación activa de cuotas en este momento.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowQuotaModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateQuota(selectedTenant.tenantId)}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                💾 Guardar Cuotas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-500 text-2xl">💡</div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-2">Sobre el Sistema de Rate Limiting</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>MVP Actual:</strong> Contadores están preparados pero no validan. Solo monitoreo informativo.</li>
              <li>• <strong>API Key:</strong> 1 API key global de Resend ($20/mo, 50K emails) para todos los tenants.</li>
              <li>• <strong>Estrategia:</strong> Cada tenant usa su propio fromEmail verificado en Resend.</li>
              <li>• <strong>Implementación Futura:</strong> Validación activa se activará cuando &gt;10 tenants o costo Resend &gt;$150/mes.</li>
              <li>• <strong>Manual Override:</strong> Botón "Reset" permite limpiar contadores manualmente si es necesario.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {platformStats && (
        <div className="mt-4 text-center text-xs text-gray-500">
          Última actualización: {new Date(platformStats.lastUpdated).toLocaleString("es-CR")}
        </div>
      )}
    </div>
  );
}
