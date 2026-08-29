import type { LoopCandidate } from "./companion";

export interface LocalLoopOptions {
  /** Duración mínima del loop en segundos. */
  minDuration?: number;
  /** Duración máxima del loop en segundos. */
  maxDuration?: number;
  /** Cuántos candidatos devolver. */
  candidates?: number;
}

const TARGET_SAMPLE_RATE = 11025;
const HOP_SEC = 0.01;
const CONTEXT_SEC = 0.6;

/**
 * Período de beat (s) por autocorrelación de una envolvente de energía.
 * Lags 0.30-1.05 s ≈ 57-200 BPM. Devuelve null si no hay ritmo claro (corr ≤ 0.25).
 */
export function estimateBeatPeriodFromEnvelope(
  env: Float32Array,
  hopSec: number
): number | null {
  const frames = env.length;
  const lagMin = Math.round(0.3 / hopSec);
  const lagMax = Math.min(Math.round(1.05 / hopSec), Math.floor(frames / 3));
  if (frames < 40 || lagMax <= lagMin + 4) return null;
  const mean = env.reduce((a, b) => a + b, 0) / frames;
  const centered = new Float32Array(frames);
  for (let i = 0; i < frames; i++) centered[i] = env[i]! - mean;
  let denom = 0;
  for (let i = 0; i < frames; i++) denom += centered[i]! * centered[i]!;
  if (denom <= 1e-12) return null;
  let bestCorr = 0;
  let beatFrames = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < frames; i++) acc += centered[i]! * centered[i + lag]!;
    const corr = acc / denom;
    if (corr > bestCorr) {
      bestCorr = corr;
      beatFrames = lag;
    }
  }
  return bestCorr > 0.25 && beatFrames > 0 ? beatFrames * hopSec : null;
}

/** Envolvente RMS (hop de 10 ms) de la canción a ~11 kHz, igual que el analizador local. */
function rmsEnvelope(buffer: AudioBuffer): Float32Array {
  const sr = buffer.sampleRate;
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const factor = Math.max(1, Math.round(sr / TARGET_SAMPLE_RATE));
  const dsLen = Math.floor(left.length / factor);
  const mono = new Float32Array(dsLen);
  for (let i = 0; i < dsLen; i++) {
    let acc = 0;
    const base = i * factor;
    for (let k = 0; k < factor; k++) {
      const s = right ? (left[base + k]! + right[base + k]!) * 0.5 : left[base + k]!;
      acc += s;
    }
    mono[i] = acc / factor;
  }
  const dsRate = sr / factor;
  const hop = Math.max(1, Math.round(HOP_SEC * dsRate));
  const frames = Math.floor(dsLen / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let k = 0; k < hop; k++) {
      const s = mono[base + k]!;
      sum += s * s;
    }
    env[f] = Math.sqrt(sum / hop);
  }
  return env;
}

/**
 * Período de beat (s) de una canción completa; null si no se detecta ritmo claro.
 * Lo usa el editor de recorte para imantar el drag a la rejilla del beat.
 */
export function estimateBeatPeriodSec(buffer: AudioBuffer): number | null {
  const env = rmsEnvelope(buffer);
  return estimateBeatPeriodFromEnvelope(env, HOP_SEC);
}

/**
 * Análisis de loop 100% local en el navegador (sin companion Python).
 *
 * Estrategia:
 * 1. Envolvente de energía (RMS) + tasa de cruces por cero a resolución fina.
 * 2. Estimación del período de beat por autocorrelación de la envolvente.
 * 3. Costuras candidatas alineadas al beat para varias duraciones de loop.
 * 4. Score de continuidad: compara el contexto justo antes del final del loop
 *    (end-w..end) con el contexto natural previo al inicio (start-w..start).
 *    Si se parecen, el salto end→start suena como la continuación original
 *    de la canción en vez de un corte.
 *
 * No sustituye a pymusiclooper (companion), pero da candidatos con costura
 * musical real cuando no hay backend.
 */
