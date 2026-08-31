import type { ClipFrameCache } from "./clipFrameCache";

export type StabilizationPathSample = {
  time: number;
  /** Posición acumulada normalizada respecto al ancho/alto del frame. */
  x: number;
  y: number;
  confidence: number;
  /** Debug temporal: componentes de la confianza por frame. */
  fit?: number;
  texture?: number;
};

export type StabilizationKeyframe = {
  time: number;
  dx: number;
  dy: number;
  /** Corrección rotacional en grados (v2 companion; 0 en fallback local). */
  rotation?: number;
  /** Escala local alrededor de 1 (v2 companion; 1 en fallback local). */
  scale?: number;
  confidence?: number;
};

export type ClipStabilization = {
  version?: 1 | 2;
  source?: "browser-lk" | "companion-opencv";
  autoEnabled: boolean;
  confidence: number;
  cropScale: number;
  jitterRmsPx: number;
  analysisFps?: number;
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
  analysisWidth: number,
  analysisHeight: number,
  sourceWidth: number = analysisWidth,
  sourceHeight: number = analysisHeight
): ClipStabilization {
  if (samples.length < 5 || sourceWidth < 2 || sourceHeight < 2) {
    return {
      version: 1,
      source: "browser-lk",
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
  console.info("[StabDebug]", JSON.stringify({
    samples: samples.length,
    confidence,
    jitterRmsPx,
    maxDx,
    maxDy,
    requiredScale,
    medianFit: percentile(samples.slice(1).map((s) => s.fit ?? 0), 0.5).toFixed(2),
    medianTexture: percentile(samples.slice(1).map((s) => s.texture ?? 0), 0.5).toFixed(2),
    correctionsPx: keyframes.slice(0, 24).map((k) => (k.dx * sourceWidth).toFixed(2)),
  }));

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

  return {
    version: 1,
    source: "browser-lk",
    autoEnabled,
    confidence,
    cropScale,
    jitterRmsPx,
    keyframes,
    reason,
  };
}

export function sourceTransformAt(
  stabilization: ClipStabilization | null | undefined,
  sourceTime: number,
  enabled: boolean = true,
  strength: number = 1
): SourceFrameTransform {
  const identity = { dx: 0, dy: 0, scale: 1, rotation: 0 };
  if (!enabled || !stabilization?.autoEnabled || stabilization.keyframes.length === 0) return identity;
  const gain = clamp(strength, 0, 1);
  if (gain <= 0) return identity;
  const cropScale = 1 + (stabilization.cropScale - 1) * gain;
  const transformFrom = (frame: StabilizationKeyframe): SourceFrameTransform => ({
    dx: frame.dx * gain,
    dy: frame.dy * gain,
    scale: cropScale * (1 + ((frame.scale ?? 1) - 1) * gain),
    rotation: (frame.rotation ?? 0) * gain,
  });
  const frames = stabilization.keyframes;
  if (sourceTime <= frames[0]!.time) {
    return transformFrom(frames[0]!);
  }
  if (sourceTime >= frames[frames.length - 1]!.time) {
    return transformFrom(frames[frames.length - 1]!);
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
    dx: (a.dx + (b.dx - a.dx) * mix) * gain,
    dy: (a.dy + (b.dy - a.dy) * mix) * gain,
    scale: cropScale * (
      1 + (((a.scale ?? 1) + ((b.scale ?? 1) - (a.scale ?? 1)) * mix) - 1) * gain
    ),
    rotation: ((a.rotation ?? 0) + ((b.rotation ?? 0) - (a.rotation ?? 0)) * mix) * gain,
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

function solveLK(
  previous: Float32Array,
  current: Float32Array,
  width: number,
  height: number,
  gradientFloor: number
): { dx: number; dy: number; texture: number; count: number } {
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let xt = 0;
  let yt = 0;
  let count = 0;
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const i = y * width + x;
      const ix = (previous[i + 1]! - previous[i - 1]! + current[i + 1]! - current[i - 1]!) * 0.25;
      const iy = (previous[i + width]! - previous[i - width]! + current[i + width]! - current[i - width]!) * 0.25;
      if (Math.abs(ix) + Math.abs(iy) < gradientFloor) continue;
      const it = current[i]! - previous[i]!;
      xx += ix * ix;
      xy += ix * iy;
      yy += iy * iy;
      xt += ix * it;
      yt += iy * it;
      count++;
    }
  }
  const determinant = xx * yy - xy * xy;
  if (count < 64 || determinant <= 1e-6) return { dx: 0, dy: 0, texture: 0, count };
  const dx = clamp((-yy * xt + xy * yt) / determinant, -3, 3);
  const dy = clamp((xy * xt - xx * yt) / determinant, -3, 3);
  // Condicionamiento del sistema LK: 1 - (correlación de gradientes)².
  // Mide si la traslación es resoluble (gradientes no degenerados en una sola
  // dirección diagonal). La isotropía 4·det/(xx+yy)² penalizaba bordes
  // axis-aligned (testsrc2 → 0.66) y dejaba el caso ideal bajo el umbral.
  const texture = clamp(determinant / Math.max(1e-9, xx * yy), 0, 1);
  return { dx, dy, texture, count };
}

/** Re-muestrea el frame desplazándolo (sx, sy) enteros: alinea el remanente de LK. */
function shiftLuma(frame: Float32Array, width: number, height: number, sx: number, sy: number): Float32Array {
  const out = new Float32Array(frame.length);
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(height - 1, Math.max(0, y + sy));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(width - 1, Math.max(0, x + sx));
      out[y * width + x] = frame[srcY * width + srcX]!;
    }
  }
  return out;
}

