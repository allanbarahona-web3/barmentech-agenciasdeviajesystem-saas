import { ContractFormState } from "@/features/contracts-form/types";

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (isoDate: string): string => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
};

const formatMoney = (value: string): string => {
  const amount = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
};

const escapeAttr = (value: unknown): string => esc(value);

const getResponsibleAdultIdentity = (
  state: ContractFormState,
  travelingWith: string,
): { idType: string; idNumber: string } => {
  if (travelingWith === state.clientFullName) {
    return {
      idType: state.clientIdType,
      idNumber: state.clientIdNumber,
    };
  }

  const companion = state.companions.find((item) => item.fullName === travelingWith);
  if (companion) {
    return {
      idType: companion.idType,
      idNumber: companion.idNumber,
    };
  }

  return { idType: "ID", idNumber: "" };
};

export type TenantLegalInfo = {
  name: string;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
  legalName: string | null;
  legalId: string | null;
  representativeName: string | null;
  representativeId: string | null;
  representativeTitle: string | null;
  representativeMaritalStatus: string | null;
  representativeAddress: string | null;
  representativePowers: string | null;
};

export type BankAccountForContract = {
  bankName: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  sinpeNumber?: string | null;
  accountHolderName: string;
};

export const buildContractPdfHtml = (
  state: ContractFormState,
  assets: { logoSrc: string | null; representativeSignSrc: string | null },
  tenantLegalInfo: TenantLegalInfo | null,
  bankAccounts: BankAccountForContract[] = [],
): string => {
  const signatureDate = formatDate(new Date().toISOString().slice(0, 10));
  const contractDestinationUpper = String(state.destination || "").trim().toLocaleUpperCase("es-CR");

  const v = (value: unknown) => `<span class="cv">${esc(String(value ?? "___"))}</span>`;
  const clause = (title: string, body: string) => `<section class="clause"><p><strong>${title}</strong></p>${body}</section>`;

  // Valores por defecto si no hay tenant legal info
  const tenantName = tenantLegalInfo?.name || "Agencia de Viajes";
  const contactPhone = tenantLegalInfo?.contactPhone || "N/A";
  const contactWhatsApp = tenantLegalInfo?.contactWhatsApp || "N/A";
  const contactEmail = tenantLegalInfo?.contactEmail || "contacto@agencia.com";
  const businessAddress = tenantLegalInfo?.businessAddress || "N/A";
  const legalName = tenantLegalInfo?.legalName || "___";
  const legalId = tenantLegalInfo?.legalId || "___";
  const repName = tenantLegalInfo?.representativeName || "___";
  const repId = tenantLegalInfo?.representativeId || "___";
  const repTitle = tenantLegalInfo?.representativeTitle || "___";
  const repMaritalStatus = tenantLegalInfo?.representativeMaritalStatus || "___";
  const repAddress = tenantLegalInfo?.representativeAddress || "___";
  const repPowers = tenantLegalInfo?.representativePowers || "___";

  const companionsIntro = state.companions.length
    ? `<section class="clause">
        <p>Adicionalmente, comparecen como acompañantes del Tour:</p>
        <ul>${state.companions
          .map(
            (person) =>
              `<li>${v(person.fullName)}, mayor de edad, ${v(person.civilStatus)}, ${v(person.profession)}, portador de ${v(person.idType)} número ${v(person.idNumber)}, vecino de ${v(person.address)}, correo electrónico ${v(person.email)}, teléfono ${v(person.phone)}, contacto de emergencia ${v(person.emergencyContactName)}, teléfono de emergencia ${v(person.emergencyContactPhone)}.</li>`,
          )
          .join("")}</ul>
      </section>`
    : "";

  const minorsIntro = state.minors.length
    ? `<section class="clause">
        <p>El Cliente declara que viaja con menor(es) de edad:</p>
        <ul>${state.minors
          .map(
            (minor) =>
              `<li>${v(minor.minorName)}, documento de menor número ${v(minor.minorId)}, en calidad de representado por ${v(minor.tutorName)}.</li>`,
          )
          .join("")}</ul>
        <p>La autorización y consentimiento de representación de menor de edad se incorpora como anexo obligatorio de este Contrato.</p>
      </section>`
    : "";

  const itineraryHtml = state.itinerary.length
    ? `<ul>${state.itinerary
        .map((item) => `<li>Fecha: ${v(formatDate(item.date))} | Actividad: ${v(item.detail)}</li>`)
        .join("")}</ul>`
    : "<p>Sin actividades registradas.</p>";

  const signerBlocks = [
    {
      signerKey: "client",
      name: state.clientFullName,
      idType: state.clientIdType,
      idNumber: state.clientIdNumber,
      role: "Cliente",
      imageBase64: null,
      isClient: true,
    },
    ...state.companions.map((companion, index) => ({
      signerKey: `companion-${index}`,
      name: companion.fullName,
      idType: companion.idType,
      idNumber: companion.idNumber,
      role: "Acompañante",
      imageBase64: null,
      isClient: false,
    })),
  ]
    .map(
      (person) => `
      <div class="sig-box">
        <div class="sig-area"
             data-signer-key="${escapeAttr(person.signerKey)}">
          <span class="sig-label">${person.isClient ? "Firma del cliente" : "Firma del acompañante"}</span>
          ${
            person.imageBase64
              ? `<img class="sig-img" src="${escapeAttr(person.imageBase64)}" alt="Firma de ${escapeAttr(person.name)}" />`
              : ""
          }
        </div>
        <p class="sig-name">${v(person.name)}</p>
        <p>${v(person.idType)}: ${v(person.idNumber)}</p>
        <p>${v(person.role)}</p>
        <p>Fecha: ${v(signatureDate)}</p>
      </div>`,
    )
    .join("");

  const karenBlock = `
    <div class="sig-box">
      <div class="sig-area sig-area--company" data-signer-key="company">
        <span class="sig-label">Firma del representante</span>
        <img class="sig-img sig-img--company"
              src="${escapeAttr(assets.representativeSignSrc || "/firmakaren.png")}" 
             alt="Firma de Karen Campos" />
      </div>
      <p class="sig-name">${esc(repName)}</p>
      <p>Cedula: ${esc(repId)}</p>
      <p>Representante legal de ${esc(tenantName)}</p>
      <p>Fecha: ${v(signatureDate)}</p>
    </div>`;

  const minorAnnexPages =
    state.hasMinorCompanion && state.minors.length > 0
      ? state.minors
          .map((minor, index) => {
            const adult = getResponsibleAdultIdentity(state, minor.travelingWith);
            return `
          <section class="annex-page">
            <h2>ANEXO DE AUTORIZACION PARA VIAJE DE MENOR DE EDAD ${index + 1}</h2>
            <p><strong>Numero de anexo:</strong> ANX-MEN-${esc(state.contractNumber)}-${String(index + 1).padStart(2, "0")}</p>
            <p><strong>Contrato Numero:</strong> ${esc(state.contractNumber)}</p>
            <p>Este anexo complementa el CONTRATO GENERAL DE VIAJE TURISTICO N. ${esc(state.contractNumber)} y documenta la autorizacion del tutor/patria potestad para el menor indicado.</p>

            <section class="annex-clause">
              <p><strong>PRIMERO: DATOS DEL MENOR</strong></p>
              <ul>
                <li>Menor: ${esc(minor.minorName)}</li>
                <li>Identificacion: ${esc(minor.minorId)}</li>
                <li>Destino del Tour: ${esc(state.destination)}</li>
                <li>Fechas del Tour: ${formatDate(state.startDate)} a ${formatDate(state.endDate)}</li>
              </ul>
            </section>

            <section class="annex-clause">
              <p><strong>SEGUNDO: DATOS DE QUIEN EJERCE PATRIA POTESTAD / TUTOR LEGAL</strong></p>
              <ul>
                <li>Nombre completo: ${esc(minor.tutorName)}</li>
                <li>Identificacion: ${esc(minor.tutorIdType || "ID")} ${esc(minor.tutorId)}</li>
                <li>Telefono de contacto: -</li>
              </ul>
            </section>

            <section class="annex-clause">
              <p><strong>TERCERO: ADULTO RESPONSABLE QUE ACOMPANA AL MENOR</strong></p>
              <ul>
                <li>Nombre completo: ${esc(minor.travelingWith)}</li>
                <li>Identificacion: ${esc(adult.idType)} ${esc(adult.idNumber)}</li>
                <li>Telefono de contacto: -</li>
              </ul>
            </section>

            <section class="annex-clause">
              <p><strong>CUARTO: DECLARACION DE AUTORIZACION</strong></p>
              <p>La persona firmante, en su condicion de tutor legal y/o quien ejerce la patria potestad, declara bajo fe de juramento que cuenta con facultades legales suficientes para autorizar el viaje del menor e identifica expresamente a ${esc(minor.travelingWith)} como el adulto responsable que acompanara al menor durante el viaje. Asimismo, exonera a ${esc(tenantName)} de responsabilidad por informacion inexacta o documentacion insuficiente aportada por el representante.</p>
            </section>

            <section class="annex-clause">
              <p><strong>QUINTO: DOCUMENTO DE RESPALDO</strong></p>
              <p>Este anexo debe estar acompanado por el permiso notarial, judicial o documento equivalente exigido por la normativa migratoria aplicable.</p>
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
                <p><strong>2) Adulto autorizado que acompana al menor</strong></p>
                <p>${esc(minor.travelingWith)}</p>
                <p>${esc(adult.idType)}: ${esc(adult.idNumber)}</p>
              </div>
            </section>
            <p><strong>Fecha de emision:</strong> ${formatDate(state.issuedAt)}</p>
          </section>`;
          })
          .join("")
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Contrato ${esc(state.contractNumber)} - ${esc(tenantName)}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: A4 portrait;
  margin: 22mm 18mm 24mm 20mm;
}

