import { TenantLegalInfo } from "@/features/contracts-form/pdf-template";
import { getClientIdentificationTypeLabel } from '@/features/customers/client-identification';

/**
 * Data required to render the Liability Waiver document.
 */
export interface LiabilityWaiverData {
  tenantLegalInfo: TenantLegalInfo;
  contractNumber: string;
  clientName: string;
  clientIdType: string;
  clientIdNumber: string;
  clientCivilStatus: string;
  clientOccupation: string;
  clientAddress: string;
  destinationCountry: string;
  startDate: string;
  endDate: string;
}

/**
 * Builds the HTML for the Liability Waiver document.
 * 
 * This is a standalone document renderer that generates a complete liability waiver
 * in Spanish, following Costa Rican legal requirements.
 * 
 * @param data - Liability waiver data
 * @param esc - HTML escape function
 * @param formatDate - Date formatting function
 * @returns HTML string for the liability waiver document
 */
export function buildLiabilityWaiverHtml(
  data: LiabilityWaiverData,
  esc: (value: unknown) => string,
  formatDate: (isoDate: string) => string,
): string {
  const tenantName = data.tenantLegalInfo?.name || "Agencia de Viajes";
  const legalName = data.tenantLegalInfo?.legalName || "___";
  const legalId = data.tenantLegalInfo?.legalId || "___";
  const contactPhone = data.tenantLegalInfo?.contactPhone || "N/A";
  const businessAddress = data.tenantLegalInfo?.businessAddress || "N/A";

  const signatureDate = formatDate(new Date().toISOString().slice(0, 10));

  return `
<section class="waiver-page">
  <h2 class="waiver-title">EXONERACIÓN DE RESPONSABILIDAD</h2>
  
  <div class="waiver-header-info">
    <p><strong>Razón Social:</strong> ${esc(legalName)}</p>
    <p><strong>Cédula Jurídica:</strong> ${esc(legalId)}</p>
    <p><strong>Teléfono:</strong> ${esc(contactPhone)}</p>
    <p><strong>Dirección Comercial:</strong> ${esc(businessAddress)}</p>
  </div>

  <div class="waiver-content">
    <p>Yo, <strong>${esc(data.clientName)}</strong>, mayor de edad, <strong>${esc(data.clientCivilStatus)}</strong>, <strong>${esc(data.clientOccupation)}</strong>, portador(a) de la <strong>${esc(getClientIdentificationTypeLabel(data.clientIdType))}</strong> número <strong>${esc(data.clientIdNumber)}</strong>, vecino(a) de <strong>${esc(data.clientAddress)}</strong>, denominado(a) como el "Cliente",</p>

    <p>en pleno uso de mis facultades, manifiesto:</p>

    <p>Por medio de la presente, libero y exonero de toda responsabilidad civil, penal, administrativa o de cualquier otra índole a <strong>${esc(legalName)}</strong>, cédula jurídica número <strong>${esc(legalId)}</strong>,</p>

    <p>con respecto al Tour a realizarse del <strong>${esc(formatDate(data.startDate))}</strong> al <strong>${esc(formatDate(data.endDate))}</strong>, con destino a <strong>${esc(data.destinationCountry)}</strong>.</p>

    <p>Asimismo, declaro y exonero de cualquier tipo de responsabilidad a <strong>${esc(legalName)}</strong>, conforme a lo siguiente:</p>

    <ul class="waiver-list">
      <li>He sido informado de los posibles riesgos asociados al Tour.</li>
      <li>Participo y adquiero el Tour de manera voluntaria y bajo mi propio riesgo.</li>
      <li>Asumo plena responsabilidad por mi participación y sus consecuencias.</li>
      <li>Renuncio expresa e irrevocablemente a cualquier reclamación, demanda o acción futura derivada de daños, enfermedades, lesiones, fallecimiento o pérdidas que pudieran ocurrir durante o como consecuencia del Tour.</li>
      <li>Cualquier tipo de enfermedad adquirida durante el Tour.</li>
      <li>Cualquier gasto médico o accidente durante el Tour.</li>
      <li>Cualquier robo, hurto, extravío de pertenencias, asalto o lesión durante el Tour.</li>
      <li>Atraso o pérdida de vuelos durante el Tour.</li>
      <li>Condiciones climatológicas adversas.</li>
      <li>Cierre de atracciones durante el Tour.</li>
      <li>Riñas o conflictos entre pasajeros o terceras personas.</li>
      <li>Eventualidades relacionadas con servicios prestados por terceros.</li>
      <li>Decisiones personales del Cliente durante el Tour.</li>
      <li>Desvíos de vuelos por emergencias aéreas.</li>
      <li>Problemas ocasionados por documentación falsa, incompleta o inválida.</li>
      <li>En caso de existir personal de acompañamiento, exonero de responsabilidad a la Agencia respecto a sus actuaciones fuera de su jornada laboral.</li>
      <li>Cualquier otra causa o evento no atribuible directamente a la Agencia.</li>
    </ul>

    <p>Este documento formará parte como anexo del CONTRATO DE VIAJE TURÍSTICO suscrito entre el Cliente y la Agencia de Viajes.</p>
  </div>

  <div class="waiver-signature-section">
    <p><strong>Cliente</strong></p>
    <div class="waiver-signature-line">____________________________________</div>
    <p>${esc(data.clientName)}</p>
    <p>${esc(getClientIdentificationTypeLabel(data.clientIdType))}: ${esc(data.clientIdNumber)}</p>
    <p>Fecha: ${esc(signatureDate)}</p>
  </div>
</section>`;
}
