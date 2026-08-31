"use client";

/** Cliente del companion local (PyMusicLooper + LoopyCut + ffmpeg + capas) */

import type { ClipStabilization, StabilizationKeyframe } from "./videoStabilization";

export const COMPANION_URL = "http://localhost:8787";

export interface VisualAlignment {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  confidence: number;
}

export interface LoopCandidate {
  start: number;
  end: number;
  duration: number;
  score: number;
  label?: string;
  /** Solo vídeo: candidato encontrado o fallback de clip completo. */
  kind?: "detected" | "full";
  /** Solo vídeo: fundido recomendado por el analizador, en segundos. */
  fadeSec?: number;
  /** Explicación breve para la UI. */
  reason?: string;
  /** Alineación global opcional IN->OUT para crossfade compensado. */
  alignment?: VisualAlignment | null;
  analysisVersion?: number;
  quality?: "excellent" | "good" | "review";
  metrics?: {
    seamVisual: number;
    motionMatch: number;
    sceneCutRisk: number;
    confidence: number;
    flowConsistency?: number;
    coverage?: number;
  };
}

export interface CompanionHealth {
  ok: boolean;
  pymusiclooper: boolean;
  pymusiclooper_version: string | null;
  loopycut: boolean;
  ffmpeg: boolean;
  librosa?: boolean;
}

export interface OverlayOption {
  id: string;
  label: string;
}

export interface VisualStyleOption {
  id: string;
  label: string;
  hint?: string;
}
export interface LayerSfx {
  id: string;
  label: string;
  time: number;
  gain: number;
  reason: string;
}

export interface LayerPlan {
  overlay: string | null;
  overlayLabel: string | null;
  blend: string | null;
  opacity: number | null;
  ambience: string | null;
  ambienceLabel: string | null;
  ambienceVolume: number;
  lowpassHz: number;
  sfx: LayerSfx[];
  chapters: { start: number; end: number; overlay: string; label: string }[];
  watermark: boolean;
  intensity: number;
  target: number;
  cycle: number;
  look?: {
    brightness: number;
    hue: number;
    sat: number;
    motion: number;
    warm: number;
    overlayReason: string;
  } | null;
  sfxPalette?: string[];
  visualStyle?: string;
  visualStyleLabel?: string;
  pixelSize?: number;
  seamMode?: "smooth" | "pingpong" | "cut";
  seamFade?: number;
}
export interface RenderParams {
  videoStart: number;
  videoEnd: number;
  audioStart: number;
  audioEnd: number;
  targetDuration: number;
  preview?: boolean;
  aspect?: "landscape" | "shorts";
  plan?: LayerPlan | Record<string, unknown>;
  seamMode?: "smooth" | "pingpong" | "cut";
  seamFade?: number;
}

export async function companionHealth(timeoutMs = 2500): Promise<CompanionHealth | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${COMPANION_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as CompanionHealth;
  } catch {
    return null;
  }
}

export async function listOverlays(): Promise<OverlayOption[]> {
  try {
    const res = await fetch(`${COMPANION_URL}/assets`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.overlays || []) as OverlayOption[];
  } catch {
    return [];
  }
}

export async function listVisualStyles(): Promise<VisualStyleOption[]> {
  try {
    const res = await fetch(`${COMPANION_URL}/assets`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.visualStyles || []) as VisualStyleOption[];
  } catch {
    return [];
  }
}