html, body {
  margin: 0;
  font-family: "Times New Roman", Times, serif;
  font-size: 11pt;
  color: #0a0a0a;
  background: #fff;
  line-height: 1.55;
}

@media screen {
  html, body {
    background: #e8ebf0;
    overflow-x: hidden;
  }

  body {
    width: 100%;
    max-width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 22mm 18mm 24mm 20mm;
    box-sizing: border-box;
    background: #fff;
    box-shadow: 0 8px 26px rgba(10, 22, 44, 0.24);
  }
}

.doc-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8pt;
  text-align: center;
  padding-bottom: 10pt;
  border-bottom: 1.5pt solid #0a0a0a;
  margin-bottom: 14pt;
}

.doc-header-logo {
  width: 110pt;
  height: auto;
  flex-shrink: 0;
}

.doc-header-text {
  width: 100%;
  text-align: center;
}

.doc-header-text h1 {
  font-size: 11.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3pt;
}

.doc-header-text .doc-meta {
  font-size: 9.5pt;
  color: #222;
  line-height: 1.4;
  text-align: center;
}

.contract-title {
  font-size: 11pt;
  font-weight: 700;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 12pt 0 8pt;
}

.contract-meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
  margin-bottom: 10pt;
}

.contract-meta td {
  padding: 2pt 6pt;
  vertical-align: top;
}

