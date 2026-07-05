import { ContractFormState } from "@/features/contracts-form/types";

/**
 * Builds the HTML for Minor Annex pages.
 * 
 * Pure extraction - generates exactly the same HTML as the original implementation.
 * 
 * @param state - Contract form state
 * @param tenantName - Tenant name for display
 * @param esc - HTML escape function
 * @param formatDate - Date formatting function
 * @param getResponsibleAdultIdentity - Function to get adult identity from traveling companion
 * @returns HTML string for minor annex pages (or empty string if no minors)
 */
export function buildMinorAnnexHtml(
  state: ContractFormState,
  tenantName: string,
  esc: (value: unknown) => string,
  formatDate: (isoDate: string) => string,
  getResponsibleAdultIdentity: (
    state: ContractFormState,
    travelingWith: string,
  ) => { idType: string; idNumber: string },
): string {
  return state.hasMinorCompanion && state.minors.length > 0
    ? state.minors
        .map((minor, index) => {
          const adult = getResponsibleAdultIdentity(state, minor.travelingWith);
          return `
          <section class="annex-page">
            <h2>ANEXO DE AUTORIZACIÓN PARA VIAJE DE MENOR DE EDAD ${index + 1}</h2>
            <p><strong>Número de anexo:</strong> ANX-MEN-${esc(state.contractNumber)}-${String(index + 1).padStart(2, "0")}</p>
            <p><strong>Contrato Número:</strong> ${esc(state.contractNumber)}</p>
            <p>Este anexo complementa el CONTRATO GENERAL DE VIAJE TURÍSTICO N. ${esc(state.contractNumber)} y documenta la autorización del tutor/patria potestad para el menor indicado.</p>

            <section class="annex-clause">
              <p><strong>PRIMERO: DATOS DEL MENOR</strong></p>
              <ul>
                <li>Menor: ${esc(minor.minorName)}</li>
                <li>Identificación: ${esc(minor.minorId)}</li>
                <li>Destino del Tour: ${esc(state.destination)}</li>
                <li>Fechas del Tour: ${formatDate(state.startDate)} a ${formatDate(state.endDate)}</li>
              </ul>
            </section>

            <section class="annex-clause">
              <p><strong>SEGUNDO: DATOS DE QUIEN EJERCE PATRIA POTESTAD / TUTOR LEGAL</strong></p>
              <ul>
                <li>Nombre completo: ${esc(minor.tutorName)}</li>
                <li>Identificación: ${esc(minor.tutorIdType || "ID")} ${esc(minor.tutorId)}</li>
                <li>Teléfono de contacto: -</li>
              </ul>
            </section>

            <section class="annex-clause">
              <p><strong>TERCERO: ADULTO RESPONSABLE QUE ACOMPAÑA AL MENOR</strong>
              <ul>
                <li>Nombre completo: ${esc(minor.travelingWith)}</li>
                <li>Identificación: ${esc(adult.idType)} ${esc(adult.idNumber)}</li>
                <li>Teléfono de contacto: -</li>
              </ul>
            </section>

            <section class="annex-clause">
              <p><strong>CUARTO: DECLARACIÓN DE AUTORIZACIÓN</strong></p>
              <p>La persona firmante, en su condición de tutor legal y/o quien ejerce la patria potestad, declara bajo fe de juramento que cuenta con facultades legales suficientes para autorizar el viaje del menor e identifica expresamente a ${esc(minor.travelingWith)} como el adulto responsable que acompañará al menor durante el viaje. Asimismo, exonera a ${esc(tenantName)} de responsabilidad por información inexacta o documentación insuficiente aportada por el representante.</p>
            </section>

            <section class="annex-clause">
              <p><strong>QUINTO: DOCUMENTO DE RESPALDO</strong></p>
              <p>Este anexo debe estar acompañado por el permiso notarial, judicial o documento equivalente exigido por la normativa migratoria aplicable.</p>
            </section>

            <section class="annex-sigs">
              <div class="annex-sig-col">
                <p class="annex-sig-line">______________________________</p>
                <p><strong>1) Tutor legal / Patria potestad</strong></p>
                <p>${esc(minor.tutorName)}</p>
                <p>${esc(minor.tutorIdType || "ID")}: ${esc(minor.tutorId)}</p>
              </div>
              <div class="annex-sig-col">
                <p class="annex-sig-line">______________________________</p>
                <p><strong>2) Adulto autorizado que acompaña al menor</strong></p>
                <p>${esc(minor.travelingWith)}</p>
                <p>${esc(adult.idType)}: ${esc(adult.idNumber)}</p>
              </div>
            </section>
            <p><strong>Fecha de emisión:</strong> ${formatDate(state.issuedAt)}</p>
          </section>`;
        })
        .join("")
    : "";
}
