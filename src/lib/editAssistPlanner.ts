import type { EditProject, EditTimelineClip } from "./editStudio";
import type { LoopSfxCue } from "./seinenSfxLibrary";

export interface EditAssistProfile {
  assetRange: readonly [min: number, max: number];
  visualEnergy: number;
  energyRise: number;
  onsetDensity: number;
}

export interface EditAssistVisualSample {
  time: number;
  quality: number;
  visualEnergy: number;
  sharpness: number;
  exposure: number;
  contrast: number;
  saturation: number;
  motion: number;
  saliencyX: number;
  saliencyY: number;
  saliencyConfidence: number;
  saliencyConcentration: number;
  hash: string;
}

export interface EditAssistSegment {
  id: string;
  start: number;
  end: number;
  quality: number;
  visualEnergy: number;
  saliencyX: number;
  saliencyY: number;
  saliencyConfidence: number;
}

export interface EditAssetAnalysis {
  assetId: string;
  name: string;
  kind: "video" | "image";
  duration: number;
  importIndex: number;
  cropRetention: number;
  quality: number;
  visualEnergy: number;
  samples: EditAssistVisualSample[];
  segments: EditAssistSegment[];
}

export interface EditAssistAudioFrame {
  time: number;
  energy: number;
  onset: number;
}

export interface EditAudioStructure {
  duration: number;
  bpm: number;
  bpmReliable: boolean;
  hopSec: number;
  frames: EditAssistAudioFrame[];
}

export interface EditAssistPresetCandidate {
  id: string;
  label: string;
  dropAt: number;
  profile: EditAssistProfile;
  clips: EditTimelineClip[];
}

export interface EditAssistPresetScore {
  presetId: string;
  label: string;
  score: number;
  musicStart: number;
  boundaryMatch: number;
  energyRise: number;
  onsetDensity: number;
  reasons: string[];
  warnings: string[];
}

export type EditAssistConfidence = "high" | "medium" | "low";

export interface EditAssistRanking {
  selected: EditAssistPresetScore;
  ranked: EditAssistPresetScore[];
  confidence: EditAssistConfidence;
}

export interface EditAssistAssignmentResult {
  clips: EditTimelineClip[];
  uniqueAssetCount: number;
  repeatedSlots: number;
  warnings: string[];
}

