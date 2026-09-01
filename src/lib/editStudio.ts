import type {
  AestheticStyle,
  ColorGradeConfig,
  ParticleControlOptions,
  ParticleType,
} from "./mangaMotionEngine";
import type { WatermarkStyleOptions } from "./watermark";

export type EditFormat = "9:16" | "16:9";
export type EditTransition = "cut" | "crossfade" | "flash" | "whip" | "punch" | "zoom" | "shake" | "blur" | "depth" | "ink" | "panel";
export type EditTransitionDirection = "auto" | "left" | "right" | "up" | "down";
export type EditMotion = "static" | "push" | "pull" | "drift" | "impact" | "whip" | "vertigo" | "spiral" | "scan" | "parallax" | "parallaxDrift";
export type EditVelocityCurve = "linear" | "easeIn" | "easeOut" | "punch";
export type EditRhythmPreset = "reference" | "build-drop" | "steady";
export type EditTextStyle = "impact" | "condensed" | "editorial" | "minimal";

export interface EditAssetMeta {
  id: string;
  name: string;
  kind: "video" | "image";
  duration: number;
  width: number;
  height: number;
}

export interface EditTimelineClip {
  id: string;
  assetId: string;
  label: string;
  duration: number;
  sourceStart: number;
  sourceDuration: number;
  transition: EditTransition;
  transitionDuration: number;
  transitionIntensity: number;
  transitionDirection: EditTransitionDirection;
  motion: EditMotion;
  motionIntensity: number;
  playbackRate: number;
  velocityCurve: EditVelocityCurve;
  /** Punto de interés dentro del encuadre: -100 izquierda/arriba, 100 derecha/abajo. */
  framingX: number;
  framingY: number;
  framingScale: number;
  style: AestheticStyle | "inherit";
}

export interface EditTextCue {
  id: string;
  text: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  size: number;
  color: string;
  accent: string;
  style: EditTextStyle;
  /** Palabra o frase que se pinta con `accent`; vacío conserva un solo color. */
  emphasis: string;
}

export interface EditProject {
  version: 1;
  name: string;
  format: EditFormat;
  fps: 30 | 60;
  bpm: number;
  clips: EditTimelineClip[];
  textCues: EditTextCue[];
  style: AestheticStyle;
  colorGrade: ColorGradeConfig;
  particles: ParticleType;
  particleIntensity: number;
  particleSpeed: number;
  particleControls: ParticleControlOptions;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkOpacity: number;
  watermarkStyle: WatermarkStyleOptions;
  musicStart: number;
  musicVolume: number;
}

export interface TimelinePlacement {
  clip: EditTimelineClip;
  index: number;
  start: number;
  end: number;
  localTime: number;
}

export const EDIT_REFERENCE_PATTERN = [
  1.4, 1.57, 1.93, 1.33, 1.5, 1.13, 1.2,
  0.6, 0.7, 0.73, 0.67, 0.75, 0.72, 0.7, 0.77,
];

export function createDefaultEditProject(): EditProject {
  return {
    version: 1,
    name: "Edit manga 01",
    format: "9:16",
    fps: 60,
    bpm: 128,
    clips: [],
    textCues: [],
    style: "original",
    colorGrade: {
      exposure: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
      fade: 0,
      bloom: 0,
      grain: 0,
    },
    particles: "none",
    particleIntensity: 45,
    particleSpeed: 1,
    particleControls: {
      size: 100,
      opacity: 72,
      wind: 0,
      turbulence: 36,
      color: "",
      blendMode: "screen",
      blur: 0,
      seed: 1337,
      loopDuration: 12,
    },
    watermarkEnabled: true,
    watermarkText: "SILENT VIGIL",
    watermarkOpacity: 0.22,
    watermarkStyle: {
      position: "bottom-center",
      scale: 0.8,
      tracking: 1.08,
      color: "#ffffff",
      ruleScale: 0.72,
      offsetX: 0,
      offsetY: 0,
    },
    musicStart: 0,
    musicVolume: 0.92,
  };
}

export function editTimelineDuration(clips: EditTimelineClip[]): number {
  return clips.reduce((total, clip) => total + Math.max(1 / 60, clip.duration), 0);
}

export function editTimelinePlacements(clips: EditTimelineClip[]): TimelinePlacement[] {
  let cursor = 0;
  return clips.map((clip, index) => {
    const start = cursor;
    cursor += Math.max(1 / 60, clip.duration);
    return { clip, index, start, end: cursor, localTime: 0 };
  });
}

export function editClipAtTime(clips: EditTimelineClip[], time: number): TimelinePlacement | null {
  const placements = editTimelinePlacements(clips);
  if (!placements.length) return null;
  const duration = placements[placements.length - 1]!.end;
  const safeTime = Math.max(0, Math.min(Math.max(0, duration - 1e-6), time));
  const placement = placements.find((entry) => safeTime >= entry.start && safeTime < entry.end)
    ?? placements[placements.length - 1]!;
  return { ...placement, localTime: safeTime - placement.start };
}

export function snapEditTime(time: number, bpm: number, division = 2): number {
  const beat = 60 / Math.max(30, Math.min(240, bpm));
  const grid = beat / Math.max(1, division);
  return Math.max(grid, Math.round(time / grid) * grid);
}

export function buildBeatMarkers(duration: number, bpm: number, division = 1): number[] {
  const step = 60 / Math.max(30, Math.min(240, bpm)) / Math.max(1, division);
  const markers: number[] = [];
  for (let time = 0; time <= duration + 1e-6; time += step) markers.push(time);
  return markers;
}

