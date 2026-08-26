"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type RenderProgress,
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
  const [shortsSec, setShortsSec] = useState(25);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
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
  const [shortsUrl, setShortsUrl] = useState<string | null>(null);
  const [shortsSize, setShortsSize] = useState(0);
  const [shortsBusy, setShortsBusy] = useState(false);

  const [cast, setCast] = useState<CastMember[]>([]);
  const [guess, setGuess] = useState<CharacterGuess | null>(null);
  const [character, setCharacter] = useState<string | null>(null);
  const [charLocked, setCharLocked] = useState(false);
  const [yt, setYt] = useState<YoutubePack | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [renderPct, setRenderPct] = useState(0);
  const [renderStage, setRenderStage] = useState("");

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
      if (shortsUrl) URL.revokeObjectURL(shortsUrl);
    };
  }, [resultUrl, previewUrl, shortsUrl]);

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
    setSongTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
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
      setError("Could not decode the audio");
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
      song: songTitle || audioFile?.name,
      artist: songArtist,
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
  }, [character, companionUp, audioFile, songTitle, songArtist, targetMin, atmosphere]);


  const onRenderProg = useCallback((p: RenderProgress) => {
    setRenderPct(p.pct);
    setRenderStage(p.stage);
  }, []);

  const runPreview = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || previewBusy) return;
    setPreviewBusy(true);
    setError(null);
    setRenderPct(0);
    setRenderStage("planning");
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
      const blob = await renderLoop(
        videoFile,
        audioFile,
        {
          videoStart: vStart,
          videoEnd: vEnd,
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          targetDuration: Math.min(20, targetSec),
          preview: true,
          plan: next,
        },
        onRenderProg
      );
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
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
    onRenderProg,
  ]);

  const generate = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || busy) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    setRenderPct(0);
    setRenderStage("planning");
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
      const blob = await renderLoop(
        videoFile,
        audioFile,
        {
          videoStart: vStart,
          videoEnd: vEnd,
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          targetDuration: targetSec,
          preview: false,
          plan: used,
        },
        onRenderProg
      );
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
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
    onRenderProg,
  ]);

  const generateShort = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || shortsBusy) return;
    setShortsBusy(true);
    setError(null);
    setRenderPct(0);
    setRenderStage("planning");
    try {
      let used = plan;
      if (!used) {
        used = await planLayers(audioFile, {
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          target: shortsSec,
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
      const blob = await renderLoop(
        videoFile,
        audioFile,
        {
          videoStart: vStart,
          videoEnd: vEnd,
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          targetDuration: shortsSec,
          preview: false,
          aspect: "shorts",
          plan: used,
        },
        onRenderProg
      );
      setShortsUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setShortsSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Short render failed");
    } finally {
      setShortsBusy(false);
    }
  }, [
    videoFile,
    audioFile,
    audioSel,
    shortsBusy,
    plan,
    shortsSec,
    atmosphere,
    sfxOn,
    intensity,
    watermark,
    vStart,
    vEnd,
    onRenderProg,
  ]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold mb-1">Video + Song</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              companionUp
                ? "border-green-700 bg-green-900/40 text-green-400"
                : "border-red-800 bg-red-950/50 text-red-400"
            }`}
          >
            {companionUp ? "● Companion online" : "● Companion offline"}
          </span>
        </div>
        <p className="text-zinc-400 text-sm mt-1">
          Upload a clip and a song. Set the length in minutes — video and song loop
          seamlessly to fill it. Atmosphere and SFX land automatically. Preview 20s
          before you generate.
        </p>
        {!companionUp && (
          <div className="mt-3 rounded-lg bg-amber-950/60 border border-amber-800 px-4 py-3 text-sm text-amber-300">
            Start the companion:{" "}
            <code className="bg-black/40 px-1.5 py-0.5 rounded">cd companion && ./start.sh</code>
          </div>
        )}
      </section>

      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">1 · Pick the video loop</h2>
        {!videoFile ? (
          <FileDropzone
            accept="video/*"
            label="Drop your video or click"
            hint="We find seamless loops; the chosen slice fades and repeats"
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
                Analyze first
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={windowSec}
                    onChange={(e) => setWindowSec(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5"
                  />
                  <span className="text-zinc-400 text-xs">s · 0 = all</span>
                </div>
              </label>
              <button
                onClick={runVideoAnalysis}
                disabled={!companionUp || analyzingVideo}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40"
              >
                {analyzingVideo ? "Finding the best cut…" : "Find seamless loops"}
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
                Manual trim
              </button>
            </div>

            {videoCandidates.length > 0 && !useManualVideo && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Hover to preview · click to pick. Export fades end into start so the cut
                  disappears.
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
                        <div className="text-xs text-cyan-400">Quality {c.score.toFixed(0)}%</div>
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

      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">2 · Song and final length</h2>
        {!audioFile ? (
          <FileDropzone
            accept="audio/*"
            label="Drop the song or click"
            hint="It will loop to cover the minutes you ask for"
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
              <span className="text-zinc-200 font-medium">How many minutes should the video last?</span>
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
                <span className="text-zinc-400 text-xs">minutes</span>
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
                  ["full", "Full song (loops if needed)"],
                  ["loops", "A detected song loop"],
                  ["trim", "Trim by hand"],
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
                  {analyzingAudio ? "Analyzing beats…" : "Detect song loops"}
                </button>
                {widened && (
                  <span className="text-xs text-amber-400">Search window was widened</span>
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
                The result will last{" "}
                <strong>{targetMin >= 1 ? `${targetMin} min` : `${targetSec.toFixed(0)}s`}</strong>
                {songLoops > 1 && (
                  <> · the song crossfades end→start and repeats ~{songLoops} times</>
                )}
                {videoLoops > 1 && <> · the video repeats ~{videoLoops} times with a fade</>}
                .
              </p>
            )}
          </div>
        )}
      </section>

      {canWork && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
          <h2 className="font-semibold">3 · Atmosphere (auto, you approve)</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            Fog, smoke and particles blend in screen mode at low opacity. Ambience sits
            under the song (low-pass). SFX (thunder, metal) land in quiet valleys.
          </p>

          <div>
            <div className="text-xs text-zinc-400 mb-1">Visual atmosphere</div>
            <div className="flex flex-wrap gap-2">
              {(overlays.length ? overlays : [{ id: "auto", label: "Auto" }]).map((o) => (
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
            Intensity: {Math.round(intensity * 100)}%
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
              Auto SFX (thunder / metal in the quiet parts)
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
              Silent Vigil Music watermark
            </label>
          </div>

          <button
            onClick={runPreview}
            disabled={previewBusy || !canWork}
            className="w-full py-2.5 rounded-lg font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40"
          >
            {previewBusy ? "Building 20s preview…" : "Preview how it would look (20 seconds)"}
          </button>
          {(previewBusy || busy) && <RenderBar pct={renderPct} stage={renderStage} />}

          {plan && (
            <div className="text-xs space-y-1 bg-zinc-950/50 border border-zinc-800 rounded-lg p-3">
              <div>
                Atmosphere: <strong>{plan.overlayLabel ?? "none"}</strong>
                {plan.blend ? ` · blend ${plan.blend}` : ""}
                {plan.opacity != null ? ` · opacity ${(plan.opacity * 100).toFixed(0)}%` : ""}
              </div>
              {plan.look?.overlayReason ? (
                <div>
                  Picked {plan.overlayLabel} because {plan.look.overlayReason}
                </div>
              ) : null}
              {plan.ambienceLabel && (
                <div>
                  Ambience: {plan.ambienceLabel} (low, low-pass {plan.lowpassHz} Hz)
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
                  Long videos: atmosphere rotates every ~90s (
                  {plan.chapters.map((c) => c.label).join(" → ")})
                </div>
              )}
              {plan.watermark && <div>Watermark: Silent Vigil Music (top edge)</div>}
            </div>
          )}

          {previewUrl && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                Rough preview (20s, smaller resolution). The final export is the same
                graph at full length.
              </p>
              <video src={previewUrl} controls className="w-full rounded-lg border border-zinc-800" />
            </div>
          )}
        </section>
      )}

      {videoFile && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">4 · Character, YouTube pack & thumbnail</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            Detects Guts, Thorfinn, Musashi or Buntarō from the drawing (and the filename).
            You can override. Copy uses the essays in <code>docs/</code> plus the title
            formula that actually ranks: Song (Slowed + Reverb) | mood.
          </p>
          {guess && (
            <p className="text-xs text-cyan-300">
              Guess: <strong>{guess.name}</strong> ({guess.series}) · {guess.confidence}% ·{" "}
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
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-400">
                  Song title
                  <input
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                    placeholder="Golden Brown"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Artist
                  <input
                    value={songArtist}
                    onChange={(e) => setSongArtist(e.target.value)}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                    placeholder="The Stranglers"
                  />
                </label>
              </div>
              <FieldCopy label="Title" value={yt.title} copied={copied} onCopy={setCopied} />
              <FieldCopy
                label="Description"
                value={yt.description}
                copied={copied}
                multiline
                onCopy={setCopied}
              />
              <FieldCopy label="Tags" value={yt.tagsLine} copied={copied} onCopy={setCopied} />
              <FieldCopy label="Playlist" value={yt.playlist} copied={copied} onCopy={setCopied} />
              <FieldCopy
                label="Pinned comment"
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
                  ).then(() => setCopied("all"));
                }}
              >
                {copied === "all" ? "Copied pack" : "Copy long-form pack"}
              </button>
              {yt.shortsTitle && (
                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <div className="text-xs text-zinc-400">Shorts promo copy (English — paste on YouTube)</div>
                  <FieldCopy label="Shorts title" value={yt.shortsTitle} copied={copied} onCopy={setCopied} />
                  <FieldCopy
                    label="Shorts description"
                    value={yt.shortsDescription || ""}
                    copied={copied}
                    multiline
                    onCopy={setCopied}
                  />
                  <FieldCopy
                    label="Shorts tags"
                    value={yt.shortsTagsLine || ""}
                    copied={copied}
                    onCopy={setCopied}
                  />
                </div>
              )}
            </div>
          )}

          {videoUrl && (
            <ThumbnailPicker
              videoUrl={videoUrl}
              start={vStart}
              end={vEnd || videoDuration || 8}
              caption={yt?.name || character || ""}
            />
          )}
        </section>
      )}

      <div className="space-y-3">
        <button
          onClick={generate}
          disabled={!canWork || busy || shortsBusy}
          className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg"
        >
          {busy
            ? "Rendering 16:9…"
            : `Generate YouTube video · ${targetMin >= 1 ? `${targetMin} min` : `${targetSec.toFixed(0)}s`} · 16:9`}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400">Shorts length</span>
          {[20, 25, 30].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShortsSec(s)}
              className={`px-2 py-1 rounded text-xs border ${
                shortsSec === s
                  ? "border-fuchsia-500 bg-fuchsia-500/15"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {s}s
            </button>
          ))}
          <button
            onClick={generateShort}
            disabled={!canWork || busy || shortsBusy}
            className="flex-1 py-2.5 rounded-xl font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40"
          >
            {shortsBusy ? "Rendering 9:16…" : `Generate Short · ${shortsSec}s · 9:16`}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          20–30s is the retention sweet spot for music teasers. 1080×1920, center crop,
          watermark in the Shorts safe zone. Use it to push the long loop.
        </p>
      </div>

      {(busy || shortsBusy) && <RenderBar pct={renderPct} stage={renderStage} />}

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {resultUrl && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">
            YouTube 16:9 ready{" "}
            <span className="text-xs text-zinc-400 font-normal">
              ({(resultSize / 1024 / 1024).toFixed(1)} MB)
            </span>
          </h2>
          <video src={resultUrl} controls loop className="w-full rounded-lg border border-zinc-800" />
          <button
            onClick={() =>
              fetch(resultUrl)
                .then((r) => r.blob())
                .then((b) => downloadBlob(b, "silent-vigil-youtube-16x9.mp4"))
            }
            className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
          >
            Download 16:9 MP4
          </button>
        </div>
      )}

      {shortsUrl && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">
            Shorts 9:16 ready{" "}
            <span className="text-xs text-zinc-400 font-normal">
              ({(shortsSize / 1024 / 1024).toFixed(1)} MB · {shortsSec}s)
            </span>
          </h2>
          <video
            src={shortsUrl}
            controls
            loop
            className="mx-auto max-h-[520px] rounded-lg border border-zinc-800"
          />
          <button
            onClick={() =>
              fetch(shortsUrl)
                .then((r) => r.blob())
                .then((b) => downloadBlob(b, "silent-vigil-shorts-9x16.mp4"))
            }
            className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
          >
            Download 9:16 Short
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
          {copied === label ? "Copied" : "Copy"}
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

function RenderBar({ pct, stage }: { pct: number; stage: string }) {
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 transition-[width] duration-300"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <p className="text-xs text-zinc-400 text-center">
        {stage || "working"} · {Math.round(pct)}%
      </p>
    </div>
  );
}

