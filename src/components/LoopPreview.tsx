"use client";

import { useEffect, useRef, useState } from "react";
import { buildGifFrames, type PipelineStage } from "@/lib/gifPipeline";
import { toImageData } from "@/lib/toImageData";
import type { GifSettings, RawFrame, StyleSettings, TrimRange } from "@/lib/types";

interface Props {
  file: File | null;
  trim: TrimRange;
  gif: GifSettings;
  style: StyleSettings;
  maxColors: number;
}

const STAGE_LABEL: Record<PipelineStage, string> = {
  extract: "Extrayendo frames (resolución exacta)…",
  loop: "Detectando corte óptimo…",
  style: "Aplicando estilo…",
  quantize: "Cuantizando colores (idéntico al GIF final)…",
};

/**
 * Previsualización EXACTA del GIF: usa el mismo pipeline que la generación
 * (mismo ancho, fps, paleta global y cuantización gifenc), por lo que lo
 * que ves aquí es pixel-perfect al resultado.
 */
export default function LoopPreview({ file, trim, gif, style, maxColors }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<RawFrame[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [stage, setStage] = useState<PipelineStage>("extract");
  const [stageRatio, setStageRatio] = useState(0);
  const [info, setInfo] = useState("");
  const [playing, setPlaying] = useState(true);

  // ---- Pipeline exacto (compartido con la generación) ----
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await buildGifFrames(
          file,
          { trim, gif, style, maxColors },
          (s, r) => {
            if (cancelled) return;
            setStage(s);
            setStageRatio(r);
          }
        );
        if (cancelled) return;
        framesRef.current = res.rgbaFrames;
        const cycle = (res.rgbaFrames.length / res.fps).toFixed(1);
        const cut = res.autoCutSeconds != null ? ` · auto-corte en ${res.autoCutSeconds.toFixed(1)}s` : "";
        setInfo(
          `${res.rgbaFrames.length} frames · ${res.width}×${res.height}px · ciclo ${cycle}s · ${res.fps} fps${cut}`
        );
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setInfo("No se pudo previsualizar este recorte");
          setStatus("idle");
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file, trim, gif, style, maxColors]);

  // ---- Animación ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || status !== "ready" || !playing) return;
    if (frames.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const first = frames[0];
    if (canvas.width !== first.width || canvas.height !== first.height) {
      canvas.width = first.width;
      canvas.height = first.height;
    }

    let raf = 0;
    let idx = 0;
    let last = performance.now();
    const step = (now: number) => {
      const interval = 1000 / gif.fps;
      if (now - last >= interval) {
        last = now;
        idx = (idx + 1) % frames.length;
        ctx.putImageData(toImageData(frames[idx]), 0, 0);
      }
      raf = requestAnimationFrame(step);
    };
    ctx.putImageData(toImageData(frames[0]), 0, 0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [status, playing, gif.fps]);

  if (!file) return null;

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          👁 Preview exacto del GIF
          <span className="ml-2 text-xs font-normal text-green-400">pixel-perfect</span>
        </h2>
        {status === "ready" && (
          <button
            onClick={() => setPlaying((p) => !p)}
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
          >
            {playing ? "⏸ Pausar" : "▶ Reproducir"}
          </button>
        )}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="rounded-lg border border-zinc-800 w-full h-auto bg-black"
          style={{ imageRendering: "pixelated" }}
        />
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 rounded-lg">
            <span className="text-sm animate-pulse">{STAGE_LABEL[stage]}</span>
            <div className="w-48 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
              <div
                className="h-full bg-fuchsia-500 transition-all"
                style={{ width: `${Math.round(stageRatio * 100)}%` }}
              />
            </div>
          </div>
        )}
        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg text-sm text-zinc-400">
            Ajusta el recorte para ver el preview
          </div>
        )}
      </div>

      {status === "ready" && (
        <p className="text-xs text-zinc-400">{info} — exactamente lo que se exportará</p>
      )}
      {status === "idle" && info && <p className="text-xs text-red-400">{info}</p>}
    </div>
  );
}