export function analyzeLocalLoops(
  buffer: AudioBuffer,
  opts: LocalLoopOptions = {}
): LoopCandidate[] {
  const minDuration = Math.max(4, opts.minDuration ?? 8);
  const maxDuration = Math.max(minDuration, opts.maxDuration ?? 90);
  const want = Math.max(1, opts.candidates ?? 5);
  const songDur = buffer.duration;
  if (!Number.isFinite(songDur) || songDur < minDuration + 4) return [];

  const sr = buffer.sampleRate;
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  // Downmix + decimación por promedio de bloques (funciona como lowpass tosco)
  const factor = Math.max(1, Math.round(sr / TARGET_SAMPLE_RATE));
  const dsRate = sr / factor;
  const dsLen = Math.floor(left.length / factor);
  const mono = new Float32Array(dsLen);
  for (let i = 0; i < dsLen; i++) {
    let acc = 0;
    const base = i * factor;
    for (let k = 0; k < factor; k++) {
      const s = right ? (left[base + k]! + right[base + k]!) * 0.5 : left[base + k]!;
      acc += s;
    }
    mono[i] = acc / factor;
  }

  // Envolventes finas: RMS y ZCR por hop de 10 ms
  const hop = Math.max(1, Math.round(HOP_SEC * dsRate));
  const frames = Math.floor(dsLen / hop);
  if (frames < 40) return [];
  const env = new Float32Array(frames);
  const zcr = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    let crossings = 0;
    let prev = 0;
    const base = f * hop;
    for (let k = 0; k < hop; k++) {
      const s = mono[base + k]!;
      sum += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) crossings++;
      prev = s;
    }
    env[f] = Math.sqrt(sum / hop);
    zcr[f] = crossings / hop;
  }
  let maxEnv = 1e-9;
  let maxZcr = 1e-9;
  for (let f = 0; f < frames; f++) {
    if (env[f]! > maxEnv) maxEnv = env[f]!;
    if (zcr[f]! > maxZcr) maxZcr = zcr[f]!;
  }

  // Período de beat por autocorrelación de la envolvente (helper compartido)
  const beatPeriodSec = estimateBeatPeriodFromEnvelope(env, HOP_SEC);
  const hasBeat = beatPeriodSec !== null;
  const beatFrames = hasBeat ? Math.round(beatPeriodSec / HOP_SEC) : 0;
  // Grid de búsqueda: medio beat si hay beat claro, si no cada 0.25 s
  const stepFrames = hasBeat ? Math.max(1, Math.round(beatFrames / 2)) : Math.round(0.25 / HOP_SEC);
  const barFrames = hasBeat ? beatFrames * 4 : 0;

  // Duraciones objetivo: largas para videos largos, cortas para shorts
  const baseLengths = maxDuration >= 60 ? [24, 32, 48, 64, 96] : [12, 16, 20, 24, 30];
  const lengths: number[] = [];
  for (const l of baseLengths) {
    let len = Math.min(maxDuration, Math.max(minDuration, l));
    if (barFrames > 0) {
      // Ajustar a compases enteros (4 beats) para conservar la estructura rítmica
      len = Math.max(barFrames * HOP_SEC, Math.round(len / (barFrames * HOP_SEC)) * barFrames * HOP_SEC);
    }
    if (len <= songDur - 4 && !lengths.includes(len)) lengths.push(len);
  }
  if (!lengths.length) return [];

  const ctxFrames = Math.max(4, Math.round(CONTEXT_SEC / HOP_SEC));
  const windowDist = (aEnd: number, bEnd: number): number => {
    // Compara [aEnd-ctx, aEnd) vs [bEnd-ctx, bEnd) en envolventes normalizadas
    let dEnv = 0;
    let dZcr = 0;
    let n = 0;
    for (let k = 1; k <= ctxFrames; k++) {
      const ai = aEnd - k;
      const bi = bEnd - k;
      if (ai < 0 || bi < 0) break;
      dEnv += Math.abs(env[ai]! / maxEnv - env[bi]! / maxEnv);
      dZcr += Math.abs(zcr[ai]! / maxZcr - zcr[bi]! / maxZcr);
      n++;
    }
    if (!n) return 1;
    return dEnv / n + 0.5 * (dZcr / n);
  };

  const startFrameMax = Math.min(frames - 1, Math.round((songDur - Math.min(...lengths)) / HOP_SEC));
  type Ranked = { start: number; end: number; len: number; dist: number; energy: number };
  const ranked: Ranked[] = [];

  for (const len of lengths) {
    const lenFrames = Math.round(len / HOP_SEC);
    const maxStart = Math.min(startFrameMax, frames - lenFrames - 1);
    if (maxStart < Math.round(2 / HOP_SEC)) continue;
    for (let sf = 0; sf <= maxStart; sf += stepFrames) {
      const ef = sf + lenFrames;
      if (ef + 1 >= frames) break;
      const dist = windowDist(ef, sf);
      // Energía media del tramo: evita elegir puentes casi mudos
      let acc = 0;
      for (let f = sf; f < ef; f += 2) acc += env[f]!;
      const energy = acc / ((ef - sf) / 2) / maxEnv;
      ranked.push({ start: sf * HOP_SEC, end: ef * HOP_SEC, len, dist, energy });
    }
  }
  if (!ranked.length) return [];

  // Score 0-100: continuidad de la costura dominante + pequeño peso de energía
  ranked.sort((a, b) => a.dist - b.dist || b.energy - a.energy);
  const out: LoopCandidate[] = [];
  for (const r of ranked) {
    const seamScore = Math.max(0, 1 - r.dist * 2.5);
    const energyScore = Math.min(1, r.energy / 0.55);
    const score = Math.round(Math.max(5, Math.min(95, (0.85 * seamScore + 0.15 * energyScore) * 100)));
    const start = Math.round(r.start * 10) / 10;
    const end = Math.round(r.end * 10) / 10;
    // Diversidad: descarta duplicados que empiezan a <2 s de uno ya elegido
    if (out.some((c) => Math.abs(c.start - start) < 2)) continue;
    out.push({ start, end, duration: Math.round((end - start) * 10) / 10, score, label: "Auto (local)" });
    if (out.length >= want) break;
  }
  return out;
}
