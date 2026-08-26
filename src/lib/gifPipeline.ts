import { quantize } from "gifenc";
import { extractFrames } from "./frameExtractor";
import { applyLoopMode, detectBestEnd } from "./loopProcessor";
import {
  buildGlobalPalette,
  mapFrameIndexed,
  needsGeneratedPalette,
  nearestIndex,
  paletteSizeFor,
  styleFrame,
} from "./styleFilter";
import type { GifSettings, RawFrame, StyleSettings, TrimRange } from "./types";

export interface PreparedFrame {
  index: Uint8Array;
  palette: number[][];
}

export interface GifPipelineResult {
  /** Frames RGBA ya cuantizados — visualmente idénticos al GIF final */
  rgbaFrames: RawFrame[];
  /** Frames indexados listos para gifenc sin re-procesar */
  prepared: PreparedFrame[];
  width: number;
  height: number;
  fps: number;
  /** Segundo exacto donde cortó el modo Auto (si aplicó) */
  autoCutSeconds: number | null;
}

export type PipelineStage = "extract" | "loop" | "style" | "quantize";

/**
 * Pipeline ÚNICO de GIF: extracción → loop → estilo → cuantización.
 * Tanto el preview en vivo como la generación final lo usan, por lo que
 * el preview es pixel-perfect respecto al resultado.
 */
export async function buildGifFrames(
  file: File,
  opts: {
    trim: TrimRange;
    gif: GifSettings;
    style: StyleSettings;
    maxColors: number;
  },
  onStage?: (stage: PipelineStage, ratio: number) => void
): Promise<GifPipelineResult> {
  const { trim, gif, style, maxColors } = opts;
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  // 1) Extracción EXACTA: mismo ancho y fps que la exportación
  const extracted = await extractFrames(
    file,
    { start: trim.start, end: trim.end, fps: gif.fps, width: gif.width },
    (r) => onStage?.("extract", r)
  );
  const { width, height } = extracted;
  let frames = extracted.frames;

  // 2) Auto-MSE (misma fórmula que la generación)
  let autoCutSeconds: number | null = null;
  if (gif.loopMode === "auto") {
    onStage?.("loop", 0);
    await tick();
    const minFrames = Math.max(3, Math.round(gif.fps * 0.4));
    const det = detectBestEnd(frames, minFrames);
    frames = frames.slice(0, det.bestEndFrame + 1);
    autoCutSeconds = (det.bestEndFrame + 1) / gif.fps;
  }

  // 3) Modo de loop
  frames = applyLoopMode(
    frames,
    gif.loopMode === "auto" ? "normal" : gif.loopMode,
    gif.fadePercent
  );

  // 4) Estilo con paleta global de ESTOS frames
  const pal = needsGeneratedPalette(style)
    ? buildGlobalPalette(frames, paletteSizeFor(style))
    : null;
  const styled: RawFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    styled.push(styleFrame(frames[i], style, pal));
    onStage?.("style", (i + 1) / frames.length);
    if (i % 6 === 5) await tick();
  }

  // 5) Cuantización GLOBAL: UNA paleta para todo el GIF (sin parpadeo entre
  // frames) + dithering Bayer adaptativo (suaviza degradados en modo Original).
  const prepared: PreparedFrame[] = [];
  const rgbaFrames: RawFrame[] = [];
  const maxC = Math.max(2, Math.min(256, maxColors));
  onStage?.("quantize", 0);
  await tick();
  const sample = samplePixels(styled);
  const palette = quantize(sample, maxC, { format: "rgb565" }) as number[][];
  const spread = estimateDitherSpread(sample, palette);
  for (let i = 0; i < styled.length; i++) {
    const { index, rgba } = mapFrameIndexed(styled[i], palette, spread);
    prepared.push({ index, palette });
    rgbaFrames.push({ data: rgba, width: styled[i].width, height: styled[i].height });
    onStage?.("quantize", (i + 1) / styled.length);
    if (i % 6 === 5) await tick();
  }

  return { rgbaFrames, prepared, width, height, fps: gif.fps, autoCutSeconds };
}

/** Muestreo equidistribuido de píxeles de todos los frames (RGBA para gifenc) */
function samplePixels(frames: RawFrame[], maxPx = 24000): Uint8Array {
  const total = frames.reduce((s, f) => s + (f.data.length >> 2), 0);
  const stride = Math.max(1, Math.floor(total / maxPx));
  const out = new Uint8Array(maxPx * 4);
  let n = 0;
  let seen = 0;
  for (const f of frames) {
    const pxCount = f.data.length >> 2;
    for (let p = 0; p < pxCount; p++) {
      if ((seen++ % stride) !== 0) continue;
      if (n >= maxPx) break;
      const s4 = p * 4, d4 = n * 4;
      out[d4] = f.data[s4];
      out[d4 + 1] = f.data[s4 + 1];
      out[d4 + 2] = f.data[s4 + 2];
      out[d4 + 3] = 255;
      n++;
    }
    if (n >= maxPx) break;
  }
  return out.subarray(0, n * 4);
}

/**
 * Amplitud de dithering = error medio de cuantización × 0.7.
 * Con colores ya exactos (estilos retro) da ~0; con fotos suaviza los degradados.
 */
function estimateDitherSpread(sample: Uint8Array, palette: number[][]): number {
  if (palette.length >= 256) return 0; // paleta completa: sin banding posible
  let acc = 0;
  const n = sample.length >> 2;
  const step = Math.max(1, Math.floor(n / 4000));
  let count = 0;
  for (let p = 0; p < n; p += step) {
    const i4 = p * 4;
    const idx = nearestIndex(sample[i4], sample[i4 + 1], sample[i4 + 2], palette);
    const c = palette[idx];
    const dr = c[0] - sample[i4], dg = c[1] - sample[i4 + 1], db = c[2] - sample[i4 + 2];
    acc += Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
    count++;
  }
  return count ? (acc / count) * 0.7 : 0;
}
