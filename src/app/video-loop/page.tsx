"use client";

import { useCallback, useEffect, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import TrimTimeline from "@/components/TrimTimeline";
import VideoLoopPreview from "@/components/VideoLoopPreview";
import SongLoopWaveform from "@/components/SongLoopWaveform";
import { downloadBlob } from "@/lib/gifEncoder";
import {
  analyzeMusic,
  analyzeVideo,
  companionHealth,
  renderLoop,
  type CompanionHealth,
  type LoopCandidate,
} from "@/lib/companion";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoLoopPage() {
  const [health, setHealth] = useState<CompanionHealth | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  /** URL de objeto persistente para las mini-previews de los candidatos */
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCandidates, setVideoCandidates] = useState<LoopCandidate[]>([]);
  const [videoSel, setVideoSel] = useState<LoopCandidate | null>(null);
  const [manualTrim, setManualTrim] = useState({ start: 0, end: 0 });
  /** Índice del candidato de video en mini-preview (hover) */
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [useManualVideo, setUseManualVideo] = useState(false);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  /** Ventana de análisis de LoopyCut en segundos (0 = todo el video) */
  const [windowSec, setWindowSec] = useState(120);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCandidates, setAudioCandidates] = useState<LoopCandidate[]>([]);
  const [audioSel, setAudioSel] = useState<LoopCandidate | null>(null);
  /** Duración deseada del VIDEO FINAL en MINUTOS */
  const [targetMin, setTargetMin] = useState(0.5);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [widened, setWidened] = useState(false);
  /** De dónde sale el audio: loops detectados, recorte manual o canción completa */
  const [audioMode, setAudioMode] = useState<"loops" | "trim" | "full">("loops");

  const [videoMode, setVideoMode] = useState<"cut" | "crossfade">("cut");
  const [crossfadeSec, setCrossfadeSec] = useState(0.6);
  const [syncMode, setSyncMode] = useState<"repeat" | "speed">("repeat");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);

  const companionUp = !!health?.ok;

  useEffect(() => {
    companionHealth().then(setHealth);
  }, []);

  useEffect(() => {
    if (resultUrl) return;
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleVideo = useCallback((f: File) => {
    setError(null);
    setResultUrl(null);
    setVideoFile(f);
    setVideoCandidates([]);
    setVideoSel(null);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = URL.createObjectURL(f);
    v.onloadedmetadata = () => {
      setVideoDuration(v.duration);
      setManualTrim({ start: 0, end: Math.min(v.duration, 5) });
      URL.revokeObjectURL(v.src);
    };
  }, []);
  const handleAudio = useCallback(async (f: File) => {
    setError(null);
    setResultUrl(null);
    setAudioFile(f);
    setAudioCandidates([]);
    setAudioSel(null);
    try {
      const arr = await f.arrayBuffer();
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(arr);
      void ctx.close();
      setAudioBuffer(buf);
      setAudioDuration(buf.duration);
    } catch {
      setError("No se pudo decodificar el audio");
    }
  }, []);

  const runVideoAnalysis = useCallback(async () => {
    if (!videoFile || analyzingVideo) return;
    setAnalyzingVideo(true);
    setError(null);
    try {
      const cands = await analyzeVideo(videoFile, {
        length: 0,
        downsample: 3,
        windowSec,
      });
      setVideoCandidates(cands);
      setUseManualVideo(false);
      if (cands.length > 0) setVideoSel(cands[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error analizando video");
    } finally {
      setAnalyzingVideo(false);
    }
  }, [videoFile, analyzingVideo, windowSec]);

  /**
   * Busca loops de canción cercanos a la duración deseada del video final.
   * Si no hay ninguno en el rango, reintenta una sola vez ampliando la búsqueda.
   */
  const runAudioAnalysis = useCallback(async () => {
    if (!audioFile || analyzingAudio) return;
    setAnalyzingAudio(true);
    setError(null);
    setWidened(false);
    try {
      const t = Math.max(5, targetMin * 60);
      let cands = await analyzeMusic(audioFile, {
        minDuration: Math.max(2, Math.round(t * 0.7)),
        maxDuration: Math.round(t * 1.35),
      });
      if (cands.length === 0 && t >= 5) {
        cands = await analyzeMusic(audioFile, {
          minDuration: Math.max(2, Math.round(t * 0.35)),
          maxDuration: t * 3,
        });
        setWidened(true);
      }
      // Recomendados primero: los más cercanos a la duración pedida
      cands.sort((a, b) => Math.abs(a.duration - t) - Math.abs(b.duration - t));
      setAudioCandidates(cands);
      if (cands.length > 0) setAudioSel(cands[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error analizando la canción");
    } finally {
      setAnalyzingAudio(false);
    }
  }, [audioFile, analyzingAudio, targetMin]);

  /** Cambia el origen del audio ajustando la selección */
  const switchAudioMode = useCallback(
    (mode: "loops" | "trim" | "full") => {
      setAudioMode(mode);
      if (!audioBuffer) return;
      if (mode === "full") {
        setAudioSel({
          start: 0,
          end: audioBuffer.duration,
          duration: audioBuffer.duration,
          score: 100,
        });
      } else if (mode === "loops" && audioCandidates.length > 0) {
        setAudioSel(audioCandidates[0]);
      }
    },
    [audioBuffer, audioCandidates]
  );
  // Rango de video efectivo (candidato o manual)
  const vStart = useManualVideo || !videoSel ? manualTrim.start : videoSel.start;
  const vEnd = useManualVideo || !videoSel ? manualTrim.end : videoSel.end;
  const vDur = Math.max(0, vEnd - vStart);
  const aDur = audioSel ? audioSel.duration : 0;
  const speedFactor = aDur > 0 && vDur > 0 ? aDur / vDur : 1;

  const generate = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || busy) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    try {
      const blob = await renderLoop(videoFile, audioFile, {
        videoStart: vStart,
        videoEnd: vEnd,
        audioStart: audioSel.start,
        audioEnd: audioSel.end,
        videoMode,
        crossfadeSec,
        syncMode,
      });
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando el video");
    } finally {
      setBusy(false);
    }
  }, [videoFile, audioFile, audioSel, busy, vStart, vEnd, videoMode, crossfadeSec, syncMode]);

  const canGenerate =
    companionUp && videoFile && audioBuffer && audioSel && (videoSel || useManualVideo) && !busy;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold mb-1">🎥 Video + Canción → Loop perfecto</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              companionUp
                ? "border-green-700 bg-green-900/40 text-green-400"
                : "border-red-800 bg-red-950/50 text-red-400"
            }`}
          >
            {companionUp ? `● Companion activo${health?.pymusiclooper ? " · PyMusicLooper" : ""}` : "● Companion apagado"}
          </span>
        </div>
        <p className="text-zinc-400 text-sm mt-1">
          Sube un video y una canción: PyMusicLooper encuentra el mejor loop de la
          canción, LoopyCut el del video, y ffmpeg renderiza el MP4 final limpio.
        </p>
        {!companionUp && (
          <div className="mt-3 rounded-lg bg-amber-950/60 border border-amber-800 px-4 py-3 text-sm text-amber-300">
            ⚠️ Companion apagado. Arráncalo con:{" "}
            <code className="bg-black/40 px-1.5 py-0.5 rounded">
              cd ~/Proyectos/loop-studio/companion && ./start.sh
            </code>
          </div>
        )}
      </section>

      {/* 1 · Video */}
      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">1 · Video</h2>
        {!videoFile ? (
          <FileDropzone
            accept="video/*"
            label="Arrastra tu video o haz clic para elegirlo"
            hint="Cualquier formato que lea ffmpeg"
            onFile={handleVideo}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-400">
                ✓ {videoFile.name} ({videoDuration.toFixed(1)}s)
              </p>
              <button
                onClick={() => {
                  setVideoFile(null);
                  setVideoCandidates([]);
                  setVideoSel(null);
                }}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Analizar primeros
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={windowSec}
                    onChange={(e) => setWindowSec(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5"
                  />
                  <span className="text-zinc-400 text-xs">s · 0 = todo</span>
                </div>
              </label>
              <button
                onClick={runVideoAnalysis}
                disabled={!companionUp || analyzingVideo}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40"
              >
                {analyzingVideo ? "Analizando frames (SSIM)…" : "🔍 Detectar loops automáticos (LoopyCut)"}
              </button>
              <button
                onClick={() => {
                  setUseManualVideo(true);
                  setVideoSel(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm border ${
                  useManualVideo ? "border-cyan-500 bg-cyan-500/15" : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                ✂️ Recorte manual
              </button>
            </div>

            {videoCandidates.length > 0 && !useManualVideo && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Pasa el cursor sobre una tarjeta para ver ese fragmento en bucle · clic para elegirlo
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {videoCandidates.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setVideoSel(c)}
                      className={`rounded-lg text-left text-sm border overflow-hidden transition-colors ${
                        videoSel === c
                          ? "border-cyan-500 bg-cyan-500/15"
                          : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
                      }`}
                    >
                      {videoUrl && (
                        <video
                          src={videoUrl}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="w-full aspect-video object-cover bg-black"
                          onLoadedMetadata={(e) => {
                            e.currentTarget.currentTime = c.start;
                          }}
                          onMouseEnter={(e) => {
                            setPreviewIdx(i);
                            const v = e.currentTarget;
                            v.currentTime = c.start;
                            void v.play();
                          }}
                          onMouseLeave={(e) => {
                            setPreviewIdx(null);
                            e.currentTarget.pause();
                          }}
                          onTimeUpdate={(e) => {
                            if (previewIdx !== i) return;
                            const v = e.currentTarget;
                            if (v.currentTime >= c.end || v.currentTime < c.start - 0.5) {
                              v.currentTime = c.start;
                            }
                          }}
                        />
                      )}
                      <div className="px-2 py-1.5">
                        <div className="font-medium text-xs">
                          {fmt(c.start)} → {fmt(c.end)}{" "}
                          <span className="text-zinc-400">({c.duration.toFixed(1)}s)</span>
                        </div>
                        <div className="text-xs text-cyan-400">Calidad {c.score.toFixed(0)}%</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {useManualVideo && (
              <TrimTimeline
                duration={videoDuration}
                start={manualTrim.start}
                end={manualTrim.end}
                onChange={setManualTrim}
              />
            )}
          </div>
        )}
      </section>

      {/* 2 · Canción */}
      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">2 · Canción</h2>
        {!audioFile ? (
          <FileDropzone
            accept="audio/*"
            label="Arrastra la canción o haz clic para elegirla"
            hint="MP3 · WAV · FLAC · OGG — PyMusicLooper encuentra los puntos exactos"
            onFile={handleAudio}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-400">
                ✓ {audioFile.name} ({fmt(audioDuration)})
              </p>
              <button
                onClick={() => {
                  setAudioFile(null);
                  setAudioBuffer(null);
                  setAudioCandidates([]);
                  setAudioSel(null);
                }}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                ✕
              </button>
            </div>

            {/* Modo de audio */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["loops", "🎵 Usar un loop detectado"],
                  ["trim", "✂️ Recortar la canción a mano"],
                  ["full", "🎶 Usar la canción completa"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => switchAudioMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    audioMode === mode
                      ? "border-fuchsia-500 bg-fuchsia-500/15"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {audioMode === "loops" && (
              <>
                <div className="flex flex-wrap items-end gap-3 text-sm">
                  <label>
                    <span className="text-zinc-300">⏱ ¿Cuánto quieres que dure el video final?</span>
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="number"
                        min={0.1}
                        max={30}
                        step={0.5}
                        value={targetMin}
                        onChange={(e) =>
                          setTargetMin(Math.max(0.1, Math.min(30, parseFloat(e.target.value) || 0.5)))
                        }
                        className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5"
                      />
                      <span className="text-zinc-400 text-xs">minutos</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Busca loops de canción de esa duración aproximada
                    </p>
                  </label>
                  <button
                    onClick={runAudioAnalysis}
                    disabled={!companionUp || analyzingAudio}
                    className="px-4 py-2 rounded-lg font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40"
                  >
                    {analyzingAudio ? "Analizando beats…" : "🎵 Detectar loops (PyMusicLooper)"}
                  </button>
                </div>

                {widened && audioCandidates.length > 0 && (
                  <p className="text-xs text-amber-400">
                    No había loops de {targetMin} min exactos: se ampliaron los límites de búsqueda.
                  </p>
                )}
              </>
            )}

            {audioMode === "full" && audioBuffer && (
              <p className="text-xs text-emerald-400">
                🎶 Se usará la canción completa ({fmt(audioDuration)}): el fragmento de video se
                repetirá hasta cubrirla.
              </p>
            )}

            {audioMode === "trim" && (
              <p className="text-xs text-cyan-400">
                ✂️ Arrastra sobre la onda de abajo para elegir el trozo de canción que quieres.
              </p>
            )}

            {audioBuffer && (
              <SongLoopWaveform
                audioBuffer={audioBuffer}
                candidates={audioMode === "loops" ? audioCandidates : []}
                selected={audioSel}
                onSelect={(c) => setAudioSel(c)}
                trimMode={audioMode === "trim"}
              />
            )}

            {audioMode === "loops" && audioCandidates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {audioCandidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setAudioSel(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      audioSel === c
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
                    }`}
                  >
                    #{i + 1} · {fmt(c.start)} → {fmt(c.end)} ({c.duration.toFixed(1)}s) ·{" "}
                    <span className="text-fuchsia-400">Score {c.score.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3 · Modos */}
      {videoFile && audioBuffer && audioSel && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
          <h2 className="font-semibold">3 · Cómo unir el video con la canción</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            El preview de abajo ya muestra el resultado con estas opciones — pruébalas y mira la
            diferencia antes de generar.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 text-zinc-400">Cuando el video termina y vuelve a empezar…</div>
              <div className="flex gap-2">
                {(["cut", "crossfade"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setVideoMode(m)}
                    className={`flex-1 px-3 py-1.5 rounded-lg border ${
                      videoMode === m
                        ? "border-cyan-500 bg-cyan-500/15"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {m === "cut" ? "Corte directo" : "Crossfade (fundido)"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                {videoMode === "cut"
                  ? "El video corta y arranca de nuevo de golpe."
                  : "El final del video se funde suavemente con el inicio."}
              </p>
              {videoMode === "crossfade" && (
                <label className="block mt-2">
                  Duración del fundido: {crossfadeSec.toFixed(1)}s
                  <input
                    type="range"
                    min={0.2}
                    max={2}
                    step={0.1}
                    value={crossfadeSec}
                    onChange={(e) => setCrossfadeSec(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </label>
              )}
            </div>
            <div>
              <div className="mb-1 text-zinc-400">Mientras suena la canción…</div>
              <div className="flex gap-2">
                {(["repeat", "speed"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSyncMode(m)}
                    className={`flex-1 px-3 py-1.5 rounded-lg border ${
                      syncMode === m
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {m === "repeat" ? "Repetir el video" : "Estirar el video"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                {syncMode === "repeat"
                  ? `El fragmento de ${vDur.toFixed(1)}s se repite sin parar hasta cubrir los ${aDur.toFixed(1)}s de canción.`
                  : `El fragmento se acelera o ralentiza (${speedFactor.toFixed(2)}×) para que una sola pasada calce exacto con la canción.`}
              </p>
            </div>
          </div>
          <div className="text-sm bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2">
            <span className="text-zinc-400">Resultado:</span> el video final durará{" "}
            <strong className="text-zinc-100">
              {aDur >= 60 ? `${fmt(aDur)} min` : `${aDur.toFixed(0)}s`}
            </strong>{" "}
            {syncMode === "repeat"
              ? `· el fragmento de video se repite ~${Math.max(1, Math.ceil(aDur / Math.max(vDur, 0.1)))} veces`
              : `· el fragmento se reproduce a ${speedFactor.toFixed(2)}× de velocidad`}
            .
          </div>
        </section>
      )}

      {/* 4 · Preview */}
      {videoFile && audioBuffer && audioSel && (
        <VideoLoopPreview
          videoFile={videoFile}
          videoStart={vStart}
          videoEnd={vEnd}
          videoMode={videoMode}
          crossfadeSec={crossfadeSec}
          audioBuffer={audioBuffer}
          audioStart={audioSel.start}
          audioEnd={audioSel.end}
          syncMode={syncMode}
        />
      )}

      <button
        onClick={generate}
        disabled={!canGenerate}
        className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg"
      >
        {busy
          ? "Renderizando con ffmpeg…"
          : `🎬 Generar MP4 · ${aDur > 0 ? `${aDur.toFixed(0)}s de música` : "loop perfecto"}`}
      </button>

      {busy && (
        <p className="text-xs text-zinc-400 animate-pulse text-center">
          Renderizando en tu máquina con ffmpeg (H.264 + AAC)…
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {resultUrl && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">
            ✅ Loop perfecto listo{" "}
            <span className="text-xs text-zinc-400 font-normal">
              ({(resultSize / 1024 / 1024).toFixed(1)} MB)
            </span>
          </h2>
          <video src={resultUrl} controls loop className="w-full rounded-lg border border-zinc-800" />
          <button
            onClick={() =>
              fetch(resultUrl)
                .then((r) => r.blob())
                .then((b) => downloadBlob(b, "loop-perfecto.mp4"))
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
