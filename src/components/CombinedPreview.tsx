"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFrames } from "@/lib/frameExtractor";
import { applyLoopMode } from "@/lib/loopProcessor";
import {
  buildGlobalPalette,
  needsGeneratedPalette,
  paletteSizeFor,
  styleFrame,
} from "@/lib/styleFilter";
import { toImageData } from "@/lib/toImageData";
import {
  buildGraph,
  ensureReverbWorklet,
  liveUpdateGraph,
  type Graph,
  type ReverbSettings,
} from "@/lib/audioEngine";
import type { RawFrame, StyleSettings, TrimRange } from "@/lib/types";

interface Props {
  /** Frames de un GIF YA generado (sesión): se usan tal cual, sin re-procesar */
  sessionFrames?: RawFrame[] | null;
  sessionFps?: number;
  /** Ruta manual: video fuente a procesar */
  videoFile: File | null;
  audioBuffer: AudioBuffer | null;
  /** Ajustes completos del audio; null = audio original sin efectos */
  audioSettings: ReverbSettings | null;
  trim: TrimRange;
  fps: number;
  width: number;
  loopMode: string;
  fadePercent: number;
  style: StyleSettings;
}

type Transport = "stopped" | "playing" | "paused";

const MAX_FRAMES = 60;
const PREVIEW_WIDTH = 360;

/**
 * Previsualización en tiempo real del resultado final: los frames del loop
 * (del GIF de sesión o procesados al vuelo) se reproducen en ciclo mientras
 * suena el audio con sus efectos. Exactamente lo que exportará el MP4.
 */
