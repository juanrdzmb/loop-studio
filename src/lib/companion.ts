"use client";

/** Cliente del companion local (PyMusicLooper + LoopyCut + ffmpeg + capas) */

export const COMPANION_URL = "http://localhost:8787";

export interface LoopCandidate {
  start: number;
  end: number;
  duration: number;
  score: number;
  label?: string;
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
  const fd = new FormData();
  fd.append("video", video);
  if (opts.length) fd.append("length", String(opts.length));
  fd.append("downsample", String(opts.downsample ?? 2));
  fd.append("similarity", String(opts.similarity ?? 90));
  fd.append("window_sec", String(opts.windowSec ?? 120));
  const res = await fetch(`${COMPANION_URL}/analyze/video`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error analizando el video");
  return data.candidates as LoopCandidate[];
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
  fd.append("sfx_on", opts.sfxOn ? "1" : "0");
  fd.append("intensity", String(opts.intensity));
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

export async function saveExportImage(blob: Blob, kind: "thumbs" | "covers"): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", blob, kind === "covers" ? "cover.jpg" : "thumb.jpg");
    const res = await fetch(`${COMPANION_URL}/export/image`, { method: "POST", body: fd });
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}
