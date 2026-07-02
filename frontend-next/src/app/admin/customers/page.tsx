'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingModal } from '@/components/loading-modal';
import { getCustomers, type CustomerListResponse } from '@/lib/customers-api';

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerListResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // LoadingModal states
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');

  useEffect(() => {
    loadCustomers();
  }, [currentPage, searchTerm]);

  async function loadCustomers() {
    try {
      setLoading(true);
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Cargando clientes...');

      const data = await getCustomers({
        page: currentPage,
        pageSize,
        search: searchTerm || undefined,
      });

      setCustomers(data);
      setLoadingModalOpen(false);
    } catch (err: any) {
      setLoadingModalState('error');
      setLoadingModalMessage(err.message || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page on search
  }

  function handleCustomerClick(customerId: string) {
    router.push(`/admin/customers/${customerId}`);
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <main className="app-shell">
      {/* Header with gradient */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
              👥 Gestión de Clientes
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
              Consulta y gestiona la información de tus clientes
            </p>
          </div>
          {customers && (
            <div
              style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '12px 20px',
                borderRadius: '8px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>
                {customers.total}
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>
                Total Clientes
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '20px 24px', marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
          🔍 Buscar Cliente
        </label>
        <input
          type="text"
          placeholder="Buscar por nombre, cédula o email..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
        />
      </div>

      {/* Customer Table */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '2px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
            📋 Lista de Clientes
          </h3>
        </div>

        {!loading && customers && customers.customers.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>👥</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' }}>
              No se encontraron clientes
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Los clientes registrados aparecerán aquí'}
            </p>
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(to right, #f9fafb, #f3f4f6)', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Nombre Completo
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Cédula/ID
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Email
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Teléfono
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Registrado
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers?.customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => handleCustomerClick(customer.id)}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                      {customer.fullName}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>
                      {customer.idNumber}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>
                      {customer.email}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {customer.phone || '-'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#9ca3af' }}>
                      {formatDate(customer.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {customers && customers.totalPages > 1 && (
              <div
                style={{
                  padding: '20px 24px',
                  borderTop: '2px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  Página {customers.page} de {customers.totalPages} • {customers.total} clientes en total
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: '8px 16px',
                      background: currentPage === 1 ? '#f3f4f6' : '#667eea',
                      color: currentPage === 1 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(customers.totalPages, prev + 1))}
                    disabled={currentPage === customers.totalPages}
                    style={{
                      padding: '8px 16px',
                      background: currentPage === customers.totalPages ? '#f3f4f6' : '#667eea',
                      color: currentPage === customers.totalPages ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: currentPage === customers.totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* LoadingModal */}
      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={() => setLoadingModalOpen(false)}
      />
    </main>
  );
}
