import type { ClipFrameCache } from "./clipFrameCache";
import type {
  EditAssetAnalysis,
  EditAssistSegment,
  EditAssistVisualSample,
  EditAudioStructure,
} from "./editAssistPlanner";

const ANALYSIS_MAX_EDGE = 160;
const COARSE_MAX_EDGE = 72;
const MAX_COARSE_SAMPLES = 160;
const MAX_DETAIL_SAMPLES = 48;
const AUDIO_WINDOW_SEC = 0.05;
const AUDIO_HOP_SEC = 0.025;

export interface EditAssistAssetSource {
  id: string;
  name: string;
  kind: "video" | "image";
  duration: number;
  width: number;
  height: number;
  importIndex: number;
  image: CanvasImageSource | null;
  cache: ClipFrameCache | null;
}

export interface EditAssistAnalysisOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, label: string) => void;
}

interface RawVisualDescriptor extends EditAssistVisualSample {
  luminance: Float32Array;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))]!;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Análisis cancelado", "AbortError");
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function analysisSize(width: number, height: number, maxEdge = ANALYSIS_MAX_EDGE): { width: number; height: number } {
  const sourceWidth = Math.max(1, width);
  const sourceHeight = Math.max(1, height);
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(9, Math.round(sourceWidth * scale)),
    height: Math.max(8, Math.round(sourceHeight * scale)),
  };
}

function cropRetention(width: number, height: number): number {
  const sourceAspect = Math.max(0.01, width / Math.max(1, height));
  const targetAspect = 9 / 16;
  return clamp01(sourceAspect > targetAspect ? targetAspect / sourceAspect : sourceAspect / targetAspect);
}

function hashFromLuminance(luminance: Float32Array, width: number, height: number): string {
  const cells = new Float32Array(9 * 8);
  const counts = new Uint16Array(9 * 8);
  for (let y = 0; y < height; y++) {
    const cellY = Math.min(7, Math.floor(y * 8 / height));
    for (let x = 0; x < width; x++) {
      const cellX = Math.min(8, Math.floor(x * 9 / width));
      const cell = cellY * 9 + cellX;
      cells[cell] += luminance[y * width + x]!;
      counts[cell]++;
    }
  }
  for (let index = 0; index < cells.length; index++) {
    cells[index] /= Math.max(1, counts[index]!);
  }
  let hash = "";
  let nibble = 0;
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      nibble = (nibble << 1) | (cells[y * 9 + x]! > cells[y * 9 + x + 1]! ? 1 : 0);
      bit++;
      if (bit === 4) {
        hash += nibble.toString(16);
        nibble = 0;
        bit = 0;
      }
    }
  }
  return hash;
}

function describeFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  time: number,
  retention: number
): RawVisualDescriptor {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const luminance = new Float32Array(width * height);
  let lumaSum = 0;
  let saturationSum = 0;
  let clipped = 0;

  for (let index = 0; index < luminance.length; index++) {
    const pixel = index * 4;
    const red = pixels[pixel]! / 255;
    const green = pixels[pixel + 1]! / 255;
    const blue = pixels[pixel + 2]! / 255;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    luminance[index] = luma;
    lumaSum += luma;
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    saturationSum += high > 0.001 ? (high - low) / high : 0;
    if (luma < 0.025 || luma > 0.975) clipped++;
  }

  const mean = lumaSum / Math.max(1, luminance.length);
  let variance = 0;
  let gradientSum = 0;
  let saliencySum = 0;
  let saliencyX = 0;
  let saliencyY = 0;
  let saliencyRadius = 0;
  const saturation = saturationSum / Math.max(1, luminance.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const luma = luminance[index]!;
      variance += (luma - mean) ** 2;
      const dx = x + 1 < width ? Math.abs(luminance[index + 1]! - luma) : 0;
      const dy = y + 1 < height ? Math.abs(luminance[index + width]! - luma) : 0;
      const gradient = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 3.2);
      gradientSum += gradient;
      const contrastWeight = Math.min(1, Math.abs(luma - mean) * 2.4);
      const weight = gradient * 0.7 + contrastWeight * 0.3;
      const normalizedX = (x + 0.5) / width;
      const normalizedY = (y + 0.5) / height;
      saliencySum += weight;
      saliencyX += normalizedX * weight;
      saliencyY += normalizedY * weight;
    }
  }

  const contrast = clamp01(Math.sqrt(variance / Math.max(1, luminance.length)) / 0.26);
  const sharpness = clamp01((gradientSum / Math.max(1, luminance.length)) * 4.5);
  const exposure = clamp01(1 - Math.abs(mean - 0.5) / 0.5 - clipped / Math.max(1, luminance.length) * 0.7);
  const centerX = saliencySum > 0.001 ? saliencyX / saliencySum : 0.5;
  const centerY = saliencySum > 0.001 ? saliencyY / saliencySum : 0.5;

  if (saliencySum > 0.001) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const luma = luminance[index]!;
        const dx = x + 1 < width ? Math.abs(luminance[index + 1]! - luma) : 0;
        const dy = y + 1 < height ? Math.abs(luminance[index + width]! - luma) : 0;
        const gradient = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 3.2);
        const weight = gradient * 0.7 + Math.min(1, Math.abs(luma - mean) * 2.4) * 0.3;
        const nx = (x + 0.5) / width;
        const ny = (y + 0.5) / height;
        saliencyRadius += Math.hypot(nx - centerX, ny - centerY) * weight;
      }
    }
  }

  const concentration = clamp01(1 - (saliencyRadius / Math.max(0.001, saliencySum)) / 0.62);
  const saliencyConfidence = clamp01((saliencySum / Math.max(1, luminance.length)) * 5) * (0.45 + concentration * 0.55);
  const quality = clamp01(exposure * 0.34 + contrast * 0.18 + sharpness * 0.3 + retention * 0.18);
  const visualEnergy = clamp01(contrast * 0.34 + saturation * 0.26 + sharpness * 0.4);

  return {
    time,
    quality,
    visualEnergy,
    sharpness,
    exposure,
    contrast,
    saturation: clamp01(saturation * 1.35),
    motion: 0,
    saliencyX: clamp01(centerX),
    saliencyY: clamp01(centerY),
    saliencyConfidence,
    saliencyConcentration: concentration,
    hash: hashFromLuminance(luminance, width, height),
    luminance,
  };
}

function sampleIndices(frameCount: number, limit: number): number[] {
  if (frameCount <= limit) return Array.from({ length: frameCount }, (_, index) => index);
  return Array.from({ length: limit }, (_, index) => (
    Math.round(index * (frameCount - 1) / (limit - 1))
  ));
}

function visualDifference(current: RawVisualDescriptor, previous: RawVisualDescriptor): number {
  let difference = 0;
  const length = Math.min(current.luminance.length, previous.luminance.length);
  for (let pixel = 0; pixel < length; pixel++) {
    difference += Math.abs(current.luminance[pixel]! - previous.luminance[pixel]!);
  }
  return clamp01((difference / Math.max(1, length)) * 5.5);
}

function detectSceneBoundaries(samples: RawVisualDescriptor[], duration: number): number[] {
  if (samples.length < 3) return [0, duration];
  const differences = samples.slice(1).map((sample, index) => visualDifference(sample, samples[index]!));
  const threshold = Math.max(
    0.42,
    percentile(differences, 0.5) * 2.1,
    percentile(differences, 0.82) * 0.92
  );
  const boundaries = [0];
  let lastBoundary = 0;
  for (let index = 1; index < samples.length; index++) {
    const time = Math.max(0, Math.min(duration, samples[index]!.time));
    if (differences[index - 1]! >= threshold && time - lastBoundary >= 0.28 && duration - time >= 0.2) {
      boundaries.push(time);
      lastBoundary = time;
    }
  }
  boundaries.push(duration);
  return boundaries;
}

function nearestFrameIndex(cache: ClipFrameCache, time: number): number {
  return Math.max(0, Math.min(cache.frames.length - 1, Math.round(time * Math.max(1, cache.fps))));
}

function detailIndices(cache: ClipFrameCache, boundaries: number[]): number[] {
  const selected = new Set(sampleIndices(cache.frames.length, Math.min(24, MAX_DETAIL_SAMPLES)));
  for (const boundary of boundaries.slice(1, -1)) {
    const center = nearestFrameIndex(cache, boundary);
    selected.add(Math.max(0, center - 1));
    selected.add(center);
    selected.add(Math.min(cache.frames.length - 1, center + 1));
  }
  const ordered = [...selected].sort((a, b) => a - b);
  if (ordered.length <= MAX_DETAIL_SAMPLES) return ordered;
  return sampleIndices(ordered.length, MAX_DETAIL_SAMPLES).map((index) => ordered[index]!);
}

