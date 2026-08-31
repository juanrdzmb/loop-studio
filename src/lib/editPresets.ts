import type { AestheticStyle, ColorGradeConfig, ParticleType } from "./mangaMotionEngine";
import type { EditMotion, EditProject, EditTextCue, EditTimelineClip, EditTransition, EditVelocityCurve } from "./editStudio";
import { snapEditTime } from "./editStudio";

// Cada preset dura 25-35s (objetivo 28-32, snapped al beat). El usuario puede editar el texto generado después.
export type PresetId = "berserkImpact" | "vinlandEmotion" | "flashStorm" | "goldenMontage";

export interface PresetTextTemplate {
  text: string;
  accent: string;
  color: string;
  y: number;
  size: number;
}

export interface EditPreset {
  id: PresetId;
  label: string;
  desc: string;
  icon: string;
  targetDuration: number; // 25-35 objetivo antes de snap
  pattern: number[]; // duraciones base (seg) antes de snap — se recorre circular hasta alcanzar target
  transitions: {
    // distribución por índice; bar cada 4 beats usa barTransition
    barTransition: EditTransition;
    dropTransitions: EditTransition[]; // se cicla en drop
    buildTransitions: EditTransition[]; // se cicla en build
  };
  motions: {
    build: EditMotion[];
    drop: EditMotion[];
  };
  intensity: { build: number; drop: number };
  velocity: {
    build: { rate: number; curve: EditVelocityCurve };
    drop: { rate: number; curve: EditVelocityCurve };
  };
  style: AestheticStyle;
  colorGrade: Partial<ColorGradeConfig>;
  particles: { type: ParticleType; intensity: number };
  textTemplates: PresetTextTemplate[]; // se colocan espaciados por el timeline
}

