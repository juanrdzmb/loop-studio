import type { ClipFrameCache } from "./clipFrameCache";

export type StabilizationPathSample = {
  time: number;
  /** Posición acumulada normalizada respecto al ancho/alto del frame. */
  x: number;
  y: number;
  confidence: number;
};

export type StabilizationKeyframe = {
  time: number;
  dx: number;
  dy: number;
};

export type ClipStabilization = {
  autoEnabled: boolean;
  confidence: number;
  cropScale: number;
  jitterRmsPx: number;
  keyframes: StabilizationKeyframe[];
  reason: string;
};

export type SourceFrameTransform = {
  /** Desplazamiento normalizado respecto al canvas de salida. */
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))]!;
}

/**
 * Separa el movimiento lento (paneo intencional) de la vibración rápida. La
 * corrección es `trayectoria suave - trayectoria medida`, nunca el paneo entero.
 */
export function buildStabilizationFromPath(
  samples: StabilizationPathSample[],
  sourceWidth: number,
  sourceHeight: number
): ClipStabilization {
  if (samples.length < 5 || sourceWidth < 2 || sourceHeight < 2) {
    return {
      autoEnabled: false,
      confidence: 0,
      cropScale: 1,
      jitterRmsPx: 0,
      keyframes: [],
      reason: "No hay suficientes fotogramas para medir microvibración.",
    };
  }

  const startTime = samples[0]!.time;
  const endTime = samples[samples.length - 1]!.time;
  const radiusSec = 0.35;
  const sigmaSec = 0.14;
  const keyframes = samples.map((sample) => {
    let sum = 0;
    let smoothX = 0;
    let smoothY = 0;
    for (const candidate of samples) {
      const distance = Math.abs(candidate.time - sample.time);
      if (distance > radiusSec) continue;
      const weight = Math.exp(-0.5 * (distance / sigmaSec) ** 2);
      sum += weight;
      smoothX += candidate.x * weight;
      smoothY += candidate.y * weight;
    }
    smoothX = sum > 0 ? smoothX / sum : sample.x;
    smoothY = sum > 0 ? smoothY / sum : sample.y;

    // Evita una corrección artificial en los bordes de una trayectoria lineal.
    const edgeDistance = Math.min(sample.time - startTime, endTime - sample.time);
    const edgeGain = clamp(edgeDistance / radiusSec, 0, 1);
    return {
      time: sample.time,
      dx: clamp((smoothX - sample.x) * edgeGain, -0.0125, 0.0125),
      dy: clamp((smoothY - sample.y) * edgeGain, -0.0125, 0.0125),
    };
  });

  const confidence = percentile(samples.slice(1).map((sample) => clamp(sample.confidence, 0, 1)), 0.5);
  const magnitudesPx = keyframes.map((frame) =>
    Math.hypot(frame.dx * sourceWidth, frame.dy * sourceHeight)
  );
  const jitterRmsPx = Math.sqrt(
    magnitudesPx.reduce((sum, value) => sum + value * value, 0) / Math.max(1, magnitudesPx.length)
  );
  const maxDx = percentile(keyframes.map((frame) => Math.abs(frame.dx)), 0.95);
  const maxDy = percentile(keyframes.map((frame) => Math.abs(frame.dy)), 0.95);
  const requiredScale = 1 + 2 * Math.max(maxDx, maxDy);
  const cropScale = clamp(requiredScale, 1, 1.02);
  const correctionIsSafe = requiredScale <= 1.0201 && maxDx <= 0.01 && maxDy <= 0.01;
  const autoEnabled = confidence >= 0.75 && jitterRmsPx >= 0.25 && correctionIsSafe;

  let reason: string;
  if (confidence < 0.75) {
    reason = "Movimiento ambiguo: no se aplicó estabilización automática.";
  } else if (jitterRmsPx < 0.25) {
    reason = "El clip ya se ve estable; no necesita corrección.";
  } else if (!correctionIsSafe) {
    reason = "La corrección exigiría demasiado recorte; se conserva el encuadre original.";
  } else {
    reason = `Microvibración corregida (${jitterRmsPx.toFixed(1)} px, recorte ${((cropScale - 1) * 100).toFixed(1)}%).`;
  }

  return { autoEnabled, confidence, cropScale, jitterRmsPx, keyframes, reason };
}

