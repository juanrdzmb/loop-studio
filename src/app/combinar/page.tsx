"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import TrimTimeline from "@/components/TrimTimeline";
import CombinedPreview from "@/components/CombinedPreview";
import { extractFrames } from "@/lib/frameExtractor";
import { applyLoopMode } from "@/lib/loopProcessor";
import {
  buildGlobalPalette,
  needsGeneratedPalette,
  paletteSizeFor,
  styleFrame,
} from "@/lib/styleFilter";
import { downloadBlob } from "@/lib/gifEncoder";
import {
  DEFAULT_SETTINGS,
  REVERB_PRESETS,
  SlowedReverbPlayer,
  renderSlowedReverb,
  type ReverbSettings,
} from "@/lib/audioEngine";
import { composeLoopVideo } from "@/lib/videoComposer";
import {
  studioStore,
  setAudioForSession,
  setGifResult,
  type GifSessionResult,
} from "@/lib/sessionStore";
import type { RawFrame, StylePresetId, StyleSettings } from "@/lib/types";

const STYLE_PRESETS: { id: StylePresetId; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "anime", label: "Anime Lo-Fi" },
  { id: "retro8bit", label: "8-Bit Retro" },
  { id: "gameboy", label: "Game Boy" },
  { id: "nes", label: "NES" },
  { id: "mono", label: "B/N" },
];

const LOOP_MODES: { id: string; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "boomerang", label: "Boomerang" },
  { id: "crossfade", label: "Crossfade" },
];