export const EDIT_PRESETS: EditPreset[] = [
  {
    id: "berserkImpact",
    label: "BERSERK — Impacto",
    desc: "Build 1.4-1.9s + drop 0.6-0.77s · punch/shake/zoom cada golpe · cámara impacto",
    icon: "💥",
    targetDuration: 30,
    // 28 clips ≈29.9s (referencia Human 15.7 + 12.1 + 2.1). 25-35 garantizado tras snap.
    pattern: [
      1.4, 1.57, 1.93, 1.33, 1.5, 1.13, 1.2,
      0.6, 0.7, 0.73, 0.67, 0.75, 0.72, 0.7, 0.77,
      1.4, 1.57, 1.93, 1.33, 1.5, 1.13, 1.2, 0.6, 0.7, 0.73, 0.67, 0.75, 0.72,
    ],
    transitions: {
      barTransition: "flash",
      dropTransitions: ["punch", "shake", "zoom", "cut"],
      buildTransitions: ["cut", "cut", "zoom", "cut"],
    },
    motions: { build: ["push", "drift"], drop: ["impact", "whip", "push"] },
    intensity: { build: 28, drop: 58 },
    velocity: { build: { rate: 0.88, curve: "easeIn" }, drop: { rate: 1.08, curve: "punch" } },
    style: "dark_fantasy",
    colorGrade: { contrast: 18, exposure: -6, saturation: -8, temperature: -8, bloom: 12, grain: 18 },
    particles: { type: "embers_fire", intensity: 58 },
    textTemplates: [
      { text: "HUMAN", color: "#ffffff", accent: "#d946ef", y: 0.38, size: 56 },
      { text: "AMONG GODS", color: "#ffffff", accent: "#f43f5e", y: 0.52, size: 48 },
      { text: "STILL STANDING", color: "#ffffff", accent: "#22d3ee", y: 0.66, size: 44 },
    ],
  },
  {
    id: "vinlandEmotion",
    label: "VINLAND — Emoción lenta",
    desc: "Takes 3-4s narrativas · crossfade largo · drift/vertigo · slow 0.78×",
    icon: "🌊",
    targetDuration: 32,
    // ~9 takes ×3.4 avg =30.6 (imitando LET GO 3.88/4.2/3.9...). Si X pequeño se duplica con variación.
    pattern: [3.85, 4.2, 3.92, 3.32, 3.12, 2.85, 4.05, 3.45, 3.05, 3.6],
    transitions: {
      barTransition: "crossfade",
      dropTransitions: ["crossfade", "zoom"],
      buildTransitions: ["crossfade", "cut"],
    },
    motions: { build: ["drift", "vertigo", "scan"], drop: ["drift", "scan"] },
    intensity: { build: 22, drop: 26 },
    velocity: { build: { rate: 0.78, curve: "easeOut" }, drop: { rate: 0.85, curve: "easeOut" } },
    style: "vintage_sepia",
    colorGrade: { contrast: 8, exposure: 6, saturation: 6, temperature: 14, bloom: 14, grain: 12 },
    particles: { type: "cinematic_dust", intensity: 34 },
    textTemplates: [
      { text: "THE BEST MC", color: "#fff7ed", accent: "#38bdf8", y: 0.62, size: 44 },
      { text: "VINLAND", color: "#ffffff", accent: "#facc15", y: 0.48, size: 52 },
    ],
  },
  {
    id: "flashStorm",
    label: "STORM — Flash ráfaga",
    desc: "Ráfaga constante 0.6-0.8s · flash/whip/shake cada corte · spiral/whip",
    icon: "🌀",
    targetDuration: 28,
    // ~36 clips avg 0.72 =26; con snap 128bpm half-beat 0.234 → 26-29
    pattern: [
      0.72, 0.68, 0.75, 0.65, 0.7, 0.73, 0.69, 0.71,
      0.74, 0.66, 0.72, 0.68, 0.75, 0.62, 0.7, 0.73,
      0.69, 0.71, 0.74, 0.66, 0.72, 0.68, 0.75, 0.62,
      0.7, 0.73, 0.69, 0.71, 0.74, 0.66, 0.72, 0.68,
    ],
    transitions: {
      barTransition: "flash",
      dropTransitions: ["flash", "whip", "shake", "punch"],
      buildTransitions: ["whip", "shake", "punch", "cut"],
    },
    motions: { build: ["spiral", "whip", "scan"], drop: ["spiral", "whip", "impact"] },
    intensity: { build: 48, drop: 62 },
    velocity: { build: { rate: 1.08, curve: "punch" }, drop: { rate: 1.15, curve: "punch" } },
    style: "seinen_bw",
    colorGrade: { contrast: 20, exposure: -4, saturation: -12, grain: 18, bloom: 6 },
    particles: { type: "snow_ash", intensity: 52 },
    textTemplates: [
      { text: "LET GO", color: "#ffffff", accent: "#ef4444", y: 0.42, size: 58 },
      { text: "NOW", color: "#ffffff", accent: "#22d3ee", y: 0.58, size: 52 },
      { text: "BREAK", color: "#ffffff", accent: "#f97316", y: 0.5, size: 50 },
    ],
  },
  {
    id: "goldenMontage",
    label: "GOLDEN — Montage cálido",
    desc: "Mixto 1.4-3.2s + burst 0.9 · push/drift/scan · zoom sutil · golden",
    icon: "✨",
    targetDuration: 30,
    // mixto narrativo + burst (imitando LET GO mixto)
    pattern: [1.4, 2.85, 1.52, 3.2, 0.92, 2.62, 1.82, 0.72, 2.22, 1.12, 3.05, 1.38, 2.45, 0.88, 2.75, 1.25, 3.12, 0.95],
    transitions: {
      barTransition: "zoom",
      dropTransitions: ["zoom", "cut", "crossfade"],
      buildTransitions: ["cut", "zoom", "crossfade"],
    },
    motions: { build: ["push", "drift", "scan"], drop: ["push", "scan", "spiral"] },
    intensity: { build: 30, drop: 38 },
    velocity: { build: { rate: 0.95, curve: "linear" }, drop: { rate: 1.02, curve: "linear" } },
    style: "golden_sunset",
    colorGrade: { contrast: 10, exposure: 8, saturation: 12, temperature: 16, bloom: 18, grain: 10 },
    particles: { type: "light_leaks", intensity: 36 },
    textTemplates: [
      { text: "VAGABOND", color: "#fffbeb", accent: "#f59e0b", y: 0.56, size: 46 },
      { text: "STILL WE MOVE", color: "#ffffff", accent: "#d946ef", y: 0.44, size: 42 },
    ],
  },
];

export function getPreset(id: PresetId): EditPreset | undefined {
  return EDIT_PRESETS.find((p) => p.id === id);
}