export interface EditAssistDraft {
  project: EditProject;
  sfxCues: LoopSfxCue[];
  presetId: string;
  presetLabel: string;
  score: number;
  confidence: EditAssistConfidence;
  reasons: string[];
  warnings: string[];
  uniqueAssetCount: number;
  repeatedSlots: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function closeness(value: number, target: number): number {
  return clamp01(1 - Math.abs(value - target));
}

function timelineDuration(clips: EditTimelineClip[]): number {
  return clips.reduce((sum, clip) => sum + Math.max(1 / 60, clip.duration), 0);
}

function clipStarts(clips: EditTimelineClip[]): number[] {
  let cursor = 0;
  return clips.map((clip) => {
    const start = cursor;
    cursor += Math.max(1 / 60, clip.duration);
    return start;
  });
}

function framesInWindow(audio: EditAudioStructure, start: number, duration: number): EditAssistAudioFrame[] {
  const end = start + duration;
  return audio.frames.filter((frame) => frame.time >= start && frame.time <= end);
}

function maxOnsetNear(audio: EditAudioStructure, time: number): number {
  const radius = Math.max(0.065, audio.hopSec * 2.5);
  let strongest = 0;
  for (const frame of audio.frames) {
    if (frame.time < time - radius) continue;
    if (frame.time > time + radius) break;
    strongest = Math.max(strongest, frame.onset);
  }
  return strongest;
}

function analyzeAudioWindow(
  audio: EditAudioStructure,
  candidate: EditAssistPresetCandidate,
  start: number
): { score: number; boundaryMatch: number; energyRise: number; onsetDensity: number } {
  const duration = timelineDuration(candidate.clips);
  const starts = clipStarts(candidate.clips);
  const boundaryValues = starts.slice(1).map((boundary, index) => {
    const transition = candidate.clips[index + 1]?.transition;
    const emphasis = transition === "punch" || transition === "shake" || transition === "whip" || transition === "flash"
      ? 1
      : transition === "zoom" || transition === "blur"
        ? 0.78
        : 0.58;
    return maxOnsetNear(audio, start + boundary) * emphasis;
  });
  const boundaryMatch = boundaryValues.length ? clamp01(average(boundaryValues) * 1.35) : 0.5;
  const frames = framesInWindow(audio, start, duration);
  const dropTime = start + duration * candidate.dropAt;
  const pre = frames.filter((frame) => frame.time < dropTime);
  const post = frames.filter((frame) => frame.time >= dropTime);
  const preEnergy = average(pre.map((frame) => frame.energy));
  const postEnergy = average(post.map((frame) => frame.energy));
  const energyRise = clamp01((postEnergy - preEnergy + 0.15) / 0.75);
  const onsetDensity = clamp01((frames.filter((frame) => frame.onset >= 0.35).length / Math.max(1, frames.length)) * 4);
  const nonSilence = frames.length
    ? frames.filter((frame) => frame.energy >= 0.08).length / frames.length
    : 0;
  const score = clamp01(
    boundaryMatch * 0.45
    + closeness(energyRise, candidate.profile.energyRise) * 0.25
    + closeness(onsetDensity, candidate.profile.onsetDensity) * 0.2
    + nonSilence * 0.1
  );
  return { score, boundaryMatch, energyRise, onsetDensity };
}

function candidateMusicStarts(audio: EditAudioStructure, duration: number): number[] {
  const maxStart = Math.max(0, audio.duration - duration);
  if (maxStart <= 1e-6) return [0];
  const step = audio.bpmReliable
    ? Math.max(0.12, 30 / Math.max(30, audio.bpm))
    : 0.25;
  const starts: number[] = [];
  for (let start = 0; start <= maxStart + 1e-6; start += step) {
    starts.push(Math.min(maxStart, start));
  }
  if (Math.abs(starts[starts.length - 1]! - maxStart) > 1e-4) starts.push(maxStart);
  return starts;
}

function assetCountFit(count: number, range: readonly [number, number]): number {
  const [min, max] = range;
  if (count >= min && count <= max) return 1;
  if (count < min) return clamp01(count / Math.max(1, min));
  return clamp01(max / Math.max(1, count));
}

function preferredEditDuration(assets: EditAssetAnalysis[], audio: EditAudioStructure | null): number {
  const visualCapacity = assets.reduce((total, asset) => {
    if (asset.kind === "image") return total + 1.8;
    const sceneCapacity = Math.max(4, (asset.segments?.length ?? 1) * 2.5);
    return total + Math.min(asset.duration, sceneCapacity);
  }, 0);
  const fromInventory = Math.max(9.8, Math.min(32, visualCapacity * 1.25));
  return audio ? Math.max(5, Math.min(fromInventory, audio.duration, 32)) : fromInventory;
}

export function rankEditAssistPresets(
  candidates: EditAssistPresetCandidate[],
  assets: EditAssetAnalysis[],
  audio: EditAudioStructure | null,
  fallbackMusicStart = 0
): EditAssistRanking {
  if (!candidates.length) throw new Error("No hay presets disponibles para el montaje asistido");
  if (!assets.length) throw new Error("No hay medios analizables para el montaje asistido");
  const meanVisualEnergy = average(assets.map((asset) => asset.visualEnergy));
  const meanQuality = average(assets.map((asset) => asset.quality));
  const preferredDuration = preferredEditDuration(assets, audio);

  const ranked = candidates.map<EditAssistPresetScore>((candidate) => {
    const duration = timelineDuration(candidate.clips);
    const coverage = clamp01(assets.length / Math.max(1, candidate.clips.length));
    const inventoryFit = assetCountFit(assets.length, candidate.profile.assetRange);
    const profileFit = inventoryFit * 0.55
      + closeness(meanVisualEnergy, candidate.profile.visualEnergy) * 0.45;
    const durationFit = clamp01(1 - Math.abs(duration - preferredDuration) / Math.max(6, preferredDuration));
    let musicStart = Math.max(0, fallbackMusicStart);
    let audioScore = 0.5;
    let boundaryMatch = 0;
    let energyRise = 0;
    let onsetDensity = 0;
    const warnings: string[] = [];

    if (audio) {
      let best: ReturnType<typeof analyzeAudioWindow> & { start: number } | null = null;
      for (const start of candidateMusicStarts(audio, duration)) {
        const result = analyzeAudioWindow(audio, candidate, start);
        if (!best || result.score > best.score + 1e-8 || (Math.abs(result.score - best.score) <= 1e-8 && start < best.start)) {
          best = { ...result, start };
        }
      }
      if (best) {
        musicStart = best.start;
        audioScore = best.score;
        boundaryMatch = best.boundaryMatch;
        energyRise = best.energyRise;
        onsetDensity = best.onsetDensity;
      }
      if (audio.duration + 1e-4 < duration) {
        audioScore *= clamp01(audio.duration / Math.max(0.1, duration));
        warnings.push("La canción es más corta que el montaje y el audio tendrá que repetirse.");
      }
      if (!audio.bpmReliable) warnings.push("El pulso no es concluyente; se usó el BPM actual y la energía de la canción.");
    } else {
      warnings.push("Sin canción: se conservan el BPM y el inicio musical actuales.");
    }

    const score = audio
      ? clamp01(audioScore * 0.4 + profileFit * 0.22 + durationFit * 0.16 + coverage * 0.14 + meanQuality * 0.08)
      : clamp01(profileFit * 0.42 + durationFit * 0.22 + coverage * 0.22 + meanQuality * 0.14);
    const reasons = [
      audio
        ? boundaryMatch >= 0.45
          ? `El ${Math.round(boundaryMatch * 100)}% de los acentos principales encaja con los cortes propuestos.`
          : "La canción tiene pocos golpes claros; la estructura prioriza su respiración y cambio de energía."
        : "La estructura se eligió por la cantidad y energía de los medios.",
      `El perfil de energía favorece el cambio narrativo cerca del ${Math.round(candidate.dropAt * 100)}% del montaje.`,
      `${Math.min(assets.length, candidate.clips.length)} de ${candidate.clips.length} huecos pueden usar un medio distinto antes de repetir.`,
      `La duración de ${duration.toFixed(1)} s se acerca a los ${preferredDuration.toFixed(1)} s útiles según canción y material.`,
    ];
    return {
      presetId: candidate.id,
      label: candidate.label,
      score,
      musicStart,
      boundaryMatch,
      energyRise,
      onsetDensity,
      reasons,
      warnings,
    };
  }).sort((a, b) => b.score - a.score || a.musicStart - b.musicStart || a.presetId.localeCompare(b.presetId));

  const selected = ranked[0]!;
  const margin = selected.score - (ranked[1]?.score ?? 0);
  const confidence: EditAssistConfidence = selected.score >= 0.72 && margin >= 0.08
    ? "high"
    : selected.score >= 0.55
      ? "medium"
      : "low";
  return { selected, ranked, confidence };
}

function strongestTransitionBoundaries(clips: EditTimelineClip[], audio: EditAudioStructure | null): number[] {
  const starts = clipStarts(clips).slice(1);
  const ranked = starts.map((time, index) => {
    const clip = clips[index + 1]!;
    const visualWeight = transitionEnergy(clip.transition) * 0.55 + clamp01(clip.motionIntensity / 100) * 0.2;
    const audioWeight = audio ? maxOnsetNear(audio, time) * 0.45 : 0.2;
    return { time, score: visualWeight + audioWeight };
  }).sort((left, right) => right.score - left.score || left.time - right.time);
  const selected: number[] = [];
  for (const boundary of ranked) {
    if (selected.every((time) => Math.abs(time - boundary.time) >= 1.35)) selected.push(boundary.time);
    if (selected.length === 2) break;
  }
  return selected.sort((a, b) => a - b);
}

/** Mezcla sugerida y reversible para el borrador: una cama muy baja y hasta dos impactos. */
export function suggestEditAssistSfx(
  project: Pick<EditProject, "clips">,
  audio: EditAudioStructure | null,
  presetId: string,
  existing: LoopSfxCue[]
): LoopSfxCue[] {
  const cues = [...existing];
  const hasAmbience = cues.some((cue) => cue.sfxId.startsWith("ambience_"));
  const ambienceId = presetId === "climberPulse"
    ? "ambience_wind"
    : presetId === "vinlandEmotion"
      ? "ambience_rain"
      : presetId === "berserkImpact" || presetId === "goldenMontage"
        ? "ambience_thunder"
        : null;
  if (ambienceId && !hasAmbience) {
    cues.push({
      id: `assist-${presetId}-ambience`,
      sfxId: ambienceId,
      name: "Ambiente sugerido",
      time: 0,
      volume: 0.14,
      targetFormat: "9x16",
    });
  }
  const existingTimes = cues.map((cue) => cue.time);
  for (const [index, time] of strongestTransitionBoundaries(project.clips, audio).entries()) {
    if (existingTimes.some((existingTime) => Math.abs(existingTime - time) < 0.22)) continue;
    cues.push({
      id: `assist-${presetId}-impact-${index}`,
      sfxId: "manga_don_impact",
      name: "Impacto sugerido",
      time: Math.round(time * 100) / 100,
      volume: 0.24,
      targetFormat: "9x16",
    });
  }
  return cues.sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
}

function transitionEnergy(transition: EditTimelineClip["transition"]): number {
  if (transition === "punch" || transition === "shake") return 1;
  if (transition === "whip" || transition === "flash") return 0.88;
  if (transition === "zoom") return 0.68;
  if (transition === "blur") return 0.42;
  if (transition === "crossfade") return 0.24;
  return 0.5;
}

function slotEnergies(clips: EditTimelineClip[], dropAt: number): number[] {
  const total = Math.max(0.1, timelineDuration(clips));
  const starts = clipStarts(clips);
  return clips.map((clip, index) => {
    const progress = starts[index]! / total;
    const phase = progress >= dropAt ? 0.82 : 0.24 + (progress / Math.max(0.05, dropAt)) * 0.22;
    const camera = clamp01(clip.motionIntensity / 100);
    return clamp01(phase * 0.35 + camera * 0.35 + transitionEnergy(clip.transition) * 0.3);
  });
}

function bitCount(value: number): number {
  let current = value >>> 0;
  let count = 0;
  while (current) {
    current &= current - 1;
    count++;
  }
  return count;
}

function hashDifference(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 1;
  let different = 0;
  let bits = 0;
  for (let index = 0; index < a.length; index++) {
    const left = Number.parseInt(a[index]!, 16);
    const right = Number.parseInt(b[index]!, 16);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return 1;
    different += bitCount(left ^ right);
    bits += 4;
  }
  return bits ? different / bits : 1;
}

function descriptorForRange(asset: EditAssetAnalysis, start: number, duration: number): EditAssistVisualSample {
  const center = start + duration / 2;
  const inRange = asset.samples.filter((sample) => sample.time >= start && sample.time <= start + duration);
  const samples = inRange.length
    ? inRange
    : [asset.samples.reduce((nearest, sample) => Math.abs(sample.time - center) < Math.abs(nearest.time - center) ? sample : nearest, asset.samples[0]!)];
  const strongest = [...samples].sort((a, b) => b.saliencyConfidence - a.saliencyConfidence || b.quality - a.quality)[0]!;
  return {
    ...strongest,
    time: center,
    quality: average(samples.map((sample) => sample.quality)),
    visualEnergy: average(samples.map((sample) => sample.visualEnergy)),
    sharpness: average(samples.map((sample) => sample.sharpness)),
    exposure: average(samples.map((sample) => sample.exposure)),
    contrast: average(samples.map((sample) => sample.contrast)),
    saturation: average(samples.map((sample) => sample.saturation)),
    motion: average(samples.map((sample) => sample.motion)),
    saliencyX: average(samples.map((sample) => sample.saliencyX * sample.saliencyConfidence)) / Math.max(0.001, average(samples.map((sample) => sample.saliencyConfidence))),
    saliencyY: average(samples.map((sample) => sample.saliencyY * sample.saliencyConfidence)) / Math.max(0.001, average(samples.map((sample) => sample.saliencyConfidence))),
    saliencyConfidence: average(samples.map((sample) => sample.saliencyConfidence)),
    saliencyConcentration: average(samples.map((sample) => sample.saliencyConcentration)),
  };
}

interface AssignmentCandidate {
  asset: EditAssetAnalysis;
  start: number;
  duration: number;
  descriptor: EditAssistVisualSample;
}

function rangesForAsset(asset: EditAssetAnalysis, requestedDuration: number): Array<{ start: number; duration: number }> {
  if (asset.kind === "image") return [{ start: 0, duration: requestedDuration }];
  const scenes = asset.segments?.length
    ? asset.segments
    : [{ id: `${asset.assetId}-full`, start: 0, end: asset.duration }];
  const ranges: Array<{ start: number; duration: number }> = [];
  for (const scene of scenes) {
    const sceneStart = Math.max(0, Math.min(asset.duration, scene.start));
    const sceneEnd = Math.max(sceneStart, Math.min(asset.duration, scene.end));
    const duration = Math.min(requestedDuration, sceneEnd - sceneStart);
    if (duration < 0.12) continue;
    const maxStart = Math.max(sceneStart, sceneEnd - duration);
    const sceneSamples = asset.samples.filter((sample) => sample.time >= sceneStart && sample.time <= sceneEnd);
    const raw = [
      sceneStart,
      maxStart,
      ...sceneSamples.map((sample) => Math.max(sceneStart, Math.min(maxStart, sample.time - duration / 2))),
    ];
    const unique = [...new Set(raw.map((value) => Math.round(value * 20) / 20))].sort((a, b) => a - b);
    const sampled = unique.length <= 5
      ? unique
      : Array.from({ length: 5 }, (_, index) => unique[Math.round(index * (unique.length - 1) / 4)]!);
    for (const start of sampled) ranges.push({ start, duration });
  }
  return ranges.length ? ranges : [{ start: 0, duration: Math.min(asset.duration, requestedDuration) }];
}

function candidatesForSlot(slot: EditTimelineClip, assets: EditAssetAnalysis[], targetEnergy: number): AssignmentCandidate[] {
  const result: AssignmentCandidate[] = [];
  for (const asset of assets) {
    const requested = Math.max(0.05, slot.duration * Math.max(0.5, Math.min(2, slot.playbackRate)));
    const candidates = rangesForAsset(asset, requested).map(({ start, duration }) => ({
      asset,
      start,
      duration,
      descriptor: descriptorForRange(asset, start, duration),
    })).sort((a, b) => {
      const left = a.descriptor.quality * 0.55 + closeness(a.descriptor.visualEnergy, targetEnergy) * 0.45;
      const right = b.descriptor.quality * 0.55 + closeness(b.descriptor.visualEnergy, targetEnergy) * 0.45;
      return right - left || a.start - b.start;
    });
    result.push(...candidates.slice(0, asset.kind === "video" ? 3 : 1));
  }
  return result;
}

function overlapRatio(range: readonly [number, number], existing: Array<readonly [number, number]>): number {
  let largest = 0;
  for (const other of existing) {
    const overlap = Math.max(0, Math.min(range[1], other[1]) - Math.max(range[0], other[0]));
    largest = Math.max(largest, overlap / Math.max(0.001, range[1] - range[0]));
  }
  return largest;
}

interface BeamState {
  score: number;
  selected: AssignmentCandidate[];
  useCounts: Record<string, number>;
  ranges: Record<string, Array<readonly [number, number]>>;
  lastAssetId: string | null;
  lastImportIndex: number;
  lastHash: string;
}

function framingFor(descriptor: EditAssistVisualSample): Pick<EditTimelineClip, "framingX" | "framingY" | "framingScale"> {
  if (descriptor.saliencyConfidence < 0.08) return { framingX: 0, framingY: 0, framingScale: 1.03 };
  const framingX = Math.round(Math.max(-65, Math.min(65, (descriptor.saliencyX - 0.5) * 200)));
  const framingY = Math.round(Math.max(-65, Math.min(65, (descriptor.saliencyY - 0.5) * 200)));
  const framingScale = Math.round((1.03 + Math.min(0.07, descriptor.saliencyConcentration * descriptor.saliencyConfidence * 0.08)) * 100) / 100;
  return { framingX, framingY, framingScale };
}

export function assignEditAssistMedia(
  slots: EditTimelineClip[],
  assets: EditAssetAnalysis[],
  dropAt: number
): EditAssistAssignmentResult {
  if (!slots.length) return { clips: [], uniqueAssetCount: 0, repeatedSlots: 0, warnings: [] };
  if (!assets.length || assets.some((asset) => !asset.samples.length)) {
    throw new Error("No hay suficientes medios analizados para construir el borrador");
  }
  const energies = slotEnergies(slots, dropAt);
  let beam: BeamState[] = [{ score: 0, selected: [], useCounts: {}, ranges: {}, lastAssetId: null, lastImportIndex: -1, lastHash: "" }];

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex]!;
    const targetEnergy = energies[slotIndex]!;
    const pool = candidatesForSlot(slot, assets, targetEnergy);
    const next: BeamState[] = [];
    for (const state of beam) {
      const hasAlternative = assets.length > 1 && pool.some((candidate) => candidate.asset.assetId !== state.lastAssetId);
      const eligible = hasAlternative
        ? pool.filter((candidate) => candidate.asset.assetId !== state.lastAssetId)
        : pool;
      for (const candidate of eligible) {
        const count = state.useCounts[candidate.asset.assetId] ?? 0;
        const importProgress = candidate.asset.importIndex / Math.max(1, assets.length - 1);
        const slotProgress = slotIndex / Math.max(1, slots.length - 1);
        const orderFit = closeness(importProgress, slotProgress);
        const differentFromPrevious = state.lastHash ? hashDifference(state.lastHash, candidate.descriptor.hash) : 1;
        const diversity = clamp01((1 / (1 + count)) * 0.65 + differentFromPrevious * 0.35);
        const range: readonly [number, number] = [candidate.start, candidate.start + candidate.duration];
        const overlap = candidate.asset.kind === "video"
          ? overlapRatio(range, state.ranges[candidate.asset.assetId] ?? [])
          : count > 0 ? 1 : 0;
        const baseScore = candidate.descriptor.quality * 0.3
          + closeness(candidate.descriptor.visualEnergy, targetEnergy) * 0.25
          + diversity * 0.2
          + orderFit * 0.15
          + candidate.descriptor.saliencyConfidence * 0.1;
        const unusedBonus = count === 0 ? 0.2 : 0;
        const backtrack = state.lastImportIndex >= 0 && candidate.asset.importIndex + 1 < state.lastImportIndex
          ? Math.min(0.16, (state.lastImportIndex - candidate.asset.importIndex) * 0.035)
          : 0;
        const score = state.score + baseScore + unusedBonus - count * 0.14 - overlap * 0.25 - backtrack;
        next.push({
          score,
          selected: [...state.selected, candidate],
          useCounts: { ...state.useCounts, [candidate.asset.assetId]: count + 1 },
          ranges: {
            ...state.ranges,
            [candidate.asset.assetId]: [...(state.ranges[candidate.asset.assetId] ?? []), range],
          },
          lastAssetId: candidate.asset.assetId,
          lastImportIndex: candidate.asset.importIndex,
          lastHash: candidate.descriptor.hash,
        });
      }
    }
    beam = next.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-8) return b.score - a.score;
      const left = a.selected[a.selected.length - 1]!;
      const right = b.selected[b.selected.length - 1]!;
      return left.asset.assetId.localeCompare(right.asset.assetId) || left.start - right.start;
    }).slice(0, 32);
    if (!beam.length) throw new Error(`No se pudo asignar un medio al hueco ${slotIndex + 1}`);
  }

  const best = beam[0]!;
  const clips = slots.map((slot, index) => {
    const selected = best.selected[index]!;
    return {
      ...slot,
      assetId: selected.asset.assetId,
      label: selected.asset.name.replace(/\.[^.]+$/, ""),
      sourceStart: selected.asset.kind === "video" ? selected.start : 0,
      sourceDuration: selected.duration,
      ...framingFor(selected.descriptor),
    };
  });
  const uniqueAssetCount = new Set(clips.map((clip) => clip.assetId)).size;
  const repeatedSlots = Math.max(0, clips.length - uniqueAssetCount);
  const warnings: string[] = [];
  if (repeatedSlots > 0) warnings.push(`${repeatedSlots} huecos reutilizan medios porque la estructura necesita más planos.`);
  if (assets.length === 1 && clips.length > 1) warnings.push("Solo hay un medio; se reutilizó con rangos distintos cuando fue posible.");
  return { clips, uniqueAssetCount, repeatedSlots, warnings };
}
