/**
 * Document Template Styles
 * 
 * Shared CSS styles for PDF document generation.
 * Optimized for A4 portrait printing with proper page breaks and margins.
 * 
 * Key features:
 * - A4 portrait format (210mm x 297mm)
 * - Print-optimized margins (22mm top, 18mm right, 24mm bottom, 20mm left)
 * - Screen preview with shadow effect
 * - Page break controls for signatures and annexes
 * - Consistent typography and spacing
 */

export const documentStyles = (): string => `
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

.doc-title {
  font-size: 11pt;
  font-weight: 700;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 12pt 0 8pt;
}

.doc-metadata {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
  margin-bottom: 10pt;
}

.doc-metadata td {
  padding: 2pt 6pt;
  vertical-align: top;
}

.doc-metadata td:first-child {
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
  page-break-after: always;
  break-after: page;
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

.doc-footer {
  margin-top: 18pt;
  padding-top: 8pt;
  border-top: 0.75pt solid #555;
  color: #333;
  font-size: 8.5pt;
  line-height: 1.4;
  text-align: center;
}

.doc-footer strong,
.doc-footer span {
  display: block;
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
`;
