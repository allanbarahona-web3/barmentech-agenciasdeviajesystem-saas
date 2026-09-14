"use client";

import { useEffect, useState } from "react";
import { CURRENT_EXCHANGE_RATE_CHANGED_EVENT, getCurrentExchangeRate, type CurrentExchangeRate } from "@/lib/exchange-rate-api";

type CurrencyCalculatorProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CurrencyCalculator({ isOpen, onClose }: CurrencyCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<CurrentExchangeRate | null>(null);
  const [usdAmount, setUsdAmount] = useState("");
  const [crcAmount, setCrcAmount] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadExchangeRate();
    }
  }, [isOpen]);

  useEffect(() => {
    const refresh = () => {
      if (isOpen) void loadExchangeRate();
    };
    window.addEventListener(CURRENT_EXCHANGE_RATE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CURRENT_EXCHANGE_RATE_CHANGED_EVENT, refresh);
  }, [isOpen]);

  const loadExchangeRate = async () => {
    try {
      setLoading(true);
      const response = await getCurrentExchangeRate();
      setExchangeRate(response.rate);
    } catch (err) {
      console.error("Error loading exchange rate:", err);
    } finally {
      setLoading(false);
    }
  };

  // USD → CRC usa tasa de VENTA (el cliente "compra" dólares)
  const handleUsdChange = (value: string) => {
    setUsdAmount(value);
    const usd = parseFloat(value);
    if (!isNaN(usd) && exchangeRate) {
      const crc = usd * exchangeRate.sellRate;
      setCrcAmount(crc.toFixed(2));
    } else {
      setCrcAmount("");
    }
  };

  // CRC → USD usa tasa de COMPRA (el cliente "vende" dólares)
  const handleCrcChange = (value: string) => {
    setCrcAmount(value);
    const crc = parseFloat(value);
    if (!isNaN(crc) && exchangeRate) {
      const usd = crc / exchangeRate.buyRate;
      setUsdAmount(usd.toFixed(2));
    } else {
      setUsdAmount("");
    }
  };

  const handleClear = () => {
    setUsdAmount("");
    setCrcAmount("");
  };

  const handleClose = () => {
    handleClear();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        padding: '80px 20px 20px',
        pointerEvents: 'none',
      }}
    >
      <div 
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          pointerEvents: 'auto',
        }}
      />
      
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: 400,
          pointerEvents: 'auto',
          animation: 'slideDown 0.2s ease-out',
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>💱 Calculadora de Divisas</h2>
          <button 
            type="button" 
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '0 8px',
              lineHeight: 1,
            }}
            title="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <p>Cargando tipo de cambio...</p>
          ) : !exchangeRate ? (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: 12,
              color: '#dc2626',
            }}>
              No hay tipo de cambio configurado para hoy. El administrador debe configurarlo.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: 10, color: '#374151' }}>
                  Tipo de cambio del día
                </div>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: 10,
                  background: '#f9fafb',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>💰 Compra</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#374151' }}>
                      ₡{exchangeRate.buyRate.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>💵 Venta</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#374151' }}>
                      ₡{exchangeRate.sellRate.toFixed(2)}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
                  Fuente: {exchangeRate.source} · Fecha efectiva: {exchangeRate.effectiveDate}
                </p>
                {exchangeRate.notes && (
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
                    📝 {exchangeRate.notes}
                  </p>
                )}
                {exchangeRate.setByName ? <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, marginBottom: 0 }}>👤 {exchangeRate.setByName}</p> : null}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                  USD (Dólares)
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                    → usa tasa de venta
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={usdAmount}
                  onChange={(e) => handleUsdChange(e.target.value)}
                  placeholder="0.00"
                  style={{ 
                    width: '100%',
                    padding: '12px',
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    border: '2px solid #e5e7eb',
                    borderRadius: 8,
                  }}
                />
              </div>

              <div style={{ textAlign: 'center', margin: '12px 0' }}>
                <span style={{ fontSize: '1.5rem' }}>⇅</span>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                  CRC (Colones)
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                    → usa tasa de compra
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={crcAmount}
                  onChange={(e) => handleCrcChange(e.target.value)}
                  placeholder="0.00"
                  style={{ 
                    width: '100%',
                    padding: '12px',
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    border: '2px solid #e5e7eb',
                    borderRadius: 8,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button 
                  type="button" 
                  onClick={handleClear}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Limpiar
                </button>
                <button 
                  type="button" 
                  onClick={handleClose}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