function estimateGlobalTranslation(
  previous: Float32Array,
  current: Float32Array,
  width: number,
  height: number,
  maxTranslation: number = 3
): { dx: number; dy: number; confidence: number; fit: number; texture: number } {
  // El piso de textura escala con el ancho: a 256 px era 2; mantenerlo fijo en
  // resoluciones mayores excluiría demasiado borde útil.
  const gradientFloor = Math.max(1.5, width * 0.008);
  // LK lineal solo resuelve con precisión <1 px: se refina re-alineando el frame
  // por el desplazamiento entero acumulado y resolviendo el remanente. Así el
  // temblor de 1-3 px/frame se mide completo en vez de subestimarse.
  let totalDx = 0;
  let totalDy = 0;
  let working = current;
  let texture = 0;
  let lastCount = 0;
  for (let iter = 0; iter < 3; iter++) {
    const step = solveLK(previous, working, width, height, gradientFloor);
    texture = step.texture;
    lastCount = step.count;
    totalDx += step.dx;
    totalDy += step.dy;
    const sx = Math.round(step.dx);
    const sy = Math.round(step.dy);
    if ((sx === 0 && sy === 0) || iter === 2) break;
    working = shiftLuma(working, width, height, sx, sy);
  }
  if (lastCount < 64) return { dx: 0, dy: 0, confidence: 0, fit: 0, texture: 0 };

  // Confianza: ajuste del desplazamiento TOTAL (subpíxel, bilineal) contra los
  // frames originales. Con muestreo entero, un desplazamiento de 0.5 px no
  // reducía el residual y el fit colapsaba a 0 aunque la medición fuera buena.
  let residual = 0;
  let temporal = 0;
  const sampleBilinear = (frame: Float32Array, x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1.001, x));
    const cy = Math.max(0, Math.min(height - 1.001, y));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const fx = cx - x0;
    const fy = cy - y0;
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const a = frame[y0 * width + x0]!;
    const b = frame[y0 * width + x1]!;
    const c = frame[y1 * width + x0]!;
    const d = frame[y1 * width + x1]!;
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  };
  for (let y = 2; y < height - 2; y += 3) {
    for (let x = 2; x < width - 2; x += 3) {
      const i = y * width + x;
      residual += Math.abs(sampleBilinear(current, x + totalDx, y + totalDy) - previous[i]!);
      temporal += Math.abs(current[i]! - previous[i]!);
    }
  }
  const fit = clamp(1 - residual / Math.max(1e-4, temporal), 0, 1);
  return {
    dx: clamp(totalDx, -maxTranslation, maxTranslation),
    dy: clamp(totalDy, -maxTranslation, maxTranslation),
    // La fiabilidad es el condicionamiento del sistema (¿se pudo resolver la
    // traslación?), no el `fit`: el fit compara residual vs diferencia temporal
    // y colapsa a 0 en vídeo real con movimiento interno (Prueba.mp4 → 0.00)
    // aunque la traslación global esté bien medida. El fit se conserva solo
    // como diagnóstico.
    confidence: texture,
    fit,
    texture,
  };
}

/** Analizador local ligero: flujo óptico global Lucas–Kanade sobre el cache del preview. */
export async function analyzeClipFrameStabilization(
  cache: ClipFrameCache
): Promise<ClipStabilization> {
  if (typeof document === "undefined" || cache.frames.length < 5) {
    return buildStabilizationFromPath([], cache.width, cache.height);
  }
  const analysisWidth = Math.max(96, Math.min(cache.width, 480));
  const analysisHeight = Math.max(54, Math.round(cache.height * (analysisWidth / cache.width)));
  const canvas = document.createElement("canvas");
  canvas.width = analysisWidth;
  canvas.height = analysisHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return buildStabilizationFromPath([], cache.width, cache.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // En clips largos analizar miles de frames bloqueaba el hilo principal. Se
  // conserva la cadencia completa en clips cortos y se muestrea un máximo de
  // 360 frames en los largos; export y preview siguen usando todos los frames.
  const stride = Math.max(1, Math.ceil(cache.frames.length / 360));
  const indices: number[] = [];
  for (let index = 0; index < cache.frames.length; index += stride) indices.push(index);
  const lastIndex = cache.frames.length - 1;
  if (indices.at(-1) !== lastIndex) indices.push(lastIndex);

  let previous = frameLuma(ctx, cache.frames[indices[0]!]!, analysisWidth, analysisHeight);
  let pathX = 0;
  let pathY = 0;
  const samples: StabilizationPathSample[] = [{ time: 0, x: 0, y: 0, confidence: 1 }];
  for (let position = 1; position < indices.length; position++) {
    const frameIndex = indices[position]!;
    const current = frameLuma(ctx, cache.frames[frameIndex]!, analysisWidth, analysisHeight);
    const motion = estimateGlobalTranslation(
      previous,
      current,
      analysisWidth,
      analysisHeight,
      3 * stride
    );
    pathX += motion.dx / analysisWidth;
    pathY += motion.dy / analysisHeight;
    samples.push({
      time: frameIndex / cache.fps,
      x: pathX,
      y: pathY,
      confidence: motion.confidence,
      fit: motion.fit,
      texture: motion.texture,
    });
    previous = current;
    if (position % 4 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return buildStabilizationFromPath(samples, cache.width, cache.height, cache.sourceWidth, cache.sourceHeight);
}
