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
  return (
    <div className="form-section-card">
      <h2 className="section-title">Datos del Contrato</h2>

      <div className="contracts-grid">
        <label>
          Numero de contrato
          <input 
            value={state.contractNumber} 
            readOnly 
            placeholder="Generando automaticamente..." 
            className="font-mono text-sm"
            title={state.contractNumber || "Esperando asignación automática..."}
          />
        </label>

        {isInternalTrip && (
          <label>
            Codigo viaje interno
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
          Fecha de emision
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
          Tipo de hospedaje
          <select
            value={state.lodgingType}
            onChange={(event) => setState((prev) => ({ ...prev, lodgingType: event.target.value }))}
          >
            <option value="N/A">N/A</option>
            <option value="Hotel con Desayunos">Hotel con Desayunos</option>
            <option value="Hotel sin Desayunos">Hotel sin Desayunos</option>
            <option value="Hostel">Hostel</option>
            <option value="Airbnb">Airbnb</option>
          </select>
        </label>

        <label>
          Tipo de acomodacion
          <select
            value={state.accommodationType}
            onChange={(event) => setState((prev) => ({ ...prev, accommodationType: event.target.value }))}
          >
            <option value="N/A">N/A</option>
            <option value="Sencilla">Sencilla</option>
            <option value="Doble">Doble</option>
            <option value="Triple">Triple</option>
            <option value="Cuadruple">Cuadruple</option>
          </select>
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

        {rangeMessage ? <p className="form-error full-row">{rangeMessage}</p> : null}

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
          <input value={state.balanceAmount} readOnly placeholder="Se calcula automaticamente" />
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
            <option value="MENSUAL">Mensual (cada 30 dias)</option>
            <option value="QUINCENAL">Quincenal (cada 15 dias)</option>
          </select>
        </label>

        <label>
          Cantidad de cuotas (automatico)
          <input value={state.installmentCount} readOnly placeholder="Se calcula automaticamente" />
        </label>

        <div className="col-span-full payment-summary-grid">
          <label className="payment-summary-field">
            Monto por cuota USD (regular)
            <input value={state.monthlyInstallmentAmount} readOnly placeholder="Saldo / plazo" />
          </label>

          <label className="payment-summary-field">
            Ultima cuota USD
            <input value={state.lastInstallmentAmount} readOnly placeholder="Ajuste de fraccion" />
            <small>Si hay fraccion, se ajusta en la ultima cuota.</small>
          </label>

          <label className="payment-summary-field">
            Fecha limite de pago total
            <input value={state.paymentDueDate} type="date" readOnly />
            <small>Todo debe quedar cancelado 22 dias antes de iniciar el viaje.</small>
          </label>
        </div>
      </div>
    </div>
  );
}
