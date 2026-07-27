'use client';

import { useState, type ReactNode } from 'react';
import { getCustomers, type CustomerListItem } from '@/lib/customers-api';

interface CustomerSearchSelectorProps {
  selectedCustomer: CustomerListItem | null;
  onSelect: (customer: CustomerListItem) => void;
  onClear: () => void;
  onEdit?: () => void;
  onCreateRequested?: () => void;
  description?: string;
  renderSelectedCustomer?: (
    customer: CustomerListItem,
    actions: { clear: () => void; edit?: () => void },
  ) => ReactNode;
  renderResult?: (
    customer: CustomerListItem,
    select: () => void,
  ) => ReactNode;
  renderResultsHeader?: (resultCount: number) => ReactNode;
  renderEmptyState?: (
    searchQuery: string,
    create?: () => void,
  ) => ReactNode;
  renderInitialState?: (create?: () => void) => ReactNode;
}

export function CustomerSearchSelector({
  selectedCustomer,
  onSelect,
  onClear,
  onEdit,
  onCreateRequested,
  description = 'Busque un cliente existente por número de identificación.',
  renderSelectedCustomer,
  renderResult,
  renderResultsHeader,
  renderEmptyState,
  renderInitialState,
}: CustomerSearchSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerListItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setError('Por favor ingrese un número de identificación');
      return;
    }

    setSearching(true);
    setError(null);
    setHasSearched(true);
    try {
      const response = await getCustomers({
        search: searchQuery.trim(),
        pageSize: 10,
      });
      setSearchResults(response.customers);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : 'Error al buscar clientes',
      );
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
        {description}
      </p>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleSearch();
          }}
          placeholder="Número de identificación"
          disabled={searching}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '15px',
          }}
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={searching}
          style={{
            padding: '10px 24px',
            background: searching ? '#9ca3af' : '#667eea',
            color: 'white',
            border: 0,
            borderRadius: '8px',
            cursor: searching ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {searching ? 'Buscando...' : '🔍 Buscar'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '12px',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            color: '#991b1b',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {selectedCustomer && renderSelectedCustomer ? (
        renderSelectedCustomer(selectedCustomer, {
          clear: onClear,
          edit: onEdit,
        })
      ) : selectedCustomer ? (
        <div
          style={{
            padding: '16px',
            background: '#f0fdf4',
            border: '2px solid #86efac',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <strong style={{ color: '#166534' }}>Cliente seleccionado</strong>
            <div style={{ color: '#15803d', marginTop: '8px' }}>
              {selectedCustomer.fullName}
            </div>
            <div style={{ color: '#15803d', fontSize: '14px' }}>
              {selectedCustomer.idNumber}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignSelf: 'start' }}>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  color: '#166534',
                  border: '1px solid #86efac',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClear}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                color: '#166534',
                border: '1px solid #86efac',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Cambiar
            </button>
          </div>
        </div>
      ) : hasSearched && searchResults.length > 0 ? (
        <div>
          {renderResultsHeader?.(searchResults.length)}
          <div style={{ display: 'grid', gap: '12px' }}>
            {searchResults.map((customer) =>
              renderResult ? (
                <div key={customer.id}>
                  {renderResult(customer, () => onSelect(customer))}
                </div>
              ) : (
                <button
                  type="button"
                  key={customer.id}
                  onClick={() => onSelect(customer)}
                  style={{
                    padding: '16px',
                    background: 'white',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ color: '#1f2937' }}>{customer.fullName}</strong>
                  <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '5px' }}>
                    {customer.idNumber}
                    {customer.email ? ` · ${customer.email}` : ''}
                  </div>
                </button>
              ),
            )}
          </div>
        </div>
      ) : hasSearched && !searching && !error && renderEmptyState ? (
        renderEmptyState(searchQuery, onCreateRequested)
      ) : hasSearched && !searching && !error ? (
        <div
          style={{
            padding: '32px 20px',
            textAlign: 'center',
            background: '#fef3c7',
            border: '2px solid #fcd34d',
            borderRadius: '12px',
            color: '#92400e',
          }}
        >
          <strong>No se encontró ningún cliente</strong>
          <p style={{ fontSize: '14px', margin: '8px 0 0' }}>
            No existe un cliente con la identificación “{searchQuery}”.
          </p>
          {onCreateRequested && (
            <button
              type="button"
              onClick={onCreateRequested}
              style={{
                marginTop: '16px',
                padding: '10px 18px',
                background: '#10b981',
                color: 'white',
                border: 0,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ➕ Crear Nuevo Cliente
            </button>
          )}
        </div>
      ) : renderInitialState ? (
        renderInitialState(onCreateRequested)
      ) : (
        <div
          style={{
            padding: '32px 20px',
            textAlign: 'center',
            background: '#f9fafb',
            border: '2px dashed #e5e7eb',
            borderRadius: '12px',
            color: '#6b7280',
          }}
        >
          Ingrese la identificación para buscar un cliente.
        </div>
      )}
    </div>
  );
}