export function applyPresetToProject(
  project: EditProject,
  preset: EditPreset,
  clipsSeed: EditTimelineClip[],
  bpm: number
): { clips: EditTimelineClip[]; textCues: EditTextCue[]; style: AestheticStyle; colorGrade: Partial<ColorGradeConfig>; particles: ParticleType; particleIntensity: number } {
  if (!clipsSeed.length) {
    return { clips: [], textCues: [], style: preset.style, colorGrade: preset.colorGrade, particles: preset.particles.type, particleIntensity: preset.particles.intensity };
  }
  const beat = 60 / Math.max(30, Math.min(240, bpm));
  const targetMin = 25;
  const targetMax = 35;
  // Generar durations hasta cubrir targetDuration (snap incluido)
  const rawDurations: number[] = [];
  let sum = 0;
  let pi = 0;
  const safety = 120;
  while (sum < preset.targetDuration && rawDurations.length < safety) {
    const base = preset.pattern[pi % preset.pattern.length]!;
    const snapped = snapEditTime(base, bpm, 2);
    rawDurations.push(snapped);
    sum += snapped;
    pi++;
    // si ya superamos targetMin y nos acercamos al max, podemos parar en bar
    if (sum >= targetMin && sum >= preset.targetDuration) break;
    if (sum > targetMax) break;
  }
  // Ajustar último clip para no exceder 35 ni quedar <25
  if (sum > targetMax && rawDurations.length > 1) {
    const excess = sum - targetMax;
    const lastIdx = rawDurations.length - 1;
    const adjusted = Math.max(beat * 0.5, rawDurations[lastIdx]! - excess);
    const snappedAdj = snapEditTime(adjusted, bpm, 2);
    sum = sum - rawDurations[lastIdx]! + snappedAdj;
    rawDurations[lastIdx] = snappedAdj;
    if (sum < targetMin) {
      // si quedó corto, empuja un poco
      rawDurations[lastIdx] = snapEditTime(rawDurations[lastIdx]! + (targetMin - sum), bpm, 2);
    }
  }
  // Si aún corto (<25), repetir patrón
  while (rawDurations.reduce((a, b) => a + b, 0) < targetMin && rawDurations.length < 80) {
    const base = preset.pattern[rawDurations.length % preset.pattern.length]!;
    rawDurations.push(snapEditTime(base, bpm, 2));
  }

  const isDropThreshold = Math.floor(rawDurations.length * 0.42);
  const clips: EditTimelineClip[] = rawDurations.map((duration, idx) => {
    const seed = clipsSeed[idx % clipsSeed.length]!;
    const isDrop = idx >= isDropThreshold;
    const isBar = idx !== 0 && idx % 4 === 0;
    let transition: EditTransition;
    if (idx === 0) transition = "cut";
    else if (isBar) transition = preset.transitions.barTransition;
    else if (isDrop) transition = preset.transitions.dropTransitions[idx % preset.transitions.dropTransitions.length]!;
    else transition = preset.transitions.buildTransitions[idx % preset.transitions.buildTransitions.length]!;

    const motions = isDrop ? preset.motions.drop : preset.motions.build;
    const motion = motions[idx % motions.length]!;
    const intensity = isDrop ? preset.intensity.drop : preset.intensity.build;
    const vel = isDrop ? preset.velocity.drop : preset.velocity.build;

    // sourceStart escalonado para vídeo (evita repetir mismo frame)
    let sourceStart = seed.sourceStart;
    if (seed.sourceDuration > duration * 0.6) {
      const span = Math.max(0, seed.sourceDuration - duration);
      sourceStart = span > 0 ? (idx * 0.73) % span : seed.sourceStart;
    }

    return {
      id: `clip-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      assetId: seed.assetId,
      label: seed.label,
      duration,
      sourceStart,
      sourceDuration: Math.max(0.12, Math.min(seed.sourceDuration || duration, duration * 1.08)),
      transition,
      transitionDuration:
        transition === "crossfade"
          ? Math.min(0.34, duration * 0.32)
          : transition === "punch" || transition === "shake"
            ? Math.min(0.18, duration * 0.26)
            : Math.min(0.15, duration * 0.22),
      motion,
      motionIntensity: intensity,
      playbackRate: vel.rate,
      velocityCurve: vel.curve,
      style: "inherit" as const,
    };
  });

  // Text cues espaciados 8-10s, duración 0.9s (punch window 0.14s en drawEditTextCue hace el efecto)
  const total = clips.reduce((a, c) => a + c.duration, 0);
  const textCues: EditTextCue[] = preset.textTemplates.slice(0, Math.min(3, preset.textTemplates.length)).map((tpl, idx) => {
    const slot = total / (preset.textTemplates.length + 1);
    const start = slot * (idx + 1) - 0.45; // centra el punch
    return {
      id: `text-${Date.now().toString(36)}-${idx}`,
      text: tpl.text,
      start: Math.max(0, Math.min(total - 0.9, start)),
      duration: 0.9,
      x: 0.5,
      y: tpl.y,
      size: tpl.size,
      color: tpl.color,
      accent: tpl.accent,
    };
  });

  return {
    clips,
    textCues,
    style: preset.style,
    colorGrade: preset.colorGrade,
    particles: preset.particles.type,
    particleIntensity: preset.particles.intensity,
  };
}