export function normalizeEditClip(clip: EditTimelineClip): EditTimelineClip {
  const transitionDirections: EditTransitionDirection[] = ["auto", "left", "right", "up", "down"];
  return {
    ...clip,
    transitionIntensity: Math.max(0, Math.min(100, clip.transitionIntensity ?? 55)),
    transitionDirection: transitionDirections.includes(clip.transitionDirection) ? clip.transitionDirection : "auto",
    motionIntensity: Math.max(0, Math.min(100, clip.motionIntensity ?? (clip.motion === "impact" ? 55 : clip.motion === "static" ? 0 : 32))),
    playbackRate: Math.max(0.5, Math.min(2, clip.playbackRate ?? 1)),
    velocityCurve: (clip.velocityCurve as EditVelocityCurve) ?? "linear",
    framingX: Math.max(-100, Math.min(100, clip.framingX ?? 0)),
    framingY: Math.max(-100, Math.min(100, clip.framingY ?? 0)),
    framingScale: Math.max(1, Math.min(1.4, clip.framingScale ?? 1)),
  };
}

export function normalizeEditTextCue(cue: EditTextCue): EditTextCue {
  const styles: EditTextStyle[] = ["impact", "condensed", "editorial", "minimal"];
  return {
    ...cue,
    start: Math.max(0, Number.isFinite(cue.start) ? cue.start : 0),
    duration: Math.max(0.2, Number.isFinite(cue.duration) ? cue.duration : 0.9),
    x: Math.max(0.08, Math.min(0.92, Number.isFinite(cue.x) ? cue.x : 0.5)),
    y: Math.max(0.08, Math.min(0.9, Number.isFinite(cue.y) ? cue.y : 0.5)),
    size: Math.max(18, Math.min(96, Number.isFinite(cue.size) ? cue.size : 48)),
    style: styles.includes(cue.style) ? cue.style : "impact",
    emphasis: typeof cue.emphasis === "string" ? cue.emphasis : "",
  };
}

export function applyVelocityCurve(progress: number, curve: EditVelocityCurve, rate: number): number {
  const p = Math.max(0, Math.min(1, progress));
  // La curva reparte el recorrido; la velocidad media se aplica en
  // `editSourceTimeAt` para que 0.5× y 2× sean multiplicadores reales.
  void rate;
  if (curve === "easeIn") return Math.pow(p, 1.8);
  if (curve === "easeOut") return 1 - Math.pow(1 - p, 1.8);
  if (curve === "punch") {
    // fast in, settle — típico punch de edit
    if (p < 0.45) return (p / 0.45) * 0.72;
    return 0.72 + ((p - 0.45) / 0.55) * 0.28;
  }
  return p;
}

export function editSourceTimeAt(clip: EditTimelineClip, localTime: number): number {
  const c = normalizeEditClip(clip);
  const normalized = Math.max(0, Math.min(1, localTime / Math.max(0.001, c.duration)));
  const warped = applyVelocityCurve(normalized, c.velocityCurve, c.playbackRate);
  const requestedSpan = Math.max(0.001, c.duration * c.playbackRate);
  const sourceSpan = Math.min(Math.max(0.001, c.sourceDuration), requestedSpan);
  return c.sourceStart + warped * sourceSpan;
}

export function applyEditRhythmPreset(
  clips: EditTimelineClip[],
  preset: EditRhythmPreset,
  bpm: number
): EditTimelineClip[] {
  const beat = 60 / Math.max(30, Math.min(240, bpm));
  return clips.map((clip, index) => {
    let duration: number;
    if (preset === "reference") {
      duration = EDIT_REFERENCE_PATTERN[index % EDIT_REFERENCE_PATTERN.length]!;
    } else if (preset === "build-drop") {
      duration = index < Math.min(5, Math.ceil(clips.length * 0.4))
        ? beat * (index % 3 === 2 ? 3 : 4)
        : beat * (index % 4 === 3 ? 2 : 1);
    } else {
      duration = beat * 2;
    }
    const snapped = snapEditTime(duration, bpm, 2);
    const isDrop = index >= Math.min(5, Math.ceil(clips.length * 0.4));
    let transition: EditTransition = "cut";
    if (index === 0) transition = "cut";
    else if (preset === "steady") transition = "crossfade";
    else if (index % 5 === 0) transition = "flash";
    else if (isDrop && index % 3 === 1) transition = "punch";
    else if (isDrop && index % 4 === 2) transition = "shake";
    else if (index % 4 === 0) transition = "zoom";
    const motion: EditMotion = isDrop
      ? (index % 3 === 0 ? "impact" : index % 3 === 1 ? "whip" : "push")
      : (index % 2 === 0 ? "push" : "drift");
    const playbackRate = preset === "reference"
      ? (index < 7 ? 0.88 : 1.05)
      : isDrop ? 1.12 : 0.92;
    return {
      ...clip,
      duration: snapped,
      sourceDuration: clip.sourceDuration > 0 ? Math.min(clip.sourceDuration, snapped * playbackRate) : snapped * playbackRate,
      transition,
      transitionDuration: preset === "steady"
        ? Math.min(0.35, snapped * 0.3)
        : transition === "punch" || transition === "shake"
          ? Math.min(0.18, snapped * 0.25)
          : Math.min(0.14, snapped * 0.2),
      transitionIntensity: isDrop ? 68 : 46,
      transitionDirection: "auto",
      motion,
      motionIntensity: isDrop ? 52 : 28,
      playbackRate,
      velocityCurve: isDrop ? "punch" : "easeIn",
    };
  });
}

export function editOutputSize(format: EditFormat): { width: number; height: number } {
  return format === "9:16"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}
