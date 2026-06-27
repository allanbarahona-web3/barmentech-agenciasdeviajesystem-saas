// Componente de Canvas de firma
// Reutiliza lógica exacta de sign-contract.v3.js

"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface InkBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SignatureCanvasRef {
  clearCanvas: () => void;
  exportToPngBase64: () => Promise<string>;
  isDirty: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const SignatureCanvas = forwardRef<SignatureCanvasRef>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureDirty, setSignatureDirty] = useState(false);
  const lastPointRef = useRef<Point | null>(null);

  // ─── Inicialización del Canvas ────────────────────────────────────────────

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const width = wrap ? wrap.clientWidth || wrap.offsetWidth : 320;

    canvas.width = Math.max(width - 2, 280);
    canvas.height = 200;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#123f79";
    }
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  // ─── Funciones de Dibujo ─────────────────────────────────────────────────

  const getCanvasPoint = (e: PointerEvent | React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const drawSegment = (from: Point, to: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const beginDraw = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    setIsDrawing(true);
    setSignatureDirty(true);
    lastPointRef.current = getCanvasPoint(e.nativeEvent);

    const canvas = canvasRef.current;
    if (canvas && typeof (canvas as any).setPointerCapture === "function" && e.pointerId !== undefined) {
      (canvas as any).setPointerCapture(e.pointerId);
    }
  };

  const moveDraw = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const current = getCanvasPoint(e.nativeEvent);
    if (lastPointRef.current) {
      drawSegment(lastPointRef.current, current);
    }
    lastPointRef.current = current;
  };

  const endDraw = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  // ─── Algoritmo de Recorte (findInkBounds) ────────────────────────────────

  const findInkBounds = (canvas: HTMLCanvasElement): InkBounds | null => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alphaIndex = (y * canvas.width + x) * 4 + 3;
        if (data[alphaIndex] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }

    if (!found) return null;

    const pad = 6;
    return {
      x: Math.max(0, minX - pad),
      y: Math.max(0, minY - pad),
      w: Math.min(canvas.width, maxX + pad + 1) - Math.max(0, minX - pad),
      h: Math.min(canvas.height, maxY + pad + 1) - Math.max(0, minY - pad),
    };
  };

  // ─── Exportación a PNG Base64 ─────────────────────────────────────────────

  const canvasToPngBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        reject(new Error("Canvas no inicializado."));
        return;
      }

      const bounds = findInkBounds(canvas);
      if (!bounds) {
        reject(new Error("No hay firma dibujada."));
        return;
      }

      const out = document.createElement("canvas");
      out.width = bounds.w;
      out.height = bounds.h;

      const ctx = out.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo preparar la firma."));
        return;
      }

      ctx.drawImage(
        canvas,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h,
        0,
        0,
        bounds.w,
        bounds.h
      );

      const dataUrl = out.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];

      if (!base64) {
        reject(new Error("No se pudo exportar la firma."));
        return;
      }

      resolve(base64);
    });
  };

  // ─── Función de Borrado ──────────────────────────────────────────────────

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureDirty(false);
  };

  // ─── Exponer métodos al padre vía ref ────────────────────────────────────

  useImperativeHandle(ref, () => ({
    clearCanvas,
    exportToPngBase64: canvasToPngBase64,
    isDirty: signatureDirty,
  }));

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <canvas
      ref={canvasRef}
      className="sign-canvas"
      aria-label="Lienzo de firma"
      onPointerDown={beginDraw}
      onPointerMove={moveDraw}
      onPointerUp={endDraw}
      onPointerLeave={endDraw}
      onPointerCancel={endDraw}
      style={{
        display: "block",
        width: "100%",
        border: "1.5px dashed rgba(13, 34, 70, 0.24)",
        borderRadius: "10px",
        background: "#fbfdff",
        cursor: "crosshair",
        touchAction: "none",
      }}
    />
  );
});

SignatureCanvas.displayName = "SignatureCanvas";
