import type { LoopCandidate, VisualAlignment } from "@/lib/companion";
import { analyzeVideoLook } from "@/lib/companion";

export type SeamMode = "smooth" | "pingpong" | "cut" | "calm" | "extend";

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
  alignment?: VisualAlignment | null;
}

export interface VisualLoopRecommendation {
  selection: VisualLoopSelection;
  candidates: VisualLoopSelection[];
}

function fadeForScore(score: number, duration: number, suggested?: number): number {
  // Crossfade cinemático: 0.25-1.0 s, curva cosine. Natural seam corto, seam aceptable + alignment medio.
  // suggested viene del companion (ya dentro de 0.25-1.0) y se respeta clampado.
  if (suggested && suggested > 0) {
    return Math.round(Math.max(0.25, Math.min(suggested, 1.0, duration * 0.15)) * 100) / 100;
  }
  const base = score >= 85 ? 0.30 : score >= 70 ? 0.55 : 0.70;
  return Math.round(Math.max(0.25, Math.min(base, duration * 0.15, 1.0)) * 100) / 100;
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
    alignment: candidate.alignment ?? null,
  };
}

// ── Smart Forward Loop — ranking equilibrado SEAM + COBERTURA + DURACIÓN ───────

/** Bonus por cobertura (relativa a sourceDuration). Filosofía §5 */
function coverageBonus(coverage: number): number {
  if (coverage >= 0.90) return 12; // 90-100% excelente
  if (coverage >= 0.80) return 8; // 80-90 muy buena
  if (coverage >= 0.70) return 4; // 70-80 buena
  if (coverage >= 0.60) return 0; // 60-70 aceptable solo si seam mejora
  if (coverage >= 0.50) return -10; // 50-60 fuerte penalización
  if (coverage >= 0.40) return -8; // 40-50 penalizado pero permite cola roja (4/9=44% con seam 97)
  return -32; // <40% normalmente rechazar
}

/** Penalización por duración absoluta, modulada por sourceDuration (§6). */
function durationPenalty(duration: number, sourceDuration: number): number {
  // Nunca <3 s (invariante existente)
  if (duration < 3) return -100;
  if (duration < 5) {
    // <5 s: rechazo prácticamente automático salvo fuente muy corta (≤9s → 4s es 44-50% y puede ser válido)
    if (sourceDuration <= 9) return -2;
    if (sourceDuration <= 13) return -22;
    return -38;
  }
  if (duration < 7) {
    // 5-7 s penalización enorme
    if (sourceDuration <= 9) return 0;
    if (sourceDuration <= 13) return -14;
    return -22;
  }
  if (duration < 9) {
    // 7-9 s penalización importante
    if (sourceDuration <= 9) return 0;
    return -8;
  }
  if (duration < 12) {
    // 9-12 s aceptable, leve
    if (sourceDuration <= 12) return 0;
    return -3;
  }
  // >12 s preferible cuando el material lo permite
  return 0;
}

export interface VisualLoopScoreBreakdown {
  start: number;
  end: number;
  duration: number;
  coverage: number;
  seam: number;
  fadeSec: number;
  covBonus: number;
  durPenalty: number;
  alignBonus: number;
  finalScore: number;
  kind: "detected" | "full";
  reason: string;
}

export function scoreVisualCandidate(
  sel: VisualLoopSelection | LoopCandidate,
  sourceDuration: number,
  kind: "detected" | "full" = "detected"
): VisualLoopScoreBreakdown {
  const duration = Math.max(0.25, (sel as VisualLoopSelection).duration ?? (sel as LoopCandidate).duration);
  const score = (sel as VisualLoopSelection).score ?? (sel as LoopCandidate).score;
  const coverage = Math.min(1, duration / Math.max(0.1, sourceDuration));
  const covBonus = coverageBonus(coverage);
  const durPenalty = durationPenalty(duration, sourceDuration);
  const align = (sel as VisualLoopSelection).alignment ?? (sel as LoopCandidate).alignment;
  const alignBonus = align && typeof align.confidence === "number" && align.confidence >= 0.30 ? Math.min(2, align.confidence * 1.5) : 0;
  // Seam pesa menos que antes (0.62 vs 0.75) para que cobertura/duración sean primer nivel
  const finalScore = score * 0.62 + coverage * 26 + covBonus + durPenalty + alignBonus;
  return {
    start: (sel as VisualLoopSelection).start ?? (sel as LoopCandidate).start,
    end: (sel as VisualLoopSelection).end ?? (sel as LoopCandidate).end,
    duration,
    coverage,
    seam: score,
    fadeSec: (sel as VisualLoopSelection).fadeSec ?? (sel as LoopCandidate).fadeSec ?? 0,
    covBonus,
    durPenalty,
    alignBonus,
    finalScore,
    kind,
    reason: (sel as VisualLoopSelection).reason ?? (sel as LoopCandidate).reason ?? "",
  };
}