export default function CombinarPage() {
  // GIF ya editado en GIF Studio (sesión): se usa TAL CUAL
  const [sessionGif, setSessionGif] = useState<GifSessionResult | null>(
    () => studioStore.gifResult
  );
  const [audioFile, setAudioFile] = useState<File | null>(() => studioStore.audioFile);

  // Ruta manual (sin GIF de sesión)
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [loopMode, setLoopMode] = useState("normal");
  const fadePercent = 25;
  const [style, setStyle] = useState<StyleSettings>({
    preset: "retro8bit",
    pixelSize: 6,
    colorCount: 24,
    fixedPalette: null,
    dither: "bayer",
  });

  // Audio slowed + avanzados
  const [useSlowed, setUseSlowed] = useState(false);
  const [adv, setAdv] = useState<ReverbSettings>({ ...DEFAULT_SETTINGS });
  const playerRef = useRef<SlowedReverbPlayer | null>(null);
  const [advPlaying, setAdvPlaying] = useState(false);

  const [audioDuration, setAudioDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [videoLengthMode, setVideoLengthMode] = useState<"audio" | "custom">("audio");
  const [customSeconds, setCustomSeconds] = useState(30);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (playerRef.current == null) playerRef.current = new SlowedReverbPlayer();

  useEffect(() => {
    if (resultUrl) return;
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  // Metadatos del video (ruta manual)
  useEffect(() => {
    if (!videoFile) return;
    let cancelled = false;
    const url = URL.createObjectURL(videoFile);
    void (async () => {
      const d = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.src = url;
        v.onloadedmetadata = () => resolve(v.duration);
        v.onerror = () => resolve(0);
      });
      URL.revokeObjectURL(url);
      if (!cancelled && Number.isFinite(d) && d > 0) {
        setDuration(d);
        setTrim((prev) =>
          prev.end > 0 ? prev : { start: Math.min(0.5, d * 0.1), end: Math.min(d, 3.5) }
        );
      }
    })();
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [videoFile]);

  // Decodificar el audio
  useEffect(() => {
    if (!audioFile) return;
    let cancelled = false;
    void (async () => {
      try {
        const arr = await audioFile.arrayBuffer();
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(arr);
        void ctx.close();
        if (cancelled) return;
        setAudioBuffer(buf);
        setAudioDuration(buf.duration);
      } catch {
        if (!cancelled) setError("No se pudo decodificar el audio");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioFile, setAudioBuffer]);

  // Poll del estado del reproductor de audio en solitario
  useEffect(() => {
    const id = setInterval(() => setAdvPlaying(playerRef.current?.isPlaying ?? false), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => playerRef.current?.dispose(), []);

  const handleAudio = useCallback((f: File) => {
    setError(null);
    setResultUrl(null);
    setAudioFile(f);
    setAudioForSession(f);
    void playerRef.current?.stop();
  }, []);

  /** Ajustes avanzados EN VIVO sobre el reproductor en solitario */
  const applyAdv = useCallback((s: ReverbSettings) => {
    playerRef.current?.setSettings(s);
    setAdv(s);
  }, []);

  const toggleAdvPlay = useCallback(() => {
    const p = playerRef.current!;
    if (!audioBuffer) return;
    if (p.isPlaying) {
      p.pause();
    } else {
      // El player decodifica el archivo por sí mismo la primera vez
      if (audioFile) {
        void p.load(audioFile).then(() => {
          p.play(useSlowed ? adv : { ...DEFAULT_SETTINGS, reverbMix: 0, speed: 1, decay: 0.2 });
        });
      }
    }
    setAdvPlaying(p.isPlaying);
  }, [audioBuffer, audioFile, useSlowed, adv]);

  const generateMp4 = useCallback(async () => {
    if (!audioBuffer || busy) return;
    if (!sessionGif && !videoFile) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    setProgress(0);
    try {
      let frames: RawFrame[];
      let outFps: number;

      if (sessionGif) {
        // Ruta exacta: frames del GIF ya editado, sin tocar nada
        frames = sessionGif.frames;
        outFps = sessionGif.fps;
      } else {
        // Ruta manual: procesar el video aquí
        setStage("Extrayendo fotogramas…");
        const { frames: raw } = await extractFrames(
          videoFile!,
          { start: trim.start, end: trim.end, fps, width },
          (r) => setProgress(r * 0.15)
        );
        setStage("Aplicando loop y estilo…");
        const looped = applyLoopMode(raw, loopMode as never, fadePercent);
        const pal = needsGeneratedPalette(style)
          ? buildGlobalPalette(looped, paletteSizeFor(style))
          : null;
        frames = [];
        for (let i = 0; i < looped.length; i++) {
          frames.push(styleFrame(looped[i], style, pal));
          setProgress(0.15 + ((i + 1) / looped.length) * 0.2);
          if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0));
        }
        outFps = fps;
      }

      // Audio final
      let finalAudio = audioBuffer;
      if (useSlowed) {
        setStage("Renderizando slowed + reverb…");
        setProgress(0.4);
        finalAudio = await renderSlowedReverb(audioBuffer, adv);
      }

      const targetDuration =
        videoLengthMode === "audio"
          ? Math.max(finalAudio.duration, frames.length / outFps)
          : Math.min(customSeconds, 60 * 10);

      setStage("Codificando MP4 (H.264 + AAC)…");
      const blob = await composeLoopVideo({
        frames,
        fps: outFps,
        audio: finalAudio,
        durationSeconds: targetDuration,
        onProgress: (r) => setProgress(0.45 + r * 0.53),
      });

      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado al componer el video");
    } finally {
      setBusy(false);
      setStage("");
    }
  }, [
    audioBuffer, busy, sessionGif, videoFile, trim, fps, width, loopMode,
    fadePercent, style, useSlowed, adv, videoLengthMode, customSeconds,
  ]);

  const effAudioDur = useSlowed ? audioDuration / adv.speed : audioDuration;
  const canGenerate = audioBuffer && (sessionGif || (videoFile && duration > 0)) && !busy;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <section>
        <h1 className="text-2xl font-bold mb-1">🎥 Combinar → MP4</h1>
        <p className="text-zinc-400 text-sm">
          Tu GIF ya editado + el audio slowed, en un MP4 (H.264 + AAC) listo para
          subir a YouTube. Sin re-ediciones: lo que generaste es lo que se combina.
        </p>
      </section>

      {/* 1 · Fuente del loop */}
      {sessionGif ? (
        <section className="bg-zinc-900 rounded-xl p-4 border border-green-800/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">1 · Tu GIF ya editado ✓</h2>
            <button
              onClick={() => {
                setGifResult(null);
                setSessionGif(null);
              }}
              className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              ✕ Quitar y editar video manualmente
            </button>
          </div>
          <div className="grid sm:grid-cols-[160px_1fr] gap-4 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sessionGif.blobUrl}
              alt="GIF de la sesión"
              className="rounded-lg border border-zinc-800 w-full"
            />
            <p className="text-sm text-green-400">{sessionGif.label}</p>
          </div>
          <p className="text-xs text-zinc-500">
            Estos son EXACTAMENTE los frames que se combinarán — cero re-procesado.
          </p>
        </section>
      ) : (
        <>
          <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-2">
            <h2 className="font-semibold">1 · Video fuente</h2>
            <p className="text-xs text-zinc-500">
              Tip: genera primero tu GIF en <span className="text-fuchsia-400">GIF Studio</span>{" "}
              y llega aquí con la edición exacta.
            </p>
            {videoFile ? (
              <p className="text-sm text-green-400">✓ {videoFile.name}</p>
            ) : (
              <FileDropzone
                accept="video/*"
                label="Sube el video"
                hint="Se recorta y estiliza aquí mismo"
                compact
                onFile={(f) => {
                  setError(null);
                  setResultUrl(null);
                  setVideoFile(f);
                  studioStore.videoFile = f;
                }}
              />
            )}
          </section>

          {videoFile && (
            <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
              <h2 className="font-semibold">2 · Ajustes del loop</h2>
              <TrimTimeline duration={duration} start={trim.start} end={trim.end} onChange={setTrim} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <label>
                  Modo loop
                  <select
                    value={loopMode}
                    onChange={(e) => setLoopMode(e.target.value)}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5"
                  >
                    {LOOP_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estilo
                  <select
                    value={style.preset}
                    onChange={(e) =>
                      setStyle((s) => ({ ...s, preset: e.target.value as StylePresetId }))
                    }
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5"
                  >
                    {STYLE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  FPS: <strong>{fps}</strong>
                  <input
                    type="range"
                    min={6}
                    max={24}
                    value={fps}
                    onChange={(e) => setFps(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 mt-2"
                  />
                </label>
                <label>
                  Ancho: <strong>{width}px</strong>
                  <input
                    type="range"
                    min={160}
                    max={720}
                    step={16}
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 mt-2"
                  />
                </label>
              </div>
            </section>
          )}
        </>
      )}

      {/* Audio */}
      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-2">
        <h2 className="font-semibold">{sessionGif ? "2" : "3"} · Audio</h2>
        {audioFile ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-400 truncate">
              ✓ {audioFile.name} ({audioDuration.toFixed(1)}s)
            </p>
            <button
              onClick={() => {
                void playerRef.current?.stop();
                setAudioFile(null);
                setAudioBuffer(null);
                setAudioDuration(0);
              }}
              className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0 ml-2"
            >
              ✕
            </button>
          </div>
        ) : (
          <FileDropzone
            accept="audio/*"
            label="Sube el audio"
            hint="El WAV exportado en Slowed + Reverb, o cualquier canción"
            compact
            onFile={handleAudio}
          />
        )}
      </section>

      {/* Controles de audio en vivo con avanzados */}
      {audioBuffer && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{sessionGif ? "3" : "4"} · Escucha y ajusta el audio en vivo</h2>
            <button
              onClick={toggleAdvPlay}
              className={`text-sm px-4 py-1.5 rounded-lg font-semibold ${
                advPlaying ? "bg-zinc-700 hover:bg-zinc-600" : "bg-fuchsia-600 hover:bg-fuchsia-500"
              }`}
            >
              {advPlaying ? "⏸ Pausar audio" : "▶ Escuchar audio"}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useSlowed}
              onChange={(e) => {
                setUseSlowed(e.target.checked);
                if (e.target.checked) applyAdv({ ...adv });
              }}
              className="accent-fuchsia-500"
            />
            Aplicar estos efectos al exportar (si tu audio aún no está slowed)
          </label>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <AdvSlider label="Velocidad" value={adv.speed} min={0.5} max={1.5} step={0.01}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) => applyAdv({ ...adv, speed: v })} />
            <AdvSlider label="Reverb (mezcla)" value={adv.reverbMix} min={0} max={1} step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => applyAdv({ ...adv, reverbMix: v })} />
            <AdvSlider label="Cola de reverb" value={adv.decay} min={0.2} max={6} step={0.1}
              format={(v) => `${v.toFixed(1)}s`}
              onChange={(v) => applyAdv({ ...adv, decay: v })} />
            <AdvSlider label="Filtro low-pass" value={adv.lowpassHz} min={500} max={18000} step={100}
              format={(v) => `${(v / 1000).toFixed(1)} kHz`}
              onChange={(v) => applyAdv({ ...adv, lowpassHz: v })} />
            <AdvSlider label="Bass boost" value={adv.bassDb ?? 0} min={0} max={12} step={0.5}
              format={(v) => `+${v.toFixed(1)} dB`}
              onChange={(v) => applyAdv({ ...adv, bassDb: v })} />
            <AdvSlider label="Brillo (agudos)" value={adv.trebleDb ?? 0} min={-6} max={8} step={0.5}
              format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
              onChange={(v) => applyAdv({ ...adv, trebleDb: v })} />
            <AdvSlider label="Rotación 8D (velocidad)" value={adv.panRate ?? 0} min={0} max={0.5} step={0.01}
              format={(v) => (v === 0 ? "off" : `${v.toFixed(2)} Hz`)}
              onChange={(v) => applyAdv({ ...adv, panRate: v, panDepth: (adv.panDepth ?? 0) || 0.7 })}
            />
            <AdvSlider label="Rotación 8D (profundidad)" value={adv.panDepth ?? 0} min={0} max={1} step={0.05}
              format={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)}
              onChange={(v) => applyAdv({ ...adv, panDepth: v, panRate: (adv.panRate ?? 0) || 0.15 })}
            />
            <AdvSlider label="Volumen" value={adv.volume} min={0} max={1.5} step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => applyAdv({ ...adv, volume: v })} />
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(REVERB_PRESETS).map(([id, p]) => (
              <button
                key={id}
                onClick={() => applyAdv({ ...p.settings })}
                className="px-3 py-1 rounded-lg text-xs border border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => applyAdv({ ...DEFAULT_SETTINGS, panRate: 0.15, panDepth: 0.7, bassDb: 4 })}
              className="px-3 py-1 rounded-lg text-xs border border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
            >
              Slowed 8D
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Todos los controles se aplican en vivo, sin reiniciar la reproducción.
          </p>
        </section>
      )}

      {/* Preview conjunto */}
      {audioBuffer && (sessionGif || (videoFile && duration > 0)) && (
        <CombinedPreview
          sessionFrames={sessionGif?.frames ?? null}
          sessionFps={sessionGif?.fps}
          videoFile={sessionGif ? null : videoFile}
          audioBuffer={audioBuffer}
          audioSettings={useSlowed ? adv : null}
          trim={trim}
          fps={fps}
          width={width}
          loopMode={loopMode}
          fadePercent={fadePercent}
          style={style}
        />
      )}

      {/* Duración */}
      {audioBuffer && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">Duración del video</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={videoLengthMode === "audio"}
                onChange={() => setVideoLengthMode("audio")}
                className="accent-fuchsia-500"
              />
              Duración del audio ({fmt(effAudioDur)})
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={videoLengthMode === "custom"}
                onChange={() => setVideoLengthMode("custom")}
                className="accent-fuchsia-500"
              />
              Personalizada:
              <input
                type="number"
                min={1}
                max={600}
                value={customSeconds}
                onChange={(e) => setCustomSeconds(parseInt(e.target.value) || 30)}
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5"
              />{" "}
              s
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            El loop se repetirá hasta cubrir la duración elegida. Videos largos
            tardan más en codificarse.
          </p>
        </section>
      )}

      <button
        onClick={generateMp4}
        disabled={!canGenerate}
        className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg"
      >
        {busy ? stage || "Procesando…" : "🎬 Generar MP4"}
      </button>

      {busy && (
        <div>
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-500 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {stage} {Math.round(progress * 100)}%
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {resultUrl && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">
            ✅ Video listo{" "}
            <span className="text-xs text-zinc-400 font-normal">
              ({(resultSize / 1024 / 1024).toFixed(1)} MB)
            </span>
          </h2>
          <video src={resultUrl} controls loop className="w-full rounded-lg border border-zinc-800" />
          <button
            onClick={() =>
              fetch(resultUrl)
                .then((r) => r.blob())
                .then((b) => downloadBlob(b, "loop-studio.mp4"))
            }
            className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
          >
            ⬇️ Descargar MP4 (listo para YouTube)
          </button>
        </div>
      )}
    </div>
  );
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function AdvSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, format, onChange } = props;
  return (
    <label className="text-sm block">
      <div className="flex justify-between mb-1">
        <span>{label}</span>
        <strong className="text-fuchsia-300">{format(value)}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-fuchsia-500"
      />
    </label>
  );
}