export default function CombinedPreview({
  sessionFrames,
  sessionFps,
  videoFile,
  audioBuffer,
  audioSettings,
  trim,
  fps,
  width,
  loopMode,
  fadePercent,
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<RawFrame[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const plainGainRef = useRef<GainNode | null>(null);
  const startClockRef = useRef(0);
  const rafRef = useRef(0);

  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [info, setInfo] = useState("");
  const [transport, setTransport] = useState<Transport>("stopped");
  const [progress, setProgress] = useState(0);

  const outFps = sessionFrames ? (sessionFps ?? fps) : fps;
  const audioDur = audioBuffer
    ? audioSettings
      ? audioBuffer.duration / audioSettings.speed
      : audioBuffer.duration
    : 0;

  // ---- Pipeline de frames ----
  // Ruta sesión: frames ya listos (derivado, sin estado extra).
  const sessionReady = !!sessionFrames && sessionFrames.length > 0;
  const sessionInfo = sessionReady
    ? `${sessionFrames!.length} frames de tu GIF · ciclo ${(
        sessionFrames!.length / (sessionFps ?? fps)
      ).toFixed(1)}s · audio ${audioDur.toFixed(0)}s`
    : "";

  useEffect(() => {
    if (!sessionReady) return;
    // Solo efectos imperativos: ref + canvas
    framesRef.current = sessionFrames!;
    const canvas = canvasRef.current;
    if (canvas) {
      const f = sessionFrames![0];
      canvas.width = f.width;
      canvas.height = f.height;
      canvas.getContext("2d")?.putImageData(toImageData(f), 0, 0);
    }
  }, [sessionReady, sessionFrames]);

  useEffect(() => {
    if (sessionReady || !videoFile) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const dur = Math.max(0.2, trim.end - trim.start);
        let pf = fps;
        if (dur * pf > MAX_FRAMES) pf = Math.max(4, Math.floor(MAX_FRAMES / dur));
        if (cancelled) return;

        const { frames } = await extractFrames(videoFile, {
          start: trim.start,
          end: trim.end,
          fps: pf,
          width: Math.min(width, PREVIEW_WIDTH),
        });
        if (cancelled) return;

        const loopFrames = applyLoopMode(frames, loopMode as never, fadePercent);
        const pal = needsGeneratedPalette(style)
          ? buildGlobalPalette(loopFrames, paletteSizeFor(style))
          : null;
        const styled: RawFrame[] = [];
        for (let i = 0; i < loopFrames.length; i++) {
          if (cancelled) return;
          styled.push(styleFrame(loopFrames[i], style, pal));
          if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
        }
        if (cancelled) return;

        framesRef.current = styled;
        setInfo(
          `${styled.length} frames · loop de ${(styled.length / pf).toFixed(1)}s · audio ${audioDur.toFixed(0)}s`
        );
        setStatus("ready");

        const canvas = canvasRef.current;
        if (canvas && styled.length > 0) {
          const f = styled[0];
          canvas.width = f.width;
          canvas.height = f.height;
          canvas.getContext("2d")?.putImageData(toImageData(f), 0, 0);
        }
      } catch {
        if (!cancelled) setInfo("No se pudo generar la previsualización");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // audioDur excluido: no debe regenerar frames al cambiar velocidad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, videoFile, trim.start, trim.end, fps, width, loopMode, fadePercent, style]);

  // ---- Ajustes de audio en vivo mientras suena ----
  useEffect(() => {
    const ctx = ctxRef.current;
    const graph = graphRef.current;
    if (ctx && graph && transport !== "stopped" && audioSettings) {
      liveUpdateGraph(ctx, graph, audioSettings);
    }
  }, [audioSettings, transport]);

  const drawLoop = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const frames = framesRef.current;
    if (frames.length === 0) return;

    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    let idx = -1;
    const step = () => {
      const elapsed = ctx.currentTime - startClockRef.current;
      const i = Math.floor(elapsed * outFps) % frames.length;
      if (i !== idx) {
        idx = i;
        c2d.putImageData(toImageData(frames[i]), 0, 0);
      }
      const p = Math.min(elapsed / Math.max(audioDur, 0.1), 1);
      setProgress(p);
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, [outFps, audioDur]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (srcRef.current) {
      srcRef.current.onended = null;
      try {
        srcRef.current.stop();
      } catch {
        /* noop */
      }
      srcRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close();
      ctxRef.current = null;
    }
    graphRef.current = null;
    plainGainRef.current = null;
    setTransport("stopped");
    setProgress(0);
  }, []);

  const play = useCallback(async () => {
    if (!audioBuffer || framesRef.current.length === 0) return;
    if (transport === "paused" && ctxRef.current) {
      void ctxRef.current.resume();
      drawLoop();
      setTransport("playing");
      return;
    }
    stopPlayback();
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    srcRef.current = src;

    if (audioSettings) {
      await ensureReverbWorklet(ctx);
      graphRef.current = buildGraph(ctx, audioBuffer, audioSettings, ctx.destination);
    } else {
      const g = ctx.createGain();
      src.connect(g).connect(ctx.destination);
      plainGainRef.current = g;
    }

    src.onended = () => {
      if (ctxRef.current === ctx) stopPlayback();
    };
    src.start();
    startClockRef.current = ctx.currentTime;
    drawLoop();
    setTransport("playing");
  }, [audioBuffer, audioSettings, transport, drawLoop, stopPlayback]);

  const pause = useCallback(() => {
    if (ctxRef.current && transport === "playing") {
      void ctxRef.current.suspend();
      cancelAnimationFrame(rafRef.current);
      setTransport("paused");
    }
  }, [transport]);

  // Limpieza al desmontar o al cambiar archivos
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (srcRef.current) {
        srcRef.current.onended = null;
        try {
          srcRef.current.stop();
        } catch {
          /* noop */
        }
      }
      void ctxRef.current?.close();
    };
  }, [videoFile, audioBuffer]);

  if (!audioBuffer || (!sessionFrames && !videoFile)) return null;

  const canPlay = sessionReady || status === "ready";
  const readyInfo = sessionReady ? sessionInfo : status === "ready" ? info : "";

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          🔊 Previsualizar {sessionFrames ? "tu GIF" : "el loop"} + audio en tiempo real
        </h2>
        {transport !== "stopped" && (
          <button
            onClick={stopPlayback}
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
          >
            ⏹ Detener
          </button>
        )}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="rounded-lg border border-zinc-800 w-full h-auto bg-black"
          style={{ imageRendering: "pixelated" }}
        />
        {!sessionReady && status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
            <span className="text-sm animate-pulse">Preparando frames del loop…</span>
          </div>
        )}
      </div>

      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        readOnly
        className="w-full accent-fuchsia-500 cursor-default"
      />

      <div className="flex items-center gap-2">
        {transport === "playing" ? (
          <button
            onClick={pause}
            className="flex-1 py-2 rounded-lg font-semibold bg-fuchsia-600 hover:bg-fuchsia-500"
          >
            ⏸ Pausar
          </button>
        ) : (
          <button
            onClick={play}
            disabled={!canPlay}
            className="flex-1 py-2 rounded-lg font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40"
          >
            {transport === "paused" ? "▶ Continuar" : "▶ Reproducir juntos"}
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        {readyInfo ? `${readyInfo} — ` : ""}
        Mueve los controles mientras suena: se aplican al instante. Esto es
        exactamente lo que exportará el MP4.
      </p>
    </div>
  );
}
