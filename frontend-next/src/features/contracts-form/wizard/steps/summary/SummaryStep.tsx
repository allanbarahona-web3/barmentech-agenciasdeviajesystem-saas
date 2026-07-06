export interface SummaryStepProps {
  isInternalTrip: boolean;
  savingDraft: boolean;
  submitting: boolean;
  previewing: boolean;
  busyNumber: boolean;
  contractNumber: string;
  status: string;
  previewHtml: string;
  latestSigningLinks: Array<{
    signerKey: string;
    signerName: string;
    signerEmail: string | null;
    signingUrl: string;
  }>;
  clientSigningLinks: Array<{
    signerKey: string;
    signerName: string;
    signerEmail: string | null;
    signingUrl: string;
  }>;
  companionSigningLinks: Array<{
    signerKey: string;
    signerName: string;
    signerEmail: string | null;
    signingUrl: string;
  }>;
  copiedSignerKey: string;
  saveDraftFlow: () => void;
  runPreviewFlow: () => void;
  runArchiveFlow: () => void;
  copySigningUrl: (url: string, signerKey: string) => void;
  buildWhatsappShareUrl: (url: string, name: string) => string;
}

export function SummaryStep({
  isInternalTrip,
  savingDraft,
  submitting,
  previewing,
  busyNumber,
  contractNumber,
  status,
  previewHtml,
  latestSigningLinks,
  clientSigningLinks,
  companionSigningLinks,
  copiedSignerKey,
  saveDraftFlow,
  runPreviewFlow,
  runArchiveFlow,
  copySigningUrl,
  buildWhatsappShareUrl,
}: SummaryStepProps) {
  return (
    <>
      {/* Final action buttons */}
      <div className="flex gap-2 flex-wrap mt-3.5">
        <button
          type="button"
          className="btn-secondary"
          disabled={savingDraft || submitting || previewing || busyNumber || !contractNumber}
          onClick={() => {
            void saveDraftFlow();
          }}
        >
          {savingDraft ? "Guardando borrador..." : (isInternalTrip ? "Guardar formulario como borrador" : "Guardar borrador")}
        </button>

        {!isInternalTrip && (
          <button
            type="button"
            className="btn-secondary"
            disabled={savingDraft || submitting || previewing || busyNumber || !contractNumber}
            onClick={() => {
              void runPreviewFlow();
            }}
          >
            {previewing ? "Generando vista previa..." : "Vista previa"}
          </button>
        )}

        <button
          type="button"
          className="btn-primary"
          disabled={savingDraft || submitting || previewing || busyNumber || !contractNumber}
          onClick={() => {
            void runArchiveFlow();
          }}
        >
          {submitting ? "Guardando..." : (isInternalTrip ? "Enviar formulario/comprobante" : "Guardar contrato y reportar reserva")}
        </button>
      </div>

      {/* Enlaces de Firma: SOLO para viajes internacionales */}
      {!isInternalTrip && latestSigningLinks.length ? (
        <div className="itinerary-box">
          <div className="itinerary-head">
            <h2>Enlaces de firma</h2>
          </div>

          {clientSigningLinks.length ? (
            <div className="itinerary-head" style={{ marginTop: 8 }}>
              <h3>Link principal del cliente</h3>
            </div>
          ) : null}
          <div className="itinerary-list">
            {clientSigningLinks.map((item) => (
              <article key={`${item.signerKey}-${item.signingUrl}`} className="subcard">
                <p>
                  <strong>{item.signerName || item.signerKey}</strong>
                  {item.signerEmail ? ` (${item.signerEmail})` : ""}
                </p>
                <div className="contracts-grid" style={{ marginTop: 8 }}>
                  <label className="col-span-full">
                    Link de firma
                    <input type="text" value={item.signingUrl} readOnly />
                  </label>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void copySigningUrl(item.signingUrl, item.signerKey);
                    }}
                  >
                    {copiedSignerKey === item.signerKey ? "✓ Copiado" : "Copiar link"}
                  </button>
                  <a
                    className="btn-secondary no-underline inline-flex items-center justify-center"
                    href={buildWhatsappShareUrl(item.signingUrl, item.signerName || item.signerKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Compartir por WhatsApp
                  </a>
                </div>
              </article>
            ))}

            {companionSigningLinks.length ? (
              <div className="itinerary-head" style={{ marginTop: 8 }}>
                <h3>Links de firma de acompanantes</h3>
              </div>
            ) : null}

            {companionSigningLinks.map((item) => (
              <article key={`${item.signerKey}-${item.signingUrl}`} className="subcard">
                <p>
                  <strong>{item.signerName || item.signerKey}</strong>
                  {item.signerEmail ? ` (${item.signerEmail})` : ""}
                </p>
                <div className="contracts-grid" style={{ marginTop: 8 }}>
                  <label className="col-span-full">
                    Link de firma
                    <input type="text" value={item.signingUrl} readOnly />
                  </label>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void copySigningUrl(item.signingUrl, item.signerKey);
                    }}
                  >
                    {copiedSignerKey === item.signerKey ? "✓ Copiado" : "Copiar link"}
                  </button>
                  <a
                    className="btn-secondary no-underline inline-flex items-center justify-center"
                    href={buildWhatsappShareUrl(item.signingUrl, item.signerName || item.signerKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Compartir por WhatsApp
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <p className="status-line">{status}</p>
    </>
  );
}

export interface SummaryPreviewPanelProps {
  isInternalTrip: boolean;
  previewHtml: string;
}

export function SummaryPreviewPanel({
  isInternalTrip,
  previewHtml,
}: SummaryPreviewPanelProps) {
  if (isInternalTrip) {
    return null;
  }

  return (
    <aside className="contracts-preview-panel">
      <section className="contract-preview-wrap">
        <div className="contract-preview-head">
          <h2>Vista previa del contrato</h2>
          <p>Formato de lectura tipo A4 para revisar y corregir sin salir del formulario.</p>
        </div>
        <div className="contract-preview-stage">
          {previewHtml ? (
            <iframe
              title="Vista previa del contrato"
              className="contract-preview-iframe"
              srcDoc={previewHtml}
            />
          ) : (
            <div className="contract-preview-placeholder">
              Completa los datos y pulsa Vista previa para mostrar el contrato aqui.
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
