import type { RawFrame, StyleSettings } from "./types";
import { GAMEBOY_PALETTE, MONO_PALETTE, NES_PALETTE } from "./palettes";

/** Matriz Bayer 4x4 normalizada (-0.5..0.5) para dithering ordenado */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16 - 0.46875));

/**
 * Pixela un frame: promedia bloques size×size y los re-expande
 * con vecino más cercano (look 8-bit auténtico).
 */
export function pixelate(frame: RawFrame, size: number): RawFrame {
  if (size <= 1) return frame;
  const { width, height } = frame;
  const bw = Math.max(1, Math.floor(width / size));
  const bh = Math.max(1, Math.floor(height / size));
  const small = new Float32Array(bw * bh * 3);
  const counts = new Float32Array(bw * bh);

  for (let y = 0; y < height; y++) {
    const by = Math.min(bh - 1, Math.floor(y / size));
    for (let x = 0; x < width; x++) {
      const bx = Math.min(bw - 1, Math.floor(x / size));
      const si = (by * bw + bx) * 3;
      const pi = (y * width + x) * 4;
      small[si] += frame.data[pi];
      small[si + 1] += frame.data[pi + 1];
      small[si + 2] += frame.data[pi + 2];
      counts[by * bw + bx]++;
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const by = Math.min(bh - 1, Math.floor(y / size));
    for (let x = 0; x < width; x++) {
      const bx = Math.min(bw - 1, Math.floor(x / size));
      const si = (by * bw + bx) * 3;
      const n = counts[by * bw + bx];
      const pi = (y * width + x) * 4;
      out[pi] = small[si] / n;
      out[pi + 1] = small[si + 1] / n;
      out[pi + 2] = small[si + 2] / n;
      out[pi + 3] = 255;
    }
  }
  return { data: out, width, height };
}

/**
 * Genera una paleta global con median-cut a partir de muestras de varios
 * frames. Una sola paleta para todo el GIF evita parpadeo de color.
 */
export function buildGlobalPalette(
  frames: RawFrame[],
  colorCount: number,
  maxSamples = 24000
): number[][] {
  const samples: number[][] = [];
  const stride = Math.max(1, Math.floor((frames.length * frames[0].width * frames[0].height) / maxSamples));
  let idx = 0;
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i += 4 * 7) {
      if ((idx++ % stride) !== 0) continue;
      samples.push([f.data[i], f.data[i + 1], f.data[i + 2]]);
      if (samples.length >= maxSamples) break;
    }
    if (samples.length >= maxSamples) break;
  }
  return medianCut(samples, colorCount);
}