.contract-meta td:first-child {
  font-weight: 700;
  white-space: nowrap;
  width: 44mm;
}

.section-heading {
  font-size: 10pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 14pt 0 6pt;
  border-bottom: 0.75pt solid #555;
  padding-bottom: 2pt;
}

.clause {
  page-break-inside: avoid;
  break-inside: avoid;
  margin-bottom: 6pt;
}

.clause p, .clause li {
  font-size: 10.5pt;
  line-height: 1.55;
  margin-bottom: 3pt;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-align: justify;
}

.clause ul, .clause ol {
  margin: 4pt 0 4pt 16pt;
  padding: 0;
}

.clause li { margin-bottom: 2pt; }

.cv { font-weight: 700; color: #0a0a0a; }

.sig-page {
  page-break-before: always;
  break-before: page;
  page-break-inside: avoid;
  break-inside: avoid;
  padding-top: 10pt;
}

.sig-page-title {
  font-size: 11pt;
  font-weight: 700;
  text-transform: uppercase;
  text-align: center;
  margin-bottom: 18pt;
  letter-spacing: 0.04em;
}

.sig-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20pt;
  align-items: start;
}

.sig-box {
  min-width: 0;
  page-break-inside: avoid;
  break-inside: avoid;
}

.sig-area {
  height: 70pt;
  border-bottom: 1pt solid #0a0a0a;
  margin-bottom: 6pt;
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 4pt;
  overflow: hidden;
}

.sig-area--company {
  border: none;
  border-bottom: 1pt solid #0a0a0a;
  justify-content: center;
}

.sig-label {
  position: absolute;
  top: -8pt;
  left: 8pt;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #333;
  background: #fff;
  padding: 0 4pt;
}

.sig-img {
  max-width: 100%;
  max-height: 62pt;
  object-fit: contain;
  display: block;
}

.sig-img--company {
  max-width: 160pt;
  max-height: 62pt;
  margin: 0 auto;
}

.sig-name {
  font-weight: 700;
  font-size: 10pt;
  margin-bottom: 2pt;
}

.sig-box p {
  font-size: 9.5pt;
  line-height: 1.45;
  margin: 1pt 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.annex-page {
  page-break-before: always;
  break-before: page;
  padding-top: 10pt;
}

.annex-page h2 {
  font-size: 11pt;
  font-weight: 700;
  text-transform: uppercase;
  text-align: center;
  letter-spacing: 0.04em;
  margin-bottom: 12pt;
}

.annex-page p {
  font-size: 10.5pt;
  line-height: 1.55;
  margin-bottom: 3pt;
  text-align: justify;
}

.annex-page ul {
  margin: 4pt 0 4pt 16pt;
  padding: 0;
}

.annex-page li {
  font-size: 10.5pt;
  line-height: 1.5;
  margin-bottom: 2pt;
}

.annex-clause {
  page-break-inside: avoid;
  break-inside: avoid;
  margin-bottom: 6pt;
}

.annex-sigs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20pt;
  margin-top: 24pt;
  page-break-inside: avoid;
  break-inside: avoid;
}

