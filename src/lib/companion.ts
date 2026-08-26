"use client";

/** Cliente del companion local (PyMusicLooper + LoopyCut + ffmpeg) */

export const COMPANION_URL = "http://localhost:8787";

export interface LoopCandidate {
  start: number;
  end: number;
  duration: number;
  score: number;
}

export interface CompanionHealth {
  ok: boolean;
  pymusiclooper: boolean;
  pymusiclooper_version: string | null;
  loopycut: boolean;
  ffmpeg: boolean;
}

export async function companionHealth(
  timeoutMs = 2500
): Promise<CompanionHealth | null> {
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

export async function analyzeMusic(
  audio: File,
  opts: { minDuration?: number; maxDuration?: number; candidates?: number } = {}
): Promise<LoopCandidate[]> {
  const fd = new FormData();
  fd.append("audio", audio);
  if (opts.minDuration) fd.append("min_duration", String(opts.minDuration));
  if (opts.maxDuration) fd.append("max_duration", String(opts.maxDuration));
  fd.append("candidates", String(opts.candidates ?? 8));
  const res = await fetch(`${COMPANION_URL}/analyze/music`, {
    method: "POST",
    body: fd,
  });
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
    /** Analiza como máximo los primeros N segundos (0 = todo el video) */
    windowSec?: number;
  } = {}
): Promise<LoopCandidate[]> {
  const fd = new FormData();
  fd.append("video", video);
  if (opts.length) fd.append("length", String(opts.length));
  fd.append("downsample", String(opts.downsample ?? 2));
  fd.append("similarity", String(opts.similarity ?? 90));
  fd.append("window_sec", String(opts.windowSec ?? 120));
  const res = await fetch(`${COMPANION_URL}/analyze/video`, {
    method: "POST",
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error analizando el video");
  return data.candidates as LoopCandidate[];
}

export interface RenderParams {
  videoStart: number;
  videoEnd: number;
  audioStart: number;
  audioEnd: number;
  videoMode: "cut" | "crossfade";
  crossfadeSec: number;
  syncMode: "repeat" | "speed";
}

export async function renderLoop(
  video: File,
  audio: File,
  params: RenderParams
): Promise<Blob> {
  const fd = new FormData();
  fd.append("video", video);
  fd.append("audio", audio);
  fd.append("params", JSON.stringify(params));
  const res = await fetch(`${COMPANION_URL}/render`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    let msg = "Error renderizando";
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  return res.blob();
}
