"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFrames } from "@/lib/frameExtractor";
import { crossfade } from "@/lib/loopProcessor";
import { toImageData } from "@/lib/toImageData";
import type { RawFrame } from "@/lib/types";

interface Props {
  videoFile: File | null;
  videoStart: number;
  videoEnd: number;
  videoMode: "cut" | "crossfade";
  crossfadeSec: number;
  audioBuffer: AudioBuffer | null;
  audioStart: number;
  audioEnd: number;
  syncMode: "repeat" | "speed";
}

type Transport = "stopped" | "playing" | "paused";

const PREVIEW_FPS = 15;
const PREVIEW_WIDTH = 480;
/** Techo de frames extraídos para el preview (segmentos largos bajan el fps) */
const MAX_PREVIEW_FRAMES = 240;

/**
 * Preview en tiempo real del loop de video + segmento de canción en bucle.
 * Aproximado (el render final es ffmpeg, exacto), pero fiel al resultado.
 */
export default function VideoLoopPreview({
  videoFile,
  videoStart,
  videoEnd,
  videoMode,
  crossfadeSec,
  audioBuffer,
  audioStart,
  audioEnd,
  syncMode,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<RawFrame[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startClockRef = useRef(0);
  const rafRef = useRef(0);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [transport, setTransport] = useState<Transport>("stopped");
  const [loadPct, setLoadPct] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Cambia al pulsar Reintentar para relanzar la extracción */
  const [retryKey, setRetryKey] = useState(0);
  const [progress, setProgress] = useState(0);
  const segDur = Math.max(0.1, videoEnd - videoStart);
  const audioDur = Math.max(0.1, audioEnd - audioStart);
  const factor = syncMode === "speed" ? audioDur / segDur : 1;
  /** fps efectivo del preview: reduce la carga en segmentos largos */
  const previewFps = Math.max(2, Math.min(PREVIEW_FPS, Math.floor(MAX_PREVIEW_FRAMES / segDur)));

  // ---- Frames del segmento (con debounce, progreso y error visible) ----
  useEffect(() => {
    if (!videoFile) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus("loading");
      setLoadPct(0);
      try {
        let { frames } = await extractFrames(
          videoFile,
          {
            start: videoStart,
            end: videoEnd,
            fps: previewFps,
            width: PREVIEW_WIDTH,
          },
          (r) => setLoadPct(r)
        );
        if (cancelled) return;
        if (videoMode === "crossfade") {
          frames = crossfade(frames, Math.round((crossfadeSec / segDur) * 100));
        }
        framesRef.current = frames;
        setStatus("ready");
        const canvas = canvasRef.current;
        if (canvas && frames.length) {
          canvas.width = frames[0].width;
          canvas.height = frames[0].height;
          canvas.getContext("2d")?.putImageData(toImageData(frames[0]), 0, 0);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setLoadError(e instanceof Error ? e.message : "No se pudo extraer los frames");
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile, videoStart, videoEnd, videoMode, crossfadeSec, retryKey]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (srcRef.current) {
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
    setTransport("stopped");
    setProgress(0);
  }, []);

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
      // En modo speed el video avanza más lento/rápido según el factor
      const frameInterval = (1 / previewFps) * factor;
      const i = Math.floor(elapsed / frameInterval) % frames.length;
      if (i !== idx) {
        idx = i;
        c2d.putImageData(toImageData(frames[i]), 0, 0);
      }
      setProgress(Math.min((elapsed % audioDur) / audioDur, 1));
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, [factor, audioDur, previewFps]);

  const play = useCallback(() => {
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
    src.loop = true;
    src.loopStart = audioStart;
    src.loopEnd = audioEnd;
    srcRef.current = src;
    src.connect(ctx.destination);
    src.start(0, audioStart);
    startClockRef.current = ctx.currentTime;
    drawLoop();
    setTransport("playing");
  }, [audioBuffer, audioStart, audioEnd, transport, drawLoop, stopPlayback]);

  const pause = useCallback(() => {
    if (ctxRef.current && transport === "playing") {
      void ctxRef.current.suspend();
      cancelAnimationFrame(rafRef.current);
      setTransport("paused");
    }
  }, [transport]);

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
  }, [videoFile, audioBuffer]);

  if (!videoFile || !audioBuffer) return null;

  const canPlay = status === "ready";

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">👀 Así quedaría el resultado (preview)</h2>
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
        />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
            <span className="text-sm animate-pulse">
              Preparando frames del loop… {Math.round(loadPct * 100)}%
            </span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 rounded-lg">
            <span className="text-sm text-red-300">⚠ {loadError}</span>
            <button
              onClick={() => {
                setLoadError(null);
                setRetryKey((k) => k + 1);
              }}
              className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              ↻ Reintentar
            </button>
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
        Video en loop ({segDur.toFixed(1)}s
        {syncMode === "speed" ? ` × ${factor.toFixed(2)} de velocidad` : `, repite cada ciclo`} +
        canción {audioDur.toFixed(1)}s en bucle. El render final es exacto con ffmpeg.
      </p>
    </div>
  );
}
