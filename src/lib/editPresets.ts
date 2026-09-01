import type { AestheticStyle, ColorGradeConfig, ParticleType } from "./mangaMotionEngine";
import type { EditAssistProfile } from "./editAssistPlanner";
import type { EditMotion, EditProject, EditTextCue, EditTextStyle, EditTimelineClip, EditTransition, EditVelocityCurve } from "./editStudio";
import { snapEditTime } from "./editStudio";

export type PresetId = "berserkImpact" | "vinlandEmotion" | "flashStorm" | "climberPulse" | "goldenMontage" | "hypnoticPortrait";

export interface PresetTextTemplate {
  text: string;
  accent: string;
  color: string;
  y: number;
  size: number;
  at: number;
  duration: number;
  style: EditTextStyle;
  emphasis: string;
}

export interface EditPreset {
  id: PresetId;
  label: string;
  desc: string;
  icon: string;
  targetDuration: number;
  assetHint: string;
  pace: string;
  /** Punto relativo donde cambia el build por el drop. */
  dropAt: number;
  assistProfile: EditAssistProfile;
  /** Duraciones observadas en las referencias; se ajustan a medio beat. */
  pattern: number[];
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
    label: "Impacto progresivo",
    desc: "Presenta al personaje con planos largos y rompe a medio beat en el drop.",
    icon: "💥",
    targetDuration: 18,
    assetHint: "12–20 planos",
    pace: "Build → ½ beat",
    dropAt: 0.56,
    assistProfile: { assetRange: [12, 20], visualEnergy: 0.65, energyRise: 0.75, onsetDensity: 0.75 },
    pattern: [
      1.4, 1.57, 1.93, 1.33, 1.5, 1.13, 1.2,
      0.6, 0.7, 0.73, 0.67, 0.75, 0.72, 0.7, 0.77, 0.6, 0.7, 0.67,
    ],
    transitions: {
      barTransition: "flash",
      dropTransitions: ["cut", "punch", "blur", "cut", "shake"],
      buildTransitions: ["cut", "blur", "cut", "zoom"],
    },
    motions: { build: ["push", "pull", "drift"], drop: ["push", "impact", "pull"] },
    intensity: { build: 24, drop: 48 },
    velocity: { build: { rate: 0.88, curve: "easeIn" }, drop: { rate: 1.08, curve: "punch" } },
    style: "seinen_bw",
    colorGrade: { contrast: 12, exposure: -2, saturation: -4, temperature: -4, bloom: 6, grain: 9 },
    particles: { type: "snow_ash", intensity: 18 },
    textTemplates: [
      { text: "GODHANDS", color: "#ffffff", accent: "#d946ef", y: 0.62, size: 28, at: 0.12, duration: 1, style: "minimal", emphasis: "GOD" },
      { text: "APOSTLES", color: "#ffffff", accent: "#84cc16", y: 0.62, size: 28, at: 0.4, duration: 1, style: "minimal", emphasis: "APOSTLES" },
      { text: "HUMAN", color: "#ffffff", accent: "#fb7185", y: 0.62, size: 34, at: 0.7, duration: 1.1, style: "condensed", emphasis: "HUMAN" },
    ],
  },
  {
    id: "vinlandEmotion",
    label: "Emoción cinematográfica",
    desc: "Primera mitad narrativa; después alterna color, blur y cortes sobre cada pulso.",
    icon: "🌊",
    targetDuration: 18.3,
    assetHint: "10–18 planos",
    pace: "Historia → pulso",
    dropAt: 0.51,
    assistProfile: { assetRange: [10, 18], visualEnergy: 0.45, energyRise: 0.55, onsetDensity: 0.6 },
    pattern: [1.88, 1.59, 2.05, 1.33, 2.42, 0.51, 0.57, 0.57, 0.58, 0.57, 0.55, 0.6, 0.55, 0.51, 0.57, 0.57, 0.58, 0.57, 0.55, 0.6, 0.6],
    transitions: {
      barTransition: "blur",
      dropTransitions: ["cut", "blur", "zoom", "cut"],
      buildTransitions: ["crossfade", "cut", "blur"],
    },
    motions: { build: ["push", "pull", "drift"], drop: ["push", "pull", "scan"] },
    intensity: { build: 20, drop: 28 },
    velocity: { build: { rate: 0.86, curve: "easeOut" }, drop: { rate: 1, curve: "punch" } },
    style: "original",
    colorGrade: { contrast: 6, exposure: 2, saturation: -4, temperature: 4, bloom: 8, grain: 5 },
    particles: { type: "cinematic_dust", intensity: 18 },
    textTemplates: [
      { text: "THE BEST MC", color: "#ffffff", accent: "#fbbf24", y: 0.74, size: 30, at: 0.83, duration: 1.25, style: "minimal", emphasis: "MC" },
    ],
  },
  {
    id: "flashStorm",
    label: "Collage gráfico",
    desc: "Composición con respiración, ráfagas cortas, zoom y tipografía por palabras.",
    icon: "🧩",
    targetDuration: 13,
    assetHint: "6–10 planos",
    pace: "Mixto · gráfico",
    dropAt: 0.33,
    assistProfile: { assetRange: [6, 10], visualEnergy: 0.6, energyRise: 0.45, onsetDensity: 0.55 },
    pattern: [1.27, 3.03, 0.3, 1, 0.82, 2.18, 2.6, 1.83],
    transitions: {
      barTransition: "flash",
      dropTransitions: ["zoom", "blur", "cut", "whip", "cut"],
      buildTransitions: ["crossfade", "zoom", "cut"],
    },
    motions: { build: ["push", "drift"], drop: ["scan", "whip", "pull"] },
    intensity: { build: 26, drop: 42 },
    velocity: { build: { rate: 0.94, curve: "easeIn" }, drop: { rate: 1.08, curve: "punch" } },
    style: "dark_fantasy",
    colorGrade: { contrast: 10, exposure: 2, saturation: 4, temperature: 2, bloom: 13, grain: 6 },
    particles: { type: "light_leaks", intensity: 18 },
    textTemplates: [
      { text: "CAUSE I'M | PROUD OF YOU", color: "#ffffff", accent: "#ef4444", y: 0.58, size: 38, at: 0.5, duration: 1.4, style: "condensed", emphasis: "PROUD" },
      { text: "PROUD OF | YOU", color: "#ffffff", accent: "#d946ef", y: 0.5, size: 46, at: 0.76, duration: 1.3, style: "editorial", emphasis: "YOU" },
    ],
  },
  {
    id: "climberPulse",
    label: "Pulso ascendente",
    desc: "Respira al principio, acelera en una ráfaga y sostiene un pulso preciso hasta el cierre.",
    icon: "↗",
    targetDuration: 26.8,
    assetHint: "8–18 planos o vídeos largos",
    pace: "Pulso → ráfaga → ascenso",
    dropAt: 0.34,
    assistProfile: { assetRange: [8, 18], visualEnergy: 0.52, energyRise: 0.72, onsetDensity: 0.68 },
    pattern: [
      0.56, 0.58, 0.62, 0.55, 0.51, 0.62, 0.57, 0.29, 0.28, 0.26, 0.3, 0.17, 0.28,
      1.17, 0.58, 0.55, 0.57, 0.54, 0.59, 0.56, 0.53, 0.58, 0.54, 0.57, 0.55, 0.6,
      0.54, 0.56, 0.28, 0.28, 0.55, 0.57, 0.54, 0.59, 0.55, 0.58, 0.54, 0.56, 0.58,
      0.55, 0.57, 0.54, 0.6, 0.56, 0.54, 0.58, 0.55,
    ],
    transitions: {
      barTransition: "depth",
      dropTransitions: ["cut", "panel", "punch", "cut", "ink", "depth"],
      buildTransitions: ["cut", "blur", "crossfade", "panel"],
    },
    motions: {
      build: ["parallax", "push", "parallaxDrift"],
      drop: ["parallaxDrift", "push", "impact", "parallax"],
    },
    intensity: { build: 24, drop: 46 },
    velocity: { build: { rate: 0.9, curve: "easeIn" }, drop: { rate: 1.04, curve: "punch" } },
    style: "seinen_bw",
    colorGrade: { contrast: 14, exposure: -3, saturation: -8, temperature: -2, bloom: 7, grain: 11 },
    particles: { type: "cinematic_dust", intensity: 16 },
    textTemplates: [],
  },
  {
    id: "goldenMontage",
    label: "Tráiler lírico",
    desc: "Intro contenida con frases; el segundo acto entra en rojo, blur y golpes selectivos.",
    icon: "🎞️",
    targetDuration: 30,
    assetHint: "12–24 planos",
    pace: "Intro → clímax",
    dropAt: 0.53,
    assistProfile: { assetRange: [12, 24], visualEnergy: 0.55, energyRise: 0.85, onsetDensity: 0.5 },
    pattern: [3.88, 4.2, 4.17, 2.05, 1.83, 0.29, 1.51, 1.59, 0.53, 0.27, 0.27, 2.11, 1.82, 0.28, 1.54, 1.56, 0.5, 0.24, 0.26, 0.62],
    transitions: {
      barTransition: "blur",
      dropTransitions: ["blur", "cut", "zoom", "punch", "flash", "cut"],
      buildTransitions: ["crossfade", "cut", "blur"],
    },
    motions: { build: ["push", "pull", "drift"], drop: ["push", "impact", "scan", "pull"] },
    intensity: { build: 20, drop: 40 },
    velocity: { build: { rate: 0.82, curve: "easeIn" }, drop: { rate: 1.06, curve: "punch" } },
    style: "dark_fantasy",
    colorGrade: { contrast: 16, exposure: -6, saturation: -10, temperature: -4, tint: 6, bloom: 10, grain: 14 },
    particles: { type: "dark_ink_fog", intensity: 20 },
    textTemplates: [
      { text: "I DON'T CARE ABOUT | PAIN ANYMORE", color: "#ffffff", accent: "#ef4444", y: 0.48, size: 27, at: 0.05, duration: 2.5, style: "condensed", emphasis: "PAIN" },
      { text: "LET GO", color: "#ffffff", accent: "#ef4444", y: 0.5, size: 62, at: 0.4, duration: 1.25, style: "editorial", emphasis: "GO" },
      { text: "LET GO", color: "#ffffff", accent: "#fb7185", y: 0.5, size: 70, at: 0.54, duration: 1.35, style: "editorial", emphasis: "GO" },
    ],
  },
  {
    id: "hypnoticPortrait",
    label: "Retrato hipnótico",
    desc: "Cuatro planos largos, push/pull lento y cambios de foco sin saturar de efectos.",
    icon: "👁️",
    targetDuration: 9.8,
    assetHint: "4–8 planos",
    pace: "Lento · magnético",
    dropAt: 0.5,
    assistProfile: { assetRange: [4, 8], visualEnergy: 0.25, energyRise: 0.2, onsetDensity: 0.25 },
    pattern: [2.13, 2.7, 2.44, 2.55],
    transitions: {
      barTransition: "blur",
      dropTransitions: ["blur", "cut", "crossfade"],
      buildTransitions: ["cut", "blur", "crossfade"],
    },
    motions: { build: ["push", "pull"], drop: ["vertigo", "pull"] },
    intensity: { build: 18, drop: 22 },
    velocity: { build: { rate: 0.78, curve: "easeOut" }, drop: { rate: 0.84, curve: "easeOut" } },
    style: "original",
    colorGrade: { contrast: 10, exposure: -1, saturation: 12, temperature: 8, bloom: 8, grain: 5 },
    particles: { type: "none", intensity: 10 },
    textTemplates: [
      { text: "HELP YOURSELF", color: "#ffffff", accent: "#ef4444", y: 0.76, size: 26, at: 0.83, duration: 1, style: "minimal", emphasis: "" },
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
    return { clips: [], textCues: project.textCues, style: preset.style, colorGrade: preset.colorGrade, particles: preset.particles.type, particleIntensity: preset.particles.intensity };
  }
  const beat = 60 / Math.max(30, Math.min(240, bpm));
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
  }

  // El último plano absorbe solo el redondeo de la rejilla; no alarga todos los
  // estilos hasta 30 s, porque las referencias cubren de 9.8 a 30 s.
  if (rawDurations.length > 0) {
    const lastIdx = rawDurations.length - 1;
    const desired = rawDurations[lastIdx]! - (sum - preset.targetDuration);
    if (desired > 0) {
      const adjusted = snapEditTime(desired, bpm, 2);
      const adjustedTotal = sum - rawDurations[lastIdx]! + adjusted;
      if (Math.abs(adjustedTotal - preset.targetDuration) <= Math.abs(sum - preset.targetDuration)) {
        rawDurations[lastIdx] = adjusted;
        sum = adjustedTotal;
      }
    }
  }

  const clipStarts: number[] = [];
  let cursor = 0;
  for (const duration of rawDurations) {
    clipStarts.push(cursor);
    cursor += duration;
  }
  const totalDuration = cursor;
  const detectedDropIndex = clipStarts.findIndex((start) => start >= totalDuration * preset.dropAt);
  const dropStartIndex = detectedDropIndex >= 0
    ? Math.max(1, detectedDropIndex)
    : rawDurations.length;
  const clips: EditTimelineClip[] = rawDurations.map((duration, idx) => {
    const seed = clipsSeed[idx % clipsSeed.length]!;
    const start = clipStarts[idx]!;
    const isDrop = idx >= dropStartIndex;
    const beatPosition = start / beat;
    const nearestBeat = Math.round(beatPosition);
    const isBar = idx !== 0
      && Math.abs(beatPosition - nearestBeat) < 0.06
      && nearestBeat % 4 === 0;
    const phaseIndex = isDrop ? idx - dropStartIndex : idx;
    let transition: EditTransition;
    if (idx === 0) transition = "cut";
    else if (isBar) transition = preset.transitions.barTransition;
    else if (isDrop) transition = preset.transitions.dropTransitions[phaseIndex % preset.transitions.dropTransitions.length]!;
    else transition = preset.transitions.buildTransitions[phaseIndex % preset.transitions.buildTransitions.length]!;

    const motions = isDrop ? preset.motions.drop : preset.motions.build;
    const motion = motions[phaseIndex % motions.length]!;
    const intensity = isDrop ? preset.intensity.drop : preset.intensity.build;
    const vel = isDrop ? preset.velocity.drop : preset.velocity.build;

    const availableDuration = Math.max(0.12, seed.sourceDuration || duration * vel.rate);
    const sourceDuration = Math.max(0.12, Math.min(availableDuration, duration * vel.rate));
    const offsetSpan = Math.max(0, availableDuration - sourceDuration);
    const sourceStart = seed.sourceStart + (offsetSpan > 0 ? (idx * 0.73) % offsetSpan : 0);
    const transitionDuration = transition === "cut"
      ? 0
      : transition === "crossfade"
        ? Math.min(0.32, duration * 0.3)
        : transition === "blur"
          ? Math.min(0.22, duration * 0.28)
          : transition === "zoom"
            ? Math.min(0.18, duration * 0.24)
            : transition === "punch" || transition === "shake"
              ? Math.min(0.14, duration * 0.22)
              : Math.min(0.12, duration * 0.2);

    return {
      id: `clip-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      assetId: seed.assetId,
      label: seed.label,
      duration,
      sourceStart,
      sourceDuration,
      transition,
      transitionDuration,
      transitionIntensity: isDrop ? 68 : 46,
      transitionDirection: "auto",
      motion,
      motionIntensity: intensity,
      playbackRate: vel.rate,
      velocityCurve: vel.curve,
      framingX: 0,
      framingY: 0,
      framingScale: motion === "impact" || motion === "whip" ? 1.07 : 1.03,
      style: "inherit" as const,
    };
  });

  const total = clips.reduce((a, c) => a + c.duration, 0);
  // Los presets gobiernan ritmo y look, nunca escriben palabras que el usuario
  // no haya proporcionado. Los templates quedan como referencia opcional para
  // una futura acción explícita, no para la automatización.
  const textCues: EditTextCue[] = project.textCues
    .filter((cue) => cue.start <= total - 0.2)
    .map((cue) => ({ ...cue, duration: Math.max(0.2, Math.min(cue.duration, total - cue.start)) }));

  return {
    clips,
    textCues,
    style: preset.style,
    colorGrade: preset.colorGrade,
    particles: preset.particles.type,
    particleIntensity: preset.particles.intensity,
  };
}
