import type { LoopCandidate } from "@/lib/companion";
import { analyzeVideoLook } from "@/lib/companion";

export type SeamMode = "smooth" | "pingpong" | "cut" | "calm";

export interface SeamAdvice {
  seam: SeamMode;
  reason: string;
  matchPct: number;
}

export interface VisualLoopSelection {
  start: number;
  end: number;
  duration: number;
  score: number;
  fadeSec: number;
  label: string;
  reason: string;
  source: "loopycut" | "browser-fallback";
}

export interface VisualLoopRecommendation {
  selection: VisualLoopSelection;
  candidates: VisualLoopSelection[];
}

function fadeForScore(score: number, duration: number, suggested?: number): number {
  const base = suggested && suggested > 0 ? suggested : score >= 85 ? 0.2 : score >= 70 ? 0.4 : 0.7;
  return Math.round(Math.max(0.12, Math.min(base, duration * 0.1)) * 100) / 100;
}

function toVisualSelection(candidate: LoopCandidate): VisualLoopSelection {
  const duration = Math.max(0.25, candidate.end - candidate.start || candidate.duration);
  return {
    start: Math.max(0, candidate.start),
    end: Math.max(candidate.start + 0.25, candidate.end),
    duration,
    score: candidate.score,
    fadeSec: fadeForScore(candidate.score, duration, candidate.fadeSec),
    label: candidate.label || "Loop visual detectado",
    reason: candidate.reason || "LoopyCut alineó imagen y movimiento en la costura.",
    source: "loopycut",
  };
}

export function pickVisualLoop(
  candidates: LoopCandidate[],
  sourceDuration: number
): VisualLoopSelection | null {
  const minPreferred = Math.max(3, sourceDuration * 0.5);
  const detected = candidates
    .filter((candidate) => candidate.kind !== "full" && candidate.score >= 70 && candidate.duration >= minPreferred)
    .map(toVisualSelection)
    .sort((a, b) => {
      const aRank = a.score * 0.75 + Math.min(1, a.duration / Math.max(0.1, sourceDuration)) * 25;
      const bRank = b.score * 0.75 + Math.min(1, b.duration / Math.max(0.1, sourceDuration)) * 25;
      return bRank - aRank;
    });
  return detected[0] ?? null;
}

/**
 * LoopyCut es la fuente principal. Si el companion no responde o no encuentra un
 * candidato suficientemente largo, se conserva todo el clip con un fundido corto.
 * Nunca se elige pingpong automáticamente: invertir la cámara queda como ajuste manual.
 */
export async function recommendVisualLoopForClip(
  file: File,
  fallbackDuration: number
): Promise<VisualLoopRecommendation> {
  try {
    const look = await analyzeVideoLook(file, { downsample: 2, windowSec: 0 });
    const duration = look.duration > 0 ? look.duration : fallbackDuration;
    // OpenCV puede leer FPS erróneos en algunos VFR y devolver, por ejemplo,
    // 0.5 s para un clip que el navegador sabe que dura 10 s. No convertir esa
    // lectura en un micro-loop: el <video> ya aportó la duración fiable.
    if (Math.abs(duration - fallbackDuration) > Math.max(0.5, fallbackDuration * 0.1)) {
      throw new Error("La duración del análisis visual no coincide con el clip cargado");
    }
    const detected = look.candidates
      .filter((candidate) => candidate.kind !== "full")
      .map(toVisualSelection);
    const selected = pickVisualLoop(look.candidates, duration);
    if (selected) return { selection: selected, candidates: detected };

    const full = look.candidates.find((candidate) => candidate.kind === "full");
    if (full) {
      const selection = toVisualSelection(full);
      return {
        selection: {
          ...selection,
          reason: "No se encontró un recorte suficientemente largo y fiable; se conserva el clip completo con fundido.",
        },
        candidates: detected,
      };
    }
  } catch {
    // El fallback del navegador mantiene la herramienta utilizable y explica la menor precisión.
  }

  const duration = Math.max(0.25, fallbackDuration);
  const matchPct = await firstLastMatchPct(file);
  return {
    selection: {
      start: 0,
      end: duration,
      duration,
      score: matchPct,
      fadeSec: fadeForScore(matchPct, duration),
      label: "Clip completo · análisis local",
      reason: "Companion no disponible: se conserva el clip completo con una costura aproximada.",
      source: "browser-fallback",
    },
    candidates: [],
  };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish, { once: true });
    setTimeout(finish, 900);
    try {
      video.currentTime = Math.max(0, time);
    } catch {
      finish();
    }
  });
}

