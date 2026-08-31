"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SfxLoopTimeline from "@/components/SfxLoopTimeline";
import {
  DEFAULT_PARTICLE_CONTROLS,
  PhysicsParticleSystem,
  renderMangaMotionFrame,
  type AestheticStyle,
  type ParticleType,
} from "@/lib/mangaMotionEngine";
import {
  applyEditRhythmPreset,
  buildBeatMarkers,
  createDefaultEditProject,
  editClipAtTime,
  editOutputSize,
  editSourceTimeAt,
  editTimelineDuration,
  editTimelinePlacements,
  snapEditTime,
  type EditAssetMeta,
  type EditProject,
  type EditRhythmPreset,
  type EditTimelineClip,
} from "@/lib/editStudio";
import {
  buildEditFrameConfig,
  composeEditTransition,
  drawEditTextCue,
} from "@/lib/editStudioRender";
import {
  buildClipFrameCache,
  clipFrameAt,
  disposeClipFrameCache,
  type ClipFrameCache,
} from "@/lib/clipFrameCache";
import { transcodeVideoForBrowser } from "@/lib/companion";
import {
  drawProfessionalWatermark,
  ensureWatermarkFont,
} from "@/lib/watermark";
import {
  preloadCuratedSfx,
  type LoopSfxCue,
} from "@/lib/seinenSfxLibrary";
import { estimateBpmFromBuffer, getTimelineWaveformPeaks } from "@/lib/editAudioAnalysis";

interface RuntimeEditAsset extends EditAssetMeta {
  file: File;
  url: string;
  image: HTMLImageElement | null;
  cache: ClipFrameCache | null;
}

const EDIT_STYLES: Array<{ id: AestheticStyle; label: string }> = [
  { id: "original", label: "Original limpio" },
  { id: "seinen_bw", label: "Seinen B&W" },
  { id: "dark_fantasy", label: "Dark fantasy" },
  { id: "retro_90s", label: "Anime 90s" },
  { id: "golden_sunset", label: "Golden hour" },
  { id: "cyberpunk_neon", label: "Neón magenta" },
  { id: "vintage_sepia", label: "Sepia manga" },
];

const EDIT_PARTICLES: Array<{ id: ParticleType; label: string }> = [
  { id: "none", label: "Sin partículas" },
  { id: "cinematic_dust", label: "Polvo de lente" },
  { id: "snow_ash", label: "Nieve y ceniza" },
  { id: "cinematic_rain", label: "Lluvia cinematográfica" },
  { id: "light_leaks", label: "Fugas de luz" },
  { id: "embers_fire", label: "Brasas" },
  { id: "golden_sparks", label: "Chispas doradas" },
  { id: "dark_ink_fog", label: "Niebla de tinta" },
];

const EDIT_TRANSITIONS: Array<{ id: EditTimelineClip["transition"]; label: string; desc: string }> = [
  { id: "cut", label: "✂ Corte seco", desc: "Al beat" },
  { id: "punch", label: "💥 Punch", desc: "Zoom + temblor" },
  { id: "shake", label: "🫨 Shake", desc: "Vibración golpe" },
  { id: "zoom", label: "🔍 Zoom", desc: "Entrada con zoom" },
  { id: "flash", label: "⚡ Flash", desc: "Destello blanco" },
  { id: "whip", label: "💨 Whip", desc: "Barrido lateral" },
  { id: "crossfade", label: "🌫 Fundido", desc: "Suave" },
];

const EDIT_MOTIONS: Array<{ id: EditTimelineClip["motion"]; label: string }> = [
  { id: "static", label: "Fijo" },
  { id: "push", label: "Push suave" },
  { id: "drift", label: "Deriva" },
  { id: "whip", label: "Whip pan" },
  { id: "vertigo", label: "Vertigo zoom" },
  { id: "spiral", label: "Espiral" },
  { id: "scan", label: "Scan" },
  { id: "impact", label: "Impacto" },
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function loadStoredProject(): EditProject {
  const fallback = createDefaultEditProject();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("loop-studio:edit-project:v1");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EditProject>;
    if (parsed.version !== 1) return fallback;
    const clips = Array.isArray(parsed.clips) ? (parsed.clips as EditTimelineClip[]).map((clip) => ({
      ...clip,
      motionIntensity: Math.max(0, Math.min(100, (clip as unknown as { motionIntensity?: number }).motionIntensity ?? (clip.motion === "impact" ? 55 : clip.motion === "static" ? 0 : 32))),
      playbackRate: Math.max(0.5, Math.min(2, (clip as unknown as { playbackRate?: number }).playbackRate ?? 1)),
      velocityCurve: ((clip as unknown as { velocityCurve?: string }).velocityCurve as EditTimelineClip["velocityCurve"]) ?? "linear",
      transition: (clip.transition as EditTimelineClip["transition"]) ?? "cut",
      motion: (clip.motion as EditTimelineClip["motion"]) ?? "push",
    })) : [];
    return {
      ...fallback,
      ...parsed,
      format: "9:16",
      colorGrade: { ...fallback.colorGrade, ...parsed.colorGrade },
      particleControls: { ...fallback.particleControls, ...parsed.particleControls },
      watermarkStyle: { ...fallback.watermarkStyle, ...parsed.watermarkStyle },
      clips,
      textCues: Array.isArray(parsed.textCues) ? parsed.textCues : [],
    };
  } catch {
    return fallback;
  }
}

