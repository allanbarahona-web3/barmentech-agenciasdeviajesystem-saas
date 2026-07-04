/**
 * Signature Page Components
 * 
 * Reusable components for rendering signature pages with
 * client, companion, and company signature blocks.
 */

import { signatureBlock, companySignatureBlock } from "./template-helpers";

export interface SignerInfo {
  key: string;
  name: string;
  idType: string;
  idNumber: string;
  role: string;
  isClient?: boolean;
}

export interface CompanySignerInfo {
  representativeName: string;
  representativeId: string;
  tenantName: string;
  signatureSrc: string;
}

/**
 * Generate signature page with client, companions, and company signatures
 */
export const signaturePage = (
  signers: SignerInfo[],
  companySigner: CompanySignerInfo,
  signatureDate: string,
): string => {
  const signerBlocks = signers
    .map((signer) =>
      signatureBlock({
        signerKey: signer.key,
        name: signer.name,
        idType: signer.idType,
        idNumber: signer.idNumber,
        role: signer.role,
        label: signer.isClient ? "Firma del cliente" : "Firma del acompañante",
        date: signatureDate,
      }),
    )
    .join("\n");

  const companyBlock = companySignatureBlock({
    representativeName: companySigner.representativeName,
    representativeId: companySigner.representativeId,
    tenantName: companySigner.tenantName,
    signatureSrc: companySigner.signatureSrc,
    date: signatureDate,
  });

  return `
<section class="sig-page">
  <h2 class="sig-page-title">Firmas</h2>
  <div class="sig-grid">
    ${signerBlocks}
    ${companyBlock}
  </div>
</section>`;
};

/**
 * Generate minor authorization annex page
 */
export const minorAuthorizationAnnex = (params: {
  annexNumber: string;
  contractNumber: string;
  minorName: string;
  minorId: string;
  destination: string;
  startDate: string;
  endDate: string;
  tutorName: string;
  tutorIdType: string;
  tutorId: string;
  responsibleAdultName: string;
  responsibleAdultIdType: string;
  responsibleAdultId: string;
  tenantName: string;
  issuedAt: string;
}): string => {
  const { escapeHtml: esc } = require("./template-helpers");
  
  return `
<section class="annex-page">
  <h2>ANEXO DE AUTORIZACIÓN PARA VIAJE DE MENOR DE EDAD</h2>
  <p><strong>Número de anexo:</strong> ${esc(params.annexNumber)}</p>
  <p><strong>Contrato Número:</strong> ${esc(params.contractNumber)}</p>
  <p>Este anexo complementa el CONTRATO GENERAL DE VIAJE TURÍSTICO N. ${esc(params.contractNumber)} y documenta la autorización del tutor/patria potestad para el menor indicado.</p>

  <section class="annex-clause">
    <p><strong>PRIMERO: DATOS DEL MENOR</strong></p>
    <ul>
      <li>Menor: ${esc(params.minorName)}</li>
      <li>Identificación: ${esc(params.minorId)}</li>
      <li>Destino del Tour: ${esc(params.destination)}</li>
      <li>Fechas del Tour: ${esc(params.startDate)} a ${esc(params.endDate)}</li>
    </ul>
  </section>

  <section class="annex-clause">
    <p><strong>SEGUNDO: DATOS DE QUIEN EJERCE PATRIA POTESTAD / TUTOR LEGAL</strong></p>
    <ul>
      <li>Nombre completo: ${esc(params.tutorName)}</li>
      <li>Identificación: ${esc(params.tutorIdType)} ${esc(params.tutorId)}</li>
      <li>Teléfono de contacto: -</li>
    </ul>
  </section>

  <section class="annex-clause">
    <p><strong>TERCERO: ADULTO RESPONSABLE QUE ACOMPAÑA AL MENOR</strong>
    <ul>
      <li>Nombre completo: ${esc(params.responsibleAdultName)}</li>
      <li>Identificación: ${esc(params.responsibleAdultIdType)} ${esc(params.responsibleAdultId)}</li>
      <li>Teléfono de contacto: -</li>
    </ul>
  </section>

  <section class="annex-clause">
    <p><strong>CUARTO: DECLARACIÓN DE AUTORIZACIÓN</strong></p>
    <p>La persona firmante, en su condición de tutor legal y/o quien ejerce la patria potestad, declara bajo fe de juramento que cuenta con facultades legales suficientes para autorizar el viaje del menor e identifica expresamente a ${esc(params.responsibleAdultName)} como el adulto responsable que acompañará al menor durante el viaje. Asimismo, exonera a ${esc(params.tenantName)} de responsabilidad por información inexacta o documentación insuficiente aportada por el representante.</p>
  </section>

  <section class="annex-clause">
    <p><strong>QUINTO: DOCUMENTO DE RESPALDO</strong></p>
    <p>Este anexo debe estar acompañado por el permiso notarial, judicial o documento equivalente exigido por la normativa migratoria aplicable.</p>
  </section>

  <section class="annex-sigs">
    <div class="annex-sig-col">
      <p class="annex-sig-line">______________________________</p>
      <p><strong>1) Tutor legal / Patria potestad</strong></p>
      <p>${esc(params.tutorName)}</p>
      <p>${esc(params.tutorIdType)}: ${esc(params.tutorId)}</p>
    </div>
    <div class="annex-sig-col">
      <p class="annex-sig-line">______________________________</p>
      <p><strong>2) Adulto autorizado que acompaña al menor</strong></p>
      <p>${esc(params.responsibleAdultName)}</p>
      <p>${esc(params.responsibleAdultIdType)}: ${esc(params.responsibleAdultId)}</p>
    </div>
  </section>
  <p><strong>Fecha de emisión:</strong> ${esc(params.issuedAt)}</p>
</section>`;
};