.annex-sig-col p {
  font-size: 9.5pt;
  line-height: 1.45;
  margin: 2pt 0;
}

.annex-sig-line {
  font-size: 10pt;
  margin-bottom: 3pt !important;
}

@media print {
  html, body {
    background: #fff;
  }

  body {
    margin: 0;
    width: auto;
    min-height: auto;
    padding: 0;
    box-shadow: none;
  }

  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: inherit; text-decoration: none; }
}
</style>
</head>
<body>

<header class="doc-header">
  <img class="doc-header-logo"
  src="${escapeAttr(assets.logoSrc || "/assets/LOGO ALMANOVA.png")}" 
       alt="${esc(tenantName)}" />
  <div class="doc-header-text">
    <h1>${esc(tenantName)}</h1>
    <p class="doc-meta">
      ${legalId !== "___" ? `Cedula juridica: ${esc(legalId)} &nbsp;|&nbsp;` : ""}
      ${contactEmail !== "N/A" ? `${esc(contactEmail)} &nbsp;|&nbsp;` : ""}
      ${contactPhone !== "N/A" ? `Tel. ${esc(contactPhone)}` : ""}<br />
      Contrato N.° <strong>${esc(state.contractNumber)}</strong> &nbsp;|&nbsp;
      Emitido: ${esc(formatDate(state.issuedAt || new Date().toISOString().slice(0, 10)))} &nbsp;|&nbsp;
      Agente: ${esc(state.generatedByAgentName || "")}
    </p>
  </div>
</header>

<h2 class="contract-title">Contrato General de Viaje Turistico a ${esc(contractDestinationUpper)}</h2>

<table class="contract-meta">
  <tr><td>Numero de contrato:</td><td>${esc(state.contractNumber)}</td></tr>
  <tr><td>Destino:</td><td>${esc(state.destination)}</td></tr>
  <tr><td>Fechas del Tour:</td><td>${esc(formatDate(state.startDate))} al ${esc(formatDate(state.endDate))}</td></tr>
  <tr><td>Emitido el:</td><td>${esc(formatDate(state.issuedAt || new Date().toISOString().slice(0, 10)))}</td></tr>
</table>

<h3 class="section-heading">Partes</h3>

<section class="clause">
  <p>(a) <strong>${esc(repName)}</strong>, mayor, ${esc(repMaritalStatus)}, ${esc(repTitle)}, portadora de la cedula de identidad numero <strong>${esc(repId)}</strong>, vecina de ${esc(repAddress)}, en condicion de representante legal, con facultades de ${esc(repPowers)} de <strong>${esc(legalName)}</strong>, cedula juridica numero ${esc(legalId)}, en adelante denominada <strong>"${esc(tenantName)}"</strong>; y</p>
</section>

<section class="clause">
  <p>(b) ${v(state.clientFullName)}, mayor de edad, ${v(state.civilStatus)}, ${v(state.profession)}, portador de ${v(state.clientIdType)} numero ${v(state.clientIdNumber)}, vecino de ${v(state.clientAddress)}, correo electronico ${v(state.clientEmail)}, telefono ${v(state.clientPhone)}, contacto de emergencia ${v(state.emergencyContactName)}, telefono de emergencia ${v(state.emergencyContactPhone)}, en adelante denominado como el <strong>"Cliente"</strong>.</p>
</section>

${companionsIntro}
${minorsIntro}

<section class="clause">
  <p>Haciendo mencion a los comparecientes en conjunto, denominados como las <strong>"Partes"</strong>, hemos convenido en celebrar el presente <strong>CONTRATO GENERAL DE VIAJE TURISTICO</strong>, el cual se regira por las siguientes clausulas:</p>
</section>

<h3 class="section-heading">Clausulas</h3>

${clause(
  "PRIMERO: OBJETO.",
  `<p>El presente Contrato sera el documento base para regular las clausulas y condiciones referentes a la contratacion del paquete turistico internacional acordado entre las Partes.</p>`,
)}

${clause(
  "SEGUNDO: DESTINO.",
  `<p>El pais a visitar por parte del Cliente es ${v(state.destination)}, y manifiesta expresamente que dicho destino fue elegido y reservado de forma voluntaria para la realizacion del Tour.</p>`,
)}

${clause(
  "TERCERO: FECHAS DEL TOUR Y PLAZO.",
  `<p>Las fechas de ejecucion del Tour seran del ${v(formatDate(state.startDate))} al ${v(formatDate(state.endDate))}, mismas que se entenderan como plazo del presente Contrato.</p>`,
)}