export async function analyzeMusic(
  audio: File,
  opts: { minDuration?: number; maxDuration?: number; candidates?: number } = {}
): Promise<LoopCandidate[]> {
  const fd = new FormData();
  fd.append("audio", audio);
  if (opts.minDuration) fd.append("min_duration", String(opts.minDuration));
  if (opts.maxDuration) fd.append("max_duration", String(opts.maxDuration));
  fd.append("candidates", String(opts.candidates ?? 8));
  const res = await fetch(`${COMPANION_URL}/analyze/music`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error analizando la canción");
  return data.candidates as LoopCandidate[];
}

export async function analyzeVideo(
  video: File,
  opts: {
    length?: number;
    downsample?: number;
    similarity?: number;
    windowSec?: number;
  } = {}
): Promise<LoopCandidate[]> {
  const look = await analyzeVideoLook(video, opts);
  return look.candidates;
}

export async function analyzeVideoLook(
  video: File,
  opts: {
    length?: number;
    downsample?: number;
    similarity?: number;
    windowSec?: number;
  } = {}
): Promise<{ candidates: LoopCandidate[]; duration: number; motionPeriod: number }> {
  const fd = new FormData();
  fd.append("video", video);
  if (opts.length) fd.append("length", String(opts.length));
  fd.append("downsample", String(opts.downsample ?? 2));
  fd.append("similarity", String(opts.similarity ?? 90));
  fd.append("window_sec", String(opts.windowSec ?? 120));
  const res = await fetch(`${COMPANION_URL}/analyze/video`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error analizando el video");
  const candidates = (data.candidates || []).map((candidate: Record<string, unknown>) => {
    const rawAlign = candidate.alignment as Record<string, unknown> | undefined;
    let alignment: VisualAlignment | undefined;
    if (rawAlign && typeof rawAlign.dx === "number") {
      const dx = Number(rawAlign.dx), dy = Number(rawAlign.dy);
      const scale = Number(rawAlign.scale), rotation = Number(rawAlign.rotation);
      const confidence = Number(rawAlign.confidence);
      if ([dx, dy, scale, rotation, confidence].every(Number.isFinite)) {
        alignment = { dx, dy, scale, rotation, confidence };
      }
    }
    const rawMetrics = candidate.metrics as Record<string, unknown> | undefined;
    const metrics = rawMetrics
      ? {
          seamVisual: Number(rawMetrics.seam_visual ?? rawMetrics.seamVisual) || 0,
          motionMatch: Number(rawMetrics.motion_match ?? rawMetrics.motionMatch) || 0,
          sceneCutRisk: Number(rawMetrics.scene_cut_risk ?? rawMetrics.sceneCutRisk) || 0,
          confidence: Number(rawMetrics.confidence) || 0,
          flowConsistency: Number(rawMetrics.flow_consistency ?? rawMetrics.flowConsistency) || undefined,
          coverage: Number(rawMetrics.coverage) || undefined,
        }
      : undefined;
    return {
      start: Number(candidate.start) || 0,
      end: Number(candidate.end) || 0,
      duration: Number(candidate.duration) || 0,
      score: Number(candidate.score) || 0,
      label: typeof candidate.label === "string" ? candidate.label : undefined,
      kind: candidate.kind === "detected" ? "detected" : candidate.kind === "full" ? "full" : undefined,
      fadeSec: Number(candidate.fade_sec ?? candidate.fadeSec) || undefined,
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
      alignment,
      analysisVersion: Number(candidate.analysis_version ?? candidate.analysisVersion) || undefined,
      quality: candidate.quality === "excellent" || candidate.quality === "good" || candidate.quality === "review"
        ? candidate.quality
        : undefined,
      metrics,
    };
  }) as LoopCandidate[];
  return {
    candidates,
    duration: Number(data.duration) || 0,
    motionPeriod: Number(data.motion_period) || 0,
  };
}

export async function analyzeVideoStabilization(video: File): Promise<ClipStabilization> {
  const form = new FormData();
  form.append("video", video);
  form.append("max_samples", "360");
  const response = await fetch(`${COMPANION_URL}/analyze/stabilization`, {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error analizando la estabilización");

  const rawFrames = Array.isArray(data.keyframes) ? data.keyframes : [];
  const keyframes = rawFrames
    .map((raw: Record<string, unknown>): StabilizationKeyframe | null => {
      const time = Number(raw.time);
      const dx = Number(raw.dx);
      const dy = Number(raw.dy);
      const rotation = Number(raw.rotation ?? 0);
      const scale = Number(raw.scale ?? 1);
      const confidence = Number(raw.confidence ?? 0);
      if (![time, dx, dy, rotation, scale, confidence].every(Number.isFinite)) return null;
      return { time, dx, dy, rotation, scale, confidence };
    })
    .filter((frame: StabilizationKeyframe | null): frame is StabilizationKeyframe => frame !== null)
    .sort((a: StabilizationKeyframe, b: StabilizationKeyframe) => a.time - b.time);

  const cropScale = Math.max(1, Math.min(1.02, Number(data.crop_scale) || 1));
  return {
    version: 2,
    source: "companion-opencv",
    autoEnabled: Boolean(data.auto_enabled) && keyframes.length >= 5,
    confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
    cropScale,
    jitterRmsPx: Math.max(0, Number(data.jitter_rms_px) || 0),
    analysisFps: Math.max(0, Number(data.analysis_fps) || 0),
    keyframes,
    reason: typeof data.reason === "string"
      ? data.reason
      : "Estabilización avanzada analizada por el companion.",
  };
}

export async function transcodeVideoForBrowser(video: File): Promise<File> {
  const form = new FormData();
  form.append("video", video);
  const response = await fetch(`${COMPANION_URL}/transcode/browser`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    let message = "No se pudo convertir el vídeo localmente";
    try {
      const data = await response.json();
      if (typeof data.error === "string") message = data.error;
    } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const base = video.name.replace(/\.[^.]+$/, "") || "clip";
  return new File([blob], `${base}.browser.mp4`, {
    type: "video/mp4",
    lastModified: Date.now(),
  });
}

export async function planLayers(
  audio: File,
  opts: {
    audioStart: number;
    audioEnd: number;
    target: number;
    atmosphere: string;
    sfxOn: boolean;
    intensity: number;
    watermark: boolean;
    visualStyle?: string;
    pixelSize?: number;
    video?: File | null;
    videoStart?: number;
    videoEnd?: number;
  }
): Promise<LayerPlan> {
  const fd = new FormData();
  fd.append("audio", audio);
  fd.append("audio_start", String(opts.audioStart));
  fd.append("audio_end", String(opts.audioEnd));
  fd.append("target", String(opts.target));
  fd.append("atmosphere", opts.atmosphere);
  if (opts.visualStyle) fd.append("visual_style", opts.visualStyle);
  if (opts.pixelSize) fd.append("pixel_size", String(opts.pixelSize));
  fd.append("sfx_on", opts.sfxOn ? "1" : "0");
  fd.append("watermark", opts.watermark ? "1" : "0");
  if (opts.video) {
    fd.append("video", opts.video);
    fd.append("video_start", String(opts.videoStart ?? 0));
    fd.append("video_end", String(opts.videoEnd ?? 0));
  }
  const res = await fetch(`${COMPANION_URL}/plan/layers`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error planificando capas");
  return data as LayerPlan;
}

export interface RenderProgress {
  pct: number;
  stage: string;
  done: boolean;
  error?: string | null;
}

export async function renderLoop(
  video: File,
  audio: File,
  params: RenderParams,
  onProgress?: (p: RenderProgress) => void
): Promise<Blob> {
  const fd = new FormData();
  fd.append("video", video);
  fd.append("audio", audio);
  fd.append("params", JSON.stringify(params));
  const start = await fetch(`${COMPANION_URL}/render/start`, { method: "POST", body: fd });
  const started = await start.json();
  if (!start.ok) throw new Error(started.error || "Could not start render");
  const id = started.id as string;
  for (;;) {
    const st = await fetch(`${COMPANION_URL}/render/status/${id}`);
    const data = (await st.json()) as RenderProgress & { error?: string };
    if (!st.ok) throw new Error(data.error || "Status failed");
    onProgress?.({
      pct: data.pct ?? 0,
      stage: data.stage || "",
      done: !!data.done,
      error: data.error,
    });
    if (data.error) throw new Error(data.error);
    if (data.done) {
      const file = await fetch(`${COMPANION_URL}/render/file/${id}`);
      if (!file.ok) throw new Error("Download failed");
      return file.blob();
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

export interface CastMember {
  id: string;
  name: string;
  series: string;
  aka: string;
  playlist: string;
  hasEssay: boolean;
  hasRefs: boolean;
}

export interface CharacterGuess {
  id: string;
  name: string;
  series: string;
  confidence: number;
  reason: string;
  scores: Record<string, number>;
  alternatives: { id: string; name: string; score: number }[];
}

export interface YoutubePack {
  character: string;
  name: string;
  series: string;
  title: string;
  description: string;
  hashtags: string[];
  tags: string[];
  tagsLine: string;
  playlist: string;
  pinnedComment: string;
  thumbnailTip: string;
  shortsTitle?: string;
  shortsDescription?: string;
  shortsHashtags?: string[];
  shortsTagsLine?: string;
}

export async function listCharacters(): Promise<CastMember[]> {
  try {
    const res = await fetch(`${COMPANION_URL}/characters`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.characters || []) as CastMember[];
  } catch {
    return [];
  }
}

export async function identifyCharacter(
  video: File,
  opts: { start?: number; end?: number; filename?: string } = {}
): Promise<CharacterGuess> {
  const fd = new FormData();
  fd.append("video", video);
  fd.append("video_start", String(opts.start ?? 0));
  fd.append("video_end", String(opts.end ?? 0));
  fd.append("filename", opts.filename || video.name);
  const res = await fetch(`${COMPANION_URL}/identify/character`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error identificando personaje");
  return data as CharacterGuess;
}

export async function youtubePack(opts: {
  character: string;
  song?: string;
  artist?: string;
  minutes: number;
  atmosphere?: string;
}): Promise<YoutubePack> {
  const fd = new FormData();
  fd.append("character", opts.character);
  if (opts.song) fd.append("song", opts.song);
  if (opts.artist) fd.append("artist", opts.artist);
  fd.append("minutes", String(opts.minutes));
  if (opts.atmosphere) fd.append("atmosphere", opts.atmosphere);
  const res = await fetch(`${COMPANION_URL}/youtube/pack`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error creando pack de YouTube");
  return data as YoutubePack;
}

export async function saveExportImage(
  blob: Blob,
  kind: "thumbs" | "covers",
  meta?: { character?: string; song?: string }
): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", blob, kind === "covers" ? "cover.jpg" : "thumb.jpg");
    if (meta?.character) fd.append("character", meta.character);
    if (meta?.song) fd.append("song", meta.song);
    const res = await fetch(`${COMPANION_URL}/export/image`, { method: "POST", body: fd });
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}

export interface SaveExportMediaResult {
  /** Ruta en disco si el guardado funcionó; null en caso contrario. */
  path: string | null;
  /** Motivo del fallo (en español) si path es null; null si guardó bien. */
  error: string | null;
}

/** Guarda en disco vía companion informando SIEMPRE del fallo (sin tragarlo en silencio). */
export async function saveExportMediaResult(
  blob: Blob,
  opts: { kind: "16x9" | "shorts" | "9x16" | "thumbs" | "covers"; character?: string; song?: string; filename?: string }
): Promise<SaveExportMediaResult> {
  try {
    const fd = new FormData();
    fd.append("kind", opts.kind);
    const ext = opts.kind === "thumbs" || opts.kind === "covers" ? "jpg" : "mp4";
    fd.append("file", blob, opts.filename || `export.${ext}`);
    if (opts.character) fd.append("character", opts.character);
    if (opts.song) fd.append("song", opts.song);
    const res = await fetch(`${COMPANION_URL}/export/media`, { method: "POST", body: fd });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) detail = String(data.error);
      } catch {
        /* respuesta sin JSON: nos quedamos con el código HTTP */
      }
      return { path: null, error: `Companion rechazó el guardado (${detail})` };
    }
    const data = await res.json();
    const path = (data.path as string) || null;
    return path
      ? { path, error: null }
      : { path: null, error: "El companion no devolvió la ruta guardada" };
  } catch {
    return { path: null, error: "Companion no disponible en :8787 (arranca con ./iniciar.sh)" };
  }
}

export async function saveExportMedia(
  blob: Blob,
  opts: { kind: "16x9" | "shorts" | "9x16" | "thumbs" | "covers"; character?: string; song?: string; filename?: string }
): Promise<string | null> {
  return (await saveExportMediaResult(blob, opts)).path;
}

export async function renderMangaMotionVideoBackend(
  videoFile: File,
  audioFile: File | null,
  config: {
    duration?: number;
    aspectRatio?: string;
    particles?: string;
    aestheticStyle?: string;
    seamMode?: string;
    loopCrossfadeDuration?: number;
    particleIntensity?: number;
  }
): Promise<Blob> {
  const fd = new FormData();
  fd.append("video", videoFile);
  if (audioFile) {
    fd.append("audio", audioFile);
  }
  fd.append(
    "params",
    JSON.stringify({
      duration: config.duration || 10,
      aspectRatio: config.aspectRatio || "9:16",
      particles: config.particles || "none",
      aestheticStyle: config.aestheticStyle || "original",
      seamMode: config.seamMode || "smooth",
      loopCrossfadeDuration: config.loopCrossfadeDuration || 1.5,
      particleIntensity: config.particleIntensity || 50,
    })
  );

  const res = await fetch(`${COMPANION_URL}/manga-motion/render`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Fallo en renderizado backend de Manga Motion");
  }
  return await res.blob();
}
