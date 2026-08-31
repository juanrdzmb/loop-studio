import { estimateBeatPeriodSec } from "./audioLoopAnalyzer";

/** Estima BPM de un AudioBuffer (60-200). Null si no hay ritmo claro. */
export function estimateBpmFromBuffer(buffer: AudioBuffer): number | null {
  const period = estimateBeatPeriodSec(buffer);
  if (period == null || !(period > 0.15 && period < 1.2)) return null;
  const bpm = Math.round(60 / period);
  if (bpm < 60 || bpm > 200) return null;
  // Snapping a BPM musicales comunes (cuantiza levemente para evitar 127 vs 128)
  const common = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 124, 128, 130, 135, 140, 144, 150, 160, 174, 180];
  let best = bpm;
  let bestDist = Infinity;
  for (const c of common) {
    const d = Math.abs(c - bpm);
    if (d < bestDist && d <= 3) { bestDist = d; best = c; }
  }
  return best;
}

/** Picos de waveform normalizados 0..1 por bucket (para dibujar en timeline). */
export function getWaveformPeaks(buffer: AudioBuffer, bucketCount: number): number[] {
  if (bucketCount <= 0 || buffer.length === 0) return [];
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const total = buffer.length;
  const buckets = Math.max(1, Math.min(8000, Math.floor(bucketCount)));
  const hop = Math.max(1, Math.floor(total / buckets));
  const peaks: number[] = new Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const start = b * hop;
    const end = Math.min(total, start + hop);
    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += Math.max(1, Math.floor(hop / 48))) {
      const s = right ? (left[i]! + right[i]!) * 0.5 : left[i]!;
      const a = Math.abs(s);
      if (a > max) max = a;
      sum += a;
      count++;
    }
    const rms = count ? sum / count : 0;
    // mezcla pico + rms para que silencios no desaparezcan y golpes resalten
    peaks[b] = Math.min(1, max * 0.72 + rms * 0.6);
  }
  // normaliza al máximo observado para que la waveform llene altura
  let globalMax = 0.01;
  for (const p of peaks) if (p > globalMax) globalMax = p;
  for (let i = 0; i < peaks.length; i++) peaks[i] = Math.min(1, peaks[i]! / globalMax);
  return peaks;
}

/** Peaks recortados a la duración visible del timeline (musicStart + duration). */
export function getTimelineWaveformPeaks(
  buffer: AudioBuffer,
  musicStart: number,
  timelineDuration: number,
  pxPerSecond: number
): number[] {
  if (!buffer || timelineDuration <= 0) return [];
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor((musicStart % Math.max(0.01, buffer.duration)) * sr));
  const timelineSamples = Math.floor(timelineDuration * sr);
  const endSample = Math.min(buffer.length, startSample + timelineSamples);
  const sliceLen = Math.max(1, endSample - startSample);
  const buckets = Math.max(16, Math.ceil(timelineDuration * pxPerSecond * 0.5));
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const hop = Math.max(1, Math.floor(sliceLen / buckets));
  const peaks: number[] = new Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const s0 = startSample + b * hop;
    const s1 = Math.min(endSample, s0 + hop);
    let max = 0;
    let sum = 0;
    let c = 0;
    for (let i = s0; i < s1; i += Math.max(1, Math.floor(hop / 32))) {
      const s = right ? (left[i]! + right[i]!) * 0.5 : left[i]!;
      const a = Math.abs(s);
      if (a > max) max = a;
      sum += a;
      c++;
    }
    const rms = c ? sum / c : 0;
    peaks[b] = Math.min(1, max * 0.72 + rms * 0.6);
  }
  let gmax = 0.01;
  for (const p of peaks) if (p > gmax) gmax = p;
  for (let i = 0; i < peaks.length; i++) peaks[i] = Math.min(1, peaks[i]! / gmax);
  return peaks;
}
