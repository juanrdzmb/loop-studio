import type { LoopMode, RawFrame } from "./types";

/** Boomerang: ida y vuelta (sin duplicar extremos) */
export function boomerang(frames: RawFrame[]): RawFrame[] {
  if (frames.length < 3) return frames;
  return [...frames, ...frames.slice(1, -1).reverse()];
}

/**
 * Crossfade: los últimos K fotogramas se funden hacia el inicio,
 * de modo que el salto del bucle se perciba como un disolvimiento suave.
 */
export function crossfade(frames: RawFrame[], fadePercent: number): RawFrame[] {
  const n = frames.length;
  if (n < 4) return frames;
  const k = Math.max(2, Math.min(Math.floor(n / 2), Math.round((n * fadePercent) / 100)));
  const out = frames.map((f) => ({ ...f }));
  for (let j = 0; j < k; j++) {
    const idx = n - k + j;
    const w = (j + 1) / k; // 0→1: al final mostramos casi el inicio
    out[idx] = blend(frames[idx], frames[j], w);
  }
  return out;
}

function blend(a: RawFrame, b: RawFrame, w: number): RawFrame {
  const data = new Uint8ClampedArray(a.data.length);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = a.data[i] * (1 - w) + b.data[i] * w;
    data[i + 1] = a.data[i + 1] * (1 - w) + b.data[i + 1] * w;
    data[i + 2] = a.data[i + 2] * (1 - w) + b.data[i + 2] * w;
    data[i + 3] = 255;
  }
  return { data, width: a.width, height: a.height };
}

export interface AutoLoopResult {
  /** Índice de frame recomendado como fin del clip */
  bestEndFrame: number;
  /** Puntaje MSE (menor = mejor loop) */
  score: number;
}

/**
 * Detecta el mejor punto de corte: busca el último frame cuyo contenido
 * sea más parecido al primer frame (MSE sobre gris reducido a 48x27).
 */
export function detectBestEnd(
  frames: RawFrame[],
  minFrames: number
): AutoLoopResult {
  if (frames.length <= minFrames + 1)
    return { bestEndFrame: frames.length - 1, score: Infinity };

  const sigs = frames.map((f) => signature(f));
  const first = sigs[0];
  let bestIdx = frames.length - 1;
  let bestScore = Infinity;
  for (let i = minFrames; i < frames.length; i++) {
    const s = mse(first, sigs[i]);
    if (s < bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return { bestEndFrame: bestIdx, score: bestScore };
}

/** Firma reducida en escala de grises para comparaciones rápidas */
function signature(f: RawFrame): Float32Array {
  const W = 48;
  const H = 27;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor((y / H) * f.height);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor((x / W) * f.width);
      const i = (sy * f.width + sx) * 4;
      out[y * W + x] =
        0.299 * f.data[i] + 0.587 * f.data[i + 1] + 0.114 * f.data[i + 2];
    }
  }
  return out;
}

function mse(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / a.length;
}

/** Aplica el modo de loop elegido a la lista de frames */
export function applyLoopMode(
  frames: RawFrame[],
  mode: LoopMode,
  fadePercent: number
): RawFrame[] {
  switch (mode) {
    case "boomerang":
      return boomerang(frames);
    case "crossfade":
      return crossfade(frames, fadePercent);
    default:
      return frames;
  }
}