export function sourceTransformAt(
  stabilization: ClipStabilization | null | undefined,
  sourceTime: number,
  enabled: boolean = true
): SourceFrameTransform {
  const identity = { dx: 0, dy: 0, scale: 1, rotation: 0 };
  if (!enabled || !stabilization?.autoEnabled || stabilization.keyframes.length === 0) return identity;
  const frames = stabilization.keyframes;
  if (sourceTime <= frames[0]!.time) {
    return { dx: frames[0]!.dx, dy: frames[0]!.dy, scale: stabilization.cropScale, rotation: 0 };
  }
  if (sourceTime >= frames[frames.length - 1]!.time) {
    const last = frames[frames.length - 1]!;
    return { dx: last.dx, dy: last.dy, scale: stabilization.cropScale, rotation: 0 };
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.time <= sourceTime) lo = mid;
    else hi = mid;
  }
  const a = frames[lo]!;
  const b = frames[hi]!;
  const mix = clamp((sourceTime - a.time) / Math.max(1e-6, b.time - a.time), 0, 1);
  return {
    dx: a.dx + (b.dx - a.dx) * mix,
    dy: a.dy + (b.dy - a.dy) * mix,
    scale: stabilization.cropScale,
    rotation: 0,
  };
}

function frameLuma(
  ctx: CanvasRenderingContext2D,
  frame: ImageBitmap,
  width: number,
  height: number
): Float32Array {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(frame, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    luma[p] = rgba[i]! * 0.2126 + rgba[i + 1]! * 0.7152 + rgba[i + 2]! * 0.0722;
  }
  return luma;
}

function estimateGlobalTranslation(
  previous: Float32Array,
  current: Float32Array,
  width: number,
  height: number
): { dx: number; dy: number; confidence: number } {
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let xt = 0;
  let yt = 0;
  let temporal = 0;
  let count = 0;
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const i = y * width + x;
      const ix = (previous[i + 1]! - previous[i - 1]! + current[i + 1]! - current[i - 1]!) * 0.25;
      const iy = (previous[i + width]! - previous[i - width]! + current[i + width]! - current[i - width]!) * 0.25;
      if (Math.abs(ix) + Math.abs(iy) < 2) continue;
      const it = current[i]! - previous[i]!;
      xx += ix * ix;
      xy += ix * iy;
      yy += iy * iy;
      xt += ix * it;
      yt += iy * it;
      temporal += Math.abs(it);
      count++;
    }
  }
  const determinant = xx * yy - xy * xy;
  if (count < 64 || determinant <= 1e-6) return { dx: 0, dy: 0, confidence: 0 };
  const dx = clamp((-yy * xt + xy * yt) / determinant, -3, 3);
  const dy = clamp((xy * xt - xx * yt) / determinant, -3, 3);
  const texture = clamp((4 * determinant) / Math.max(1e-6, (xx + yy) ** 2), 0, 1);

  let residual = 0;
  for (let y = 2; y < height - 2; y += 3) {
    for (let x = 2; x < width - 2; x += 3) {
      const i = y * width + x;
      const ix = (previous[i + 1]! - previous[i - 1]! + current[i + 1]! - current[i - 1]!) * 0.25;
      const iy = (previous[i + width]! - previous[i - width]! + current[i + width]! - current[i - width]!) * 0.25;
      residual += Math.abs(ix * dx + iy * dy + current[i]! - previous[i]!);
    }
  }
  const fit = clamp(1 - residual / Math.max(1, temporal), 0, 1);
  return { dx, dy, confidence: clamp(texture * 0.7 + fit * 0.3, 0, 1) };
}

/** Analizador local ligero: flujo óptico global Lucas–Kanade sobre el cache del preview. */
export async function analyzeClipFrameStabilization(
  cache: ClipFrameCache
): Promise<ClipStabilization> {
  if (typeof document === "undefined" || cache.frames.length < 5) {
    return buildStabilizationFromPath([], cache.width, cache.height);
  }
  const analysisWidth = Math.max(96, Math.min(256, cache.width));
  const analysisHeight = Math.max(54, Math.round(cache.height * (analysisWidth / cache.width)));
  const canvas = document.createElement("canvas");
  canvas.width = analysisWidth;
  canvas.height = analysisHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return buildStabilizationFromPath([], cache.width, cache.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let previous = frameLuma(ctx, cache.frames[0]!, analysisWidth, analysisHeight);
  let pathX = 0;
  let pathY = 0;
  const samples: StabilizationPathSample[] = [{ time: 0, x: 0, y: 0, confidence: 1 }];
  for (let i = 1; i < cache.frames.length; i++) {
    const current = frameLuma(ctx, cache.frames[i]!, analysisWidth, analysisHeight);
    const motion = estimateGlobalTranslation(previous, current, analysisWidth, analysisHeight);
    pathX += motion.dx / analysisWidth;
    pathY += motion.dy / analysisHeight;
    samples.push({ time: i / cache.fps, x: pathX, y: pathY, confidence: motion.confidence });
    previous = current;
    if (i % 12 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return buildStabilizationFromPath(samples, cache.width, cache.height);
}
