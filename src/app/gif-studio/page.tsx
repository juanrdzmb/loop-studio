"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FileDropzone from "@/components/FileDropzone";
import TrimTimeline from "@/components/TrimTimeline";
import LoopPreview from "@/components/LoopPreview";
import { buildGifFrames } from "@/lib/gifPipeline";
import { downloadBlob, encodePrepared } from "@/lib/gifEncoder";
import { setVideoForSession, setGifResult } from "@/lib/sessionStore";
import type { GifSettings, LoopMode, StylePresetId, StyleSettings } from "@/lib/types";

const STYLE_PRESETS: { id: StylePresetId; label: string; desc: string }[] = [
  { id: "none", label: "Original", desc: "Sin filtro" },
  { id: "anime", label: "Anime Lo-Fi", desc: "Pixel suave · 32 colores" },
  { id: "retro8bit", label: "8-Bit Retro", desc: "Pixelado fuerte · 16 colores + dither" },
  { id: "gameboy", label: "Game Boy", desc: "4 tonos verdes" },
  { id: "nes", label: "NES", desc: "Paleta clásica de consola" },
  { id: "mono", label: "Blanco/Negro", desc: "6 tonos de gris" },
  { id: "custom", label: "Manual", desc: "Tus propios ajustes" },
];

const LOOP_MODES: { id: LoopMode; label: string; desc: string }[] = [
  { id: "normal", label: "Normal", desc: "Repite tal cual" },
  { id: "boomerang", label: "Boomerang", desc: "Ida y vuelta" },
  { id: "crossfade", label: "Crossfade", desc: "Fundido final → inicio" },
  { id: "auto", label: "Auto (MSE)", desc: "Detecta el mejor corte" },
];

