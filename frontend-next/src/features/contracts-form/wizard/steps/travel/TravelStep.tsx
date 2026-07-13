import type { ContractFormState } from "@/features/contracts-form/types";
import { applyMoneyDerivedValues, syncTourDates, addDaysIso } from "@/features/contracts-form/utils";

export interface TravelStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  internalTripMeta: { tripCode: string; name: string } | null;
  packageFieldsLocked: boolean;
  todayIso: string;
  rangeMessage: string;
  onMoneyChange: (field: "totalAmount" | "reservationAmount" | "installmentCount", value: string) => void;
  onMoneyBlur: (field: "totalAmount" | "reservationAmount") => void;
}

const LUGGAGE_OPTIONS = [
  "Equipaje de Mano",
  "Carry On",
  "Equipaje Documentado",
];

const LODGING_OPTIONS = [
  "Hotel con Desayunos",
  "Hotel sin Desayunos",
  "Hostel",
  "Airbnb",
];

const ACCOMMODATION_OPTIONS = [
  "Sencilla",
  "Doble",
  "Triple",
  "Cuadruple",
];

/**
 * TravelStep - Contract Travel Information Section
 * 
 * Extracted from ContractsForm as part of incremental component extraction.
 * Contains the "Datos del Contrato" section including travel details,
 * dates, amounts, and payment information.
 * 
 * This is a pure extraction with zero functional changes.
 */
