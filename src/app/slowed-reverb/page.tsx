"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FileDropzone from "@/components/FileDropzone";
import {
  DEFAULT_SETTINGS,
  REVERB_PRESETS,
  SlowedReverbPlayer,
  audioBufferToWav,
  renderSlowedReverb,
  type ReverbSettings,
} from "@/lib/audioEngine";
import { downloadBlob } from "@/lib/gifEncoder";
import { setAudioForSession } from "@/lib/sessionStore";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SlowedReverbPage() {
  const playerRef = useRef<SlowedReverbPlayer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [settings, setSettings] = useState<ReverbSettings>({ ...DEFAULT_SETTINGS });
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  /** Posición mientras el usuario arrastra la barra (null = no arrastrando) */
  const [scrub, setScrub] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const scrubRef = useRef<number | null>(null);

  if (playerRef.current == null) playerRef.current = new SlowedReverbPlayer();

  // Poll de posición para la barra
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      if (scrubRef.current == null) setPos(p.getOffset());
      setPlaying(p.isPlaying);
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => playerRef.current?.dispose(), []);

  const onFile = useCallback(async (f: File) => {
    setError(null);
    try {
      const dur = await playerRef.current!.load(f);
      setFileName(f.name);
      setSourceDuration(dur);
      setReady(true);
      setPos(0);
      setPlaying(false);
      setAudioForSession(f);
    } catch (e) {
      setError(
        e instanceof Error ? `No se pudo decodificar el audio: ${e.message}` : "Error al cargar audio"
      );
    }
  }, []);

  /** Aplica ajustes EN VIVO: sin reiniciar la reproducción */
  const applySettings = useCallback((s: ReverbSettings) => {
    playerRef.current!.setSettings(s);
    setSettings(s);
  }, []);

  const togglePlay = useCallback(() => {
    const p = playerRef.current!;
    if (p.isPlaying) {
      p.pause();
    } else {
      if (p.getOffset() >= p.duration - 0.05) p.seek(0);
      p.play(settings);
    }
    setPlaying(p.isPlaying);
  }, [settings]);

  /** Salta a una posición del archivo (segundos fuente) y sigue sonando */
  const seek = useCallback((t: number) => {
    const p = playerRef.current!;
    p.seek(t);
    setPos(p.getOffset());
  }, []);

  /** Commit del scrub: aplica la posición elegida */
  const commitScrub = useCallback(() => {
    if (scrubRef.current == null) return;
    seek(scrubRef.current);
    scrubRef.current = null;
    setScrub(null);
  }, [seek]);

  const exportWav = useCallback(async () => {
    const p = playerRef.current!;
    if (!ready || rendering) return;
    setRendering(true);
    setError(null);
    setRenderProgress(0.1);
    try {
      p.pause();
      // Reusar el buffer ya decodificado (fallback: re-decodificar el archivo)
      const buffer =
        p.decodedBuffer ??
        (await (async () => {
          const file = fileName ? await lastLoadedFile() : null;
          if (!file) throw new Error("Vuelve a seleccionar el archivo de audio");
          const arr = await file.arrayBuffer();
          const tmpCtx = new AudioContext();
          const decoded = await tmpCtx.decodeAudioData(arr);
          void tmpCtx.close();
          return decoded;
        })());

      setRenderProgress(0.3);
      const rendered = await renderSlowedReverb(buffer, settings);
      setRenderProgress(0.85);
      const wav = audioBufferToWav(rendered);
      downloadBlob(wav, `${baseName(fileName)}-slowed.wav`);
      setRenderProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al renderizar");
    } finally {
      setTimeout(() => setRendering(false), 400);
    }
  }, [ready, rendering, settings, fileName]);


  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <section>
        <h1 className="text-2xl font-bold mb-1">🎧 Slowed + Reverb</h1>
        <p className="text-zinc-400 text-sm">
          Ralentiza la canción y añade reverb con escucha en tiempo real. Exporta WAV listo para
          combinar con tu GIF.
        </p>
      </section>

      {!ready && (
        <FileDropzone
          accept="audio/mpeg,audio/wav,audio/ogg,audio/*"
          label="Arrastra una canción o haz clic para elegirla"
          hint="MP3 · WAV · OGG"
          onFile={onFile}
        />
      )}

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {ready && (
        <>
          {/* Reproductor */}
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium truncate">🎵 {fileName}</span>
              <button
                onClick={() => {
                  playerRef.current?.stop();
                  setReady(false);
                  setFileName(null);
                }}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                Cambiar canción
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(sourceDuration, 0.1)}
              step={0.05}
              value={scrub ?? Math.min(pos, sourceDuration)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                scrubRef.current = v;
                setScrub(v);
              }}
              onPointerUp={commitScrub}
              onKeyUp={commitScrub}
              onBlur={commitScrub}
              className="w-full accent-fuchsia-500"
            />
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{fmt(scrub ?? Math.min(pos, sourceDuration))}</span>
              <span>{fmt(sourceDuration)}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => seek(Math.max(0, (scrub ?? pos) - 10))}
                disabled={rendering}
                className="px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-semibold disabled:opacity-40"
                title="Retroceder 10 segundos"
              >
                ⏪ 10s
              </button>
              <button
                onClick={togglePlay}
                disabled={rendering}
                className="flex-1 py-2.5 rounded-lg font-bold bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40"
              >
                {playing ? "⏸ Pausar" : "▶ Escuchar"}
              </button>
              <button
                onClick={() => seek(Math.min(sourceDuration, (scrub ?? pos) + 10))}
                disabled={rendering}
                className="px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-semibold disabled:opacity-40"
                title="Adelantar 10 segundos"
              >
                10s ⏩
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <h2 className="font-semibold mb-2">⚡ Presets</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(REVERB_PRESETS).map(([id, p]) => (
                <button
                  key={id}
                  onClick={() => applySettings({ ...p.settings })}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    JSON.stringify(settings) === JSON.stringify(p.settings)
                      ? "border-cyan-500 bg-cyan-500/15"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Controles */}
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <Slider
              label="Velocidad"
              value={settings.speed}
              min={0.5}
              max={1.5}
              step={0.01}
              format={(v) => `${v.toFixed(2)}x ${pitchHint(v)}`}
              onChange={(v) => applySettings({ ...settings, speed: v })}
            />
            <Slider
              label="Mezcla reverb"
              value={settings.reverbMix}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => applySettings({ ...settings, reverbMix: v })}
            />
            <Slider
              label="Cola de reverb"
              value={settings.decay}
              min={0.2}
              max={6}
              step={0.1}
              format={(v) => `${v.toFixed(1)}s`}
              onChange={(v) => applySettings({ ...settings, decay: v })}
            />
            <Slider
              label="Filtro low-pass"
              value={settings.lowpassHz}
              min={500}
              max={18000}
              step={100}
              format={(v) => `${(v / 1000).toFixed(1)} kHz`}
              onChange={(v) => applySettings({ ...settings, lowpassHz: v })}
            />
            <Slider
              label="Volumen"
              value={settings.volume}
              min={0}
              max={1.5}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => applySettings({ ...settings, volume: v })}
            />
            <Slider
              label="Bass boost"
              value={settings.bassDb ?? 0}
              min={0}
              max={12}
              step={0.5}
              format={(v) => `+${v.toFixed(1)} dB`}
              onChange={(v) => applySettings({ ...settings, bassDb: v })}
            />
            <Slider
              label="Brillo (agudos)"
              value={settings.trebleDb ?? 0}
              min={-6}
              max={8}
              step={0.5}
              format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
              onChange={(v) => applySettings({ ...settings, trebleDb: v })}
            />
            <Slider
              label="Rotación 8D (velocidad)"
              value={settings.panRate ?? 0}
              min={0}
              max={0.5}
              step={0.01}
              format={(v) => (v === 0 ? "off" : `${v.toFixed(2)} Hz`)}
              onChange={(v) =>
                applySettings({
                  ...settings,
                  panRate: v,
                  panDepth: (settings.panDepth ?? 0) || 0.7,
                })
              }
            />
            <Slider
              label="Rotación 8D (profundidad)"
              value={settings.panDepth ?? 0}
              min={0}
              max={1}
              step={0.05}
              format={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)}
              onChange={(v) =>
                applySettings({
                  ...settings,
                  panDepth: v,
                  panRate: (settings.panRate ?? 0) || 0.15,
                })
              }
            />
            <Slider
              label="Crackle de vinilo"
              value={settings.crackle ?? 0}
              min={0}
              max={1}
              step={0.05}
              format={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)}
              onChange={(v) => applySettings({ ...settings, crackle: v })}
            />
            <Slider
              label="Amplitud estéreo"
              value={settings.width ?? 1}
              min={0}
              max={2}
              step={0.05}
              format={(v) => (v === 1 ? "normal" : `${v.toFixed(2)}×`)}
              onChange={(v) => applySettings({ ...settings, width: v })}
            />
          </div>

          {/* Exportar */}
          <div className="space-y-3">
            <button
              onClick={exportWav}
              disabled={rendering}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 disabled:opacity-40 transition-all"
            >
              {rendering ? "Renderizando…" : "⬇️ Exportar WAV slowed"}
            </button>
            {rendering && (
              <div className="text-xs text-zinc-400">
                Renderizando offline… {Math.round(renderProgress * 100)}%
              </div>
            )}
            <Link
              href="/combinar"
              className="block w-full py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 font-semibold text-center"
            >
              🎬 Ir a Combinar con GIF →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Recupera el último archivo cargado guardado en la sesión */
async function lastLoadedFile(): Promise<File | null> {
  const { studioStore } = await import("@/lib/sessionStore");
  return studioStore.audioFile;
}

function baseName(name: string | null): string {
  if (!name) return "audio";
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function pitchHint(v: number): string {
  if (v < 0.75) return "(muy grave)";
  if (v < 0.95) return "(grave)";
  if (v <= 1.02) return "";
  return "(agudo)";
}

function Slider(props: {
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