${clause(
  "CUARTO: PRECIO, FORMA DE PAGO Y MEDIOS DE PAGO.",
  `<ul>
    <li>Precio total del Tour: USD ${v(formatMoney(state.totalAmount))}</li>
    <li>Pago inicial (reserva): USD ${v(formatMoney(state.reservationAmount))}</li>
    <li>Saldo pendiente: USD ${v(formatMoney(state.balanceAmount))}</li>
    <li>Saldo dividido en ${v(state.installmentCount)} cuota(s) ${state.paymentFrequency === "QUINCENAL" ? "quincenal(es)" : "mensual(es)"} de USD ${v(formatMoney(state.monthlyInstallmentAmount))}</li>
    <li>Ultima cuota ajustada: USD ${v(formatMoney(state.lastInstallmentAmount))}</li>
    <li>Fecha limite de pago total: ${v(formatDate(state.paymentDueDate))}</li>
  </ul>
  <p>Los medios de pago para realizar los pagos son los siguientes:</p>
  <ul>
    ${bankAccounts.length > 0 ? bankAccounts.map(account => {
      const parts = [];
      if (account.accountNumber) {
        parts.push(`<li>Cuenta bancaria ${account.accountType === "CUENTA_CORRIENTE" ? "corriente" : "ahorro"} (${account.currency}): ${esc(account.accountNumber)} - ${esc(account.bankName)}.</li>`);
      }
      if (account.sinpeNumber) {
        parts.push(`<li>Sinpe Movil: ${esc(account.sinpeNumber)} - ${esc(account.bankName)}.</li>`);
      }
      return parts.join('');
    }).join('') : `<li>Consultar con ${esc(tenantName)} las cuentas bancarias activas para realizar pagos.</li>`}
    <li>Pagos en efectivo o tarjeta en oficinas de ${esc(tenantName)}.</li>
  </ul>`,
)}

${clause(
  "QUINTO: DEPOSITO DE RESERVA.",
  `<p>La cuota de reserva inicial se utiliza como deposito minimo para reservar y garantizar el espacio del Cliente en el Tour y los operadores turisticos, por lo que dicho deposito no sera transferible, reutilizable ni reembolsable.</p>
  <p>En caso de incumplimiento en pagos, ${esc(tenantName)} podra notificar una fecha limite para poner al dia los montos. De mantenerse el incumplimiento, ${esc(tenantName)} podra excluir al Cliente del Tour y los dineros recibidos al momento no seran reembolsables.</p>`,
)}

${clause(
  "SEXTO: ALOJAMIENTOS Y HOSPEDAJES.",
  `<p>Como parte del Tour, el Cliente sera alojado en establecimientos tipo hostel, hotel u otros similares, conforme a la logistica del viaje, disponibilidad y condiciones operativas del proveedor.</p>
  <p>Como referencia de preferencia del Cliente, se registra tipo de hospedaje ${v(state.lodgingType)} y acomodacion solicitada ${v(state.accommodationType)}. Esta preferencia no constituye garantia absoluta y estara sujeta a disponibilidad y criterios operativos del Tour.</p>
  <p>La asignacion final de habitaciones y tipo de acomodacion sera determinada por ${esc(tenantName)} segun criterios operativos, pudiendo incluir habitaciones individuales, dobles, multiples o compartidas.</p>
  <p>El Cliente reconoce y acepta expresamente que la acomodacion podra implicar el uso de habitaciones compartidas con otros participantes del Tour, ya sean conocidos o no, asi como el uso de banos privados o compartidos, segun disponibilidad del hospedaje.</p>
  <p>${esc(tenantName)} podra modificar el hospedaje originalmente previsto, incluyendo cambios de establecimiento, categoria o tipo de habitacion, siempre que se mantengan condiciones razonables de servicio dentro del Tour contratado.</p>
  <p>Todo lo anterior estara sujeto a disponibilidad, necesidades operativas del Tour, asi como a casos fortuitos o de fuerza mayor.</p>`,
)}

${clause(
  "SEPTIMO: CHECK IN Y ASIGNACION DE ASIENTOS.",
  `<p>${esc(tenantName)} realizara el check in segun apertura de aerolinea. La asignacion de asientos la realiza la aerolinea de forma aleatoria.</p>
  <p>Equipaje permitido: ${v(state.luggageClause)}</p>`,
)}

