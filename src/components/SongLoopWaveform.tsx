"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoopCandidate } from "@/lib/companion";

interface Props {
  audioBuffer: AudioBuffer;
  candidates: LoopCandidate[];
  selected: LoopCandidate | null;
  onSelect: (c: LoopCandidate) => void;
  /** Modo recorte: arrastrar sobre la onda define la región */
  trimMode?: boolean;
}

const BAND_COLORS = [
  "rgba(217,70,239,0.28)", // fuchsia
  "rgba(34,211,238,0.25)", // cyan
  "rgba(250,204,21,0.22)", // yellow
  "rgba(74,222,128,0.22)", // green
  "rgba(251,146,60,0.22)", // orange
  "rgba(244,114,182,0.22)", // pink
  "rgba(96,165,250,0.22)", // blue
  "rgba(167,139,250,0.22)", // violet
];

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Waveform de la canción con las bandas de cada loop detectado.
 * Clic en una banda: la selecciona y la escucha en bucle.
 * Clic de nuevo o botón detener: corta la escucha.
 */
export default function SongLoopWaveform({
  audioBuffer,
  candidates,
  selected,
  onSelect,
  trimMode = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<{ min: Float32Array; max: Float32Array } | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);
  const [auditioning, setAuditioning] = useState(false);
  const [playT, setPlayT] = useState<number | null>(null);
  /** Región en curso durante el arrastre en modo recorte */
  const [dragRegion, setDragRegion] = useState<{ a: number; b: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);

  const duration = audioBuffer.duration;

  // ---- Cálculo de picos min/max por columna ----
  useEffect(() => {
    const cols = 1200;
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
    const step = ch0.length / cols;
    const min = new Float32Array(cols);
    const max = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      let lo = 1;
      let hi = -1;
      const s0 = Math.floor(c * step);
      const s1 = Math.min(ch0.length, Math.floor((c + 1) * step));
      // Muestreo con paso adaptado: suficiente para una vista general
      const stride = Math.max(1, Math.floor((s1 - s0) / 50));
      for (let i = s0; i < s1; i += stride) {
        const v = (ch0[i] + ch1[i]) / 2;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[c] = lo === 1 ? 0 : lo;
      max[c] = hi === -1 ? 0 : hi;
    }
    peaksRef.current = { min, max };
  }, [audioBuffer]);

  // ---- Dibujo ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const t2x = (t: number) => (t / duration) * w;

    // Bandas de candidatos
    candidates.forEach((c, i) => {
      const x0 = t2x(c.start);
      const x1 = t2x(c.end);
      ctx.fillStyle = c === selected ? "rgba(217,70,239,0.35)" : BAND_COLORS[i % BAND_COLORS.length];
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
      if (c === selected) {
        ctx.strokeStyle = "#e879f9";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 + 0.5, 0.5, Math.max(2, x1 - x0) - 1, h - 1);
      }
    });

    // Selección fuera de los candidatos (toda la canción o recorte manual)
    const custom = selected && !candidates.includes(selected) ? selected : null;
    if (custom) {
      const x0 = t2x(custom.start);
      const x1 = t2x(custom.end);
      ctx.fillStyle = "rgba(217,70,239,0.35)";
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
      ctx.strokeStyle = "#e879f9";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, 0.5, Math.max(2, x1 - x0) - 1, h - 1);
    }

    // Región en curso (arrastrando en modo recorte)
    if (dragRegion) {
      const x0 = t2x(Math.min(dragRegion.a, dragRegion.b));
      const x1 = t2x(Math.max(dragRegion.a, dragRegion.b));
      ctx.fillStyle = "rgba(34,211,238,0.30)";
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, 0.5, Math.max(2, x1 - x0) - 1, h - 1);
    }
    // Waveform
    const { min, max } = peaks;
    const scale = w / min.length;
    ctx.fillStyle = "#71717a";
    for (let c = 0; c < min.length; c++) {
      const y0 = mid - max[c] * mid * 0.92;
      const y1 = mid - min[c] * mid * 0.92;
      ctx.fillRect(c * scale, y0, Math.max(1, scale), Math.max(1, y1 - y0));
    }

    // Cursor de escucha
    if (playT != null) {
      const x = t2x(playT);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 1, 0, 2, h);
    }

    // Marcas de tiempo
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px system-ui";
    const tickStep = duration > 600 ? 120 : duration > 240 ? 60 : 30;
    for (let t = 0; t <= duration; t += tickStep) {
      const x = t2x(t);
      ctx.fillRect(x, h - 5, 1, 5);
      if (t > 0) ctx.fillText(fmt(t), x + 3, h - 6);
    }
  }, [candidates, selected, playT, duration, dragRegion]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // ---- Audición en bucle de un candidato ----
  const stopAudition = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (srcRef.current) {
      try {
        srcRef.current.stop();
      } catch {
        /* noop */
      }
      srcRef.current = null;
    }
    setAuditioning(false);
    setPlayT(null);
  }, []);

  const startAudition = useCallback(
    (c: LoopCandidate) => {
      stopAudition();
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.loop = true;
      src.loopStart = c.start;
      src.loopEnd = c.end;
      src.connect(ctx.destination);
      src.start(0, c.start);
      srcRef.current = src;
      setAuditioning(true);
      const t0 = ctx.currentTime;
      const tick = () => {
        const inLoop = ((ctx.currentTime - t0) * 1) % (c.end - c.start);
        setPlayT(c.start + inLoop);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [audioBuffer, stopAudition]
  );

  // Detener al desmontar
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (srcRef.current) {
        try {
          srcRef.current.stop();
        } catch {
          /* noop */
        }
      }
      void ctxRef.current?.close();
    };
  }, []);

  const timeAt = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): number => {
      const rect = e.currentTarget.getBoundingClientRect();
      return Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * duration, duration));
    },
    [duration]
  );

  /** Modo recorte: arrastrar define la región; al soltar se confirma */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!trimMode) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = timeAt(e);
      setDragRegion({ a: dragStartRef.current, b: dragStartRef.current });
    },
    [trimMode, timeAt]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStartRef.current == null) return;
    setDragRegion({ a: dragStartRef.current, b: timeAt(e) });
  }, [timeAt]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragStartRef.current == null) return;
      const a = dragStartRef.current;
      const b = timeAt(e);
      dragStartRef.current = null;
      setDragRegion(null);
      if (Math.abs(b - a) < 0.5) return; // demasiado corto: ignorar
      const region: LoopCandidate = {
        start: Math.min(a, b),
        end: Math.max(a, b),
        duration: Math.abs(b - a),
        score: 100,
      };
      onSelect(region);
      startAudition(region);
    },
    [timeAt, onSelect, startAudition]
  );

  /** Clic sobre la waveform: selecciona/audiciona el candidato bajo el cursor */
  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (trimMode) return; // en modo recorte manda el arrastre
      const rect = e.currentTarget.getBoundingClientRect();
      const t = ((e.clientX - rect.left) / rect.width) * duration;
      const hit =
        candidates.find((c) => t >= c.start && t <= c.end) ??
        candidates.reduce<LoopCandidate | null>(
          (best, c) =>
            best == null || Math.abs((c.start + c.end) / 2 - t) < Math.abs((best.start + best.end) / 2 - t)
              ? c
              : best,
          null
        );
      if (!hit) return;
      if (hit === selected && auditioning) {
        stopAudition();
        return;
      }
      onSelect(hit);
      startAudition(hit);
    },
    [candidates, duration, selected, auditioning, onSelect, startAudition, stopAudition, trimMode]
  );

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`w-full h-20 rounded-lg bg-zinc-950 border border-zinc-800 ${
          trimMode ? "cursor-crosshair" : "cursor-pointer"
        }`}
      />
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>
          {trimMode
            ? "✂️ Arrastra sobre la onda para elegir el trozo de canción"
            : "👆 Clic sobre una banda para escuchar ese loop"}
          {auditioning ? " · sonando en bucle" : ""}
        </span>
        {auditioning && (
          <button
            onClick={stopAudition}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            ⏹ Detener escucha
          </button>
        )}
      </div>
    </div>
  );
}