function ThumbnailPicker({
  videoUrl,
  start,
  end,
  caption,
}: {
  videoUrl: string;
  start: number;
  end: number;
  caption: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(start);
  const [preview, setPreview] = useState<string | null>(null);
  const [album, setAlbum] = useState<string | null>(null);

  const drawCover = useCallback((size: number, ratio: number) => {
    const v = ref.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = Math.round(size / ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const vr = v.videoWidth / v.videoHeight;
    let sx = 0;
    let sy = 0;
    let sw = v.videoWidth;
    let sh = v.videoHeight;
    if (vr > ratio) {
      sw = v.videoHeight * ratio;
      sx = (v.videoWidth - sw) / 2;
    } else {
      sh = v.videoWidth / ratio;
      sy = (v.videoHeight - sh) / 2;
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }, []);

  const grabThumb = useCallback(() => {
    const c = drawCover(1280, 16 / 9);
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx && caption) {
      const fade = ctx.createLinearGradient(0, 560, 0, 720);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 560, 1280, 160);
      ctx.font = "600 36px Montserrat, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(caption, 40, 680);
    }
    setPreview(c.toDataURL("image/jpeg", 0.92));
  }, [caption, drawCover]);

  const grabAlbum = useCallback(() => {
    const c = drawCover(3000, 1);
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 24;
      ctx.strokeRect(48, 48, 2904, 2904);
      if (caption) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 2760, 3000, 240);
        ctx.font = "600 72px Montserrat, system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(caption, 80, 2910);
      }
    }
    setAlbum(c.toDataURL("image/jpeg", 0.92));
  }, [caption, drawCover]);

  return (
    <div className="space-y-2 pt-2 border-t border-zinc-800">
      <div className="text-xs text-zinc-400">
        1280×720 thumbnail · 3000×3000 album (DistroKid / YouTube Music if the track is yours).
        The in-video Music card is Content ID — not something you attach by hand.
      </div>
      <video
        ref={ref}
        src={videoUrl}
        muted
        playsInline
        className="w-full aspect-video object-cover rounded-lg bg-black"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = start;
        }}
      />
      <label className="block text-xs text-zinc-400">
        Frame {t.toFixed(1)}s
        <input
          type="range"
          min={start}
          max={Math.max(start + 0.1, end)}
          step={0.05}
          value={t}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            setT(n);
            const v = ref.current;
            if (v) v.currentTime = n;
          }}
          className="w-full accent-cyan-500"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={grabThumb} className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 hover:border-zinc-500">
          Grab 1280×720
        </button>
        <button type="button" onClick={grabAlbum} className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 hover:border-zinc-500">
          Grab album 3000×3000
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = preview;
              a.download = "youtube-thumbnail-1280x720.jpg";
              a.click();
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-cyan-700 hover:bg-cyan-600"
          >
            Download thumbnail
          </button>
        )}
        {album && (
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = album;
              a.download = "album-cover-3000x3000.jpg";
              a.click();
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-cyan-700 hover:bg-cyan-600"
          >
            Download album cover
          </button>
        )}
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="YouTube thumbnail preview" className="w-full rounded-lg border border-zinc-800" />
      )}
      {album && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={album} alt="Album cover preview" className="w-48 rounded-lg border border-zinc-800" />
      )}
    </div>
  );
}