${clause(
  "OCTAVO: SEGURO DE VIAJE.",
  `<p>${esc(tenantName)} podra colaborar con la adquisicion de seguro de viaje mediante agencia aliada Assist Card, siendo opcional para el Cliente.</p>
  <p>El Cliente acepta que, en caso de no contratar seguro con ${esc(tenantName)} o bien no contar con un seguro viajero propio durante el Tour en este mismo acto, exonera a ${esc(tenantName)} de toda responsabilidad por cualquier accidente, enfermedad, gasto medico, muerte o repatriacion.</p>
  <p>Asimismo, el Cliente declara que exime a ${esc(tenantName)}, en este mismo acto y en la medida permitida por ley, de responsabilidad por gastos medicos, hospitalarios, emergencias, cancelaciones, retrasos, perdida de equipaje u otras contingencias cubribles por el seguro de viaje.</p>`,
)}

${clause(
  "NOVENO: PERSONAL DE ACOMPANAMIENTO.",
  `<p>Dependiendo del Tour, ${esc(tenantName)} podra asignar personal de acompanamiento desde Costa Rica.</p>
  <p>El Cliente debe presentarse con al menos 3 horas de anticipacion al aeropuerto y con toda la documentacion requerida para viajar. ${esc(tenantName)} no sera responsable por llegada tardia, documentos vencidos o documentacion incompleta del Cliente.</p>`,
)}

${clause(
  "DECIMO: FICHA DE ACTIVIDADES E ITINERARIO.",
  `${itineraryHtml}
  <p>${esc(tenantName)} podra modificar itinerario, ruta, hospedajes u orden del Tour cuando sea necesario para seguridad, resguardo y ejecucion efectiva del servicio.</p>`,
)}

${clause(
  "DECIMO PRIMERO: TRANSPORTES.",
  `<p>${esc(tenantName)} brindara, por medio de terceros contratados, transportes relacionados con el Tour (vehiculo privado, microbus, colectivo o transporte publico). Todo transporte fuera de itinerario corre por cuenta del Cliente.</p>`,
)}

${clause(
  "DECIMO SEGUNDO: ALIMENTACION.",
  `<p>El Tour no incluye alimentacion, salvo indicacion expresa en la publicacion del tour o bien que el hospedaje indique que se incluye el desayuno con el hospedaje; por lo tanto, el Cliente debe asumir sus costos de alimentacion durante el tour.</p>`,
)}

${clause(
  "DECIMO TERCERO: CANCELACIONES, REEMBOLSOS, CREDITOS Y FUERZA MAYOR.",
  `<p><strong>13.1 Politica de Reembolsos y Plazos de Devolucion.</strong> En caso de que proceda un reembolso total o parcial por cualquier concepto relacionado con los servicios contratados, el Cliente acepta y reconoce que ${esc(tenantName)} dispondra de un plazo minimo de tres (3) meses y maximo de seis (6) meses calendario para efectuar dicha devolucion. El plazo comenzara a computarse a partir de la fecha en que ${esc(tenantName)} confirme formalmente la procedencia del reembolso.</p>
  <p>El Cliente acepta que este plazo responde a la operativa del sector turistico, incluyendo procesos de recuperacion de fondos con terceros proveedores como aerolineas, hoteles, operadores y servicios internacionales, los cuales no dependen directamente de ${esc(tenantName)}. El Cliente renuncia expresamente a cualquier reclamacion adicional, intereses, indemnizacion o penalizacion relacionada con el tiempo de espera dentro del plazo establecido.</p>
  <p><strong>13.2 Politica de Creditos a Favor (Voucher).</strong> Como alternativa al reembolso, ${esc(tenantName)} podra ofrecer al Cliente un credito a favor (voucher) equivalente al monto pagado, utilizable en futuros viajes, servicios o experiencias ofrecidas por la agencia. Este credito tendra una vigencia de hasta doce (12) meses y sera transferible previa autorizacion de ${esc(tenantName)}. La aceptacion del credito por parte del Cliente implica la renuncia al reembolso en dinero.</p>
  <p><strong>13.3 Responsabilidad frente a Terceros Proveedores.</strong> ${esc(tenantName)} actua como intermediario entre el Cliente y terceros proveedores (incluyendo, pero no limitado a, aerolineas, hoteles, operadores turisticos y transportistas). Por lo tanto, ${esc(tenantName)} no sera responsable por cancelaciones, retrasos, modificaciones, perdidas o incumplimientos atribuibles a dichos proveedores. Cualquier gestion de reembolso estara sujeta a las politicas y tiempos de respuesta de estos terceros.</p>
  <p><strong>13.4 Cancelaciones por Parte del Cliente.</strong> En caso de cancelacion voluntaria por parte del Cliente, los montos pagados podran estar sujetos a penalidades, cargos administrativos y condiciones de los proveedores. Si la cancelacion se realiza con menos de veintidos (22) dias calendario de antelacion a la fecha de inicio del viaje, aplicara una penalidad equivalente al diez por ciento (10%) del valor total del contrato. ${esc(tenantName)} no garantiza reembolsos en estos casos, pudiendo ofrecer unicamente creditos a favor segun la evaluacion del caso.</p>
  <p><strong>13.5 Fuerza Mayor.</strong> ${esc(tenantName)} no sera responsable por la imposibilidad total o parcial de prestar los servicios contratados cuando esto se deba a causas de fuerza mayor, incluyendo pero no limitado a: pandemias, conflictos politicos, desastres naturales, restricciones gubernamentales, huelgas, cancelaciones masivas o cualquier evento fuera del control razonable de la agencia. En estos casos, ${esc(tenantName)} podra reprogramar el servicio o emitir un credito a favor, sin obligacion inmediata de reembolso.</p>
  <p><strong>13.6 Aceptacion de Condiciones.</strong> Al contratar los servicios, el Cliente declara haber leido, entendido y aceptado todas las condiciones de esta clausula, incluyendo tiempos de reembolso, politicas de credito y limitaciones de responsabilidad.</p>`,
)}

