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
  /** If false, parent handles listening (avoids two loops at once). Default true. */
  autoAudition?: boolean;
  /** Rejilla de imán para el drag (s, típicamente medio beat). undefined = sin imán. */
  snapSec?: number;
  /** Si existe, el drag mueve una ventana fija en vez de cambiar su duración. */
  fixedDurationSec?: number;
}

const BAND_COLORS = [
  "rgba(217,70,239,0.45)", // fuchsia
  "rgba(34,211,238,0.40)", // cyan
  "rgba(250,204,21,0.38)", // yellow
  "rgba(74,222,128,0.38)", // green
  "rgba(251,146,60,0.38)", // orange
  "rgba(244,114,182,0.38)", // pink
  "rgba(96,165,250,0.38)", // blue
  "rgba(167,139,250,0.38)", // violet
];

const BAND_SOLID = [
  "#d946ef",
  "#22d3ee",
  "#facc15",
  "#4ade80",
  "#fb923c",
  "#f472b6",
  "#60a5fa",
  "#a78bfa",
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
  autoAudition = true,
  snapSec,
  fixedDurationSec,
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

    const t2x = (t: number) => (t / duration) * w;

    // Carriles escalonados para los candidatos (arriba, uno por fila, sin solaparse)
    const maxLanes = Math.min(6, candidates.length || 1);
    const laneH = Math.min(13, Math.max(8, h * 0.15));
    const lanesH = maxLanes * laneH;
    const waveTop = lanesH + 2;
    const waveH = Math.max(10, h - waveTop - 4);
    const waveMid = waveTop + waveH / 2;
    const sorted = [...candidates].sort((a, b) => a.start - b.start);
    sorted.forEach((c, i) => {
      const x0 = t2x(c.start);
      const x1 = t2x(c.end);
      const lane = i % maxLanes;
      const y = lane * laneH;
      const on = c === selected;
      ctx.fillStyle = on ? "rgba(217,70,239,0.55)" : BAND_COLORS[i % BAND_COLORS.length];
      ctx.fillRect(x0, y + 1, Math.max(2, x1 - x0), laneH - 2);
      if (on) {
        ctx.strokeStyle = "#e879f9";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 + 0.5, y + 1.5, Math.max(2, x1 - x0) - 1, laneH - 3);
      } else {
        ctx.strokeStyle = BAND_SOLID[i % BAND_SOLID.length];
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x0 + 0.5, y + 1.5, Math.max(2, x1 - x0) - 1, laneH - 3);
      }
    });

    // Selección fuera de los candidatos (toda la canción o recorte manual)
    const custom = selected && !candidates.includes(selected) ? selected : null;
    if (custom) {
      const x0 = t2x(custom.start);
      const x1 = t2x(custom.end);
      ctx.fillStyle = "rgba(217,70,239,0.35)";
      ctx.fillRect(x0, waveTop, Math.max(2, x1 - x0), waveH);
      ctx.strokeStyle = "#e879f9";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, waveTop + 0.5, Math.max(2, x1 - x0) - 1, waveH - 1);
    }

    // Región en curso (arrastrando en modo recorte)
    if (dragRegion) {
      const x0 = t2x(Math.min(dragRegion.a, dragRegion.b));
      const x1 = t2x(Math.max(dragRegion.a, dragRegion.b));
      ctx.fillStyle = "rgba(34,211,238,0.30)";
      ctx.fillRect(x0, waveTop, Math.max(2, x1 - x0), waveH);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, waveTop + 0.5, Math.max(2, x1 - x0) - 1, waveH - 1);
    }
    // Waveform
    const { min, max } = peaks;
    const scale = w / min.length;
    ctx.fillStyle = "#71717a";
    for (let c = 0; c < min.length; c++) {
      const y0 = waveMid - max[c] * (waveH / 2) * 0.92;
      const y1 = waveMid - min[c] * (waveH / 2) * 0.92;
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

  const fixedRegionAt = useCallback(
    (centerTime: number): { a: number; b: number } => {
      const fixed = Math.min(duration, Math.max(0.05, fixedDurationSec ?? duration));
      const start = Math.max(0, Math.min(centerTime - fixed / 2, duration - fixed));
      return { a: start, b: start + fixed };
    },
    [duration, fixedDurationSec]
  );

  /** Candidato bajo el cursor (solo si el clic cae dentro de su rango de tiempo) */
  const bandAt = useCallback(
    (t: number): LoopCandidate | null =>
      candidates.find((c) => t >= c.start && t <= c.end) ?? null,
    [candidates]
  );

  /** Clic corto (<0.5s): selecciona/audiciona la banda bajo el cursor en cualquier modo */
  const onPointerClick = useCallback(
    (t: number) => {
      const hit = bandAt(t);
      if (!hit) return;
      if (hit === selected && auditioning) {
        stopAudition();
        return;
      }
      onSelect(hit);
      if (autoAudition) startAudition(hit);
    },
    [bandAt, selected, auditioning, onSelect, startAudition, stopAudition, autoAudition]
  );

  /** Modo recorte: arrastrar define la región; clic corto selecciona banda */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = timeAt(e);
      setDragRegion(
        trimMode && fixedDurationSec
          ? fixedRegionAt(dragStartRef.current)
          : { a: dragStartRef.current, b: dragStartRef.current }
      );
    },
    [timeAt, trimMode, fixedDurationSec, fixedRegionAt]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStartRef.current == null) return;
    const current = timeAt(e);
    setDragRegion(
      trimMode && fixedDurationSec
        ? fixedRegionAt(current)
        : { a: dragStartRef.current, b: current }
    );
  }, [timeAt, trimMode, fixedDurationSec, fixedRegionAt]);

  /** Imanar un tiempo a la rejilla del beat si queda cerca (tolerancia 120 ms o 30% del paso) */
  const snapT = useCallback(
    (t: number): number => {
      if (!snapSec || snapSec <= 0) return t;
      const snapped = Math.round(t / snapSec) * snapSec;
      const tol = Math.max(0.12, snapSec * 0.3);
      if (Math.abs(snapped - t) > tol) return t;
      return Math.max(0, Math.min(duration, snapped));
    },
    [snapSec, duration]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragStartRef.current == null) return;
      const a = dragStartRef.current;
      const b = timeAt(e);
      dragStartRef.current = null;
      setDragRegion(null);
      if (trimMode && fixedDurationSec) {
        const raw = fixedRegionAt(b);
        const fixed = raw.b - raw.a;
        const start = Math.max(0, Math.min(snapT(raw.a), duration - fixed));
        const region: LoopCandidate = {
          start,
          end: start + fixed,
          duration: fixed,
          score: 100,
          label: "Selección manual",
        };
        onSelect(region);
        if (autoAudition) startAudition(region);
        return;
      }
      if (Math.abs(b - a) < 0.5) {
        // Clic simple: seleccionar banda bajo el cursor (si hay)
        onPointerClick(b);
        return;
      }
      const s = snapT(Math.min(a, b));
      const en = snapT(Math.max(a, b));
      const region: LoopCandidate = {
        start: s,
        end: en,
        duration: Math.max(0.5, en - s),
        score: 100,
      };
      onSelect(region);
      if (autoAudition) startAudition(region);
    },
    [timeAt, onSelect, startAudition, autoAudition, onPointerClick, snapT, trimMode, fixedDurationSec, fixedRegionAt, duration]
  );

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        data-testid="loop-waveform"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`w-full h-24 rounded-lg bg-zinc-950 border border-zinc-800 ${
          trimMode ? "cursor-crosshair" : "cursor-pointer"
        }`}
      />
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>
          {trimMode
            ? fixedDurationSec
              ? "✂️ Arrastra para colocar el fragmento; su duración permanece fija"
              : "✂️ Arrastra sobre la onda para recortar a mano · clic en una banda (arriba) para elegir un loop"
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
