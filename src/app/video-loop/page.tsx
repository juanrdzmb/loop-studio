"use client";

import { useCallback, useEffect, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import TrimTimeline from "@/components/TrimTimeline";
import SongLoopWaveform from "@/components/SongLoopWaveform";
import { downloadBlob } from "@/lib/gifEncoder";
import {
  analyzeMusic,
  analyzeVideo,
  companionHealth,
  identifyCharacter,
  listCharacters,
  listOverlays,
  planLayers,
  renderLoop,
  youtubePack,
  type CastMember,
  type CharacterGuess,
  type CompanionHealth,
  type LayerPlan,
  type LoopCandidate,
  type OverlayOption,
  type YoutubePack,
} from "@/lib/companion";

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoLoopPage() {
  const [health, setHealth] = useState<CompanionHealth | null>(null);
  const [overlays, setOverlays] = useState<OverlayOption[]>([]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCandidates, setVideoCandidates] = useState<LoopCandidate[]>([]);
  const [videoSel, setVideoSel] = useState<LoopCandidate | null>(null);
  const [manualTrim, setManualTrim] = useState({ start: 0, end: 0 });
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [useManualVideo, setUseManualVideo] = useState(false);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [windowSec, setWindowSec] = useState(120);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCandidates, setAudioCandidates] = useState<LoopCandidate[]>([]);
  const [audioSel, setAudioSel] = useState<LoopCandidate | null>(null);
  const [targetMin, setTargetMin] = useState(1);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [widened, setWidened] = useState(false);
  const [audioMode, setAudioMode] = useState<"loops" | "trim" | "full">("full");

  const [atmosphere, setAtmosphere] = useState("auto");
  const [sfxOn, setSfxOn] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [intensity, setIntensity] = useState(0.45);

  const [plan, setPlan] = useState<LayerPlan | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);

  const [cast, setCast] = useState<CastMember[]>([]);
  const [guess, setGuess] = useState<CharacterGuess | null>(null);
  const [character, setCharacter] = useState<string | null>(null);
  const [charLocked, setCharLocked] = useState(false);
  const [yt, setYt] = useState<YoutubePack | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const companionUp = !!health?.ok;

  useEffect(() => {
    companionHealth().then(setHealth);
    listOverlays().then(setOverlays);
    listCharacters().then(setCast);
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [resultUrl, previewUrl]);

  const handleVideo = useCallback((f: File) => {
    setError(null);
    setResultUrl(null);
    setPreviewUrl(null);
    setPlan(null);
    setGuess(null);
    setCharacter(null);
    setCharLocked(false);
    setYt(null);
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
    setPreviewUrl(null);
    setPlan(null);
    setAudioFile(f);
    setAudioCandidates([]);
    try {
      const arr = await f.arrayBuffer();
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(arr);
      void ctx.close();
      setAudioBuffer(buf);
      setAudioDuration(buf.duration);
      setAudioSel({ start: 0, end: buf.duration, duration: buf.duration, score: 100 });
      setAudioMode("full");
    } catch {
      setError("No se pudo decodificar el audio");
    }
  }, []);

  const runVideoAnalysis = useCallback(async () => {
    if (!videoFile || analyzingVideo) return;
    setAnalyzingVideo(true);
    setError(null);
    try {
      const cands = await analyzeVideo(videoFile, { length: 0, downsample: 3, windowSec });
      setVideoCandidates(cands);
      setUseManualVideo(false);
      if (cands.length > 0) setVideoSel(cands[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error analizando video");
    } finally {
      setAnalyzingVideo(false);
    }
  }, [videoFile, analyzingVideo, windowSec]);

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
      cands.sort((a, b) => Math.abs(a.duration - t) - Math.abs(b.duration - t));
      setAudioCandidates(cands);
      setAudioMode("loops");
      if (cands.length > 0) setAudioSel(cands[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error analizando la canción");
    } finally {
      setAnalyzingAudio(false);
    }
  }, [audioFile, analyzingAudio, targetMin]);

  const switchAudioMode = useCallback(
    (mode: "loops" | "trim" | "full") => {
      setAudioMode(mode);
      setPlan(null);
      setPreviewUrl(null);
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

  const vStart = useManualVideo || !videoSel ? manualTrim.start : videoSel.start;
  const vEnd = useManualVideo || !videoSel ? manualTrim.end : videoSel.end;
  const vDur = Math.max(0, vEnd - vStart);
  const aDur = audioSel ? audioSel.duration : 0;
  const targetSec = Math.max(8, targetMin * 60);
  const songLoops = aDur > 0 ? Math.max(1, Math.ceil(targetSec / aDur)) : 0;
  const videoLoops = vDur > 0 ? Math.max(1, Math.ceil(targetSec / vDur)) : 0;

  const canWork =
    companionUp && videoFile && audioFile && audioSel && (videoSel || useManualVideo);

  useEffect(() => {
    if (!videoFile || !companionUp) return;
    const end = vEnd > vStart ? vEnd : Math.min(videoDuration || 8, 8);
    let cancel = false;
    identifyCharacter(videoFile, {
      start: vStart,
      end,
      filename: videoFile.name,
    })
      .then((g) => {
        if (cancel) return;
        setGuess(g);
        if (!charLocked) setCharacter(g.id);
      })
      .catch(() => {
        /* el usuario puede elegir a mano */
      });
    return () => {
      cancel = true;
    };
  }, [videoFile, companionUp, vStart, vEnd, videoDuration, charLocked]);

  useEffect(() => {
    if (!character || !companionUp) return;
    let cancel = false;
    youtubePack({
      character,
      song: audioFile?.name,
      minutes: targetMin,
      atmosphere,
    })
      .then((p) => {
        if (!cancel) setYt(p);
      })
      .catch(() => {
        if (!cancel) setYt(null);
      });
    return () => {
      cancel = true;
    };
  }, [character, companionUp, audioFile, targetMin, atmosphere]);


  const runPreview = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || previewBusy) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const next = await planLayers(audioFile, {
        audioStart: audioSel.start,
        audioEnd: audioSel.end,
        target: targetSec,
        atmosphere,
        sfxOn,
        intensity,
        watermark,
        video: videoFile,
        videoStart: vStart,
        videoEnd: vEnd,
      });
      setPlan(next);
      const blob = await renderLoop(videoFile, audioFile, {
        videoStart: vStart,
        videoEnd: vEnd,
        audioStart: audioSel.start,
        audioEnd: audioSel.end,
        targetDuration: Math.min(20, targetSec),
        preview: true,
        plan: next,
      });
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en la previsualización");
    } finally {
      setPreviewBusy(false);
    }
  }, [
    videoFile,
    audioFile,
    audioSel,
    previewBusy,
    targetSec,
    atmosphere,
    sfxOn,
    intensity,
    watermark,
    vStart,
    vEnd,
  ]);

  const generate = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || busy) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    try {
      let used = plan;
      if (!used) {
        used = await planLayers(audioFile, {
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          target: targetSec,
          atmosphere,
          sfxOn,
          intensity,
          watermark,
          video: videoFile,
          videoStart: vStart,
          videoEnd: vEnd,
        });
        setPlan(used);
      }
      const blob = await renderLoop(videoFile, audioFile, {
        videoStart: vStart,
        videoEnd: vEnd,
        audioStart: audioSel.start,
        audioEnd: audioSel.end,
        targetDuration: targetSec,
        preview: false,
        plan: used,
      });
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando el video");
    } finally {
      setBusy(false);
    }
  }, [
    videoFile,
    audioFile,
    audioSel,
    busy,
    plan,
    targetSec,
    atmosphere,
    sfxOn,
    intensity,
    watermark,
    vStart,
    vEnd,
  ]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold mb-1">🎥 Video + Canción</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              companionUp
                ? "border-green-700 bg-green-900/40 text-green-400"
                : "border-red-800 bg-red-950/50 text-red-400"
            }`}
          >
            {companionUp ? "● Companion activo" : "● Companion apagado"}
          </span>
        </div>
        <p className="text-zinc-400 text-sm mt-1">
          Sube un video y una canción. Dices cuántos minutos debe durar el resultado: el
          video y la canción se repiten solos (sin corte) hasta completar. La atmósfera y
          los sonidos se colocan automáticamente — ves un preview de 20 s antes de generar.
        </p>
        {!companionUp && (
          <div className="mt-3 rounded-lg bg-amber-950/60 border border-amber-800 px-4 py-3 text-sm text-amber-300">
            Arranca el companion:{" "}
            <code className="bg-black/40 px-1.5 py-0.5 rounded">
              cd ~/Proyectos/loop-studio/companion && ./start.sh
            </code>
          </div>
        )}
      </section>

      {/* 1 · Video */}
      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">1 · Elige el trozo de video que se va a repetir</h2>
        {!videoFile ? (
          <FileDropzone
            accept="video/*"
            label="Arrastra tu video o haz clic"
            hint="Detectamos loops suaves; el trozo elegido se funde y se repite"
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
                {analyzingVideo ? "Buscando el mejor corte…" : "🔍 Encontrar loops suaves"}
              </button>
              <button
                onClick={() => {
                  setUseManualVideo(true);
                  setVideoSel(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm border ${
                  useManualVideo
                    ? "border-cyan-500 bg-cyan-500/15"
                    : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                ✂️ Recorte manual
              </button>
            </div>

            {videoCandidates.length > 0 && !useManualVideo && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Pasa el cursor para ver el loop · clic para elegirlo. Al generar se funde
                  el final con el inicio para que no se note el corte.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {videoCandidates.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setVideoSel(c)}
                      className={`rounded-lg text-left text-sm border overflow-hidden ${
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
                            void v.play().catch(() => {});
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

      {/* 2 · Canción + duración */}
      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">2 · Canción y duración del video final</h2>
        {!audioFile ? (
          <FileDropzone
            accept="audio/*"
            label="Arrastra la canción o haz clic"
            hint="Se repetirá sola hasta cubrir la duración que pidas"
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

            <label className="block text-sm">
              <span className="text-zinc-200 font-medium">
                ¿Cuántos minutos debe durar el video final?
              </span>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={0.25}
                  max={180}
                  step={0.25}
                  value={targetMin}
                  onChange={(e) =>
                    setTargetMin(Math.max(0.25, Math.min(180, parseFloat(e.target.value) || 1)))
                  }
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5"
                />
                <span className="text-zinc-400 text-xs">minutos</span>
                {[1, 3, 5, 10, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => setTargetMin(m)}
                    className={`px-2 py-1 rounded text-xs border ${
                      targetMin === m
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["full", "🎶 Toda la canción (se repite si hace falta)"],
                  ["loops", "🎵 Un loop de la canción"],
                  ["trim", "✂️ Recortar a mano"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => switchAudioMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={runAudioAnalysis}
                  disabled={!companionUp || analyzingAudio}
                  className="px-4 py-2 rounded-lg font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40"
                >
                  {analyzingAudio ? "Analizando beats…" : "🎵 Detectar loops de la canción"}
                </button>
                {widened && (
                  <span className="text-xs text-amber-400">
                    Se ampliaron los límites de búsqueda
                  </span>
                )}
              </div>
            )}

            {audioBuffer && (
              <SongLoopWaveform
                audioBuffer={audioBuffer}
                candidates={audioMode === "loops" ? audioCandidates : []}
                selected={audioSel}
                onSelect={setAudioSel}
                trimMode={audioMode === "trim"}
              />
            )}

            {audioMode === "loops" && audioCandidates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {audioCandidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setAudioSel(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      audioSel === c
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    #{i + 1} · {fmt(c.start)} → {fmt(c.end)} ({c.duration.toFixed(1)}s) · Score{" "}
                    {c.score.toFixed(0)}%
                  </button>
                ))}
              </div>
            )}

            {aDur > 0 && (
              <p className="text-sm bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300">
                El resultado durará{" "}
                <strong>{targetMin >= 1 ? `${targetMin} min` : `${targetSec.toFixed(0)}s`}</strong>
                {songLoops > 1 && (
                  <>
                    {" "}
                    · la canción se funde (final → inicio) y se repite ~{songLoops} veces
                  </>
                )}
                {videoLoops > 1 && <> · el video se repetirá ~{videoLoops} veces con fundido</>}
                .
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3 · Ambiente */}
      {canWork && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
          <h2 className="font-semibold">3 · Atmósfera (automático, tú apruebas)</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            Niebla, humo y partículas se mezclan en modo screen a baja opacidad. El ambiente
            suena por debajo de la canción (filtro grave). Los SFX (trueno, metal) caen en
            los valles de volumen de la música.
          </p>

          <div>
            <div className="text-xs text-zinc-400 mb-1">Atmósfera visual</div>
            <div className="flex flex-wrap gap-2">
              {(overlays.length ? overlays : [{ id: "auto", label: "Automático" }]).map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setAtmosphere(o.id);
                    setPlan(null);
                    setPreviewUrl(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    atmosphere === o.id
                      ? "border-cyan-500 bg-cyan-500/15"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            Intensidad: {Math.round(intensity * 100)}%
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.05}
              value={intensity}
              onChange={(e) => {
                setIntensity(parseFloat(e.target.value));
                setPlan(null);
                setPreviewUrl(null);
              }}
              className="w-full accent-cyan-500"
            />
          </label>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sfxOn}
                onChange={(e) => {
                  setSfxOn(e.target.checked);
                  setPlan(null);
                  setPreviewUrl(null);
                }}
                className="accent-fuchsia-500"
              />
              Sonidos automáticos (truenos / metal en los silencios)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => {
                  setWatermark(e.target.checked);
                  setPlan(null);
                  setPreviewUrl(null);
                }}
                className="accent-fuchsia-500"
              />
              Marca de agua Silent Vigil Music
            </label>
          </div>

          <button
            onClick={runPreview}
            disabled={previewBusy || !canWork}
            className="w-full py-2.5 rounded-lg font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40"
          >
            {previewBusy ? "Preparando preview de 20 s…" : "👁 Ver cómo quedaría (20 segundos)"}
          </button>

          {plan && (
            <div className="text-xs space-y-1 bg-zinc-950/50 border border-zinc-800 rounded-lg p-3">
              <div>
                Atmósfera: <strong>{plan.overlayLabel ?? "ninguna"}</strong>
                {plan.blend ? ` · blend ${plan.blend}` : ""}
                {plan.opacity != null ? ` · opacidad ${(plan.opacity * 100).toFixed(0)}%` : ""}
              </div>
              {plan.look?.overlayReason ? (
                <div>
                  Elegí {plan.overlayLabel} porque {plan.look.overlayReason}
                </div>
              ) : null}
              {plan.ambienceLabel && (
                <div>
                  Ambiente: {plan.ambienceLabel} (bajo, low-pass {plan.lowpassHz} Hz)
                </div>
              )}
              {plan.sfx.length > 0 && (
                <div>
                  SFX:{" "}
                  {plan.sfx
                    .slice(0, 6)
                    .map((s) => `${s.label} @ ${fmt(s.time)}`)
                    .join(" · ")}
                  {plan.sfx.length > 6 ? "…" : ""}
                </div>
              )}
              {plan.chapters.length > 1 && (
                <div>
                  Videos largos: la atmósfera cambia cada ~90 s (
                  {plan.chapters.map((c) => c.label).join(" → ")})
                </div>
              )}
              {plan.watermark && <div>Marca de agua: Silent Vigil Music (borde superior)</div>}
            </div>
          )}

          {previewUrl && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                Preview aproximado (20 s, resolución reducida). El final es el mismo montaje a
                duración completa.
              </p>
              <video src={previewUrl} controls className="w-full rounded-lg border border-zinc-800" />
            </div>
          )}
        </section>
      )}

      {videoFile && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">4 · Personaje y YouTube</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            Detecta a Guts, Thorfinn, Musashi o Buntarō por el dibujo (y el nombre del
            archivo). Tú puedes corregirlo. El texto sale de tus ensayos en{" "}
            <code>docs/</code>.
          </p>
          {guess && (
            <p className="text-xs text-cyan-300">
              Creo que es <strong>{guess.name}</strong> ({guess.series}) · {guess.confidence}% ·{" "}
              {guess.reason}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(cast.length
              ? cast
              : [
                  { id: "guts", name: "Guts", series: "Berserk", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "thorfinn", name: "Thorfinn", series: "Vinland Saga", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "musashi", name: "Miyamoto Musashi", series: "Vagabond", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "buntaro", name: "Buntarō Mori", series: "The Climber", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                ]
            ).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCharacter(c.id);
                  setCharLocked(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  character === c.id
                    ? "border-cyan-500 bg-cyan-500/15"
                    : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                {c.name}
                <span className="text-zinc-500 text-xs"> · {c.series}</span>
              </button>
            ))}
          </div>

          {yt && (
            <div className="space-y-2 text-sm">
              <FieldCopy
                label="Título"
                value={yt.title}
                copied={copied}
                onCopy={setCopied}
              />
              <FieldCopy
                label="Descripción"
                value={yt.description}
                copied={copied}
                multiline
                onCopy={setCopied}
              />
              <FieldCopy
                label="Tags"
                value={yt.tagsLine}
                copied={copied}
                onCopy={setCopied}
              />
              <FieldCopy
                label="Playlist"
                value={yt.playlist}
                copied={copied}
                onCopy={setCopied}
              />
              <FieldCopy
                label="Comentario anclado"
                value={yt.pinnedComment}
                copied={copied}
                onCopy={setCopied}
              />
              <p className="text-xs text-zinc-500">{yt.thumbnailTip}</p>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500"
                onClick={() => {
                  void copyText(
                    `${yt.title}\n\n${yt.description}\n\nTags: ${yt.tagsLine}\nPlaylist: ${yt.playlist}\nPinned: ${yt.pinnedComment}`
                  ).then(() => setCopied("todo"));
                }}
              >
                {copied === "todo" ? "Copiado todo" : "Copiar todo el pack"}
              </button>
            </div>
          )}
        </section>
      )}


      <button
        onClick={generate}
        disabled={!canWork || busy}
        className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg"
      >
        {busy
          ? "Renderizando con ffmpeg…"
          : `🎬 Generar video · ${targetMin >= 1 ? `${targetMin} min` : `${targetSec.toFixed(0)}s`}`}
      </button>

      {busy && (
        <p className="text-xs text-zinc-400 animate-pulse text-center">
          Fundiendo el loop de video, mezclando atmósfera + SFX + marca de agua…
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
            ✅ Listo{" "}
            <span className="text-xs text-zinc-400 font-normal">
              ({(resultSize / 1024 / 1024).toFixed(1)} MB)
            </span>
          </h2>
          <video src={resultUrl} controls loop className="w-full rounded-lg border border-zinc-800" />
          <button
            onClick={() =>
              fetch(resultUrl)
                .then((r) => r.blob())
                .then((b) => downloadBlob(b, "silent-vigil-loop.mp4"))
            }
            className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
          >
            ⬇️ Descargar MP4
          </button>
        </div>
      )}
    </div>
  );
}

function FieldCopy({
  label,
  value,
  copied,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (k: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400">{label}</span>
        <button
          type="button"
          className="text-xs text-cyan-400 hover:text-cyan-300"
          onClick={() => {
            void copyText(value).then(() => onCopy(label));
          }}
        >
          {copied === label ? "Copiado" : "Copiar"}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={8}
          className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono"
        />
      ) : (
        <div className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono break-words">
          {value}
        </div>
      )}
    </div>
  );
}