function diagnoseSelection(
  breakdowns: VisualLoopScoreBreakdown[],
  selected: VisualLoopScoreBreakdown | null,
  sourceDuration: number
): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  // Solo log en dev; evita ruido en prod. También respeta que el navegador no tenga process.
  try {
    const hasWindow = typeof window !== "undefined";
    const isDev = hasWindow
      ? window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      : true;
    if (!isDev) return;
    console.groupCollapsed(`[SmartLoop] source ${sourceDuration.toFixed(2)}s · ${breakdowns.length} candidatos`);
    for (const b of breakdowns) {
      const selMark = selected && Math.abs(b.start - selected.start) < 0.02 && Math.abs(b.end - selected.end) < 0.02 ? "→ SELECTED" : "  ";
      console.log(
        `${selMark} ${b.kind} ${b.start.toFixed(2)}→${b.end.toFixed(2)} dur ${b.duration.toFixed(2)}s cov ${(b.coverage * 100).toFixed(0)}% seam ${b.seam} fade ${b.fadeSec} covB ${b.covBonus} durP ${b.durPenalty} alignB ${b.alignBonus.toFixed(1)} final ${b.finalScore.toFixed(1)} :: ${b.reason}`
      );
    }
    console.groupEnd();
  } catch {
    // nunca romper por logging
  }
}

export function pickVisualLoop(
  candidates: LoopCandidate[],
  sourceDuration: number
): VisualLoopSelection | null {
  const srcDur = Math.max(0.5, sourceDuration);
  // Filtro duro mínimo: nunca <3 s y seam ≥40 para no evaluar ruido; full compite aparte
  const viable = candidates.filter((c) => c.duration >= 3 && c.score >= 40);
  if (viable.length === 0) return null;

  // Construir selecciones con breakdown
  const detectedSels = viable
    .filter((c) => c.kind !== "full")
    .map(toVisualSelection);
  const fullCands = viable.filter((c) => c.kind === "full").map(toVisualSelection);
  // Si no hay detected con seam≥70, igual evaluamos los que pasaron filtro ≥40
  // pero con penalización fuerte ya aplicada; eso evita elegir micro-loop 0.5 s con 77

  const allSels: { sel: VisualLoopSelection; kind: "detected" | "full" }[] = [
    ...detectedSels.map((s) => ({ sel: s, kind: "detected" as const })),
    ...fullCands.map((s) => ({ sel: s, kind: "full" as const })),
  ];

  const breakdowns = allSels.map(({ sel, kind }) => scoreVisualCandidate(sel, srcDur, kind));
  // Ordenar por finalScore descendente
  breakdowns.sort((a, b) => b.finalScore - a.finalScore);

  // Hard reject para duraciones absurdamente cortas (<5 s con cobertura <0.45) salvo que sea la única opción
  // y fuente muy corta. Si el mejor es un micro-loop rechazable, saltar al siguiente que no lo sea.
  let best: VisualLoopScoreBreakdown | null = null;
  for (const b of breakdowns) {
    const isMicroShort = b.duration < 5 && b.coverage < 0.45;
    const isExtremelyShort = b.duration < 3.5;
    if (b.kind === "detected" && (isExtremelyShort || isMicroShort)) {
      // Solo permitir micro si su seam es excepcional (≥90) y no hay alternativa ≥50% con seam ≥60
      const hasAlternative = breakdowns.some(
        (other) => other !== b && other.coverage >= 0.50 && other.seam >= 60 && other.finalScore > -50
      );
      if (hasAlternative) continue;
      if (b.seam < 90) continue;
    }
    best = b;
    break;
  }
  if (!best) best = breakdowns[0] ?? null;
  diagnoseSelection(breakdowns, best, srcDur);
  if (!best) return null;
  // Si el ganador es full, devolverlo como selección con motivo mejorado
  if (best.kind === "full") {
    const fullSel = fullCands.find((s) => Math.abs(s.start - best!.start) < 0.02 && Math.abs(s.end - best!.end) < 0.02);
    if (fullSel) {
      return {
        ...fullSel,
        reason: "Clip completo conserva variedad temporal; ningún recorte ofrecía cobertura/duración suficiente para compensar su seam.",
      };
    }
  }
  // Buscar selección detected correspondiente al best
  const winner = detectedSels.find(
    (s) => Math.abs(s.start - best!.start) < 0.02 && Math.abs(s.end - best!.end) < 0.02
  );
  return winner ?? (best.kind === "full" ? fullCands[0] ?? null : null);
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
