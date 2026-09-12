"use client";

import { useCallback, useEffect, useState } from "react";

export interface Attachment {
  id: string;
  originalFileName: string;
  url?: string;
  mimeType: string;
}

interface AttachmentViewerProps {
  attachments: Attachment[];
  initialIndex?: number;
  onClose: () => void;
  resolveAttachmentUrl?: (attachment: Attachment, signal: AbortSignal) => Promise<string>;
}

export default function AttachmentViewer({
  attachments,
  initialIndex = 0,
  onClose,
  resolveAttachmentUrl,
}: AttachmentViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      attachments.flatMap((attachment) =>
        attachment.url ? [[attachment.id, attachment.url]] : [],
      ),
    ),
  );
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [attachmentLoadError, setAttachmentLoadError] = useState("");

  const current = attachments[currentIndex];
  const currentUrl = current?.url || (current ? resolvedUrls[current.id] : undefined);
  const isImage = current?.mimeType?.startsWith("image/");
  const isPDF = current?.mimeType === "application/pdf";

  const selectAttachment = useCallback((nextIndex: number) => {
    setCurrentIndex(nextIndex);
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!current || currentUrl || !resolveAttachmentUrl) return;

    const controller = new AbortController();

    void Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted) {
          setLoadingAttachmentId(current.id);
          setAttachmentLoadError("");
        }
        return resolveAttachmentUrl(current, controller.signal);
      })
      .then((url) => {
        if (!controller.signal.aborted) {
          setResolvedUrls((urls) => ({ ...urls, [current.id]: url }));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAttachmentLoadError(
            error instanceof Error ? error.message : "No se pudo cargar el documento.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingAttachmentId((attachmentId) =>
            attachmentId === current.id ? null : attachmentId,
          );
        }
      });

    return () => controller.abort();
  }, [current, currentUrl, resolveAttachmentUrl]);

  // Navegación con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) selectAttachment(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < attachments.length - 1) selectAttachment(currentIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, attachments.length, onClose, selectAttachment]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDownload = () => {
    if (!currentUrl) return;
    const link = document.createElement("a");
    link.href = currentUrl;
    link.download = current.originalFileName;
    link.target = "_blank";
    link.click();
  };

  if (!current) return null;

  return (
    <div className="attachment-viewer-overlay" onClick={onClose}>
      <div className="attachment-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="attachment-viewer-header">
          <div className="attachment-viewer-info">
            <span className="attachment-viewer-filename">{current.originalFileName}</span>
            {attachments.length > 1 && (
              <span className="attachment-viewer-counter">
                {currentIndex + 1} / {attachments.length}
              </span>
            )}
          </div>
          <div className="attachment-viewer-actions">
            <button onClick={handleDownload} className="viewer-btn" title="Descargar" disabled={!currentUrl}>
              ⬇️
            </button>
            <button onClick={onClose} className="viewer-btn viewer-btn-close" title="Cerrar (ESC)">
              ✕
            </button>
          </div>
        </div>

        {/* Controles de Zoom (solo para imágenes) */}
        {isImage && (
          <div className="attachment-viewer-zoom-controls">
            <button onClick={handleZoomOut} className="viewer-btn" disabled={zoomLevel <= 0.5} title="Alejar">
              🔍−
            </button>
            <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
            <button onClick={handleZoomIn} className="viewer-btn" disabled={zoomLevel >= 3} title="Acercar">
              🔍+
            </button>
            <button onClick={handleResetZoom} className="viewer-btn" title="Reset">
              ↺
            </button>
          </div>
        )}

        {/* Contenido */}
        <div
          className="attachment-viewer-content"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: zoomLevel > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        >
          {loadingAttachmentId === current.id ? (
            <div className="viewer-unsupported">
              <p>Cargando documento...</p>
            </div>
          ) : attachmentLoadError && !currentUrl ? (
            <div className="viewer-unsupported">
              <p>{attachmentLoadError}</p>
            </div>
          ) : isImage && currentUrl ? (
            <img
              src={currentUrl}
              alt={current.originalFileName}
              className="viewer-image"
              style={{
                transform: `scale(${zoomLevel}) translate(${position.x / zoomLevel}px, ${position.y / zoomLevel}px)`,
                transition: isDragging ? "none" : "transform 0.2s ease",
              }}
              draggable={false}
            />
          ) : isPDF && currentUrl ? (
            <iframe src={currentUrl} className="viewer-pdf" title={current.originalFileName} />
          ) : (
            <div className="viewer-unsupported">
              <p>Vista previa no disponible para este tipo de archivo.</p>
              <button onClick={handleDownload} className="viewer-btn-primary">
                📥 Descargar {current.originalFileName}
              </button>
            </div>
          )}
        </div>

        {/* Navegación (si hay múltiples archivos) */}
        {attachments.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button className="attachment-viewer-nav attachment-viewer-nav-prev" onClick={() => selectAttachment(currentIndex - 1)} title="Anterior (←)">
                ‹
              </button>
            )}
            {currentIndex < attachments.length - 1 && (
              <button className="attachment-viewer-nav attachment-viewer-nav-next" onClick={() => selectAttachment(currentIndex + 1)} title="Siguiente (→)">
                ›
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