export function TravelStep({
  state,
  setState,
  isInternalTrip,
  internalTripMeta,
  packageFieldsLocked,
  todayIso,
  rangeMessage,
  onMoneyChange,
  onMoneyBlur,
}: TravelStepProps) {
  // Parse selected luggage types from luggageClause
  const parseLuggageSelection = (): Set<string> => {
    const clause = state.luggageClause.trim();
    if (!clause) return new Set();

    // Split by " + " to detect multiple selections
    const parts = clause.split(" + ").map(p => p.trim());
    const selected = new Set<string>();

    for (const part of parts) {
      if (LUGGAGE_OPTIONS.includes(part)) {
        selected.add(part);
      }
    }

    return selected;
  };

  const selectedLuggage = parseLuggageSelection();

  const handleLuggageCheckChange = (option: string, checked: boolean) => {
    const newSelected = new Set(selectedLuggage);
    
    if (checked) {
      newSelected.add(option);
    } else {
      newSelected.delete(option);
    }

    const clause = Array.from(newSelected).join(" + ");
    setState((prev) => ({ ...prev, luggageClause: clause }));
  };

  // Parse selected lodging types
  const parseLodgingSelection = (): Set<string> => {
    const type = state.lodgingType.trim();
    if (!type || type === "N/A") return new Set();

    const parts = type.split(" + ").map(p => p.trim());
    const selected = new Set<string>();

    for (const part of parts) {
      if (LODGING_OPTIONS.includes(part)) {
        selected.add(part);
      }
    }

    return selected;
  };

  const selectedLodging = parseLodgingSelection();

  const handleLodgingCheckChange = (option: string, checked: boolean) => {
    const newSelected = new Set(selectedLodging);
    
    if (checked) {
      newSelected.add(option);
    } else {
      newSelected.delete(option);
    }

    const type = Array.from(newSelected).join(" + ");
    setState((prev) => ({ ...prev, lodgingType: type || "N/A" }));
  };

  // Parse selected accommodation types
  const parseAccommodationSelection = (): Set<string> => {
    const type = state.accommodationType.trim();
    if (!type || type === "N/A") return new Set();

    const parts = type.split(" + ").map(p => p.trim());
    const selected = new Set<string>();

    for (const part of parts) {
      if (ACCOMMODATION_OPTIONS.includes(part)) {
        selected.add(part);
      }
    }

    return selected;
  };

  const selectedAccommodation = parseAccommodationSelection();

  const handleAccommodationCheckChange = (option: string, checked: boolean) => {
    const newSelected = new Set(selectedAccommodation);
    
    if (checked) {
      newSelected.add(option);
    } else {
      newSelected.delete(option);
    }

    const type = Array.from(newSelected).join(" + ");
    setState((prev) => ({ ...prev, accommodationType: type || "N/A" }));
  };
  
  return (
    <>
      {/* SECCIÓN 1: INFORMACIÓN DEL VIAJE */}
      <div className="form-section-card">
        <h2 className="section-title">📋 Información del Viaje</h2>

        <div className="contracts-grid">
          <label>
            Número de contrato
            <input 
              value={state.contractNumber} 
              readOnly 
              placeholder="Generando automáticamente..." 
              className="font-mono text-sm"
              title={state.contractNumber || "Esperando asignación automática..."}
            />
          </label>

          {isInternalTrip && (
            <label>
              Código viaje interno
              <input
                value={internalTripMeta?.tripCode || "Cargando..."}
                readOnly
                title={internalTripMeta?.name || "Viaje interno seleccionado"}
                className="font-mono text-sm"
                style={{ backgroundColor: "#f3f4f6" }}
              />
            </label>
          )}

          <label>
            Fecha de emisión
            <input type="date" value={state.issuedAt} readOnly />
          </label>

          <label>
            Destino
            <input
              value={state.destination}
              onChange={(event) => setState((prev) => ({ ...prev, destination: event.target.value }))}
              placeholder="Ej. España"
              readOnly={packageFieldsLocked}
              style={packageFieldsLocked ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : undefined}
            />
          </label>

          <label>
            Fecha inicio tour
            <input
              type="date"
              value={state.startDate}
              min={todayIso}
              onChange={(event) => {
                const selected = String(event.target.value || "");
                const safe = selected && selected < todayIso ? todayIso : selected;
                setState((prev) => applyMoneyDerivedValues(syncTourDates(prev, "start", safe)));
              }}
              readOnly={packageFieldsLocked}
              style={packageFieldsLocked ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : undefined}
            />
          </label>

          <label>
            Fecha fin tour
            <input
              type="date"
              value={state.endDate}
              min={state.startDate ? addDaysIso(state.startDate, 1) : addDaysIso(todayIso, 1)}
              onChange={(event) =>
                setState((prev) => applyMoneyDerivedValues(syncTourDates(prev, "end", event.target.value)))
              }
              readOnly={packageFieldsLocked}
              style={packageFieldsLocked ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : undefined}
            />
          </label>

          <label>
            Fecha límite de pago total
            <input value={state.paymentDueDate} type="date" readOnly />
            <small>Todo debe quedar cancelado 22 días antes de iniciar el viaje.</small>
          </label>

          {rangeMessage ? <p className="form-error full-row">{rangeMessage}</p> : null}
        </div>
      </div>

      {/* SECCIÓN 2: PREFERENCIAS DEL VIAJE (CHECKBOXES) */}
      <div className="form-section-card">
        <h2 className="section-title">✅ Preferencias del Viaje</h2>

        <div className="contracts-grid">

        <label>
          Tipo de hospedaje
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "10px", 
            padding: "12px",
            backgroundColor: "#f9fafb",
            borderRadius: "6px",
            border: "1px solid #e5e7eb"
          }}>
            {LODGING_OPTIONS.map((option) => {
              const isChecked = selectedLodging.has(option);
              return (
                <label 
                  key={option} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    cursor: "pointer",
                    fontSize: "0.95rem",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: isChecked ? "#d1fae5" : "transparent",
                    border: isChecked ? "1px solid #10b981" : "1px solid transparent",
                    transition: "all 0.2s ease",
                    boxShadow: isChecked ? "0 0 8px rgba(16, 185, 129, 0.3)" : "none"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => handleLodgingCheckChange(option, e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ color: isChecked ? "#065f46" : "#374151", fontWeight: isChecked ? 600 : 400 }}>{option}</span>
                </label>
              );
            })}
          </div>
        </label>

        <label>
          Tipo de acomodación
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "10px", 
            padding: "12px",
            backgroundColor: "#f9fafb",
            borderRadius: "6px",
            border: "1px solid #e5e7eb"
          }}>
            {ACCOMMODATION_OPTIONS.map((option) => {
              const isChecked = selectedAccommodation.has(option);
              return (
                <label 
                  key={option} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    cursor: "pointer",
                    fontSize: "0.95rem",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: isChecked ? "#d1fae5" : "transparent",
                    border: isChecked ? "1px solid #10b981" : "1px solid transparent",
                    transition: "all 0.2s ease",
                    boxShadow: isChecked ? "0 0 8px rgba(16, 185, 129, 0.3)" : "none"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => handleAccommodationCheckChange(option, e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ color: isChecked ? "#065f46" : "#374151", fontWeight: isChecked ? 600 : 400 }}>{option}</span>
                </label>
              );
            })}
          </div>
        </label>

        <label>
          Equipaje permitido
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "10px", 
            padding: "12px",
            backgroundColor: "#f9fafb",
            borderRadius: "6px",
            border: "1px solid #e5e7eb"
          }}>
            {LUGGAGE_OPTIONS.map((option) => {
              const isChecked = selectedLuggage.has(option);
              return (
                <label 
                  key={option} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    cursor: "pointer",
                    fontSize: "0.95rem",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: isChecked ? "#d1fae5" : "transparent",
                    border: isChecked ? "1px solid #10b981" : "1px solid transparent",
                    transition: "all 0.2s ease",
                    boxShadow: isChecked ? "0 0 8px rgba(16, 185, 129, 0.3)" : "none"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => handleLuggageCheckChange(option, e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ color: isChecked ? "#065f46" : "#374151", fontWeight: isChecked ? 600 : 400 }}>{option}</span>
                </label>
              );
            })}
          </div>
        </label>
        </div>
      </div>

      {/* SECCIÓN 3: INFORMACIÓN DE PAGOS Y CUOTAS */}
      <div className="form-section-card">
        <h2 className="section-title">💰 Información de Pagos y Cuotas</h2>

        <div className="contracts-grid">
        <label>
          Monto total USD
          <input
            type="number"
            step="0.01"
            value={state.totalAmount}
            placeholder="Ej. 1250.00"
            onChange={(event) => onMoneyChange("totalAmount", event.target.value)}
            onBlur={() => onMoneyBlur("totalAmount")}
          />
        </label>

        <label>
          Reserva USD
          <input
            type="number"
            step="0.01"
            value={state.reservationAmount}
            placeholder="Ej. 300.00"
            onChange={(event) => onMoneyChange("reservationAmount", event.target.value)}
            onBlur={() => onMoneyBlur("reservationAmount")}
          />
        </label>

        <label>
          Saldo pendiente USD
          <input value={state.balanceAmount} readOnly placeholder="Se calcula automáticamente" />
        </label>

        <label>
          Frecuencia de pago
          <select
            value={state.paymentFrequency}
            onChange={(event) =>
              setState((prev) =>
                applyMoneyDerivedValues({
                  ...prev,
                  paymentFrequency: event.target.value as "QUINCENAL" | "MENSUAL",
                }),
              )
            }
          >
            <option value="MENSUAL">Mensual (cada 30 días)</option>
            <option value="QUINCENAL">Quincenal (cada 15 días)</option>
          </select>
        </label>

        <label>
          Cantidad de cuotas (automático)
          <input value={state.installmentCount} readOnly placeholder="Se calcula automáticamente" />
        </label>

        <div className="col-span-full payment-summary-grid">
          <label className="payment-summary-field">
            Monto por cuota USD (regular)
            <input value={state.monthlyInstallmentAmount} readOnly placeholder="Saldo / plazo" />
          </label>

          <label className="payment-summary-field">
            Última cuota USD
            <input value={state.lastInstallmentAmount} readOnly placeholder="Ajuste de fracción" />
            <small>Si hay fracción, se ajusta en la última cuota.</small>
          </label>
        </div>
        </div>
      </div>
    </>
  );
}