function segmentsFromBoundaries(
  assetId: string,
  boundaries: number[],
  samples: EditAssistVisualSample[]
): EditAssistSegment[] {
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]!;
    const center = (start + end) / 2;
    const inside = samples.filter((sample) => sample.time >= start && sample.time <= end);
    const descriptors = inside.length
      ? inside
      : [samples.reduce((nearest, sample) => Math.abs(sample.time - center) < Math.abs(nearest.time - center) ? sample : nearest, samples[0]!)];
    const confidence = Math.max(0.001, average(descriptors.map((sample) => sample.saliencyConfidence)));
    return {
      id: `${assetId}-scene-${index}`,
      start,
      end,
      quality: average(descriptors.map((sample) => sample.quality)),
      visualEnergy: average(descriptors.map((sample) => sample.visualEnergy)),
      saliencyX: average(descriptors.map((sample) => sample.saliencyX * sample.saliencyConfidence)) / confidence,
      saliencyY: average(descriptors.map((sample) => sample.saliencyY * sample.saliencyConfidence)) / confidence,
      saliencyConfidence: confidence,
    };
  });
}

export async function analyzeEditAssets(
  sources: EditAssistAssetSource[],
  options: EditAssistAnalysisOptions = {}
): Promise<EditAssetAnalysis[]> {
  const analyses: EditAssetAnalysis[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D no disponible para analizar los medios");
  const totalSamples = Math.max(1, sources.reduce((total, source) => (
    total + (source.kind === "video"
      ? Math.min(MAX_COARSE_SAMPLES, source.cache?.frames.length ?? 0) + Math.min(MAX_DETAIL_SAMPLES, source.cache?.frames.length ?? 0)
      : 1)
  ), 0));
  let completedSamples = 0;

  for (const source of sources) {
    throwIfAborted(options.signal);
    let boundaries = [0, Math.max(0.05, source.duration)];
    let detailFrameSources: Array<{ frame: CanvasImageSource; time: number }> = [];
    if (source.kind === "video") {
      if (!source.cache?.frames.length) throw new Error(`El clip ${source.name} todavía no tiene borrador visual`);
      const coarseSize = analysisSize(source.width, source.height, COARSE_MAX_EDGE);
      canvas.width = coarseSize.width;
      canvas.height = coarseSize.height;
      const coarseSamples: RawVisualDescriptor[] = [];
      for (const index of sampleIndices(source.cache.frames.length, MAX_COARSE_SAMPLES)) {
        throwIfAborted(options.signal);
        const frame = source.cache.frames[index];
        if (!frame) continue;
        coarseSamples.push(describeFrame(
          ctx,
          frame,
          coarseSize.width,
          coarseSize.height,
          index / Math.max(1, source.cache.fps),
          cropRetention(source.width, source.height)
        ));
        completedSamples++;
        options.onProgress?.(completedSamples / totalSamples, `Buscando escenas en ${source.name}`);
        if (completedSamples % 8 === 0) await yieldToBrowser();
      }
      boundaries = detectSceneBoundaries(coarseSamples, Math.max(0.05, source.duration));
      for (const index of detailIndices(source.cache, boundaries)) {
        const frame = source.cache.frames[index];
        if (frame) detailFrameSources.push({ frame, time: index / Math.max(1, source.cache.fps) });
      }
    } else if (source.image) {
      detailFrameSources = [{ frame: source.image, time: 0 }];
    } else {
      throw new Error(`No se pudo leer la imagen ${source.name}`);
    }

    const size = analysisSize(source.width, source.height);
    canvas.width = size.width;
    canvas.height = size.height;
    const retention = cropRetention(source.width, source.height);
    const rawSamples: RawVisualDescriptor[] = [];
    for (const item of detailFrameSources) {
      throwIfAborted(options.signal);
      rawSamples.push(describeFrame(ctx, item.frame, size.width, size.height, item.time, retention));
      completedSamples++;
      options.onProgress?.(completedSamples / totalSamples, `Analizando ${source.name}`);
      if (completedSamples % 4 === 0) await yieldToBrowser();
    }

    for (let index = 1; index < rawSamples.length; index++) {
      const current = rawSamples[index]!;
      const previous = rawSamples[index - 1]!;
      current.motion = visualDifference(current, previous);
    }
    if (rawSamples.length > 1) rawSamples[0]!.motion = rawSamples[1]!.motion;
    for (const sample of rawSamples) {
      sample.visualEnergy = clamp01(sample.visualEnergy * 0.72 + sample.motion * 0.28);
    }
    const samples: EditAssistVisualSample[] = rawSamples.map(({ luminance, ...sample }) => {
      void luminance;
      return sample;
    });
    analyses.push({
      assetId: source.id,
      name: source.name,
      kind: source.kind,
      duration: Math.max(0.05, source.duration),
      importIndex: source.importIndex,
      cropRetention: retention,
      quality: average(samples.map((sample) => sample.quality)),
      visualEnergy: average(samples.map((sample) => sample.visualEnergy)),
      samples,
      segments: source.kind === "image"
        ? [{
            id: `${source.id}-scene-0`,
            start: 0,
            end: Math.max(0.05, source.duration),
            quality: samples[0]?.quality ?? 0,
            visualEnergy: samples[0]?.visualEnergy ?? 0,
            saliencyX: samples[0]?.saliencyX ?? 0.5,
            saliencyY: samples[0]?.saliencyY ?? 0.5,
            saliencyConfidence: samples[0]?.saliencyConfidence ?? 0,
          }]
        : segmentsFromBoundaries(source.id, boundaries, samples),
    });
  }
  options.onProgress?.(1, "Análisis visual listo");
  return analyses;
}

export async function analyzeEditAudio(
  buffer: AudioBuffer,
  options: EditAssistAnalysisOptions & { bpm: number; bpmReliable: boolean }
): Promise<EditAudioStructure> {
  throwIfAborted(options.signal);
  const sampleRate = Math.max(1, buffer.sampleRate);
  const windowSize = Math.max(64, Math.round(sampleRate * AUDIO_WINDOW_SEC));
  const hopSize = Math.max(32, Math.round(sampleRate * AUDIO_HOP_SEC));
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const energyRaw: number[] = [];
  const transientRaw: number[] = [];

  for (let start = 0, frameIndex = 0; start < buffer.length; start += hopSize, frameIndex++) {
    throwIfAborted(options.signal);
    const end = Math.min(buffer.length, start + windowSize);
    const stride = Math.max(1, Math.floor((end - start) / 512));
    let squares = 0;
    let transient = 0;
    let previous = 0;
    let count = 0;
    for (let index = start; index < end; index += stride) {
      const sample = right ? (left[index]! + right[index]!) * 0.5 : left[index]!;
      squares += sample * sample;
      if (count > 0) transient += Math.abs(sample - previous);
      previous = sample;
      count++;
    }
    energyRaw.push(Math.sqrt(squares / Math.max(1, count)));
    transientRaw.push(transient / Math.max(1, count - 1));
    if (frameIndex % 240 === 0) {
      options.onProgress?.(Math.min(0.99, start / Math.max(1, buffer.length)), "Leyendo ritmo y energía");
      await yieldToBrowser();
    }
  }

  const energyScale = Math.max(0.0001, percentile(energyRaw, 0.95));
  const transientScale = Math.max(0.0001, percentile(transientRaw, 0.95));
  const energies = energyRaw.map((value, index) => {
    const nearby = [energyRaw[index - 1], value, energyRaw[index + 1]].filter((item): item is number => item != null);
    return clamp01(average(nearby) / energyScale);
  });
  const onsetRaw = energies.map((energy, index) => {
    const prior = average(energies.slice(Math.max(0, index - 4), index));
    const rise = Math.max(0, energy - prior);
    const transient = clamp01(transientRaw[index]! / transientScale);
    const priorTransient = index > 0 ? clamp01(transientRaw[index - 1]! / transientScale) : 0;
    return Math.max(0, rise * 0.72 + Math.max(0, transient - priorTransient) * 0.28);
  });
  const onsetScale = Math.max(0.04, percentile(onsetRaw, 0.95));
  const frames = energies.map((energy, index) => ({
    time: index * hopSize / sampleRate,
    energy,
    onset: clamp01(onsetRaw[index]! / onsetScale),
  }));
  options.onProgress?.(1, "Análisis musical listo");
  return {
    duration: buffer.duration,
    bpm: options.bpm,
    bpmReliable: options.bpmReliable,
    hopSec: hopSize / sampleRate,
    frames,
  };
}