function medianCut(pixels: number[][], count: number): number[][] {
  const boxes: number[][][] = [pixels];
  while (boxes.length < count) {
    // Divide la caja con mayor rango de canal y más píxeles
    let target = -1;
    let targetRange = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const r = boxRange(box);
      const score = r.maxRange * Math.log2(box.length);
      if (score > targetRange) {
        targetRange = score;
        target = i;
      }
    });
    if (target === -1) break;
    const box = boxes[target];
    const ch = boxChannel(box);
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(target, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    const n = box.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

function boxRange(box: number[][]): { min: number[]; max: number[]; maxRange: number } {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  for (const p of box)
    for (let c = 0; c < 3; c++) {
      if (p[c] < min[c]) min[c] = p[c];
      if (p[c] > max[c]) max[c] = p[c];
    }
  const ranges = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { min, max, maxRange: Math.max(...ranges) };
}

function boxChannel(box: number[][]): number {
  const { min, max } = boxRange(box);
  const ranges = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return ranges.indexOf(Math.max(...ranges));
}

/** Mapea el frame a la paleta (vecino más cercano) con dithering opcional */
export function applyPalette(frame: RawFrame, palette: number[][], dither: boolean): RawFrame {
  const out = new Uint8ClampedArray(frame.data.length);
  // Radio de dispersión proporcional al tamaño de paleta
  const spread = dither ? 255 / Math.cbrt(Math.max(2, palette.length)) : 0;

  for (let i = 0; i < frame.data.length; i += 4) {
    const px = (i >> 2);
    const bx = px % frame.width;
    const by = (px / frame.width) | 0;
    const t = dither ? BAYER_4[by & 3][bx & 3] * spread : 0;
    const r = clamp(frame.data[i] + t);
    const g = clamp(frame.data[i + 1] + t);
    const b = clamp(frame.data[i + 2] + t);
    const c = palette[nearestIndex(r, g, b, palette)];
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = 255;
  }
  return { data: out, width: frame.width, height: frame.height };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Caché de búsquedas por paleta (WeakMap: al cambiar de paleta, caché nueva) */
const cacheStore = new WeakMap<number[][], Map<number, number>>();

/** Índice del color más cercano en la paleta (métrica perceptual ponderada) */
export function nearestIndex(r: number, g: number, b: number, palette: number[][]): number {
  let cache = cacheStore.get(palette);
  if (!cache) {
    cache = new Map();
    cacheStore.set(palette, cache);
  }
  const key = (r << 16) | (g << 8) | b;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
    const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114; // ponderado perceptual
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  if (cache.size > 200000) cache.clear();
  cache.set(key, bestIdx);
  return bestIdx;
}

/**
 * Mapea un frame a índices de paleta y reconstruye el RGBA resultante.
 * ditherSpread > 0 aplica dithering Bayer ordenado con esa amplitud.
 * Es el paso exacto que recibe el encoder: preview == GIF final.
 */
export function mapFrameIndexed(
  frame: RawFrame,
  palette: number[][],
  ditherSpread: number
): { index: Uint8Array; rgba: Uint8ClampedArray } {
  const pxCount = frame.data.length >> 2;
  const index = new Uint8Array(pxCount);
  const rgba = new Uint8ClampedArray(frame.data.length);
  for (let p = 0; p < pxCount; p++) {
    const i4 = p * 4;
    let r = frame.data[i4], g = frame.data[i4 + 1], b = frame.data[i4 + 2];
    if (ditherSpread > 0) {
      const t = BAYER_4[(p / frame.width | 0) & 3][(p % frame.width) & 3] * ditherSpread;
      r = clamp(r + t);
      g = clamp(g + t);
      b = clamp(b + t);
    }
    const idx = nearestIndex(r, g, b, palette);
    index[p] = idx;
    const c = palette[idx];
    rgba[i4] = c[0];
    rgba[i4 + 1] = c[1];
    rgba[i4 + 2] = c[2];
    rgba[i4 + 3] = 255;
  }
  return { index, rgba };
}

/** Resuelve los StyleSettings concretos según el preset elegido */
export function resolveStyle(s: StyleSettings): {
  pixelSize: number;
  palette: number[][] | null;
  dither: boolean;
} {
  switch (s.preset) {
    case "retro8bit":
      return { pixelSize: s.pixelSize || 6, palette: null, dither: true }; // paleta generada abajo
    case "anime":
      return { pixelSize: s.pixelSize || 3, palette: null, dither: false };
    case "gameboy":
      return { pixelSize: s.pixelSize || 5, palette: GAMEBOY_PALETTE, dither: true };
    case "nes":
      return { pixelSize: s.pixelSize || 4, palette: NES_PALETTE, dither: false };
    case "mono":
      return { pixelSize: s.pixelSize || 4, palette: MONO_PALETTE, dither: true };
    default:
      return { pixelSize: s.pixelSize, palette: s.fixedPalette, dither: s.dither === "bayer" };
  }
}

/** Indica si el preset necesita una paleta generada desde los frames */
export function needsGeneratedPalette(s: StyleSettings): boolean {
  const { palette } = resolveStyle(s);
  return palette === null && s.preset !== "none";
}

/** Tamaño de paleta a generar según el preset */
export function paletteSizeFor(s: StyleSettings): number {
  switch (s.preset) {
    case "retro8bit":
      return 16;
    case "anime":
      return 32;
    default:
      return Math.max(2, Math.min(64, s.colorCount));
  }
}

/** Aplica el pipeline completo de estilo a un frame */
export function styleFrame(
  frame: RawFrame,
  settings: StyleSettings,
  generatedPalette: number[][] | null
): RawFrame {
  if (settings.preset === "none") return frame; // Original: sin filtro ni pixelado
  const { pixelSize, palette, dither } = resolveStyle(settings);
  let f = pixelate(frame, pixelSize);
  const pal = palette ?? generatedPalette;
  if (pal) f = applyPalette(f, pal, dither);
  return f;
}