${clause(
  "DECIMO CUARTO: DERECHOS Y OBLIGACIONES DEL CLIENTE.",
  `<p>El Cliente se obliga, entre otros, a pagar montos economicos segun contrato; brindar documentacion veraz y vigente; respetar horarios, itinerarios y normas de proveedores; resguardar pertenencias personales; asumir gastos no incluidos; y gestionar correctamente documentacion de menor(es), cuando aplique.</p>`,
)}

${clause(
  "DECIMO CUARTO BIS: CONDUCTA Y NORMAS DEL CLIENTE.",
  `<p>El Cliente se compromete a mantener una conducta respetuosa, adecuada y alineada con las normas de convivencia durante todo el desarrollo del tour, tanto con el personal de la Agencia como con otros participantes, proveedores y terceros.</p>
  <p>Queda estrictamente prohibido cualquier comportamiento que implique agresion verbal o fisica, discriminacion, acoso, consumo excesivo de sustancias que afecten la convivencia, incumplimiento de normas locales o cualquier accion que ponga en riesgo la operacion del tour o la experiencia del grupo.</p>
  <p>${esc(tenantName)} se reserva el derecho de excluir, sin derecho a reembolso alguno, a cualquier Cliente cuya conducta sea considerada inapropiada, riesgosa o perjudicial para el desarrollo del tour o la experiencia de terceros.</p>
  <p>Asimismo, cualquier gasto adicional derivado de dicha exclusion sera asumido en su totalidad por el Cliente.</p>`,
)}

${clause(
  "DECIMO QUINTO: DERECHOS Y OBLIGACIONES DE VIAJES ALMA NOVA.",
  `<p>${esc(tenantName)} se obliga, entre otros, a ejecutar el Tour contratado; contratar y pagar a proveedores del servicio; brindar acompanamiento contractual y soporte operativo; y gestionar check in cuando corresponda.</p>`,
)}

${clause(
  "DECIMO SEXTO: EXONERACION Y LIMITACION DE RESPONSABILIDAD.",
  `<p>El Cliente reconoce y acepta que la participacion en el tour implica riesgos inherentes propios de los viajes nacionales e internacionales, incluyendo, pero no limitado a, condiciones climaticas adversas, retrasos, cancelaciones, accidentes, enfermedades, situaciones politicas, sociales o sanitarias, y cualquier otro evento fuera del control razonable de la Agencia.</p>
  <p>En consecuencia, el Cliente exonera expresa e irrevocablemente a ${esc(tenantName)} de toda responsabilidad por danos, perdidas, lesiones, gastos medicos, retrasos, modificaciones de itinerario, perdida de equipaje, o cualquier otra contingencia que pueda surgir durante el desarrollo del tour, cuando estos no sean atribuibles directamente a dolo o culpa grave comprobada de la Agencia.</p>
  <p>Asimismo, el Cliente acepta que la Agencia no garantiza resultados subjetivos del viaje, tales como satisfaccion personal, experiencias individuales, condiciones climaticas especificas, calidad percibida de servicios de terceros, ni expectativas personales no estipuladas expresamente en el presente contrato.</p>
  <p>La responsabilidad total de la Agencia, en cualquier caso comprobado, se limitara exclusivamente al monto efectivamente pagado por el Cliente por los servicios contratados.</p>`,
)}

${clause(
  "DECIMO SEPTIMO: INTERMEDIACION Y RESPONSABILIDAD DE TERCEROS.",
  `<p>El Cliente reconoce que ${esc(tenantName)} actua exclusivamente como intermediario entre el Cliente y los distintos proveedores de servicios turisticos, incluyendo, pero no limitado a, aerolineas, hoteles, operadores turisticos, empresas de transporte y otros prestadores.</p>
  <p>En consecuencia, la Agencia no sera responsable por actos, omisiones, incumplimientos, retrasos, cancelaciones, sobreventas, cambios de itinerario, perdidas, danos o cualquier otra situacion atribuible a dichos proveedores.</p>
  <p>El Cliente acepta que cualquier reclamacion derivada de servicios prestados por terceros debera dirigirse directamente contra el proveedor correspondiente, conforme a sus propias politicas, terminos y condiciones.</p>`,
)}