export default function GifStudioPage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [playhead, setPlayhead] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [gif, setGif] = useState<GifSettings>({
    fps: 12,
    width: 480,
    loopMode: "normal",
    fadePercent: 25,
  });

  const [style, setStyle] = useState<StyleSettings>({
    preset: "retro8bit",
    pixelSize: 6,
    colorCount: 24,
    fixedPalette: null,
    dither: "bayer",
  });

  const [maxColors, setMaxColors] = useState(256);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [videoUrl, resultUrl]);

  const onFile = useCallback((f: File) => {
    setError(null);
    setResultUrl(null);
    setFile(f);
    setVideoForSession(f);
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    setDuration(d);
    setTrim({ start: Math.min(0.5, d * 0.1), end: Math.min(d, 3.5) });
  }, []);

  // Preview de estilo en vivo: lo maneja el componente LoopPreview

  const generateGif = useCallback(async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    setProgress(0);
    try {
      // Pipeline único: extracción → loop → estilo → cuantización
      // (el mismo que usa el preview, por eso son idénticos)
      const res = await buildGifFrames(
        file,
        { trim, gif, style, maxColors },
        (stage, r) => {
          const labels: Record<string, string> = {
            extract: "Extrayendo fotogramas…",
            loop: "Buscando el punto de loop perfecto…",
            style: "Aplicando estilo…",
            quantize: "Cuantizando colores…",
          };
          setProgressLabel(labels[stage]);
          const base: Record<string, number> = {
            extract: 0, loop: 0.35, style: 0.4, quantize: 0.7,
          };
          const span: Record<string, number> = {
            extract: 0.35, loop: 0.05, style: 0.3, quantize: 0.1,
          };
          setProgress(base[stage] + r * span[stage]);
        }
      );

      // Codificar sin re-procesar
      setProgressLabel("Codificando GIF…");
      const blob = await encodePrepared(res.prepared, {
        fps: gif.fps,
        width: res.width,
        height: res.height,
        onProgress: (r) => setProgress(0.8 + r * 0.2),
      });

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);

      // Guardar el GIF YA EDITADO para la pestaña Combinar (sin re-procesar)
      const styleLabels: Record<string, string> = {
        none: "Original", anime: "Anime Lo-Fi", retro8bit: "8-Bit Retro",
        gameboy: "Game Boy", nes: "NES", mono: "B/N", custom: "Manual",
      };
      setGifResult({
        blobUrl: url,
        frames: res.rgbaFrames,
        fps: gif.fps,
        width: res.width,
        height: res.height,
        label: `${res.width}×${res.height} · ${gif.fps} fps · ${res.rgbaFrames.length} frames · ${
          styleLabels[style.preset] ?? style.preset
        }${res.autoCutSeconds != null ? ` · auto-corte ${res.autoCutSeconds.toFixed(1)}s` : ""}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
      setProgressLabel("");
      setProgress(0);
    }
  }, [file, busy, trim, gif, style, maxColors, resultUrl]);

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:text-fuchsia-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
        >
          Loop Studio <span aria-hidden="true">/</span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">🎬 GIF Studio</h1>
        <p className="text-zinc-400 text-sm">
          Recorta tu video, elige el modo de loop perfecto y aplica estilos pixel art.
        </p>
      </section>

      {!file && (
        <FileDropzone
          accept="video/mp4,video/webm,video/quicktime,video/*"
          label="Arrastra un video o haz clic para elegirlo"
          hint="MP4 · WebM · MOV — se procesa localmente, nada sale de tu equipo"
          onFile={onFile}
        />
      )}

      {file && (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Columna izquierda: preview + timeline */}
          <section className="space-y-4">
            <div className="rounded-xl overflow-hidden bg-black border border-zinc-800">
              {videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  loop
                  muted
                  onLoadedMetadata={onLoadedMetadata}
                  onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                  className="w-full"
                />
              )}
            </div>

            {duration > 0 && (
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <h2 className="font-semibold mb-3">✂️ Recorte</h2>
                <TrimTimeline
                  duration={duration}
                  start={trim.start}
                  end={trim.end}
                  currentTime={playhead}
                  onChange={(r) => {
                    setTrim(r);
                    if (videoRef.current) videoRef.current.currentTime = r.start;
                  }}
                />
              </div>
            )}

            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
              <h2 className="font-semibold">🔁 Modo de loop</h2>
              <div className="grid grid-cols-2 gap-2">
                {LOOP_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setGif((g) => ({ ...g, loopMode: m.id }))}
                    title={m.desc}
                    className={`px-3 py-2 rounded-lg text-left text-sm border transition-colors ${
                      gif.loopMode === m.id
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
                    }`}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-zinc-400">{m.desc}</div>
                  </button>
                ))}
              </div>
              {gif.loopMode === "crossfade" && (
                <label className="block text-sm">
                  Fundido: {gif.fadePercent}% del clip
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={gif.fadePercent}
                    onChange={(e) =>
                      setGif((g) => ({ ...g, fadePercent: parseInt(e.target.value) }))
                    }
                    className="w-full accent-fuchsia-500"
                  />
                </label>
              )}
            </div>

            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 grid grid-cols-2 gap-4">
              <label className="text-sm">
                FPS: <strong>{gif.fps}</strong>
                <input
                  type="range"
                  min={5}
                  max={24}
                  value={gif.fps}
                  onChange={(e) => setGif((g) => ({ ...g, fps: parseInt(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </label>
              <label className="text-sm">
                Ancho: <strong>{gif.width}px</strong>
                <input
                  type="range"
                  min={160}
                  max={720}
                  step={16}
                  value={gif.width}
                  onChange={(e) => setGif((g) => ({ ...g, width: parseInt(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </label>
            </div>
          </section>

          {/* Columna derecha: preview + estilo + resultado */}
          <section className="space-y-4">
            <LoopPreview file={file} trim={trim} gif={gif} style={style} maxColors={maxColors} />

            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
              <h2 className="font-semibold">🎨 Estilo</h2>
              <div className="flex flex-wrap gap-2">
                {STYLE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setStyle((s) => ({ ...s, preset: p.id }))}
                    title={p.desc}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      style.preset === p.id
                        ? "border-cyan-500 bg-cyan-500/15"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {(style.preset === "custom" || style.preset !== "none") && (
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <label className="text-sm">
                    Tamaño de píxel: <strong>{style.pixelSize}</strong>
                    <input
                      type="range"
                      min={1}
                      max={14}
                      value={style.pixelSize}
                      onChange={(e) =>
                        setStyle((s) => ({ ...s, pixelSize: parseInt(e.target.value) }))
                      }
                      className="w-full accent-fuchsia-500"
                    />
                  </label>
                  {style.preset === "custom" && (
                    <>
                      <label className="text-sm">
                        Colores: <strong>{style.colorCount}</strong>
                        <input
                          type="range"
                          min={2}
                          max={64}
                          value={style.colorCount}
                          onChange={(e) =>
                            setStyle((s) => ({ ...s, colorCount: parseInt(e.target.value) }))
                          }
                          className="w-full accent-fuchsia-500"
                        />
                      </label>
                      <label className="text-sm flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={style.dither === "bayer"}
                          onChange={(e) =>
                            setStyle((s) => ({
                              ...s,
                              dither: e.target.checked ? "bayer" : "none",
                            }))
                          }
                          className="accent-fuchsia-500"
                        />
                        Dithering retro
                      </label>
                    </>
                  )}
                </div>
              )}

              <label className="block text-sm">
                Colores máximos del GIF: <strong>{maxColors}</strong>
                <input
                  type="range"
                  min={8}
                  max={256}
                  step={8}
                  value={maxColors}
                  onChange={(e) => setMaxColors(parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </label>
            </div>

            <button
              onClick={generateGif}
              disabled={busy || duration <= 0}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg"
            >
              {busy ? "Procesando…" : "✨ Generar GIF"}
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
                  {progressLabel} {Math.round(progress * 100)}%
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
                  ✅ GIF listo{" "}
                  <span className="text-xs text-zinc-400 font-normal">
                    ({(resultSize / 1024).toFixed(0)} KB)
                  </span>
                </h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt="GIF generado"
                  className="rounded-lg border border-zinc-800 w-full"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      fetch(resultUrl)
                        .then((r) => r.blob())
                        .then((b) => downloadBlob(b, "loop-studio.gif"))
                    }
                    className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
                  >
                    ⬇️ Descargar GIF
                  </button>
                  <Link
                    href="/combinar"
                    className="flex-1 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 font-semibold text-center"
                  >
                    🎵 Combinar con audio →
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