function frameLuma(ctx: CanvasRenderingContext2D, w: number, h: number): Float32Array {
  const img = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    out[p] = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
  }
  return out;
}

/** How similar first vs last frame are (0–100). Low = camera never comes back. */
export async function firstLastMatchPct(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 12000);
      video.onloadeddata = () => {
        clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(t);
        reject(new Error("decode"));
      };
      video.load();
    });
    const dur = video.duration;
    if (!Number.isFinite(dur) || dur < 0.4) return 100;
    const w = 96;
    const h = Math.max(2, Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 50;
    await seekTo(video, Math.min(0.05, dur * 0.02));
    ctx.drawImage(video, 0, 0, w, h);
    const a = frameLuma(ctx, w, h);
    await seekTo(video, Math.max(0.05, dur - 0.08));
    ctx.drawImage(video, 0, 0, w, h);
    const b = frameLuma(ctx, w, h);
    let acc = 0;
    for (let i = 0; i < a.length; i++) acc += Math.abs(a[i] - b[i]);
    const mad = acc / a.length;
    return Math.max(0, Math.min(100, 100 * (1 - mad / 48)));
  } catch {
    return 50;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Pick a loop that looks like one take.
 * Zoom/pan that never returns → constant-speed boomerang.
 * Start ≈ end (or the clip is already a camera cycle) → short crossfade.
 */
export async function recommendSeamForClip(file: File): Promise<SeamAdvice> {
  const matchPct = await firstLastMatchPct(file);
  if (matchPct >= 82) {
    return {
      seam: "smooth",
      reason: `Inicio y final coinciden (${Math.round(matchPct)}%) — fundido, una sola toma.`,
      matchPct,
    };
  }
  return {
    seam: "smooth",
    reason:
      `La unión necesita fundido (${Math.round(matchPct)}% de coincidencia). No se invertirá la cámara automáticamente.`,
    matchPct,
  };
}

export function pickBestAudioLoop(
  candidates: LoopCandidate[],
  opts: { songDuration: number; preferTime?: number; targetSec: number }
): LoopCandidate {
  if (!candidates.length) {
    const start = Math.max(0, Math.min(opts.preferTime || 0, Math.max(0, opts.songDuration - 8)));
    const end = opts.songDuration;
    return { start, end, duration: end - start, score: 0, label: "Canción completa" };
  }
  // La duración del video decide qué loop conviene: en 16:9 largo (≥3 min) menos
  // repeticiones = menos costuras, así que pesan los loops largos; en shorts un
  // loop de 10-30 s basta y encaja mejor con el ritmo del clip.
  const longVideo = opts.targetSec >= 180;
  let best = candidates[0]!;
  let bestPts = -1;
  for (const c of candidates) {
    if (c.duration < 4) continue;
    let pts = c.score;
    if (longVideo) {
      if (c.duration >= 45 && c.duration <= 150) pts += 14;
      else if (c.duration >= 30) pts += 8;
      if (c.duration < 12) pts -= 12;
    } else {
      if (c.duration >= 10 && c.duration <= 50) pts += 8;
      if (c.duration >= 12 && c.duration <= 30) pts += 4;
    }
    if (opts.preferTime != null && opts.preferTime >= c.start && opts.preferTime <= c.end) pts += 18;
    if (opts.preferTime != null && Math.abs(c.start - opts.preferTime) < 4) pts += 10;
    if (pts > bestPts) {
      bestPts = pts;
      best = c;
    }
  }
  return best;
}