${clause(
  "DECIMO OCTAVO: EMISION DE TIQUETES AEREOS.",
  `<p>El Cliente reconoce y acepta que la emision de los tiquetes aereos forma parte de la gestion operativa del Tour, la cual sera realizada por ${esc(tenantName)} conforme a criterios de disponibilidad, condiciones de mercado y coordinacion con proveedores.</p>
  <p>En ese sentido, la emision de los tiquetes aereos no necesariamente se realizara de forma inmediata al momento del pago de la reserva, pagos parciales o incluso la cancelacion total del Tour, pudiendo efectuarse en cualquier momento hasta un plazo maximo de cuarenta y ocho (48) horas previas al inicio del viaje.</p>
  <p>El Cliente entiende y acepta que la confirmacion de su espacio dentro del Tour es independiente del momento de emision de los tiquetes aereos, y que estos podran ser adquiridos en una fecha posterior segun condiciones operativas y comerciales.</p>
  <p>${esc(tenantName)} garantiza la prestacion del servicio de transporte aereo conforme a lo contratado, por lo que el Cliente renuncia a cualquier reclamo relacionado exclusivamente con el momento de emision de los tiquetes, siempre que los mismos sean entregados dentro del plazo indicado y el servicio sea efectivamente brindado.</p>`,
)}

${clause(
  "DECIMO NOVENO: MODIFICACIONES AL CONTRATO.",
  `<p>Toda modificacion debera formalizarse por escrito mediante adenda firmada por las Partes.</p>`,
)}

${clause(
  "VIGESIMO: RESOLUCION ALTERNA DE CONFLICTOS Y LEY APLICABLE.",
  `<p>Este Contrato se regira por la legislacion de la Republica de Costa Rica. Cualquier controversia intentara resolverse primero por via conciliatoria antes de acudir a la via judicial.</p>`,
)}

${clause(
  "VIGESIMO PRIMERO: CONFIDENCIALIDAD.",
  `<p>Toda informacion comercial, operativa y documental conocida con ocasion del Contrato sera tratada como confidencial durante su vigencia y por un ano adicional a su terminacion.</p>`,
)}

${clause(
  "VIGESIMO SEGUNDO: NOTIFICACIONES Y COMUNICACIONES.",
  `<ul>
    <li><strong>${esc(tenantName)}:</strong> ${contactEmail !== "N/A" ? esc(contactEmail) : "___"}${contactWhatsApp !== "N/A" ? ` y WhatsApp ${esc(contactWhatsApp)}` : ""}.</li>
    <li><strong>Cliente:</strong> Direccion ${v(state.clientAddress)}, correo ${v(state.clientEmail)} y telefono ${v(state.clientPhone)}.</li>
  </ul>`,
)}

${clause(
  "VIGESIMO TERCERO: INTEGRIDAD CONTRACTUAL.",
  `<p>Las Partes aceptan que este Contrato y sus anexos constituyen el acuerdo total entre ellas respecto del Tour contratado.</p>`,
)}

${clause(
  "VIGESIMO CUARTO: AUTORIZACION DE USO DE IMAGEN.",
  `<p>El Cliente autoriza de forma expresa, voluntaria y gratuita a ${esc(tenantName)} para captar, reproducir, publicar y utilizar su imagen, voz y/o apariencia en fotografias, videos o cualquier material audiovisual generado durante el desarrollo del tour.</p>
  <p>Dicho material podra ser utilizado con fines comerciales, publicitarios y promocionales en redes sociales, sitios web, campanas de marketing y cualquier otro medio de difusion de la Agencia, sin limitacion territorial ni temporal.</p>
  <p>El Cliente renuncia a cualquier compensacion economica derivada del uso de su imagen en los terminos aqui establecidos.</p>
  <p>En caso de no estar de acuerdo, el Cliente debera manifestarlo por escrito previo al inicio del tour.</p>`,
)}

<section class="clause">
  <p>En fe de lo anterior, las Partes declaran haber leido y comprendido integralmente el presente Contrato, aceptandolo en todas sus clausulas.</p>
</section>

<section class="sig-page">
  <h2 class="sig-page-title">Firmas - Contrato N.° ${esc(state.contractNumber)}</h2>
  <div class="sig-grid">
    ${signerBlocks}
    ${karenBlock}
  </div>
</section>

${minorAnnexPages}

</body>
</html>`;
};