function TimelineClipBlock({
  clip,
  index,
  selected,
  pxPerSecond,
  onSelect,
  onDropClip,
}: {
  clip: EditTimelineClip;
  index: number;
  selected: boolean;
  pxPerSecond: number;
  onSelect: () => void;
  onDropClip: (sourceId: string, targetId: string) => void;
}) {
  const motionLabel = EDIT_MOTIONS.find((m) => m.id === clip.motion)?.label ?? clip.motion;
  const transLabel = EDIT_TRANSITIONS.find((t) => t.id === clip.transition)?.label ?? clip.transition;
  const rateBadge = Math.abs((clip.playbackRate ?? 1) - 1) > 0.02 ? `${(clip.playbackRate ?? 1).toFixed(2)}×` : "";
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/edit-clip", clip.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropClip(event.dataTransfer.getData("text/edit-clip"), clip.id);
      }}
      onClick={onSelect}
      style={{ width: Math.max(74, clip.duration * pxPerSecond) }}
      className={`group relative h-20 shrink-0 overflow-hidden border-r border-black/50 px-2 py-2 text-left transition ${selected
        ? "bg-fuchsia-600 text-white ring-2 ring-inset ring-fuchsia-300"
        : index % 2 === 0
          ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}
      title={`${transLabel} · ${motionLabel}${rateBadge ? ` · ${rateBadge}` : ""} — Arrastra para reordenar`}
    >
      <span className="block truncate text-[10px] font-black uppercase tracking-wider">{clip.label}</span>
      <span className="mt-1 block font-mono text-[10px] opacity-75">{clip.duration.toFixed(2)} s{rateBadge ? ` · ${rateBadge}` : ""}</span>
      <span className="absolute bottom-1.5 left-2 text-[8px] font-semibold uppercase opacity-60 truncate pr-6">{motionLabel} · {transLabel.split(" ")[0]}</span>
      <span className="absolute right-1.5 top-1.5 font-mono text-[9px] opacity-40">{index + 1}</span>
    </button>
  );
}

export default function EditStudioPage() {
  const [project, setProject] = useState<EditProject>(loadStoredProject);
  const [assets, setAssets] = useState<RuntimeEditAsset[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(project.clips[0]?.id ?? null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("Añade imágenes o vídeos para empezar.");
  const [error, setError] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sfxCues, setSfxCues] = useState<LoopSfxCue[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timelineTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const projectRef = useRef(project);
  const assetsRef = useRef(assets);
  const previewParticlesRef = useRef(new PhysicsParticleSystem());
  const previousParticlesRef = useRef(new PhysicsParticleSystem());
  const exportAbortRef = useRef<AbortController | null>(null);

  const duration = useMemo(() => editTimelineDuration(project.clips), [project.clips]);
  const placements = useMemo(() => editTimelinePlacements(project.clips), [project.clips]);
  const beatMarkers = useMemo(() => buildBeatMarkers(duration, project.bpm, 1), [duration, project.bpm]);
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) ?? null;
  const selectedAsset = selectedClip ? assets.find((asset) => asset.id === selectedClip.assetId) ?? null : null;
  const pxPerSecond = 72;
  const waveformPeaks = useMemo(() => {
    if (!audioBuffer || duration <= 0) return null;
    return getTimelineWaveformPeaks(audioBuffer, project.musicStart, duration, pxPerSecond);
  }, [audioBuffer, duration, project.musicStart]);
  const avgIntensity = useMemo(() => {
    if (!project.clips.length) return 32;
    return Math.round(project.clips.reduce((acc, clip) => acc + (clip.motionIntensity ?? 32), 0) / project.clips.length);
  }, [project.clips]);
  const [bpmDetecting, setBpmDetecting] = useState(false);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => {
    localStorage.setItem("loop-studio:edit-project:v1", JSON.stringify(project));
  }, [project]);
  useEffect(() => {
    void ensureWatermarkFont();
  }, []);
  useEffect(() => () => {
    for (const asset of assetsRef.current) {
      URL.revokeObjectURL(asset.url);
      disposeClipFrameCache(asset.cache);
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [audioUrl, resultUrl]);

  const updateProject = useCallback((patch: Partial<EditProject>) => {
    setProject((current) => ({ ...current, ...patch }));
  }, []);

  const updateClip = useCallback((id: string, patch: Partial<EditTimelineClip>) => {
    setProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip),
    }));
  }, []);

  const appendAssetAsClip = useCallback((asset: RuntimeEditAsset) => {
    const defaultDuration = asset.kind === "image" ? 1.5 : Math.min(2, Math.max(0.4, asset.duration));
    const clip: EditTimelineClip = {
      id: uid("clip"),
      assetId: asset.id,
      label: asset.name.replace(/\.[^.]+$/, ""),
      duration: defaultDuration,
      sourceStart: 0,
      sourceDuration: asset.kind === "image" ? defaultDuration : Math.min(asset.duration, defaultDuration),
      transition: "cut",
      transitionDuration: 0.12,
      motion: "push",
      motionIntensity: 32,
      playbackRate: 1,
      velocityCurve: "linear",
      style: "inherit",
    };
    setProject((current) => ({ ...current, clips: [...current.clips, clip] }));
    setSelectedClipId(clip.id);
  }, []);

  const prepareVideoAsset = useCallback(async (file: File, url: string): Promise<void> => {
    setStatus(`Preparando borrador de ${file.name}…`);
    const metadataVideo = document.createElement("video");
    metadataVideo.preload = "metadata";
    metadataVideo.muted = true;
    metadataVideo.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("El vídeo tardó demasiado en responder")), 15_000);
      metadataVideo.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      metadataVideo.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Códec no compatible con el navegador"));
      };
    });
    const cache = await buildClipFrameCache(file, {
      maxWidth: 540,
      fps: 18,
      maxMemoryMb: 88,
      onProgress: (ratio) => setStatus(`Preparando ${file.name} · ${Math.round(ratio * 100)}%`),
    });
    const asset: RuntimeEditAsset = {
      id: uid("asset"),
      name: file.name,
      kind: "video",
      duration: Math.max(0.25, metadataVideo.duration || cache.duration),
      width: metadataVideo.videoWidth || cache.sourceWidth,
      height: metadataVideo.videoHeight || cache.sourceHeight,
      file,
      url,
      image: null,
      cache,
    };
    metadataVideo.removeAttribute("src");
    metadataVideo.load();
    setAssets((current) => [...current, asset]);
    appendAssetAsClip(asset);
  }, [appendAssetAsClip]);

  const prepareFile = useCallback(async (file: File, allowTranscode = true): Promise<void> => {
    const isImage = file.type.startsWith("image/") && !file.type.includes("gif");
    const isVideo = file.type.startsWith("video/") || !isImage;
    const url = URL.createObjectURL(file);
    try {
      if (isImage) {
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`No se pudo abrir ${file.name}`));
        });
        const asset: RuntimeEditAsset = {
          id: uid("asset"),
          name: file.name,
          kind: "image",
          duration: 10,
          width: image.naturalWidth,
          height: image.naturalHeight,
          file,
          url,
          image,
          cache: null,
        };
        setAssets((current) => [...current, asset]);
        appendAssetAsClip(asset);
        return;
      }

      if (isVideo) {
        await prepareVideoAsset(file, url);
      }
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (isVideo && allowTranscode) {
        setStatus(`Convirtiendo ${file.name} a H.264 localmente…`);
        try {
          const converted = await transcodeVideoForBrowser(file);
          const convertedUrl = URL.createObjectURL(converted);
          try {
            await prepareVideoAsset(converted, convertedUrl);
          } catch (convertedCause) {
            URL.revokeObjectURL(convertedUrl);
            throw convertedCause;
          }
          return;
        } catch (transcodeError) {
          console.warn("Conversión local no disponible:", transcodeError);
        }
      }
      throw cause;
    }
  }, [appendAssetAsClip, prepareVideoAsset]);

  const handleMediaFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoadingMedia(true);
    setError(null);
    try {
      for (const file of Array.from(files)) await prepareFile(file);
      setStatus(`${files.length} recurso${files.length === 1 ? "" : "s"} añadido${files.length === 1 ? "" : "s"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar el medio");
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleAudioFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const nextUrl = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioBuffer(decoded);
      setAudioUrl(nextUrl);
      void preloadCuratedSfx(context);
      // auto BPM si detecta ritmo claro (sin pisar si el usuario ya editó manualmente recientemente)
      const autoBpm = estimateBpmFromBuffer(decoded);
      if (autoBpm) {
        setProject((cur) => ({ ...cur, bpm: autoBpm }));
        setStatus(`Música lista · ${formatTime(decoded.duration)} · BPM ${autoBpm} detectado`);
      } else {
        setStatus(`Música lista · ${formatTime(decoded.duration)}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo decodificar la canción");
    }
  };

  const handleDetectBpm = useCallback(async () => {
    if (!audioBuffer) return;
    setBpmDetecting(true);
    try {
      // ligera pausa para que el UI pinte el spinner
      await new Promise<void>((r) => setTimeout(r, 30));
      const bpm = estimateBpmFromBuffer(audioBuffer);
      if (bpm) {
        updateProject({ bpm });
        setStatus(`BPM detectado: ${bpm} · rail actualizado`);
      } else {
        setError("No se detectó un pulso claro — ajusta BPM a mano");
      }
    } finally {
      setBpmDetecting(false);
    }
  }, [audioBuffer, updateProject]);

  const applyBulkTransition = useCallback((transition: EditTimelineClip["transition"]) => {
    if (!project.clips.length) return;
    setProject((cur) => ({ ...cur, clips: cur.clips.map((clip, idx) => idx === 0 ? clip : ({ ...clip, transition })) }));
    setStatus(`Transición ${transition} aplicada a ${Math.max(0, project.clips.length - 1)} cortes`);
  }, [project.clips.length]);

  const applyBulkMotion = useCallback((motion: EditTimelineClip["motion"]) => {
    if (!project.clips.length) return;
    setProject((cur) => ({ ...cur, clips: cur.clips.map((clip) => ({ ...clip, motion })) }));
    setStatus(`Cámara ${motion} aplicada a todas las tomas`);
  }, [project.clips.length]);

  const seekTo = useCallback((next: number) => {
    const safe = Math.max(0, Math.min(Math.max(0, duration - 1 / Math.max(1, project.fps)), next));
    timelineTimeRef.current = safe;
    setCurrentTime(safe);
    const audio = audioElementRef.current;
    if (audio && audioBuffer) {
      audio.currentTime = (project.musicStart + safe) % Math.max(0.01, audioBuffer.duration);
    }
  }, [audioBuffer, duration, project.fps, project.musicStart]);

  const togglePlayback = useCallback(() => {
    if (!project.clips.length) return;
    setIsPlaying((playing) => {
      const next = !playing;
      const audio = audioElementRef.current;
      if (audio) {
        audio.volume = Math.max(0, Math.min(1, project.musicVolume));
        if (next) {
          audio.currentTime = (project.musicStart + timelineTimeRef.current) % Math.max(0.01, audio.duration || 1);
          void audio.play().catch(() => undefined);
        } else {
          audio.pause();
        }
      }
      return next;
    });
  }, [project.clips.length, project.musicStart, project.musicVolume]);

  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();
    let lastUiUpdate = 0;
    const sceneCanvas = document.createElement("canvas");
    const previousCanvas = document.createElement("canvas");

    const draw = (now: number) => {
      const liveProject = projectRef.current;
      const liveAssets = assetsRef.current;
      const canvas = canvasRef.current;
      const liveDuration = editTimelineDuration(liveProject.clips);
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      if (isPlayingRef.current && liveDuration > 0) {
        timelineTimeRef.current += dt;
        if (timelineTimeRef.current >= liveDuration) {
          timelineTimeRef.current = 0;
          const audio = audioElementRef.current;
          if (audio) audio.currentTime = liveProject.musicStart % Math.max(0.01, audio.duration || 1);
        }
      }

      if (canvas) {
        const logical = editOutputSize("9:16");
        const width = 540;
        const height = Math.round(width * logical.height / logical.width);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          sceneCanvas.width = width;
          sceneCanvas.height = height;
          previousCanvas.width = width;
          previousCanvas.height = height;
        }
        const ctx = canvas.getContext("2d");
        const sceneCtx = sceneCanvas.getContext("2d");
        const previousCtx = previousCanvas.getContext("2d");
        if (ctx && sceneCtx && previousCtx) {
          const placement = editClipAtTime(liveProject.clips, timelineTimeRef.current);
          const asset = placement ? liveAssets.find((entry) => entry.id === placement.clip.assetId) : null;
          const sourceTime = placement
            ? editSourceTimeAt(placement.clip, placement.localTime)
            : 0;
          const source = asset?.kind === "image"
            ? asset.image
            : asset?.cache
              ? clipFrameAt(asset.cache, sourceTime)
              : null;

          if (placement && source) {
            const config = buildEditFrameConfig(liveProject, placement.clip, 60, 1 / 60);
            renderMangaMotionFrame(sceneCtx, source, config, width, height, placement.localTime, null, undefined, 0);
            previewParticlesRef.current.update(
              liveProject.particles,
              liveProject.particleIntensity,
              width,
              height,
              timelineTimeRef.current,
              liveProject.particleSpeed,
              1,
              { ...liveProject.particleControls, loopDuration: Math.max(0.5, liveDuration) }
            );
            previewParticlesRef.current.draw(sceneCtx, liveProject.particles, liveProject.particleControls);

            let previousSource: CanvasImageSource | null = null;
            if (placement.index > 0 && placement.localTime < placement.clip.transitionDuration) {
              const previousPlacement = editTimelinePlacements(liveProject.clips)[placement.index - 1]!;
              const previousAsset = liveAssets.find((entry) => entry.id === previousPlacement.clip.assetId);
              const previousSourceTime = previousPlacement.clip.sourceStart + previousPlacement.clip.sourceDuration;
              const previousMedia = previousAsset?.kind === "image"
                ? previousAsset.image
                : previousAsset?.cache
                  ? clipFrameAt(previousAsset.cache, previousSourceTime)
                  : null;
              if (previousMedia) {
                const previousConfig = buildEditFrameConfig(liveProject, previousPlacement.clip, 60, 1 / 60);
                renderMangaMotionFrame(
                  previousCtx,
                  previousMedia,
                  previousConfig,
                  width,
                  height,
                  Math.max(0, previousPlacement.clip.duration - 1 / 60),
                  null,
                  undefined,
                  0
                );
                previousParticlesRef.current.update(
                  liveProject.particles,
                  liveProject.particleIntensity,
                  width,
                  height,
                  previousPlacement.end,
                  liveProject.particleSpeed,
                  1,
                  { ...liveProject.particleControls, loopDuration: Math.max(0.5, liveDuration) }
                );
                previousParticlesRef.current.draw(previousCtx, liveProject.particles, liveProject.particleControls);
                previousSource = previousCanvas;
              }
            }
            composeEditTransition(ctx, sceneCanvas, previousSource, placement.clip, placement.localTime, width, height);
            for (const cue of liveProject.textCues) drawEditTextCue(ctx, cue, width, height, timelineTimeRef.current);
            if (liveProject.watermarkEnabled) {
              drawProfessionalWatermark(ctx, {
                text: liveProject.watermarkText,
                width,
                height,
                opacity: liveProject.watermarkOpacity,
                shorts: true,
                style: liveProject.watermarkStyle,
              });
            }
          } else {
            ctx.fillStyle = "#09090b";
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "#71717a";
            ctx.textAlign = "center";
            ctx.font = "600 16px ui-sans-serif, system-ui";
            ctx.fillText(asset ? "Preparando borrador…" : "Añade clips a la línea de tiempo", width / 2, height / 2);
          }
        }
      }

      if (now - lastUiUpdate > 90) {
        setCurrentTime(timelineTimeRef.current);
        lastUiUpdate = now;
      }
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const removeAsset = (assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (asset) {
      URL.revokeObjectURL(asset.url);
      disposeClipFrameCache(asset.cache);
    }
    setAssets((current) => current.filter((entry) => entry.id !== assetId));
    setProject((current) => ({ ...current, clips: current.clips.filter((clip) => clip.assetId !== assetId) }));
    if (selectedClip?.assetId === assetId) setSelectedClipId(null);
  };

  const reorderClips = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    setProject((current) => {
      const next = [...current.clips];
      const sourceIndex = next.findIndex((clip) => clip.id === sourceId);
      const targetIndex = next.findIndex((clip) => clip.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved!);
      return { ...current, clips: next };
    });
  };

  const applyRhythm = (preset: EditRhythmPreset) => {
    setProject((current) => ({
      ...current,
      clips: applyEditRhythmPreset(current.clips, preset, current.bpm),
    }));
    setStatus(preset === "reference" ? "Cadencia de los edits de referencia aplicada." : "Ritmo ajustado a la rejilla musical.");
  };

  const addTextCue = () => {
    const cue = {
      id: uid("text"),
      text: "HUMAN",
      start: timelineTimeRef.current,
      duration: 0.8,
      x: 0.5,
      y: 0.58,
      size: 48,
      color: "#ffffff",
      accent: "#d946ef",
    };
    setProject((current) => ({ ...current, textCues: [...current.textCues, cue] }));
  };

  const saveProjectFile = () => {
    const manifest = {
      ...project,
      assets: assets.map(({ id, name, kind, duration: assetDuration, width, height }) => ({
        id, name, kind, duration: assetDuration, width, height,
      })),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9_-]+/gi, "_") || "edit"}.loop-edit.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const loadProjectFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as EditProject;
      if (parsed.version !== 1 || !Array.isArray(parsed.clips)) throw new Error("Proyecto incompatible");
      const fallback = createDefaultEditProject();
      const migratedClips = (parsed.clips as EditTimelineClip[]).map((clip) => ({
        ...clip,
        motionIntensity: Math.max(0, Math.min(100, (clip as unknown as { motionIntensity?: number }).motionIntensity ?? 32)),
        playbackRate: Math.max(0.5, Math.min(2, (clip as unknown as { playbackRate?: number }).playbackRate ?? 1)),
        velocityCurve: ((clip as unknown as { velocityCurve?: string }).velocityCurve as EditTimelineClip["velocityCurve"]) ?? "linear",
      }));
      setProject({
        ...fallback,
        ...parsed,
        format: "9:16",
        clips: migratedClips,
        colorGrade: { ...fallback.colorGrade, ...parsed.colorGrade },
        particleControls: { ...fallback.particleControls, ...parsed.particleControls },
        watermarkStyle: { ...fallback.watermarkStyle, ...parsed.watermarkStyle },
      });
      setSelectedClipId(parsed.clips[0]?.id ?? null);
      seekTo(0);
      setStatus("Proyecto cargado. Reimporta los archivos que falten por nombre.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el proyecto");
    }
  };

  const exportVideo = async () => {
    if (!project.clips.length || exporting) return;
    setError(null);
    setExporting(true);
    setExportProgress(0);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    try {
      const { exportEditStudioVideo } = await import("@/lib/editStudioExport");
      const blob = await exportEditStudioVideo({
        project,
        assets,
        audioBuffer,
        sfxCues,
        signal: controller.signal,
        onProgress: (ratio, stage) => {
          setExportProgress(ratio);
          setExportStage(stage);
        },
      });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^a-z0-9_-]+/gi, "_") || "edit"}_${project.format.replace(":", "x")}.mp4`;
      anchor.click();
      setStatus("Edit exportado y listo para publicar.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setExportStage("Exportación cancelada");
      } else {
        setError(cause instanceof Error ? cause.message : "Falló la exportación");
      }
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {audioUrl && <audio ref={audioElementRef} src={audioUrl} preload="auto" />}

      <section className="relative overflow-hidden border-y border-zinc-800 bg-zinc-950 px-4 py-7 sm:px-7">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fuchsia-500 via-amber-300 to-cyan-400" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-fuchsia-700/10 blur-3xl" />
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-fuchsia-400">Loop Studio / montaje rítmico · 9:16 Shorts</p>
        <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">EDIT <span className="text-zinc-600">STUDIO</span></h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Edits verticales 9:16 al beat con 7 transiciones, 8 movimientos de cámara y velocidad por toma. Sine loops — cortes limpios para cualquier anime. Dual Studio sigue intacto para loops largos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveProjectFile} className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-zinc-500">Guardar proyecto</button>
            <label className="cursor-pointer border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-zinc-500">
              Abrir proyecto
              <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => void loadProjectFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      </section>

      {error && <div className="border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4">
          <div className="border border-zinc-800 bg-black p-3 shadow-2xl shadow-black/50">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-3">
              <input
                aria-label="Nombre del proyecto"
                value={project.name}
                onChange={(event) => updateProject({ name: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-black uppercase tracking-wider text-white outline-none"
              />
              <span className="font-mono text-[10px] text-zinc-500">9:16 · {project.fps} FPS · {formatTime(duration)}</span>
            </div>
            <div className="mx-auto max-w-[430px] overflow-hidden border border-zinc-800 bg-zinc-950">
              <canvas
                ref={canvasRef}
                data-testid="edit-preview-canvas"
                className="block h-auto w-full"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={togglePlayback} disabled={!project.clips.length} className="h-10 min-w-24 bg-white px-4 text-xs font-black text-black disabled:opacity-30">
                {isPlaying ? "❚❚ PAUSA" : "▶ PLAY"}
              </button>
              <input
                aria-label="Cabezal de Edit Studio"
                type="range"
                min="0"
                max={Math.max(0.01, duration)}
                step={1 / project.fps}
                value={Math.min(currentTime, Math.max(0, duration))}
                onChange={(event) => seekTo(Number(event.target.value))}
                className="min-w-0 flex-1 accent-fuchsia-500"
              />
              <span className="w-24 text-right font-mono text-[11px] text-zinc-400">{formatTime(currentTime)}</span>
            </div>
          </div>

          <section className="border border-zinc-800 bg-zinc-950">
            <div className="flex flex-col gap-3 border-b border-zinc-800 px-3 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-200">Timeline / beat rail</h2>
                  <p className="mt-1 text-[10px] text-zinc-500">Arrastra clips para ordenar. Click en la regla para mover el cabezal. Waveform real de la canción detrás.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="flex items-center gap-1 border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-400">
                    BPM
                    <input type="number" min="30" max="240" value={project.bpm} onChange={(event) => updateProject({ bpm: Math.max(30, Math.min(240, Number(event.target.value) || 120)) })} className="w-14 bg-transparent font-mono text-white outline-none" />
                  </label>
                  <button type="button" disabled={!audioBuffer || bpmDetecting} onClick={() => void handleDetectBpm()} className="border border-cyan-700 bg-cyan-950/60 px-2 py-1 text-[10px] font-bold text-cyan-200 disabled:opacity-40">{bpmDetecting ? "Detectando…" : "🎵 Detectar BPM"}</button>
                  <button type="button" onClick={() => applyRhythm("reference")} className="border border-fuchsia-800 bg-fuchsia-950/50 px-2 py-1 text-[10px] font-bold text-fuchsia-200">Referencia 18 s</button>
                  <button type="button" onClick={() => applyRhythm("build-drop")} className="border border-amber-800 bg-amber-950/40 px-2 py-1 text-[10px] font-bold text-amber-200">Build → drop</button>
                  <button type="button" onClick={() => applyRhythm("steady")} className="border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-bold text-zinc-300">Constante</button>
                </div>
              </div>
              {project.clips.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-zinc-900 pt-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Aplicar a todos:</span>
                  <button type="button" onClick={() => applyBulkTransition("punch")} className="border border-fuchsia-800 bg-black px-2 py-1 text-[9px] font-bold text-fuchsia-300 hover:bg-fuchsia-950/40">💥 Punch</button>
                  <button type="button" onClick={() => applyBulkTransition("shake")} className="border border-amber-800 bg-black px-2 py-1 text-[9px] font-bold text-amber-300 hover:bg-amber-950/40">🫨 Shake</button>
                  <button type="button" onClick={() => applyBulkTransition("cut")} className="border border-zinc-700 bg-black px-2 py-1 text-[9px] font-bold text-zinc-300 hover:bg-zinc-900">✂ Corte</button>
                  <span className="mx-1 h-4 w-px bg-zinc-800" />
                  <button type="button" onClick={() => applyBulkMotion("push")} className="border border-cyan-800 bg-black px-2 py-1 text-[9px] font-bold text-cyan-300 hover:bg-cyan-950/40">Push</button>
                  <button type="button" onClick={() => applyBulkMotion("impact")} className="border border-red-900 bg-black px-2 py-1 text-[9px] font-bold text-red-300 hover:bg-red-950/30">Impacto</button>
                  <button type="button" onClick={() => applyBulkMotion("whip")} className="border border-zinc-700 bg-black px-2 py-1 text-[9px] font-bold text-zinc-300 hover:bg-zinc-900">Whip</button>
                  <span className="mx-1 h-4 w-px bg-zinc-800" />
                  <label className="flex items-center gap-1.5 text-[9px] text-zinc-500">Energía <span className="font-mono text-zinc-300">{avgIntensity}%</span>
                    <input type="range" min="0" max="100" value={avgIntensity} onChange={(event) => {
                      const v = Number(event.target.value);
                      setProject((cur) => ({ ...cur, clips: cur.clips.map((clip) => ({ ...clip, motionIntensity: v })) }));
                    }} className="w-20 accent-fuchsia-500" />
                  </label>
                </div>
              )}
            </div>
            <div className="overflow-x-auto bg-black/70">
              <div
                className="relative min-h-28 min-w-full"
                style={{ width: Math.max(720, duration * pxPerSecond) }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  seekTo((event.clientX - rect.left) / pxPerSecond);
                }}
              >
                {/* Waveform detrás de beat markers */}
                {waveformPeaks && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex h-6 items-end gap-px overflow-hidden opacity-45" style={{ width: duration * pxPerSecond }}>
                    {waveformPeaks.map((peak, idx) => (
                      <div key={idx} className="shrink-0 bg-fuchsia-400/55" style={{ width: Math.max(1, (duration * pxPerSecond) / waveformPeaks.length - 0.5), height: Math.max(1, peak * 22) }} />
                    ))}
                  </div>
                )}
                {beatMarkers.map((time, index) => {
                  const isBar = index % 4 === 0;
                  return (
                    <div key={`${time}-${index}`} className={`pointer-events-none absolute inset-y-0 border-l ${isBar ? "border-cyan-400/28" : "border-cyan-400/12"}`} style={{ left: time * pxPerSecond }}>
                      <span className={`absolute left-1 top-1 font-mono text-[8px] ${isBar ? "text-cyan-200/70 font-bold" : "text-cyan-300/35"}`}>{index + 1}</span>
                    </div>
                  );
                })}
                <div className="absolute left-0 right-0 top-7 flex h-20">
                  {project.clips.map((clip, index) => (
                    <TimelineClipBlock
                      key={clip.id}
                      clip={clip}
                      index={index}
                      selected={clip.id === selectedClipId}
                      pxPerSecond={pxPerSecond}
                      onSelect={() => {
                        setSelectedClipId(clip.id);
                        seekTo(placements[index]?.start ?? 0);
                      }}
                      onDropClip={reorderClips}
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-fuchsia-400 shadow-[0_0_10px_#e879f9]" style={{ left: currentTime * pxPerSecond }} />
              </div>
            </div>
          </section>

          <details className="border border-zinc-800 bg-zinc-950 p-3">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-300">SFX por golpe y ambientes</summary>
            <div className="pt-3">
              <SfxLoopTimeline
                loopDuration={Math.max(0.5, duration)}
                currentTime={currentTime}
                timeRef={timelineTimeRef}
                isPlaying={isPlaying}
                onTogglePlay={togglePlayback}
                cues={sfxCues}
                onCuesChange={setSfxCues}
                onSeekRequest={seekTo}
                audioContextRef={audioContextRef}
                activeFormatFilter="9x16"
                hasMedia={project.clips.length > 0}
              />
            </div>
          </details>
        </section>

        <aside className="space-y-4">
          <section className="border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-200">01 / Medios</h2>
              <label className={`cursor-pointer bg-fuchsia-600 px-2.5 py-1.5 text-[10px] font-black text-white ${loadingMedia ? "pointer-events-none opacity-50" : "hover:bg-fuchsia-500"}`}>
                {loadingMedia ? "Preparando…" : "+ Importar"}
                <input type="file" multiple accept="video/*,image/*" className="hidden" onChange={(event) => void handleMediaFiles(event.target.files)} />
              </label>
            </div>
            <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
              {assets.length === 0 && <p className="border border-dashed border-zinc-800 px-3 py-5 text-center text-[10px] text-zinc-600">MP4, MOV, WebM, JPG, PNG</p>}
              {assets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 border border-zinc-800 bg-black/40 p-2">
                  <span className="text-lg">{asset.kind === "video" ? "🎞️" : "🖼️"}</span>
                  <button type="button" onClick={() => appendAssetAsClip(asset)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[10px] font-bold text-zinc-200">{asset.name}</span>
                    <span className="font-mono text-[9px] text-zinc-600">{asset.width}×{asset.height}{asset.kind === "video" ? ` · ${asset.duration.toFixed(1)}s` : ""}</span>
                  </button>
                  <button type="button" onClick={() => removeAsset(asset.id)} className="px-1 text-xs text-zinc-600 hover:text-red-400">×</button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-zinc-600">Pulsa un medio para añadir otra toma del mismo archivo.</p>
          </section>

          <section className="border border-zinc-800 bg-zinc-950 p-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-200">02 / Música</h2>
            <label className="mt-3 block cursor-pointer border border-dashed border-zinc-700 bg-black/30 px-3 py-3 text-center text-[10px] text-zinc-400 hover:border-zinc-500">
              {audioFile ? audioFile.name : "Seleccionar canción"}
              <input type="file" accept="audio/*" className="hidden" onChange={(event) => void handleAudioFile(event.target.files?.[0] ?? null)} />
            </label>
            {audioBuffer && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[9px] text-zinc-500">Inicio canción
                  <input type="number" min="0" max={audioBuffer.duration} step="0.1" value={project.musicStart} onChange={(event) => updateProject({ musicStart: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                </label>
                <label className="text-[9px] text-zinc-500">Volumen {Math.round(project.musicVolume * 100)}%
                  <input type="range" min="0" max="120" value={Math.round(project.musicVolume * 100)} onChange={(event) => updateProject({ musicVolume: Number(event.target.value) / 100 })} className="mt-2 w-full accent-fuchsia-500" />
                </label>
              </div>
            )}
          </section>

          {selectedClip && (
            <section className="border border-fuchsia-900/60 bg-fuchsia-950/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-xs font-black uppercase tracking-wider text-fuchsia-200">03 / Toma seleccionada</h2>
                <span className="font-mono text-[9px] text-zinc-600">{selectedAsset?.kind ?? "missing"}</span>
              </div>
              <input value={selectedClip.label} onChange={(event) => updateClip(selectedClip.id, { label: event.target.value })} className="mt-3 w-full border-b border-zinc-700 bg-transparent py-1 text-xs font-bold text-white outline-none" aria-label="Nombre de toma" />
              {/* Tiempo */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] text-zinc-500">
                <label>Duración final
                  <input aria-label="Duración de toma" type="number" min="0.25" max="30" step="0.05" value={selectedClip.duration} onChange={(event) => updateClip(selectedClip.id, { duration: Math.max(0.25, Number(event.target.value) || 0.25) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                </label>
                <label>Fuente desde
                  <input type="number" min="0" max={selectedAsset?.duration ?? 30} step="0.05" value={selectedClip.sourceStart} onChange={(event) => updateClip(selectedClip.id, { sourceStart: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                </label>
                <label>Tramo fuente
                  <input type="number" min="0.05" max={selectedAsset?.duration ?? 30} step="0.05" value={selectedClip.sourceDuration} onChange={(event) => updateClip(selectedClip.id, { sourceDuration: Math.max(0.05, Number(event.target.value) || 0.05) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                </label>
              </div>
              {/* Velocidad */}
              <div className="mt-3 rounded border border-zinc-800 bg-black/40 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-300">⚡ Velocidad</span>
                  <span className="font-mono text-[10px] text-fuchsia-300">{(selectedClip.playbackRate ?? 1).toFixed(2)}×</span>
                </div>
                <input type="range" min="0.5" max="2" step="0.05" value={selectedClip.playbackRate ?? 1} onChange={(event) => updateClip(selectedClip.id, { playbackRate: Number(event.target.value) })} className="mt-2 w-full accent-fuchsia-500" />
                <div className="mt-1 flex justify-between text-[8px] text-zinc-500"><span>0.5× lento</span><span>1×</span><span>2× rápido</span></div>
                <label className="mt-2 block text-[9px] text-zinc-500">Curva
                  <select value={selectedClip.velocityCurve ?? "linear"} onChange={(event) => updateClip(selectedClip.id, { velocityCurve: event.target.value as EditTimelineClip["velocityCurve"] })} className="mt-1 w-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200">
                    <option value="linear">Lineal</option><option value="easeIn">Entrada suave</option><option value="easeOut">Salida suave</option><option value="punch">Punch (rápido→estable)</option>
                  </select>
                </label>
              </div>
              {/* Transición */}
              <div className="mt-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Entrada · transición al beat</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {EDIT_TRANSITIONS.map((tr) => (
                    <button key={tr.id} type="button" onClick={() => updateClip(selectedClip.id, { transition: tr.id })} className={`border px-2 py-1.5 text-left text-[10px] leading-tight ${selectedClip.transition === tr.id ? "border-fuchsia-500 bg-fuchsia-600 text-white" : "border-zinc-700 bg-black text-zinc-300 hover:border-zinc-500"}`}>
                      <span className="block font-bold">{tr.label}</span><span className="text-[8px] opacity-70">{tr.desc}</span>
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-[9px] text-zinc-500">Duración transición
                  <input type="range" min="0" max="0.6" step="0.02" value={selectedClip.transitionDuration} onChange={(event) => updateClip(selectedClip.id, { transitionDuration: Number(event.target.value) })} className="mt-1 w-full accent-fuchsia-500" />
                  <span className="float-right font-mono text-zinc-300">{selectedClip.transitionDuration.toFixed(2)}s</span>
                </label>
              </div>
              {/* Cámara */}
              <div className="mt-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Cámara 2.5D</p>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {EDIT_MOTIONS.map((mo) => (
                    <button key={mo.id} type="button" onClick={() => updateClip(selectedClip.id, { motion: mo.id })} className={`border px-1 py-1.5 text-[9px] font-bold ${selectedClip.motion === mo.id ? "border-cyan-400 bg-cyan-600 text-white" : "border-zinc-700 bg-black text-zinc-400 hover:border-zinc-500"}`}>{mo.label}</button>
                  ))}
                </div>
                <label className="mt-2 block text-[9px] text-zinc-500">Intensidad cámara <span className="float-right font-mono text-zinc-300">{selectedClip.motionIntensity ?? 32}%</span>
                  <input type="range" min="0" max="100" value={selectedClip.motionIntensity ?? 32} onChange={(event) => updateClip(selectedClip.id, { motionIntensity: Number(event.target.value) })} className="mt-1 w-full accent-cyan-400" />
                </label>
              </div>
              <label className="mt-3 block text-[9px] text-zinc-500">Filtro de esta toma
                <select value={selectedClip.style} onChange={(event) => updateClip(selectedClip.id, { style: event.target.value as EditTimelineClip["style"] })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200">
                  <option value="inherit">Usar look global</option>{EDIT_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                </select>
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => updateClip(selectedClip.id, { duration: snapEditTime(selectedClip.duration, project.bpm, 2) })} className="border border-zinc-700 px-2 py-1 text-[9px] font-bold text-zinc-300">Imán ½ beat</button>
                <button type="button" onClick={() => {
                  const clone = { ...selectedClip, id: uid("clip"), label: `${selectedClip.label} copia` };
                  setProject((current) => ({ ...current, clips: [...current.clips, clone] }));
                  setSelectedClipId(clone.id);
                }} className="border border-zinc-700 px-2 py-1 text-[9px] font-bold text-zinc-300">Duplicar</button>
                <button type="button" onClick={() => {
                  setProject((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== selectedClip.id) }));
                  setSelectedClipId(null);
                }} className="border border-red-900 px-2 py-1 text-[9px] font-bold text-red-300">Eliminar</button>
              </div>
            </section>
          )}

          <details open className="border border-zinc-800 bg-zinc-950 p-3">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-200">04 / Look global — 9:16 Short</summary>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
              <label>FPS
                <select value={project.fps} onChange={(event) => updateProject({ fps: Number(event.target.value) as 30 | 60 })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200"><option value="60">60 fps</option><option value="30">30 fps</option></select>
              </label>
              <span className="flex items-end pb-1 font-mono text-[10px] text-zinc-500">9:16 · 1080×1920 · para Shorts</span>
              <label className="col-span-2">Filtro
                <select value={project.style} onChange={(event) => updateProject({ style: event.target.value as AestheticStyle })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200">{EDIT_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select>
              </label>
              {(["exposure", "contrast", "saturation", "temperature", "bloom", "grain"] as const).map((key) => (
                <label key={key} className="capitalize">{key} <span className="float-right font-mono text-zinc-300">{project.colorGrade[key]}</span>
                  <input type="range" min={key === "bloom" || key === "grain" ? 0 : -100} max="100" value={project.colorGrade[key]} onChange={(event) => updateProject({ colorGrade: { ...project.colorGrade, [key]: Number(event.target.value) } })} className="mt-2 w-full accent-fuchsia-500" />
                </label>
              ))}
            </div>
          </details>

          <details className="border border-zinc-800 bg-zinc-950 p-3">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-200">05 / Atmósfera</summary>
            <div className="mt-3 space-y-2 text-[9px] text-zinc-500">
              <select value={project.particles} onChange={(event) => updateProject({ particles: event.target.value as ParticleType })} className="w-full border border-zinc-800 bg-black px-2 py-1.5 text-zinc-200">{EDIT_PARTICLES.map((particle) => <option key={particle.id} value={particle.id}>{particle.label}</option>)}</select>
              <label>Densidad <span className="float-right">{project.particleIntensity}%</span><input type="range" min="10" max="100" value={project.particleIntensity} onChange={(event) => updateProject({ particleIntensity: Number(event.target.value) })} className="mt-2 w-full accent-amber-400" /></label>
              <label>Tamaño <span className="float-right">{project.particleControls.size}%</span><input type="range" min="40" max="180" value={project.particleControls.size} onChange={(event) => updateProject({ particleControls: { ...project.particleControls, size: Number(event.target.value) } })} className="mt-2 w-full accent-amber-400" /></label>
              <label>Opacidad <span className="float-right">{project.particleControls.opacity}%</span><input type="range" min="0" max="100" value={project.particleControls.opacity} onChange={(event) => updateProject({ particleControls: { ...project.particleControls, opacity: Number(event.target.value) } })} className="mt-2 w-full accent-amber-400" /></label>
              <label>Viento <span className="float-right">{project.particleControls.wind}</span><input type="range" min="-100" max="100" value={project.particleControls.wind} onChange={(event) => updateProject({ particleControls: { ...project.particleControls, wind: Number(event.target.value) } })} className="mt-2 w-full accent-amber-400" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label>Color <input type="color" value={project.particleControls.color || "#ffffff"} onChange={(event) => updateProject({ particleControls: { ...project.particleControls, color: event.target.value } })} className="mt-1 h-7 w-full border border-zinc-800 bg-black" /></label>
                <label>Mezcla <select value={project.particleControls.blendMode} onChange={(event) => updateProject({ particleControls: { ...project.particleControls, blendMode: event.target.value as EditProject["particleControls"]["blendMode"] } })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1.5 text-zinc-200"><option value="screen">Pantalla</option><option value="source-over">Normal</option><option value="lighter">Aditivo</option><option value="soft-light">Luz suave</option></select></label>
              </div>
              <button type="button" onClick={() => updateProject({ particleControls: { ...DEFAULT_PARTICLE_CONTROLS, opacity: 72, turbulence: 36, blendMode: "screen" } })} className="border border-zinc-700 px-2 py-1 text-zinc-400">Restablecer</button>
            </div>
          </details>

          <details className="border border-zinc-800 bg-zinc-950 p-3">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-200">06 / Textos y firma</summary>
            <div className="mt-3 space-y-2">
              <button type="button" onClick={addTextCue} className="w-full border border-cyan-800 bg-cyan-950/30 px-2 py-1.5 text-[10px] font-bold text-cyan-200">+ Texto en el cabezal</button>
              {project.textCues.map((cue) => (
                <div key={cue.id} className="grid grid-cols-[1fr_58px_24px] gap-1 border border-zinc-800 bg-black/30 p-1.5">
                  <input value={cue.text} onChange={(event) => updateProject({ textCues: project.textCues.map((entry) => entry.id === cue.id ? { ...entry, text: event.target.value } : entry) })} className="min-w-0 bg-transparent text-[10px] font-bold text-white outline-none" />
                  <input type="number" step="0.05" value={cue.start} onChange={(event) => updateProject({ textCues: project.textCues.map((entry) => entry.id === cue.id ? { ...entry, start: Math.max(0, Number(event.target.value) || 0) } : entry) })} className="bg-zinc-900 px-1 font-mono text-[9px] text-zinc-300" />
                  <button type="button" onClick={() => updateProject({ textCues: project.textCues.filter((entry) => entry.id !== cue.id) })} className="text-zinc-600 hover:text-red-400">×</button>
                </div>
              ))}
              <label className="flex items-center gap-2 text-[10px] text-zinc-400"><input type="checkbox" checked={project.watermarkEnabled} onChange={(event) => updateProject({ watermarkEnabled: event.target.checked })} className="accent-fuchsia-500" /> Marca de agua</label>
              {project.watermarkEnabled && (
                <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
                  <input value={project.watermarkText} onChange={(event) => updateProject({ watermarkText: event.target.value })} className="col-span-2 border border-zinc-800 bg-black px-2 py-1 text-zinc-200" />
                  <label>Opacidad<input type="range" min="5" max="60" value={Math.round(project.watermarkOpacity * 100)} onChange={(event) => updateProject({ watermarkOpacity: Number(event.target.value) / 100 })} className="mt-2 w-full accent-fuchsia-500" /></label>
                  <label>Posición<select value={project.watermarkStyle.position} onChange={(event) => updateProject({ watermarkStyle: { ...project.watermarkStyle, position: event.target.value as NonNullable<EditProject["watermarkStyle"]["position"]> } })} className="mt-1 w-full border border-zinc-800 bg-black px-1 py-1 text-zinc-200"><option value="bottom-center">Abajo centro</option><option value="bottom-left">Abajo izq.</option><option value="bottom-right">Abajo der.</option><option value="top-center">Arriba centro</option></select></label>
                </div>
              )}
            </div>
          </details>

          <section className="border border-zinc-700 bg-white p-3 text-black">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider">07 / Exportar MP4</h2>
                <p className="mt-1 text-[9px] text-zinc-600">1080×1920 · {project.fps} fps · audio 48 kHz · 9:16</p>
              </div>
              <span className="font-mono text-[10px]">{Math.round(exportProgress * 100)}%</span>
            </div>
            <div className="mt-3 h-1.5 bg-zinc-200"><div className="h-full bg-fuchsia-600 transition-[width]" style={{ width: `${exportProgress * 100}%` }} /></div>
            {exportStage && <p className="mt-2 text-[9px] text-zinc-600">{exportStage}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void exportVideo()} disabled={exporting || !project.clips.length} className="flex-1 bg-black px-3 py-2 text-xs font-black text-white disabled:opacity-30">{exporting ? "EXPORTANDO…" : "EXPORTAR EDIT"}</button>
              {exporting && <button type="button" onClick={() => exportAbortRef.current?.abort()} className="border border-black px-3 text-xs font-bold">Cancelar</button>}
            </div>
            {resultUrl && <a href={resultUrl} download className="mt-2 block text-center text-[10px] font-bold text-fuchsia-700 underline">Descargar de nuevo</a>}
          </section>
        </aside>
      </div>

      <p className="border-l-2 border-zinc-700 pl-3 font-mono text-[10px] text-zinc-500">{status}</p>
    </div>
  );
}
