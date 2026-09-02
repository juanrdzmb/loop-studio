"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SfxLoopTimeline from "@/components/SfxLoopTimeline";
import {
  DEFAULT_PARTICLE_CONTROLS,
  PhysicsParticleSystem,
  renderMangaMotionFrame,
  type AestheticStyle,
  type ColorGradeConfig,
  type ParticleType,
} from "@/lib/mangaMotionEngine";
import {
  applyEditProfessionalGrammar,
  applyEditRhythmPreset,
  buildBeatMarkers,
  createDefaultEditProject,
  editClipAtTime,
  editOutputSize,
  editSourceTimeAt,
  editTimelineDuration,
  editTimelinePlacements,
  normalizeEditClip,
  normalizeEditTextCue,
  snapEditTime,
  type EditAssetMeta,
  type EditProject,
  type EditProfessionalGrammar,
  type EditRhythmPreset,
  type EditTimelineClip,
} from "@/lib/editStudio";
import {
  buildEditFrameConfig,
  composeEditTransition,
  drawEditTextCue,
} from "@/lib/editStudioRender";
import {
  buildClipFrameCache,
  clipFrameAt,
  disposeClipFrameCache,
  type ClipFrameCache,
} from "@/lib/clipFrameCache";
import { transcodeVideoForBrowser } from "@/lib/companion";
import {
  drawProfessionalWatermark,
  ensureWatermarkFont,
} from "@/lib/watermark";
import {
  preloadCuratedSfx,
  type LoopSfxCue,
} from "@/lib/seinenSfxLibrary";
import { estimateBpmFromBuffer, getTimelineWaveformPeaks } from "@/lib/editAudioAnalysis";
import {
  analyzeEditAssets,
  analyzeEditAudio,
  type EditAssistAssetSource,
} from "@/lib/editAssistAnalysis";
import {
  assignEditAssistMedia,
  rankEditAssistPresets,
  suggestEditAssistSfx,
  type EditAssetAnalysis,
  type EditAssistDraft,
  type EditAssistPresetCandidate,
  type EditAssistRanking,
  type EditAudioStructure,
} from "@/lib/editAssistPlanner";
import { EDIT_PRESETS, applyPresetToProject, type EditPreset, type PresetId } from "@/lib/editPresets";
import {
  buildFallbackEditAssetManifest,
  matchEditAssetManifest,
  type EditAssetManifest,
} from "@/lib/editProjectAssets";

interface RuntimeEditAsset extends EditAssetMeta {
  file: File;
  url: string;
  image: HTMLImageElement | null;
  cache: ClipFrameCache | null;
}

interface EditProjectDocument extends EditProject {
  assets?: EditAssetManifest[];
  sfxCues?: LoopSfxCue[];
  audio?: { name: string; size: number; lastModified: number } | null;
}

type EditInspectorTab = "montage" | "media" | "clip" | "finish";

const EDIT_INSPECTOR_TABS: Array<{
  id: EditInspectorTab;
  step: string;
  label: string;
  activeClassName: string;
  idleClassName: string;
  markerClassName: string;
}> = [
  {
    id: "media",
    step: "01",
    label: "Medios",
    activeClassName: "border-sky-400/55 bg-sky-400/12 text-sky-100 shadow-[inset_0_-2px_0_rgba(56,189,248,0.95)]",
    idleClassName: "border-transparent text-zinc-500 hover:border-sky-900/70 hover:bg-sky-950/25 hover:text-sky-200",
    markerClassName: "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.65)]",
  },
  {
    id: "montage",
    step: "02",
    label: "Montaje",
    activeClassName: "border-amber-300/55 bg-amber-300/10 text-amber-100 shadow-[inset_0_-2px_0_rgba(252,211,77,0.95)]",
    idleClassName: "border-transparent text-zinc-500 hover:border-amber-900/70 hover:bg-amber-950/20 hover:text-amber-200",
    markerClassName: "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.6)]",
  },
  {
    id: "clip",
    step: "03",
    label: "Toma",
    activeClassName: "border-fuchsia-400/55 bg-fuchsia-400/10 text-fuchsia-100 shadow-[inset_0_-2px_0_rgba(232,121,249,0.95)]",
    idleClassName: "border-transparent text-zinc-500 hover:border-fuchsia-900/70 hover:bg-fuchsia-950/25 hover:text-fuchsia-200",
    markerClassName: "bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.6)]",
  },
  {
    id: "finish",
    step: "04",
    label: "Acabado",
    activeClassName: "border-emerald-400/55 bg-emerald-400/10 text-emerald-100 shadow-[inset_0_-2px_0_rgba(52,211,153,0.95)]",
    idleClassName: "border-transparent text-zinc-500 hover:border-emerald-900/70 hover:bg-emerald-950/20 hover:text-emerald-200",
    markerClassName: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]",
  },
];

const PROJECT_STORAGE_KEY = "loop-studio:edit-project:v1";
const ASSET_MANIFEST_STORAGE_KEY = "loop-studio:edit-assets:v1";
const SFX_STORAGE_KEY = "loop-studio:edit-sfx:v1";

const EDIT_STYLES: Array<{ id: AestheticStyle; label: string }> = [
  { id: "original", label: "Original limpio" },
  { id: "seinen_bw", label: "Seinen B&W" },
  { id: "dark_fantasy", label: "Dark fantasy" },
  { id: "retro_90s", label: "Anime 90s" },
  { id: "golden_sunset", label: "Golden hour" },
  { id: "cyberpunk_neon", label: "Neón magenta" },
  { id: "vintage_sepia", label: "Sepia manga" },
];

const EDIT_PARTICLES: Array<{ id: ParticleType; label: string }> = [
  { id: "none", label: "Sin partículas" },
  { id: "cinematic_dust", label: "Polvo de lente" },
  { id: "snow_ash", label: "Nieve y ceniza" },
  { id: "cinematic_rain", label: "Lluvia cinematográfica" },
  { id: "light_leaks", label: "Fugas de luz" },
  { id: "embers_fire", label: "Brasas" },
  { id: "golden_sparks", label: "Chispas doradas" },
  { id: "dark_ink_fog", label: "Niebla de tinta" },
];

const EDIT_TRANSITIONS: Array<{ id: EditTimelineClip["transition"]; label: string; desc: string }> = [
  { id: "cut", label: "✂ Corte seco", desc: "Al beat" },
  { id: "punch", label: "💥 Punch", desc: "Zoom + temblor" },
  { id: "shake", label: "🫨 Shake", desc: "Vibración golpe" },
  { id: "zoom", label: "🔍 Zoom", desc: "Entrada con zoom" },
  { id: "flash", label: "⚡ Flash", desc: "Destello blanco" },
  { id: "whip", label: "💨 Whip", desc: "Barrido lateral" },
  { id: "blur", label: "◌ Blur", desc: "Cambio de foco" },
  { id: "crossfade", label: "🌫 Fundido", desc: "Suave" },
  { id: "depth", label: "◫ Profundidad", desc: "Capas 2.5D" },
  { id: "ink", label: "● Tinta", desc: "Revelado manga" },
  { id: "panel", label: "▥ Viñetas", desc: "Paneles escalonados" },
];

const EDIT_MOTIONS: Array<{ id: EditTimelineClip["motion"]; label: string }> = [
  { id: "static", label: "Fijo" },
  { id: "push", label: "Acercar" },
  { id: "pull", label: "Alejar" },
  { id: "drift", label: "Deriva" },
  { id: "whip", label: "Whip pan" },
  { id: "vertigo", label: "Vertigo zoom" },
  { id: "spiral", label: "Espiral" },
  { id: "scan", label: "Scan" },
  { id: "impact", label: "Impacto" },
  { id: "parallax", label: "Parallax 2.5D" },
  { id: "parallaxDrift", label: "Profundidad + deriva" },
];

const EDIT_PROFESSIONAL_GRAMMARS: Array<{
  id: EditProfessionalGrammar;
  label: string;
  desc: string;
  accent: string;
}> = [
  {
    id: "cinematic",
    label: "Cine limpio",
    desc: "Movimiento suave y un efecto de enlace solo al cambiar de frase.",
    accent: "Fundido · blur · profundidad",
  },
  {
    id: "rhythmic",
    label: "Impacto rítmico",
    desc: "Cortes al pulso con punch, whip o flash reservados para acentos.",
    accent: "Punch · whip · flash",
  },
  {
    id: "manga",
    label: "Manga 2.5D",
    desc: "Parallax contenido con tinta, viñetas y profundidad dosificados.",
    accent: "Tinta · viñetas · 2.5D",
  },
];

interface EditFinishRecipe {
  id: "clean" | "ink" | "crimson";
  label: string;
  desc: string;
  style: AestheticStyle;
  colorGrade: Partial<ColorGradeConfig>;
  particles: ParticleType;
  particleIntensity: number;
  particleControls: Partial<EditProject["particleControls"]>;
}

const EDIT_FINISH_RECIPES: EditFinishRecipe[] = [
  {
    id: "clean",
    label: "Cine limpio",
    desc: "Contraste natural, bloom corto y polvo apenas visible.",
    style: "original",
    colorGrade: { exposure: 1, contrast: 8, saturation: -4, temperature: 2, tint: 0, fade: 2, bloom: 5, grain: 6 },
    particles: "cinematic_dust",
    particleIntensity: 14,
    particleControls: { size: 92, opacity: 34, wind: 2, turbulence: 22, color: "#f4f4f5", blendMode: "screen", blur: 1 },
  },
  {
    id: "ink",
    label: "Tinta editorial",
    desc: "Blanco y negro con textura de papel y ceniza contenida.",
    style: "seinen_bw",
    colorGrade: { exposure: -2, contrast: 16, saturation: -12, temperature: -3, tint: 0, fade: 4, bloom: 4, grain: 13 },
    particles: "snow_ash",
    particleIntensity: 16,
    particleControls: { size: 78, opacity: 38, wind: -4, turbulence: 30, color: "#e4e4e7", blendMode: "screen", blur: 0 },
  },
  {
    id: "crimson",
    label: "Rojo de impacto",
    desc: "Negros densos, acento carmesí y fugas de luz discretas.",
    style: "dark_fantasy",
    colorGrade: { exposure: -5, contrast: 18, saturation: -8, temperature: -5, tint: 10, fade: 0, bloom: 11, grain: 10 },
    particles: "light_leaks",
    particleIntensity: 14,
    particleControls: { size: 108, opacity: 28, wind: 5, turbulence: 24, color: "#ef4444", blendMode: "screen", blur: 4 },
  },
];

const EDIT_COLOR_CONTROLS: Array<{
  key: "exposure" | "contrast" | "saturation" | "temperature" | "tint" | "fade" | "bloom" | "grain";
  label: string;
}> = [
  { key: "exposure", label: "Exposición" },
  { key: "contrast", label: "Contraste" },
  { key: "saturation", label: "Saturación" },
  { key: "temperature", label: "Temperatura" },
  { key: "tint", label: "Matiz verde / magenta" },
  { key: "fade", label: "Negros lavados" },
  { key: "bloom", label: "Resplandor" },
  { key: "grain", label: "Grano de película" },
];

const EDIT_STUDIO_READABILITY_CSS = `
  [data-edit-studio-root] {
    color: #f4f4f5;
    font-family: var(--font-app-sans);
    font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
    letter-spacing: -0.008em;
  }
  [data-edit-studio-root] .font-mono {
    font-family: var(--font-app-mono);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  [data-edit-studio-root] [class~="text-[7px]"],
  [data-edit-studio-root] [class~="text-[8px]"] {
    font-size: 0.8125rem;
    line-height: 1.125rem;
  }
  [data-edit-studio-root] [class~="text-[9px]"],
  [data-edit-studio-root] [class~="text-[10px]"],
  [data-edit-studio-root] [class~="text-[11px]"] {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
  [data-edit-studio-root] [class~="text-xs"] {
    font-size: 0.9375rem;
    line-height: 1.3rem;
  }
  [data-edit-studio-root] [class~="text-sm"] {
    font-size: 1rem;
    line-height: 1.45rem;
  }
  [data-edit-studio-root] [class~="text-zinc-500"],
  [data-edit-studio-root] [class~="text-zinc-600"] {
    color: #a1a1aa;
  }
  [data-edit-studio-root] select,
  [data-edit-studio-root] input:not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="file"]) {
    min-height: 2.25rem;
  }
  [data-edit-studio-root] summary { line-height: 1.35; }
  [data-edit-studio-root] button:focus-visible,
  [data-edit-studio-root] label:has(input:focus-visible),
  [data-edit-studio-root] summary:focus-visible,
  [data-edit-studio-root] input:focus-visible,
  [data-edit-studio-root] select:focus-visible,
  [data-edit-studio-root] a:focus-visible {
    outline: 2px solid #67e8f9;
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-edit-studio-root] *,
    [data-edit-studio-root] *::before,
    [data-edit-studio-root] *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function editFileKind(file: Pick<File, "name" | "type">): "video" | "image" {
  if (file.type.startsWith("image/") && !file.type.includes("gif")) return "image";
  return /\.(?:jpe?g|png|webp|avif)$/i.test(file.name) ? "image" : "video";
}

/** Al subir una carpeta llegan archivos de todo tipo: queda solo el medio editable. */
function isEditableMediaFile(file: File): boolean {
  if (file.name.startsWith(".")) return false;
  if (file.type.startsWith("video/") || file.type.startsWith("image/")) return true;
  return /\.(?:mp4|m4v|mov|webm|mkv|avi|mts|m2ts|jpe?g|png|webp|avif|gif)$/i.test(file.name);
}

function editAssetSignature(assets: Array<Pick<EditAssetMeta, "id" | "duration" | "width" | "height">>): string {
  return assets.map((asset) => `${asset.id}:${asset.duration}:${asset.width}x${asset.height}`).join("|");
}

function buildPresetSeedClips(assets: EditAssetMeta[]): EditTimelineClip[] {
  return assets.map((asset, index) => ({
    id: `seed-${index}`,
    assetId: asset.id,
    label: asset.name.replace(/\.[^.]+$/, ""),
    duration: 1.2,
    sourceStart: 0,
    sourceDuration: asset.kind === "image" ? 1.2 : asset.duration,
    transition: "cut",
    transitionDuration: 0.12,
    transitionIntensity: 55,
    transitionDirection: "auto",
    motion: "push",
    motionIntensity: 32,
    playbackRate: 1,
    velocityCurve: "linear",
    framingX: 0,
    framingY: 0,
    framingScale: 1,
    style: "inherit",
  }));
}

function particleSpeedForPreset(presetId: PresetId): number {
  if (presetId === "flashStorm") return 1.1;
  if (presetId === "vinlandEmotion" || presetId === "hypnoticPortrait") return 0.9;
  return 1;
}

interface EditAssistSession {
  baseProject: EditProject;
  baseSfxCues: LoopSfxCue[];
  assetSignature: string;
  assets: EditAssetMeta[];
  audioBuffer: AudioBuffer | null;
  audioDuration: number;
  analyses: EditAssetAnalysis[];
  audio: EditAudioStructure | null;
  bpm: number;
  ranking: EditAssistRanking;
  candidates: EditAssistPresetCandidate[];
}

function buildAssistCandidate(
  project: EditProject,
  preset: EditPreset,
  assets: EditAssetMeta[],
  bpm: number
): EditAssistPresetCandidate {
  const result = applyPresetToProject(project, preset, buildPresetSeedClips(assets), bpm);
  return {
    id: preset.id,
    label: preset.label,
    dropAt: preset.dropAt,
    profile: preset.assistProfile,
    clips: result.clips.map((clip, index) => ({ ...clip, id: `assist-${preset.id}-${index}` })),
  };
}

function buildAssistDraft(session: EditAssistSession, presetId: PresetId, requestedMusicStart?: number): EditAssistDraft {
  const preset = EDIT_PRESETS.find((entry) => entry.id === presetId);
  const candidate = session.candidates.find((entry) => entry.id === presetId);
  const presetScore = session.ranking.ranked.find((entry) => entry.presetId === presetId);
  if (!preset || !candidate || !presetScore) throw new Error("El montaje recomendado ya no está disponible");
  const assignment = assignEditAssistMedia(candidate.clips, session.analyses, preset.dropAt);
  const duration = editTimelineDuration(assignment.clips);
  const maxMusicStart = session.audioDuration > duration
    ? session.audioDuration - duration
    : 0;
  const musicStart = session.audioBuffer
    ? Math.max(0, Math.min(maxMusicStart, requestedMusicStart ?? presetScore.musicStart))
    : session.baseProject.musicStart;
  const textCues = session.baseProject.textCues
    .filter((cue) => cue.start <= duration - 0.2)
    .map((cue) => ({ ...cue, duration: Math.max(0.2, Math.min(cue.duration, duration - cue.start)) }));
  const cropWarnings = session.analyses.filter((analysis) => analysis.cropRetention < 0.42).length;
  const qualityWarnings = session.analyses.filter((analysis) => analysis.quality < 0.34).length;
  const warnings = [...presetScore.warnings, ...assignment.warnings];
  if (cropWarnings > 0) warnings.push(`${cropWarnings} medio${cropWarnings === 1 ? "" : "s"} perderán bastante imagen al pasar a 9:16; revisa su encuadre.`);
  if (qualityWarnings > 0) warnings.push(`${qualityWarnings} medio${qualityWarnings === 1 ? "" : "s"} tienen poca nitidez o exposición irregular.`);
  const score = presetScore.score;
  const confidence = presetId === session.ranking.selected.presetId
    ? session.ranking.confidence
    : score >= 0.7
      ? "high"
      : score >= 0.5
        ? "medium"
        : "low";
  return {
    project: {
      ...session.baseProject,
      bpm: session.bpm,
      musicStart,
      style: preset.style,
      colorGrade: { ...session.baseProject.colorGrade, ...preset.colorGrade },
      particles: preset.particles.type,
      particleIntensity: preset.particles.intensity,
      particleSpeed: particleSpeedForPreset(preset.id),
      clips: assignment.clips,
      textCues,
    },
    sfxCues: suggestEditAssistSfx({ clips: assignment.clips }, session.audio, preset.id, session.baseSfxCues),
    presetId,
    presetLabel: preset.label,
    score,
    confidence,
    reasons: presetScore.reasons,
    warnings: [...new Set(warnings)],
    uniqueAssetCount: assignment.uniqueAssetCount,
    repeatedSlots: assignment.repeatedSlots,
  };
}

function loadStoredProject(): EditProject {
  const fallback = createDefaultEditProject();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EditProject>;
    if (parsed.version !== 1) return fallback;
    const clips = Array.isArray(parsed.clips)
      ? (parsed.clips as EditTimelineClip[]).map(normalizeEditClip)
      : [];
    return {
      ...fallback,
      ...parsed,
      format: "9:16",
      colorGrade: { ...fallback.colorGrade, ...parsed.colorGrade },
      particleControls: { ...fallback.particleControls, ...parsed.particleControls },
      watermarkStyle: { ...fallback.watermarkStyle, ...parsed.watermarkStyle },
      clips,
      textCues: Array.isArray(parsed.textCues)
        ? parsed.textCues.map(normalizeEditTextCue)
        : [],
    };
  } catch {
    return fallback;
  }
}

function loadStoredAssetManifest(project: EditProject): EditAssetManifest[] {
  if (typeof window === "undefined") return buildFallbackEditAssetManifest(project.clips);
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSET_MANIFEST_STORAGE_KEY) ?? "[]") as EditAssetManifest[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // El fallback permite recuperar proyectos guardados antes del manifiesto.
  }
  return buildFallbackEditAssetManifest(project.clips);
}

function loadStoredSfxCues(): LoopSfxCue[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SFX_STORAGE_KEY) ?? "[]") as LoopSfxCue[];
    return Array.isArray(parsed)
      ? parsed.filter((cue) => cue && typeof cue.id === "string" && typeof cue.sfxId === "string" && Number.isFinite(cue.time))
      : [];
  } catch {
    return [];
  }
}

function manifestForRuntimeAsset(asset: RuntimeEditAsset): EditAssetManifest {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    size: asset.file.size,
    lastModified: asset.file.lastModified,
  };
}

function TimelineClipBlock({
  clip,
  asset,
  index,
  selected,
  pxPerSecond,
  onSelect,
  onDropClip,
}: {
  clip: EditTimelineClip;
  asset: RuntimeEditAsset | null;
  index: number;
  selected: boolean;
  pxPerSecond: number;
  onSelect: () => void;
  onDropClip: (sourceId: string, targetId: string) => void;
}) {
  const thumbnailRef = useRef<HTMLCanvasElement | null>(null);
  const motionLabel = EDIT_MOTIONS.find((m) => m.id === clip.motion)?.label ?? clip.motion;
  const transLabel = EDIT_TRANSITIONS.find((t) => t.id === clip.transition)?.label ?? clip.transition;
  const rateBadge = Math.abs((clip.playbackRate ?? 1) - 1) > 0.02 ? `${(clip.playbackRate ?? 1).toFixed(2)}×` : "";
  useEffect(() => {
    const canvas = thumbnailRef.current;
    const source = asset?.kind === "image"
      ? asset.image
      : asset?.cache
        ? clipFrameAt(asset.cache, clip.sourceStart)
        : null;
    if (!canvas || !source) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sourceWidth = "naturalWidth" in source
      ? source.naturalWidth
      : "width" in source
        ? Number(source.width)
        : asset?.width ?? canvas.width;
    const sourceHeight = "naturalHeight" in source
      ? source.naturalHeight
      : "height" in source
        ? Number(source.height)
        : asset?.height ?? canvas.height;
    const scale = Math.max(canvas.width / Math.max(1, sourceWidth), canvas.height / Math.max(1, sourceHeight));
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  }, [asset, clip.sourceStart]);
  return (
    <button
      type="button"
      data-testid="edit-timeline-clip"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/edit-clip", clip.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropClip(event.dataTransfer.getData("text/edit-clip"), clip.id);
      }}
      onClick={onSelect}
      style={{ width: Math.max(150, clip.duration * pxPerSecond) }}
      className={`group relative h-28 shrink-0 overflow-hidden border-r border-black/70 text-left transition ${selected
        ? "bg-fuchsia-600 text-white ring-2 ring-inset ring-fuchsia-300"
        : index % 2 === 0
          ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}
      title={`${transLabel} · ${motionLabel}${rateBadge ? ` · ${rateBadge}` : ""} — Arrastra para reordenar`}
    >
      <canvas ref={thumbnailRef} width="160" height="90" className={`absolute inset-0 h-full w-full object-cover ${asset ? "opacity-55" : "opacity-0"}`} />
      <span className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10" />
      {!asset && <span className="absolute inset-x-2 top-4 border border-dashed border-red-500/50 bg-red-950/60 py-1 text-center font-mono text-[8px] font-black uppercase text-red-200">Medio pendiente</span>}
      <span className="absolute inset-x-2 bottom-10 block truncate text-[10px] font-black uppercase tracking-wider">{clip.label}</span>
      <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 font-mono text-[8px] opacity-80">
        <span className="shrink-0">{clip.duration.toFixed(2)} s{rateBadge ? ` · ${rateBadge}` : ""}</span>
        <span className="min-w-0 truncate text-right uppercase">{motionLabel} · {transLabel.split(" ")[0]}</span>
      </span>
      <span className="absolute right-1.5 top-1.5 bg-black/65 px-1 font-mono text-[9px] opacity-80">{index + 1}</span>
    </button>
  );
}

export default function EditStudioPage() {
  const [project, setProject] = useState<EditProject>(createDefaultEditProject);
  const [assets, setAssets] = useState<RuntimeEditAsset[]>([]);
  const [expectedAssets, setExpectedAssets] = useState<EditAssetManifest[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("Añade imágenes o vídeos para empezar.");
  const [error, setError] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sfxCues, setSfxCues] = useState<LoopSfxCue[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [assistPhase, setAssistPhase] = useState<"idle" | "analyzing" | "review">("idle");
  const [assistProgress, setAssistProgress] = useState(0);
  const [assistProgressLabel, setAssistProgressLabel] = useState("");
  const [assistSession, setAssistSession] = useState<EditAssistSession | null>(null);
  const [assistDraft, setAssistDraft] = useState<EditAssistDraft | null>(null);
  const [assistPreviewMode, setAssistPreviewMode] = useState<"current" | "draft">("current");
  const [inspectorTab, setInspectorTab] = useState<EditInspectorTab>("media");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timelineTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const projectRef = useRef(project);
  const persistedProjectRef = useRef(project);
  const assetsRef = useRef(assets);
  const audioBufferRef = useRef(audioBuffer);
  const previewParticlesRef = useRef(new PhysicsParticleSystem());
  const previousParticlesRef = useRef(new PhysicsParticleSystem());
  const exportAbortRef = useRef<AbortController | null>(null);
  const assistAbortRef = useRef<AbortController | null>(null);
  const inspectorScrollRef = useRef<HTMLDivElement | null>(null);
  const assistGenerationRef = useRef(0);
  const assistVisualCacheRef = useRef(new Map<string, EditAssetAnalysis[]>());
  const assistAudioCacheRef = useRef(new WeakMap<AudioBuffer, { bpm: number; analysis: EditAudioStructure }>());
  const storageReadyRef = useRef(false);

  const selectInspectorTab = useCallback((tab: EditInspectorTab) => {
    if (inspectorScrollRef.current) inspectorScrollRef.current.scrollTop = 0;
    setInspectorTab(tab);
  }, []);

  const assistDraftStale = Boolean(assistSession && (
    assistSession.baseProject !== project
    || assistSession.assetSignature !== editAssetSignature(assets)
    || assistSession.audioBuffer !== audioBuffer
  ));
  const previewingAssistDraft = Boolean(assistPreviewMode === "draft" && assistDraft && !assistDraftStale);
  const activeProject = previewingAssistDraft && assistDraft ? assistDraft.project : project;
  const activeSfxCues = previewingAssistDraft && assistDraft ? assistDraft.sfxCues : sfxCues;
  const activeProjectReadOnly = assistPhase === "review" && !previewingAssistDraft;
  const playbackProject = activeProject;
  const duration = useMemo(() => editTimelineDuration(activeProject.clips), [activeProject.clips]);
  const playbackDuration = duration;
  const placements = useMemo(() => editTimelinePlacements(activeProject.clips), [activeProject.clips]);
  const beatMarkers = useMemo(() => buildBeatMarkers(duration, activeProject.bpm, 1), [duration, activeProject.bpm]);
  const selectedClip = activeProject.clips.find((clip) => clip.id === selectedClipId) ?? activeProject.clips[0] ?? null;
  const selectedAsset = selectedClip ? assets.find((asset) => asset.id === selectedClip.assetId) ?? null : null;
  const missingAssetIds = useMemo(() => new Set(activeProject.clips
    .filter((clip) => !assets.some((asset) => asset.id === clip.assetId))
    .map((clip) => clip.assetId)), [activeProject.clips, assets]);
  const pxPerSecond = 72;
  const waveformPeaks = useMemo(() => {
    if (!audioBuffer || duration <= 0) return null;
    return getTimelineWaveformPeaks(audioBuffer, activeProject.musicStart, duration, pxPerSecond);
  }, [activeProject.musicStart, audioBuffer, duration]);
  const avgIntensity = useMemo(() => {
    if (!activeProject.clips.length) return 32;
    return Math.round(activeProject.clips.reduce((acc, clip) => acc + (clip.motionIntensity ?? 32), 0) / activeProject.clips.length);
  }, [activeProject.clips]);
  const [bpmDetecting, setBpmDetecting] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const storedProject = loadStoredProject();
      const storedAssets = loadStoredAssetManifest(storedProject);
      const storedSfx = loadStoredSfxCues();
      storageReadyRef.current = true;
      persistedProjectRef.current = storedProject;
      projectRef.current = storedProject;
      setProject(storedProject);
      setExpectedAssets(storedAssets);
      setSfxCues(storedSfx);
      setSelectedClipId(storedProject.clips[0]?.id ?? null);
      if (storedProject.clips.length) {
        setStatus(`Proyecto restaurado · reconecta ${storedAssets.length} medio${storedAssets.length === 1 ? "" : "s"} para continuar.`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { projectRef.current = playbackProject; }, [playbackProject]);
  useEffect(() => { persistedProjectRef.current = project; }, [project]);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { audioBufferRef.current = audioBuffer; }, [audioBuffer]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => {
    if (!storageReadyRef.current) return;
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
  }, [project]);
  useEffect(() => {
    if (!storageReadyRef.current) return;
    localStorage.setItem(ASSET_MANIFEST_STORAGE_KEY, JSON.stringify(expectedAssets));
  }, [expectedAssets]);
  useEffect(() => {
    if (!storageReadyRef.current) return;
    const serializable = sfxCues
      .filter((cue) => !cue.customBuffer)
      .map(({ customBuffer, ...cue }) => {
        void customBuffer;
        return cue;
      });
    localStorage.setItem(SFX_STORAGE_KEY, JSON.stringify(serializable));
  }, [sfxCues]);
  useEffect(() => {
    void ensureWatermarkFont();
  }, []);
  useEffect(() => () => assistAbortRef.current?.abort(), []);
  // La limpieza debe ocurrir SOLO al desmontar la página: con [audioUrl, resultUrl]
  // como dependencias, elegir una canción o terminar un export ejecutaba este
  // cleanup a mitad de sesión y destruía los cachés de fotogramas de los vídeos.
  // El revoke en swap ya lo hacen handleAudioFile y el flujo de export.
  const audioUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);
  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);
  useEffect(() => () => {
    for (const asset of assetsRef.current) {
      URL.revokeObjectURL(asset.url);
      disposeClipFrameCache(asset.cache);
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  const replaceActiveProject = useCallback((updater: (current: EditProject) => EditProject) => {
    if (previewingAssistDraft) {
      setAssistDraft((current) => current ? { ...current, project: updater(current.project) } : current);
      return;
    }
    if (activeProjectReadOnly) return;
    setProject(updater);
  }, [activeProjectReadOnly, previewingAssistDraft]);

  const updateProject = useCallback((patch: Partial<EditProject>) => {
    replaceActiveProject((current) => ({ ...current, ...patch }));
  }, [replaceActiveProject]);

  const updateClip = useCallback((id: string, patch: Partial<EditTimelineClip>) => {
    replaceActiveProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === id ? normalizeEditClip({ ...clip, ...patch }) : clip),
    }));
  }, [replaceActiveProject]);

  const updateActiveSfxCues = useCallback((next: LoopSfxCue[]) => {
    if (previewingAssistDraft) {
      setAssistDraft((current) => current ? { ...current, sfxCues: next } : current);
    } else if (!activeProjectReadOnly) {
      setSfxCues(next);
    }
  }, [activeProjectReadOnly, previewingAssistDraft]);

  const appendAssetAsClip = useCallback((asset: RuntimeEditAsset) => {
    const defaultDuration = asset.kind === "image" ? 1.5 : Math.min(2, Math.max(0.4, asset.duration));
    const clip: EditTimelineClip = {
      id: uid("clip"),
      assetId: asset.id,
      label: asset.name.replace(/\.[^.]+$/, ""),
      duration: defaultDuration,
      sourceStart: 0,
      sourceDuration: asset.kind === "image" ? defaultDuration : Math.min(asset.duration, defaultDuration),
      transition: "cut",
      transitionDuration: 0.12,
      transitionIntensity: 55,
      transitionDirection: "auto",
      motion: "push",
      motionIntensity: 32,
      playbackRate: 1,
      velocityCurve: "linear",
      framingX: 0,
      framingY: 0,
      framingScale: 1,
      style: "inherit",
    };
    setProject((current) => ({ ...current, clips: [...current.clips, clip] }));
    setSelectedClipId(clip.id);
  }, []);

  const registerRuntimeAsset = useCallback((asset: RuntimeEditAsset, reconnecting: boolean) => {
    setAssets((current) => {
      const existing = current.find((entry) => entry.id === asset.id);
      return existing
        ? current.map((entry) => entry.id === asset.id ? asset : entry)
        : [...current, asset];
    });
    const manifest = manifestForRuntimeAsset(asset);
    setExpectedAssets((current) => {
      const exists = current.some((entry) => entry.id === manifest.id);
      return exists
        ? current.map((entry) => entry.id === manifest.id ? manifest : entry)
        : [...current, manifest];
    });
    if (!reconnecting) appendAssetAsClip(asset);
  }, [appendAssetAsClip]);

  const prepareVideoAsset = useCallback(async (file: File, url: string, reconnect?: EditAssetManifest | null): Promise<void> => {
    setStatus(`Preparando borrador de ${file.name}…`);
    const metadataVideo = document.createElement("video");
    metadataVideo.preload = "metadata";
    metadataVideo.muted = true;
    metadataVideo.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("El vídeo tardó demasiado en responder")), 15_000);
      metadataVideo.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      metadataVideo.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Códec no compatible con el navegador"));
      };
    });
    const cache = await buildClipFrameCache(file, {
      maxWidth: 540,
      fps: 18,
      maxMemoryMb: 88,
      onProgress: (ratio) => setStatus(`Preparando ${file.name} · ${Math.round(ratio * 100)}%`),
    });
    const asset: RuntimeEditAsset = {
      id: reconnect?.id ?? uid("asset"),
      name: reconnect?.name ?? file.name,
      kind: "video",
      duration: Math.max(0.25, metadataVideo.duration || cache.duration),
      width: metadataVideo.videoWidth || cache.sourceWidth,
      height: metadataVideo.videoHeight || cache.sourceHeight,
      file,
      url,
      image: null,
      cache,
    };
    metadataVideo.removeAttribute("src");
    metadataVideo.load();
    registerRuntimeAsset(asset, Boolean(reconnect));
  }, [registerRuntimeAsset]);

  const prepareFile = useCallback(async (file: File, allowTranscode = true, reconnect?: EditAssetManifest | null): Promise<void> => {
    const isImage = editFileKind(file) === "image";
    const isVideo = file.type.startsWith("video/") || !isImage;
    const url = URL.createObjectURL(file);
    try {
      if (isImage) {
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`No se pudo abrir ${file.name}`));
        });
        const asset: RuntimeEditAsset = {
          id: reconnect?.id ?? uid("asset"),
          name: reconnect?.name ?? file.name,
          kind: "image",
          duration: 10,
          width: image.naturalWidth,
          height: image.naturalHeight,
          file,
          url,
          image,
          cache: null,
        };
        registerRuntimeAsset(asset, Boolean(reconnect));
        return;
      }

      if (isVideo) {
        await prepareVideoAsset(file, url, reconnect);
      }
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (isVideo && allowTranscode) {
        setStatus(`Convirtiendo ${file.name} a H.264 localmente…`);
        try {
          const converted = await transcodeVideoForBrowser(file);
          const convertedUrl = URL.createObjectURL(converted);
          try {
            await prepareVideoAsset(converted, convertedUrl, reconnect);
          } catch (convertedCause) {
            URL.revokeObjectURL(convertedUrl);
            throw convertedCause;
          }
          return;
        } catch (transcodeError) {
          console.warn("Conversión local no disponible:", transcodeError);
        }
      }
      throw cause;
    }
  }, [prepareVideoAsset, registerRuntimeAsset]);

  const handleMediaFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setLoadingMedia(true);
    setError(null);
    try {
      const connectedIds = new Set(assets.map((asset) => asset.id));
      let reconnected = 0;
      let added = 0;
      for (const file of Array.from(files)) {
        const reconnect = matchEditAssetManifest(expectedAssets, {
          name: file.name,
          kind: editFileKind(file),
          size: file.size,
          lastModified: file.lastModified,
        }, connectedIds);
        await prepareFile(file, true, reconnect);
        if (reconnect) {
          connectedIds.add(reconnect.id);
          reconnected++;
        } else {
          added++;
        }
      }
      setStatus([
        reconnected ? `${reconnected} medio${reconnected === 1 ? "" : "s"} reconectado${reconnected === 1 ? "" : "s"}` : "",
        added ? `${added} medio${added === 1 ? "" : "s"} añadido${added === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · "));
      selectInspectorTab("montage");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar el medio");
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleAudioFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const nextUrl = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioBuffer(decoded);
      setAudioUrl(nextUrl);
      void preloadCuratedSfx(context);
      // auto BPM si detecta ritmo claro (sin pisar si el usuario ya editó manualmente recientemente)
      const autoBpm = estimateBpmFromBuffer(decoded);
      if (autoBpm) {
        updateProject({ bpm: autoBpm });
        setStatus(`Música lista · ${formatTime(decoded.duration)} · BPM ${autoBpm} detectado`);
      } else {
        setStatus(`Música lista · ${formatTime(decoded.duration)}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo decodificar la canción");
    }
  };

  const handleDetectBpm = useCallback(async () => {
    if (!audioBuffer) return;
    setBpmDetecting(true);
    try {
      // ligera pausa para que el UI pinte el spinner
      await new Promise<void>((r) => setTimeout(r, 30));
      const bpm = estimateBpmFromBuffer(audioBuffer);
      if (bpm) {
        updateProject({ bpm });
        setStatus(`BPM detectado: ${bpm} · rail actualizado`);
      } else {
        setError("No se detectó un pulso claro — ajusta BPM a mano");
      }
    } finally {
      setBpmDetecting(false);
    }
  }, [audioBuffer, updateProject]);

  const applyProfessionalGrammar = useCallback((grammar: EditProfessionalGrammar) => {
    if (!activeProject.clips.length || activeProjectReadOnly) return;
    const option = EDIT_PROFESSIONAL_GRAMMARS.find((entry) => entry.id === grammar);
    replaceActiveProject((current) => ({
      ...current,
      clips: applyEditProfessionalGrammar(current.clips, grammar),
    }));
    setStatus(`${option?.label ?? "Gramática profesional"} aplicada · se conservaron orden, recortes y duración.`);
  }, [activeProject.clips.length, activeProjectReadOnly, replaceActiveProject]);

  const applyFinishRecipe = useCallback((recipeId: EditFinishRecipe["id"]) => {
    if (activeProjectReadOnly) return;
    const recipe = EDIT_FINISH_RECIPES.find((entry) => entry.id === recipeId);
    if (!recipe) return;
    replaceActiveProject((current) => ({
      ...current,
      style: recipe.style,
      colorGrade: { ...current.colorGrade, ...recipe.colorGrade },
      particles: recipe.particles,
      particleIntensity: recipe.particleIntensity,
      particleControls: { ...current.particleControls, ...recipe.particleControls },
    }));
    setStatus(`Acabado ${recipe.label} aplicado a todo el edit; el montaje no cambió.`);
  }, [activeProjectReadOnly, replaceActiveProject]);

  const seekTo = useCallback((next: number) => {
    const safe = Math.max(0, Math.min(Math.max(0, playbackDuration - 1 / Math.max(1, playbackProject.fps)), next));
    timelineTimeRef.current = safe;
    setCurrentTime(safe);
    const audio = audioElementRef.current;
    if (audio && audioBuffer) {
      audio.currentTime = (playbackProject.musicStart + safe) % Math.max(0.01, audioBuffer.duration);
    }
  }, [audioBuffer, playbackDuration, playbackProject.fps, playbackProject.musicStart]);

  const togglePlayback = useCallback(() => {
    if (!playbackProject.clips.length) return;
    setIsPlaying((playing) => {
      const next = !playing;
      const audio = audioElementRef.current;
      if (audio) {
        audio.volume = Math.max(0, Math.min(1, playbackProject.musicVolume));
        if (next) {
          audio.currentTime = (playbackProject.musicStart + timelineTimeRef.current) % Math.max(0.01, audio.duration || 1);
          void audio.play().catch(() => undefined);
        } else {
          audio.pause();
        }
      }
      return next;
    });
  }, [playbackProject.clips.length, playbackProject.musicStart, playbackProject.musicVolume]);

  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();
    let lastUiUpdate = 0;
    const sceneCanvas = document.createElement("canvas");
    const previousCanvas = document.createElement("canvas");

    const draw = (now: number) => {
      const liveProject = projectRef.current;
      const liveAssets = assetsRef.current;
      const canvas = canvasRef.current;
      const liveDuration = editTimelineDuration(liveProject.clips);
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      if (isPlayingRef.current && liveDuration > 0) {
        timelineTimeRef.current += dt;
        if (timelineTimeRef.current >= liveDuration) {
          timelineTimeRef.current = 0;
          const audio = audioElementRef.current;
          if (audio) audio.currentTime = liveProject.musicStart % Math.max(0.01, audio.duration || 1);
        }
      }

      if (canvas) {
        const logical = editOutputSize("9:16");
        const width = 540;
        const height = Math.round(width * logical.height / logical.width);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          sceneCanvas.width = width;
          sceneCanvas.height = height;
          previousCanvas.width = width;
          previousCanvas.height = height;
        }
        const ctx = canvas.getContext("2d");
        const sceneCtx = sceneCanvas.getContext("2d");
        const previousCtx = previousCanvas.getContext("2d");
        if (ctx && sceneCtx && previousCtx) {
          const placement = editClipAtTime(liveProject.clips, timelineTimeRef.current);
          const asset = placement ? liveAssets.find((entry) => entry.id === placement.clip.assetId) : null;
          const sourceTime = placement
            ? editSourceTimeAt(placement.clip, placement.localTime)
            : 0;
          const source = asset?.kind === "image"
            ? asset.image
            : asset?.cache
              ? clipFrameAt(asset.cache, sourceTime)
              : null;

          if (placement && source) {
            const config = buildEditFrameConfig(liveProject, placement.clip, 60, 1 / 60);
            renderMangaMotionFrame(sceneCtx, source, config, width, height, placement.localTime, null, undefined, 0);
            previewParticlesRef.current.update(
              liveProject.particles,
              liveProject.particleIntensity,
              width,
              height,
              timelineTimeRef.current,
              liveProject.particleSpeed,
              1,
              { ...liveProject.particleControls, loopDuration: Math.max(0.5, liveDuration) }
            );
            previewParticlesRef.current.draw(sceneCtx, liveProject.particles, liveProject.particleControls);

            let previousSource: CanvasImageSource | null = null;
            if (placement.index > 0 && placement.localTime < placement.clip.transitionDuration) {
              const previousPlacement = editTimelinePlacements(liveProject.clips)[placement.index - 1]!;
              const previousAsset = liveAssets.find((entry) => entry.id === previousPlacement.clip.assetId);
              const previousSourceTime = editSourceTimeAt(previousPlacement.clip, previousPlacement.clip.duration);
              const previousMedia = previousAsset?.kind === "image"
                ? previousAsset.image
                : previousAsset?.cache
                  ? clipFrameAt(previousAsset.cache, previousSourceTime)
                  : null;
              if (previousMedia) {
                const previousConfig = buildEditFrameConfig(liveProject, previousPlacement.clip, 60, 1 / 60);
                renderMangaMotionFrame(
                  previousCtx,
                  previousMedia,
                  previousConfig,
                  width,
                  height,
                  Math.max(0, previousPlacement.clip.duration - 1 / 60),
                  null,
                  undefined,
                  0
                );
                previousParticlesRef.current.update(
                  liveProject.particles,
                  liveProject.particleIntensity,
                  width,
                  height,
                  previousPlacement.end,
                  liveProject.particleSpeed,
                  1,
                  { ...liveProject.particleControls, loopDuration: Math.max(0.5, liveDuration) }
                );
                previousParticlesRef.current.draw(previousCtx, liveProject.particles, liveProject.particleControls);
                previousSource = previousCanvas;
              }
            }
            composeEditTransition(ctx, sceneCanvas, previousSource, placement.clip, placement.localTime, width, height);
            for (const cue of liveProject.textCues) drawEditTextCue(ctx, cue, width, height, timelineTimeRef.current);
            if (liveProject.watermarkEnabled) {
              drawProfessionalWatermark(ctx, {
                text: liveProject.watermarkText,
                width,
                height,
                opacity: liveProject.watermarkOpacity,
                shorts: true,
                style: liveProject.watermarkStyle,
              });
            }
          } else {
            ctx.fillStyle = "#09090b";
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "#71717a";
            ctx.textAlign = "center";
            ctx.font = "600 24px ui-sans-serif, system-ui";
            ctx.fillText(asset ? "Preparando borrador…" : placement ? "Reconecta el medio de esta toma" : "Añade clips a la línea de tiempo", width / 2, height / 2);
          }
        }
      }

      if (now - lastUiUpdate > 90) {
        setCurrentTime(timelineTimeRef.current);
        lastUiUpdate = now;
      }
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const removeAsset = (assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (asset) {
      URL.revokeObjectURL(asset.url);
      disposeClipFrameCache(asset.cache);
    }
    setAssets((current) => current.filter((entry) => entry.id !== assetId));
    setExpectedAssets((current) => current.filter((entry) => entry.id !== assetId));
    setProject((current) => ({ ...current, clips: current.clips.filter((clip) => clip.assetId !== assetId) }));
    if (selectedClip?.assetId === assetId) setSelectedClipId(null);
  };

  const reorderClips = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    replaceActiveProject((current) => {
      const next = [...current.clips];
      const sourceIndex = next.findIndex((clip) => clip.id === sourceId);
      const targetIndex = next.findIndex((clip) => clip.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved!);
      return { ...current, clips: next };
    });
  };

  const applyRhythm = (preset: EditRhythmPreset) => {
    replaceActiveProject((current) => ({
      ...current,
      clips: applyEditRhythmPreset(current.clips, preset, current.bpm),
    }));
    setStatus(preset === "reference" ? "Cadencia de los edits de referencia aplicada." : "Ritmo ajustado a la rejilla musical.");
  };

  const addTextCue = () => {
    const cue = {
      id: uid("text"),
      text: "HUMAN",
      start: timelineTimeRef.current,
      duration: 0.8,
      x: 0.5,
      y: 0.58,
      size: 48,
      color: "#ffffff",
      accent: "#d946ef",
      style: "impact" as const,
      emphasis: "HUMAN",
    };
    replaceActiveProject((current) => ({ ...current, textCues: [...current.textCues, cue] }));
  };

  const pausePreview = useCallback(() => {
    setIsPlaying(false);
    audioElementRef.current?.pause();
  }, []);

  const cancelAssistAnalysis = useCallback(() => {
    assistGenerationRef.current++;
    assistAbortRef.current?.abort();
    assistAbortRef.current = null;
    setAssistPhase("idle");
    setAssistProgress(0);
    setAssistProgressLabel("");
    setStatus("Montaje asistido cancelado; tu timeline sigue intacta.");
  }, []);

  const switchAssistPreview = useCallback((mode: "current" | "draft") => {
    if (mode === "draft" && (!assistDraft || assistDraftStale)) return;
    const target = mode === "draft" && assistDraft ? assistDraft.project : project;
    pausePreview();
    setAssistPreviewMode(mode);
    setSelectedClipId(target.clips[0]?.id ?? null);
    projectRef.current = target;
    timelineTimeRef.current = 0;
    setCurrentTime(0);
    const audio = audioElementRef.current;
    if (audio) audio.currentTime = target.musicStart % Math.max(0.01, audio.duration || 1);
  }, [assistDraft, assistDraftStale, pausePreview, project]);

  const discardAssistDraft = useCallback(() => {
    pausePreview();
    projectRef.current = project;
    timelineTimeRef.current = 0;
    setCurrentTime(0);
    setAssistPreviewMode("current");
    setSelectedClipId(project.clips[0]?.id ?? null);
    setAssistDraft(null);
    setAssistSession(null);
    setAssistPhase("idle");
    setAssistProgress(0);
    setAssistProgressLabel("");
    setStatus("Borrador descartado; el montaje anterior no cambió.");
  }, [pausePreview, project]);

  const startAssist = useCallback(async () => {
    if (!assets.length || loadingMedia || assistPhase === "analyzing") {
      if (!assets.length) setError("Importa al menos una imagen o un vídeo para crear el montaje asistido.");
      return;
    }
    const generation = ++assistGenerationRef.current;
    const controller = new AbortController();
    assistAbortRef.current?.abort();
    assistAbortRef.current = controller;
    const baseProject = project;
    const baseAssets = [...assets];
    const baseAudio = audioBuffer;
    const assetSignature = editAssetSignature(baseAssets);
    pausePreview();
    setAssistPhase("analyzing");
    setAssistSession(null);
    setAssistDraft(null);
    setAssistPreviewMode("current");
    setAssistProgress(0.01);
    setAssistProgressLabel("Preparando análisis local");
    setError(null);

    try {
      const sources: EditAssistAssetSource[] = baseAssets.map((asset, importIndex) => ({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        importIndex,
        image: asset.image,
        cache: asset.cache,
      }));
      let analyses = assistVisualCacheRef.current.get(assetSignature) ?? null;
      if (analyses) {
        setAssistProgress(0.62);
        setAssistProgressLabel("Reutilizando análisis visual de esta sesión");
      } else {
        analyses = await analyzeEditAssets(sources, {
          signal: controller.signal,
          onProgress: (ratio, label) => {
            if (assistGenerationRef.current !== generation) return;
            setAssistProgress(0.05 + ratio * 0.6);
            setAssistProgressLabel(label);
          },
        });
        assistVisualCacheRef.current.set(assetSignature, analyses);
      }
      const detectedBpm = baseAudio ? estimateBpmFromBuffer(baseAudio) : null;
      const bpm = detectedBpm ?? baseProject.bpm;
      let audio: EditAudioStructure | null = null;
      if (baseAudio) {
        const cachedAudio = assistAudioCacheRef.current.get(baseAudio);
        if (cachedAudio?.bpm === bpm) {
          audio = cachedAudio.analysis;
          setAssistProgress(0.9);
          setAssistProgressLabel("Reutilizando análisis musical de esta sesión");
        } else {
          audio = await analyzeEditAudio(baseAudio, {
            bpm,
            bpmReliable: detectedBpm != null,
            signal: controller.signal,
            onProgress: (ratio, label) => {
              if (assistGenerationRef.current !== generation) return;
              setAssistProgress(0.65 + ratio * 0.25);
              setAssistProgressLabel(label);
            },
          });
          assistAudioCacheRef.current.set(baseAudio, { bpm, analysis: audio });
        }
      }
      if (assistGenerationRef.current !== generation) return;
      setAssistProgress(0.92);
      setAssistProgressLabel("Probando estructuras y encuadres");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const assetMetas: EditAssetMeta[] = baseAssets.map(({ id, name, kind, duration: assetDuration, width, height }) => ({
        id, name, kind, duration: assetDuration, width, height,
      }));
      const candidates = EDIT_PRESETS.map((preset) => buildAssistCandidate(baseProject, preset, assetMetas, bpm));
      const ranking = rankEditAssistPresets(candidates, analyses, audio, baseProject.musicStart);
      const session: EditAssistSession = {
        baseProject,
        baseSfxCues: [...sfxCues],
        assetSignature,
        assets: assetMetas,
        audioBuffer: baseAudio,
        audioDuration: baseAudio?.duration ?? 0,
        analyses,
        audio,
        bpm,
        ranking,
        candidates,
      };
      if (
        assistGenerationRef.current !== generation
        || persistedProjectRef.current !== baseProject
        || editAssetSignature(assetsRef.current) !== assetSignature
        || audioBufferRef.current !== baseAudio
      ) {
        throw new Error("Los medios o el proyecto cambiaron durante el análisis. Vuelve a generar el borrador.");
      }
      const draft = buildAssistDraft(session, ranking.selected.presetId as PresetId);
      setAssistSession(session);
      setAssistDraft(draft);
      setAssistPhase("review");
      setAssistPreviewMode("draft");
      setSelectedClipId(draft.project.clips[0]?.id ?? null);
      projectRef.current = draft.project;
      timelineTimeRef.current = 0;
      setCurrentTime(0);
      const audioElement = audioElementRef.current;
      if (audioElement) audioElement.currentTime = draft.project.musicStart % Math.max(0.01, audioElement.duration || 1);
      setAssistProgress(1);
      setAssistProgressLabel("Borrador listo para revisar");
      setStatus(`Borrador listo · ${draft.presetLabel} · ${draft.project.clips.length} tomas · todavía no se ha aplicado.`);
    } catch (cause) {
      if (assistGenerationRef.current !== generation) return;
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setAssistPhase("idle");
        setStatus("Montaje asistido cancelado; tu timeline sigue intacta.");
      } else {
        setAssistPhase("idle");
        setError(cause instanceof Error ? cause.message : "No se pudo crear el montaje asistido");
      }
      setAssistProgress(0);
      setAssistProgressLabel("");
    } finally {
      if (assistGenerationRef.current === generation) assistAbortRef.current = null;
    }
  }, [assets, assistPhase, audioBuffer, loadingMedia, pausePreview, project, sfxCues]);

  const selectAssistPreset = useCallback((presetId: PresetId) => {
    if (!assistSession || assistDraftStale) return;
    try {
      const draft = buildAssistDraft(assistSession, presetId);
      pausePreview();
      setAssistDraft(draft);
      setAssistPreviewMode("draft");
      setSelectedClipId(draft.project.clips[0]?.id ?? null);
      projectRef.current = draft.project;
      timelineTimeRef.current = 0;
      setCurrentTime(0);
      const audio = audioElementRef.current;
      if (audio) audio.currentTime = draft.project.musicStart % Math.max(0.01, audio.duration || 1);
      setStatus(`Alternativa preparada: ${draft.presetLabel}. Revisa antes de aplicar.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar esta alternativa");
    }
  }, [assistDraftStale, assistSession, pausePreview]);

  const updateAssistMusicStart = useCallback((value: number) => {
    if (!assistDraft || !assistSession || assistDraftStale || !assistSession.audioBuffer) return;
    const draftDuration = editTimelineDuration(assistDraft.project.clips);
    const maxStart = Math.max(0, assistSession.audioDuration - draftDuration);
    const musicStart = Math.max(0, Math.min(maxStart, Number.isFinite(value) ? value : 0));
    const nextDraft = { ...assistDraft, project: { ...assistDraft.project, musicStart } };
    setAssistDraft(nextDraft);
    if (assistPreviewMode === "draft") projectRef.current = nextDraft.project;
    const audio = audioElementRef.current;
    if (audio) audio.currentTime = (musicStart + timelineTimeRef.current) % Math.max(0.01, audio.duration || 1);
  }, [assistDraft, assistDraftStale, assistPreviewMode, assistSession]);

  const acceptAssistDraft = useCallback(() => {
    if (!assistDraft || !assistSession) return;
    if (assistDraftStale) {
      setError("El proyecto, los medios o la canción cambiaron. Genera un borrador nuevo antes de aplicarlo.");
      return;
    }
    pausePreview();
    persistedProjectRef.current = assistDraft.project;
    projectRef.current = assistDraft.project;
    setProject(assistDraft.project);
    setSfxCues(assistDraft.sfxCues);
    setSelectedClipId(assistDraft.project.clips[0]?.id ?? null);
    timelineTimeRef.current = 0;
    setCurrentTime(0);
    setAssistPreviewMode("current");
    setAssistDraft(null);
    setAssistSession(null);
    setAssistPhase("idle");
    setAssistProgress(0);
    setAssistProgressLabel("");
    setError(null);
    setStatus("Montaje asistido aplicado. Ahora puedes ajustar tomas, texto, look y SFX.");
  }, [assistDraft, assistDraftStale, assistSession, pausePreview]);

  const applyPreset = useCallback((presetId: PresetId) => {
    const preset = EDIT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (!assets.length) {
      setError("Sube 1 imagen/vídeo mínimo para generar el preset");
      return;
    }
    const isUntouchedImport = project.textCues.length === 0
      && project.clips.length === assets.length
      && project.clips.every((clip, index) => {
        const asset = assets[index];
        if (!asset) return false;
        const defaultDuration = asset.kind === "image" ? 1.5 : Math.min(2, Math.max(0.4, asset.duration));
        const closeTo = (value: number, expected: number) => Math.abs(value - expected) < 1e-4;
        return clip.assetId === asset.id
          && closeTo(clip.duration, defaultDuration)
          && closeTo(clip.sourceStart, 0)
          && closeTo(clip.sourceDuration, asset.kind === "image" ? defaultDuration : Math.min(asset.duration, defaultDuration))
          && clip.transition === "cut"
          && closeTo(clip.transitionDuration, 0.12)
          && clip.motion === "push"
          && clip.motionIntensity === 32
          && closeTo(clip.playbackRate, 1)
          && clip.velocityCurve === "linear"
          && closeTo(clip.framingX, 0)
          && closeTo(clip.framingY, 0)
          && closeTo(clip.framingScale, 1)
          && clip.style === "inherit";
      });
    if (!isUntouchedImport && project.clips.length > 0 && !window.confirm(`¿Reemplazar timeline actual por preset "${preset.label}"? Se perderá el montaje actual (quedará editable después).`)) return;
    // Los medios importados son la fuente de verdad: el preset puede recorrer
    // todo un vídeo aunque la toma inicial añadida al timeline durase 2 s.
    const seedClips = buildPresetSeedClips(assets);
    const bpm = audioBuffer ? (estimateBpmFromBuffer(audioBuffer) ?? project.bpm) : project.bpm;
    if (audioBuffer) {
      const autoBpm = estimateBpmFromBuffer(audioBuffer);
      if (autoBpm) updateProject({ bpm: autoBpm });
    }
    const result = applyPresetToProject(project, preset, seedClips, bpm);
    setProject((cur) => ({
      ...cur,
      style: result.style,
      colorGrade: { ...cur.colorGrade, ...result.colorGrade },
      particles: result.particles,
      particleIntensity: result.particleIntensity,
      particleSpeed: particleSpeedForPreset(preset.id),
      clips: result.clips,
      textCues: result.textCues,
    }));
    setSelectedClipId(result.clips[0]?.id ?? null);
    seekTo(0);
    const total = result.clips.reduce((a, c) => a + c.duration, 0);
    setStatus(`Preset "${preset.label}" aplicado · ${result.clips.length} tomas · ${total.toFixed(1)}s · texto editable en 06 / Textos`);
    setError(null);
  }, [assets, audioBuffer, project, seekTo, updateProject]);

  const saveProjectFile = () => {
    const runtimeManifest = new Map(assets.map((asset) => [asset.id, manifestForRuntimeAsset(asset)]));
    const assetManifest = [
      ...expectedAssets.map((entry) => runtimeManifest.get(entry.id) ?? entry),
      ...assets.filter((asset) => !expectedAssets.some((entry) => entry.id === asset.id)).map(manifestForRuntimeAsset),
    ];
    const manifest: EditProjectDocument = {
      ...project,
      assets: assetManifest,
      sfxCues: sfxCues.map(({ customBuffer, ...cue }) => {
        void customBuffer;
        return cue;
      }),
      audio: audioFile ? { name: audioFile.name, size: audioFile.size, lastModified: audioFile.lastModified } : null,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9_-]+/gi, "_") || "edit"}.loop-edit.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const loadProjectFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as EditProjectDocument;
      if (parsed.version !== 1 || !Array.isArray(parsed.clips)) throw new Error("Proyecto incompatible");
      const fallback = createDefaultEditProject();
      const migratedClips = (parsed.clips as EditTimelineClip[]).map(normalizeEditClip);
      const nextProject: EditProject = {
        ...fallback,
        ...parsed,
        format: "9:16",
        clips: migratedClips,
        textCues: Array.isArray(parsed.textCues)
          ? parsed.textCues.map(normalizeEditTextCue)
          : [],
        colorGrade: { ...fallback.colorGrade, ...parsed.colorGrade },
        particleControls: { ...fallback.particleControls, ...parsed.particleControls },
        watermarkStyle: { ...fallback.watermarkStyle, ...parsed.watermarkStyle },
      };
      pausePreview();
      for (const asset of assetsRef.current) {
        URL.revokeObjectURL(asset.url);
        disposeClipFrameCache(asset.cache);
      }
      setAssets([]);
      const nextManifest = Array.isArray(parsed.assets) && parsed.assets.length
        ? parsed.assets
        : buildFallbackEditAssetManifest(migratedClips);
      setExpectedAssets(nextManifest);
      setSfxCues(Array.isArray(parsed.sfxCues) ? parsed.sfxCues : []);
      setProject(nextProject);
      setSelectedClipId(parsed.clips[0]?.id ?? null);
      timelineTimeRef.current = 0;
      setCurrentTime(0);
      setAssistDraft(null);
      setAssistSession(null);
      setAssistPhase("idle");
      setAssistPreviewMode("current");
      selectInspectorTab("media");
      setStatus(`Proyecto cargado · selecciona juntos los ${nextManifest.length} medios y se reconectarán por nombre.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el proyecto");
    }
  };

  const exportVideo = async () => {
    if (!project.clips.length || exporting) return;
    setError(null);
    setExporting(true);
    setExportProgress(0);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    try {
      const { exportEditStudioVideo } = await import("@/lib/editStudioExport");
      const blob = await exportEditStudioVideo({
        project,
        assets,
        audioBuffer,
        sfxCues,
        signal: controller.signal,
        onProgress: (ratio, stage) => {
          setExportProgress(ratio);
          setExportStage(stage);
        },
      });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^a-z0-9_-]+/gi, "_") || "edit"}_${project.format.replace(":", "x")}.mp4`;
      anchor.click();
      setStatus("Edit exportado y listo para publicar.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setExportStage("Exportación cancelada");
      } else {
        setError(cause instanceof Error ? cause.message : "Falló la exportación");
      }
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
    }
  };

  return (
    <div data-edit-studio-root className="relative left-1/2 flex w-[min(1760px,calc(100vw-1rem))] -translate-x-1/2 flex-col gap-3 pb-8 lg:-my-8 lg:h-[calc(100dvh-4rem)] lg:gap-0 lg:overflow-hidden lg:pb-0">
      <style>{EDIT_STUDIO_READABILITY_CSS}</style>
      {audioUrl && <audio ref={audioElementRef} src={audioUrl} preload="auto" />}

      <section className="relative shrink-0 overflow-hidden border-y border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-5 lg:min-h-20">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fuchsia-500 via-amber-300 to-cyan-400" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-fuchsia-700/10 blur-3xl" />
        <div className="flex h-full flex-col justify-center gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="shrink-0 text-2xl font-black tracking-tight text-white">EDIT <span className="text-zinc-600">STUDIO</span></h1>
            <span className="hidden h-5 w-px bg-zinc-800 sm:block" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-200 sm:truncate">De tus clips a un montaje profesional 9:16</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">Todo local · {assets.length} medios · {activeProject.clips.length} tomas · {formatTime(duration)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveProjectFile} className="min-h-10 border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-200 hover:border-zinc-500">Guardar</button>
            <label className="flex min-h-10 cursor-pointer items-center border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-200 hover:border-zinc-500">
              Abrir
              <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => void loadProjectFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      </section>

      {error && <div className="shrink-0 border border-red-800 bg-red-950/90 px-4 py-2 text-xs text-red-200">{error}</div>}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_440px] lg:overflow-hidden lg:bg-black/30 lg:p-3 xl:grid-cols-[minmax(0,1fr)_470px]">
        <section className="min-w-0 space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_250px] lg:gap-3 lg:space-y-0 lg:overflow-hidden">
          <div data-testid="edit-preview-stage" className="max-lg:sticky max-lg:top-16 max-lg:z-30 border border-zinc-800 bg-black p-3 shadow-2xl shadow-black/50 lg:flex lg:min-h-0 lg:flex-col">
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2">
              <input
                aria-label="Nombre del proyecto"
                value={activeProject.name}
                disabled={activeProjectReadOnly}
                onChange={(event) => updateProject({ name: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-black uppercase tracking-wider text-white outline-none"
              />
              <div className="flex items-center gap-2">
                {previewingAssistDraft && <span className="bg-amber-300 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase text-black">Vista borrador</span>}
                <span className="font-mono text-[10px] text-zinc-500">9:16 · {playbackProject.fps} FPS · {formatTime(playbackDuration)}</span>
              </div>
            </div>
            <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-950 lg:max-w-none">
              <canvas
                ref={canvasRef}
                data-testid="edit-preview-canvas"
                className="block h-auto w-full object-contain max-lg:max-h-[55dvh] max-lg:w-auto max-lg:max-w-full lg:h-full lg:w-auto lg:max-w-full"
              />
            </div>
            <div className="mt-2 flex shrink-0 items-center gap-3">
              <button type="button" onClick={togglePlayback} disabled={!playbackProject.clips.length} className="h-10 min-w-24 bg-white px-4 text-xs font-black text-black disabled:opacity-30">
                {isPlaying ? "❚❚ PAUSA" : "▶ PLAY"}
              </button>
              <input
                aria-label="Cabezal de Edit Studio"
                type="range"
                min="0"
                max={Math.max(0.01, playbackDuration)}
                step={1 / playbackProject.fps}
                value={Math.min(currentTime, Math.max(0, playbackDuration))}
                onChange={(event) => seekTo(Number(event.target.value))}
                className="min-w-0 flex-1 accent-fuchsia-500"
              />
              <span className="w-24 text-right font-mono text-[11px] text-zinc-400">{formatTime(currentTime)}</span>
            </div>
          </div>

          <section className="hidden" data-testid="edit-assist-panel-mobile">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-300 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-black">Nuevo</span>
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-100">Montaje asistido</h2>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
                  Analiza localmente energía, movimiento, nitidez, foco y ritmo. Propone preset, orden, tramos, encuadres y ventana musical en un borrador que puedes comparar antes de aplicarlo.
                </p>
              </div>
              {assistPhase === "idle" && (
                <button
                  type="button"
                  data-testid="edit-assist-start-mobile"
                  onClick={() => void startAssist()}
                  disabled={!assets.length || loadingMedia || exporting}
                  className="shrink-0 bg-amber-300 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  ✦ Crear borrador
                </button>
              )}
            </div>

            {assistPhase === "idle" && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800 pt-3 font-mono text-[8px] uppercase tracking-wide text-zinc-600">
                <span>{assets.length} medio{assets.length === 1 ? "" : "s"}</span>
                <span>{audioBuffer ? "Canción incluida" : "Sin canción · decidirá por imagen"}</span>
                <span>Sin nube · sin modificar la timeline</span>
              </div>
            )}

            {assistPhase === "analyzing" && (
              <div className="mt-4 border border-amber-300/20 bg-black/40 p-3" data-testid="edit-assist-progress-mobile">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-100">Creando borrador…</p>
                    <p className="mt-1 text-[9px] text-zinc-500">{assistProgressLabel}</p>
                  </div>
                  <button type="button" onClick={cancelAssistAnalysis} className="border border-zinc-700 px-2.5 py-1.5 text-[9px] font-bold text-zinc-300 hover:border-zinc-500">Cancelar</button>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden bg-zinc-800">
                  <div className="h-full bg-gradient-to-r from-amber-300 to-fuchsia-500 transition-[width]" style={{ width: `${Math.round(assistProgress * 100)}%` }} />
                </div>
                <p className="mt-2 font-mono text-[8px] text-zinc-600">{Math.round(assistProgress * 100)}% · el proyecto actual permanece intacto</p>
              </div>
            )}

            {assistPhase === "review" && assistDraft && assistSession && (
              <div className="mt-4 space-y-3" data-testid="edit-assist-review-mobile">
                {assistDraftStale && (
                  <div className="border border-red-800 bg-red-950/40 px-3 py-2 text-[10px] text-red-200" data-testid="edit-assist-stale-mobile">
                    El proyecto, los medios o la canción cambiaron. Descarta este borrador y genera uno nuevo.
                  </div>
                )}
                <div className="grid gap-3 border border-amber-300/20 bg-black/45 p-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black uppercase tracking-wider text-white">{assistDraft.presetLabel}</span>
                      <span className="bg-fuchsia-600 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase text-white">
                        {assistDraft.confidence === "high" ? "Confianza alta" : assistDraft.confidence === "medium" ? "Confianza media" : "Confianza baja"}
                      </span>
                      {assistDraft.presetId === assistSession.ranking.selected.presetId && <span className="font-mono text-[8px] uppercase text-amber-300">Recomendado</span>}
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-zinc-500">
                      {assistDraft.project.clips.length} tomas · {formatTime(editTimelineDuration(assistDraft.project.clips))} · {assistDraft.uniqueAssetCount} medios únicos · encaje {Math.round(assistDraft.score * 100)}%
                    </p>
                    <ul className="mt-3 space-y-1 text-[9px] leading-relaxed text-zinc-400">
                      {assistDraft.reasons.slice(0, 3).map((reason) => <li key={reason}>• {reason}</li>)}
                    </ul>
                  </div>
                  <div className="space-y-2 text-[9px] text-zinc-500">
                    <label className="block">Estructura
                      <select
                        data-testid="edit-assist-preset-mobile"
                        value={assistDraft.presetId}
                        disabled={assistDraftStale}
                        onChange={(event) => selectAssistPreset(event.target.value as PresetId)}
                        className="mt-1 w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200 disabled:opacity-40"
                      >
                        {assistSession.ranking.ranked.map((entry) => (
                          <option key={entry.presetId} value={entry.presetId}>{entry.label} · {Math.round(entry.score * 100)}%</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">Inicio de canción
                      <input
                        data-testid="edit-assist-music-start-mobile"
                        type="number"
                        min="0"
                        max={Math.max(0, assistSession.audioDuration - editTimelineDuration(assistDraft.project.clips))}
                        step="0.05"
                        value={assistDraft.project.musicStart}
                        disabled={!assistSession.audioBuffer || assistDraftStale}
                        onChange={(event) => updateAssistMusicStart(Number(event.target.value))}
                        className="mt-1 w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-zinc-200 disabled:opacity-40"
                      />
                    </label>
                  </div>
                </div>

                {assistDraft.warnings.length > 0 && (
                  <details className="border border-amber-900/60 bg-amber-950/15 px-3 py-2">
                    <summary className="cursor-pointer text-[9px] font-bold text-amber-200">{assistDraft.warnings.length} aviso{assistDraft.warnings.length === 1 ? "" : "s"} para revisar</summary>
                    <ul className="mt-2 space-y-1 text-[9px] text-amber-100/65">
                      {assistDraft.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                    </ul>
                  </details>
                )}

                <div className="flex flex-col justify-between gap-3 border-t border-zinc-800 pt-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-1 border border-zinc-800 bg-black p-1">
                    <button type="button" data-testid="edit-assist-preview-current-mobile" onClick={() => switchAssistPreview("current")} className={`px-3 py-1.5 text-[9px] font-black uppercase ${assistPreviewMode === "current" || assistDraftStale ? "bg-zinc-200 text-black" : "text-zinc-500"}`}>Actual</button>
                    <button type="button" data-testid="edit-assist-preview-draft-mobile" disabled={assistDraftStale} onClick={() => switchAssistPreview("draft")} className={`px-3 py-1.5 text-[9px] font-black uppercase disabled:opacity-30 ${assistPreviewMode === "draft" && !assistDraftStale ? "bg-amber-300 text-black" : "text-zinc-500"}`}>Borrador</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-testid="edit-assist-discard-mobile" onClick={discardAssistDraft} className="border border-zinc-700 px-3 py-2 text-[9px] font-bold text-zinc-300 hover:border-zinc-500">Descartar</button>
                    <button type="button" data-testid="edit-assist-accept-mobile" disabled={assistDraftStale} onClick={acceptAssistDraft} className="bg-white px-4 py-2 text-[9px] font-black uppercase tracking-wider text-black disabled:opacity-30">Aplicar montaje</button>
                  </div>
                </div>
                <p className="font-mono text-[8px] text-zinc-600">Los textos existentes se conservan. Los SFX sugeridos viven solo en el borrador hasta aplicar.</p>
              </div>
            )}
          </section>

          <section className="hidden">
            <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200">Montajes dirigidos</h2>
                <p className="mt-1 text-[10px] text-zinc-500">Cada opción replica una gramática real de los ejemplos: elige por ritmo, no por anime.</p>
              </div>
              <span className="font-mono text-[9px] text-zinc-600">BPM detectado · todo queda editable</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {EDIT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  data-testid={`edit-preset-mobile-${preset.id}`}
                  className="group border border-zinc-800 bg-black p-3 text-left transition hover:border-fuchsia-700 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg" aria-hidden="true">{preset.icon}</span>
                    <span className="bg-fuchsia-600 px-1.5 py-0.5 font-mono text-[9px] font-black text-white">{preset.targetDuration.toFixed(preset.targetDuration % 1 ? 1 : 0)} s</span>
                  </div>
                  <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-white group-hover:text-fuchsia-200">{preset.label}</div>
                  <div className="mt-1 text-[10px] leading-snug text-zinc-400">{preset.desc}</div>
                  <div className="mt-3 flex h-4 items-end gap-px" aria-hidden="true">
                    {preset.pattern.slice(0, 22).map((beatLength, index) => (
                      <span key={`${preset.id}-${index}`} className="min-w-px bg-fuchsia-400/55 transition group-hover:bg-fuchsia-300" style={{ flexGrow: beatLength, height: `${Math.min(100, 35 + beatLength * 22)}%` }} />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-wide text-zinc-500">
                    <span>{preset.assetHint}</span>
                    <span className="text-zinc-300">{preset.pace}</span>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-zinc-500">Importa los planos en el orden narrativo. El preset puede repetir un medio si necesita más cortes; después arrastra la timeline y corrige el foco de cada toma.</p>
          </section>

          <section className="min-h-0 overflow-hidden border border-zinc-800 bg-zinc-950 lg:flex lg:flex-col">
            <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-800 px-3 py-2">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 data-testid="edit-timeline-heading" className="text-xs font-black uppercase tracking-[0.16em] text-zinc-200">Timeline y ritmo</h2>
                  <p className="mt-1 text-[10px] text-zinc-500">Arrastra para ordenar. Selecciona una toma para corregir su encuadre.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="flex items-center gap-1 border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-400">
                    BPM
                    <input type="number" min="30" max="240" value={activeProject.bpm} disabled={activeProjectReadOnly} onChange={(event) => updateProject({ bpm: Math.max(30, Math.min(240, Number(event.target.value) || 120)) })} className="w-14 bg-transparent font-mono text-white outline-none disabled:opacity-40" />
                  </label>
                  <button type="button" disabled={!audioBuffer || bpmDetecting} onClick={() => void handleDetectBpm()} className="border border-cyan-700 bg-cyan-950/60 px-2 py-1 text-[10px] font-bold text-cyan-200 disabled:opacity-40">{bpmDetecting ? "Detectando…" : "🎵 Detectar BPM"}</button>
                </div>
              </div>
              <details className="border-t border-zinc-900 pt-2">
                <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-zinc-400">Ajustar ritmo manualmente</summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[9px] font-bold text-zinc-400">Ritmo</span>
                  <button type="button" disabled={activeProjectReadOnly} onClick={() => applyRhythm("reference")} className="border border-fuchsia-800 bg-fuchsia-950/50 px-3 py-1.5 text-[10px] font-bold text-fuchsia-200 disabled:opacity-35">Referencia 18 s</button>
                  <button type="button" disabled={activeProjectReadOnly} onClick={() => applyRhythm("build-drop")} className="border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-[10px] font-bold text-amber-200 disabled:opacity-35">Build → drop</button>
                  <button type="button" disabled={activeProjectReadOnly} onClick={() => applyRhythm("steady")} className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[10px] font-bold text-zinc-300 disabled:opacity-35">Constante</button>
                  {activeProject.clips.length > 1 && (
                    <label className="ml-auto flex items-center gap-2 text-[9px] text-zinc-500">Energía <span className="font-mono text-zinc-200">{avgIntensity}%</span>
                      <input type="range" min="0" max="100" value={avgIntensity} disabled={activeProjectReadOnly} onChange={(event) => {
                        const value = Number(event.target.value);
                        replaceActiveProject((current) => ({ ...current, clips: current.clips.map((clip) => normalizeEditClip({ ...clip, motionIntensity: value })) }));
                      }} className="w-24 accent-fuchsia-500 disabled:opacity-35" />
                    </label>
                  )}
                </div>
              </details>
            </div>
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-black/70">
              <div
                className="relative min-h-36 min-w-full"
                style={{ width: Math.max(720, duration * pxPerSecond) }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  seekTo((event.clientX - rect.left) / pxPerSecond);
                }}
              >
                {/* Waveform detrás de beat markers */}
                {waveformPeaks && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex h-6 items-end gap-px overflow-hidden opacity-45" style={{ width: duration * pxPerSecond }}>
                    {waveformPeaks.map((peak, idx) => (
                      <div key={idx} className="shrink-0 bg-fuchsia-400/55" style={{ width: Math.max(1, (duration * pxPerSecond) / waveformPeaks.length - 0.5), height: Math.max(1, peak * 22) }} />
                    ))}
                  </div>
                )}
                {beatMarkers.map((time, index) => {
                  const isBar = index % 4 === 0;
                  return (
                    <div key={`${time}-${index}`} className={`pointer-events-none absolute inset-y-0 border-l ${isBar ? "border-cyan-400/28" : "border-cyan-400/12"}`} style={{ left: time * pxPerSecond }}>
                      <span className={`absolute left-1 top-1 font-mono text-[8px] ${isBar ? "text-cyan-200/70 font-bold" : "text-cyan-300/35"}`}>{index + 1}</span>
                    </div>
                  );
                })}
                <div className="absolute left-0 right-0 top-8 flex h-28">
                  {activeProject.clips.map((clip, index) => (
                    <TimelineClipBlock
                      key={clip.id}
                      clip={clip}
                      asset={assets.find((asset) => asset.id === clip.assetId) ?? null}
                      index={index}
                      selected={clip.id === selectedClipId}
                      pxPerSecond={pxPerSecond}
                      onSelect={() => {
                        setSelectedClipId(clip.id);
                        selectInspectorTab("clip");
                        seekTo(placements[index]?.start ?? 0);
                      }}
                      onDropClip={reorderClips}
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-fuchsia-400 shadow-[0_0_10px_#e879f9]" style={{ left: currentTime * pxPerSecond }} />
              </div>
            </div>
          </section>

        </section>

        <aside className="min-h-0 overflow-hidden border border-zinc-700/80 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.32)] lg:flex lg:flex-col">
          <nav aria-label="Inspector de Edit Studio" className="grid shrink-0 grid-cols-4 gap-1 border-b border-zinc-800 bg-black/80 p-1.5">
            {EDIT_INSPECTOR_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectInspectorTab(tab.id)}
                aria-current={inspectorTab === tab.id ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-start justify-center border px-2.5 py-2 text-left uppercase transition-colors ${inspectorTab === tab.id ? tab.activeClassName : tab.idleClassName}`}
              >
                <span className="flex items-center gap-2 text-[9px] font-black tracking-wide">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tab.markerClassName}`} />
                  <span>{tab.label}{tab.id === "clip" && selectedClip ? " · 1" : ""}</span>
                </span>
                <span aria-hidden="true" className="mt-0.5 pl-3.5 font-mono text-[8px] font-semibold tracking-[0.14em] opacity-55">Paso {tab.step}</span>
              </button>
            ))}
          </nav>
          <div ref={inspectorScrollRef} data-testid="edit-inspector-scroll" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,rgba(24,24,27,0.55),rgba(9,9,11,0)_240px)] p-4">
            {activeProjectReadOnly && (
              <div className="border border-zinc-700 bg-black px-3 py-2 text-[9px] text-zinc-400">
                <strong className="text-zinc-200">Actual está en solo lectura.</strong> Cambia a <button type="button" onClick={() => switchAssistPreview("draft")} className="font-black text-amber-300 underline">Borrador</button> para ajustar timeline, toma, look y SFX sin tocar el proyecto guardado.
              </div>
            )}
            <section className={`${inspectorTab === "montage" ? "block" : "hidden"} space-y-3`} data-testid="edit-assist-panel">
              <div className="border border-amber-300/35 bg-gradient-to-br from-amber-300/10 via-zinc-950 to-fuchsia-950/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-[8px] font-black uppercase tracking-wider text-amber-300">Recomendado</span>
                    <h2 className="mt-1 text-sm font-black text-white">Crear montaje profesional</h2>
                    <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Analiza tus planos y la canción, elige los mejores tramos y prepara un borrador que puedes comparar antes de aplicarlo.</p>
                  </div>
                  {assistPhase === "idle" && assets.length > 0 && (
                    <button type="button" data-testid="edit-assist-start" onClick={() => void startAssist()} disabled={loadingMedia || exporting} className="min-h-11 shrink-0 bg-amber-300 px-4 py-2 text-[9px] font-black text-black transition hover:bg-amber-200 disabled:opacity-35">✦ Crear</button>
                  )}
                  {assistPhase === "idle" && assets.length === 0 && (
                    <button type="button" onClick={() => selectInspectorTab("media")} className="min-h-11 shrink-0 border border-amber-300/50 px-3 py-2 text-[9px] font-black text-amber-200 hover:bg-amber-300/10">Importar</button>
                  )}
                </div>
                {assistPhase === "idle" && (
                  <div className="mt-4 grid grid-cols-3 gap-px bg-zinc-800 text-[8px] text-zinc-500">
                    <span className="bg-black p-2.5"><strong className={assets.length ? "text-emerald-300" : "text-amber-300"}>1 · {assets.length ? "Listo" : "Pendiente"}</strong><span className="mt-1 block">{assets.length || 0} medios</span></span>
                    <span className="bg-black p-2.5"><strong className={audioBuffer ? "text-emerald-300" : "text-zinc-300"}>2 · {audioBuffer ? "Lista" : "Opcional"}</strong><span className="mt-1 block">Canción</span></span>
                    <span className="bg-black p-2.5"><strong className="text-cyan-300">3 · Local</strong><span className="mt-1 block">Sin subir nada</span></span>
                  </div>
                )}
                {assistPhase === "analyzing" && (
                  <div className="mt-3 border border-amber-300/20 bg-black/45 p-3" data-testid="edit-assist-progress">
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="text-[9px] font-black uppercase text-amber-100">Analizando {Math.round(assistProgress * 100)}%</p><p className="mt-1 text-[8px] text-zinc-500">{assistProgressLabel}</p></div>
                      <button type="button" onClick={cancelAssistAnalysis} className="border border-zinc-700 px-2 py-1 text-[8px] font-bold text-zinc-300">Cancelar</button>
                    </div>
                    <div className="mt-3 h-1.5 bg-zinc-800"><div className="h-full bg-gradient-to-r from-amber-300 to-fuchsia-500" style={{ width: `${assistProgress * 100}%` }} /></div>
                  </div>
                )}
                {assistPhase === "review" && assistDraft && assistSession && (
                  <div className="mt-3 space-y-3" data-testid="edit-assist-review">
                    {assistDraftStale && <div data-testid="edit-assist-stale" className="border border-red-800 bg-red-950/50 p-2 text-[9px] text-red-200">El proyecto cambió durante la revisión. Descarta y genera de nuevo.</div>}
                    <div className="border border-amber-300/20 bg-black/45 p-3">
                      <div className="flex flex-wrap items-center gap-2"><strong className="text-[11px] uppercase text-white">{assistDraft.presetLabel}</strong><span className="bg-fuchsia-600 px-1.5 py-0.5 font-mono text-[7px] font-black uppercase text-white">{Math.round(assistDraft.score * 100)}% encaje</span></div>
                      <p className="mt-1 font-mono text-[8px] text-zinc-500">{assistDraft.project.clips.length} tomas · {formatTime(editTimelineDuration(assistDraft.project.clips))} · {assistDraft.sfxCues.length - assistSession.baseSfxCues.length} SFX sugeridos</p>
                      <ul className="mt-3 space-y-1 text-[9px] leading-relaxed text-zinc-400">
                        {assistDraft.reasons.slice(0, 2).map((reason) => <li key={reason}>• {reason}</li>)}
                      </ul>
                      <label className="mt-3 block text-[8px] uppercase text-zinc-500">Estructura
                        <select data-testid="edit-assist-preset" value={assistDraft.presetId} disabled={assistDraftStale} onChange={(event) => selectAssistPreset(event.target.value as PresetId)} className="mt-1 w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[9px] normal-case text-zinc-200 disabled:opacity-40">
                          {assistSession.ranking.ranked.map((entry) => <option key={entry.presetId} value={entry.presetId}>{entry.label} · {Math.round(entry.score * 100)}%</option>)}
                        </select>
                      </label>
                      <label className="mt-2 block text-[8px] uppercase text-zinc-500">Inicio de canción
                        <input data-testid="edit-assist-music-start" type="number" min="0" max={Math.max(0, assistSession.audioDuration - editTimelineDuration(assistDraft.project.clips))} step="0.05" value={assistDraft.project.musicStart} disabled={!assistSession.audioBuffer || assistDraftStale} onChange={(event) => updateAssistMusicStart(Number(event.target.value))} className="mt-1 w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[9px] text-zinc-200 disabled:opacity-40" />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1 border border-zinc-800 bg-black p-1">
                      <button type="button" data-testid="edit-assist-preview-current" onClick={() => switchAssistPreview("current")} className={`px-2 py-2 text-[8px] font-black uppercase ${assistPreviewMode === "current" || assistDraftStale ? "bg-zinc-200 text-black" : "text-zinc-500"}`}>Actual · solo lectura</button>
                      <button type="button" data-testid="edit-assist-preview-draft" disabled={assistDraftStale} onClick={() => switchAssistPreview("draft")} className={`px-2 py-2 text-[8px] font-black uppercase disabled:opacity-30 ${assistPreviewMode === "draft" && !assistDraftStale ? "bg-amber-300 text-black" : "text-zinc-500"}`}>Borrador · editable</button>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" data-testid="edit-assist-discard" onClick={discardAssistDraft} className="flex-1 border border-zinc-700 px-3 py-2 text-[9px] font-bold text-zinc-300">Descartar</button>
                      <button type="button" data-testid="edit-assist-accept" disabled={assistDraftStale} onClick={acceptAssistDraft} className="flex-1 bg-white px-3 py-2 text-[9px] font-black uppercase text-black disabled:opacity-30">Aplicar montaje</button>
                    </div>
                    {assistDraft.warnings.length > 0 && <details className="border border-amber-900/50 p-2"><summary className="cursor-pointer text-[8px] font-bold text-amber-200">{assistDraft.warnings.length} avisos para revisar</summary><ul className="mt-2 space-y-1 text-[8px] text-zinc-500">{assistDraft.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></details>}
                  </div>
                )}
              </div>

              <div className="border border-cyan-900/70 bg-cyan-950/10 p-3">
                <h2 className="text-xs font-black text-cyan-100">Dosificar efectos en un clic</h2>
                <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">Conserva el montaje y reparte movimiento y transiciones solo donde aportan.</p>
                <div className="mt-3 space-y-2">
                  {EDIT_PROFESSIONAL_GRAMMARS.map((grammar) => (
                    <button
                      key={grammar.id}
                      type="button"
                      data-testid={`edit-grammar-${grammar.id}`}
                      disabled={!activeProject.clips.length || activeProjectReadOnly}
                      onClick={() => applyProfessionalGrammar(grammar.id)}
                      className="group w-full border border-zinc-700 bg-black p-3 text-left transition hover:border-cyan-500 hover:bg-cyan-950/20 disabled:opacity-35"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-black text-zinc-100">{grammar.label}</span>
                        <span className="font-mono text-[8px] uppercase text-cyan-300">{grammar.accent}</span>
                      </span>
                      <span className="mt-1 block text-[9px] leading-relaxed text-zinc-500">{grammar.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <details className="border border-zinc-800 bg-zinc-950 p-3">
                <summary className="cursor-pointer text-[10px] font-black text-fuchsia-200">Elegir una estructura manualmente</summary>
                <p className="mt-2 text-[9px] leading-relaxed text-zinc-500">Usa una de las seis estructuras medidas en tus vídeos de referencia. Reemplaza la timeline, pero después todo sigue editable.</p>
                <div className="mt-3 grid gap-2">
                  {EDIT_PRESETS.map((preset) => (
                    <button key={preset.id} type="button" disabled={assistPhase !== "idle"} onClick={() => applyPreset(preset.id)} data-testid={`edit-preset-${preset.id}`} className="group border border-zinc-800 bg-black p-3 text-left hover:border-fuchsia-700 disabled:opacity-35">
                      <span className="flex items-start gap-3">
                        <span className="text-lg" aria-hidden="true">{preset.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2"><strong className="text-[10px] text-zinc-100">{preset.label}</strong><span className="shrink-0 font-mono text-[8px] text-fuchsia-300">{preset.targetDuration.toFixed(1)} s</span></span>
                          <span className="mt-1 block text-[9px] leading-relaxed text-zinc-500">{preset.desc}</span>
                          <span className="mt-2 block font-mono text-[8px] uppercase text-zinc-500">{preset.pace} · {preset.assetHint}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            </section>
          <section className={`${inspectorTab === "media" ? "block" : "hidden"} border border-sky-900/60 bg-gradient-to-br from-sky-950/25 via-zinc-950 to-zinc-950 p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-sky-100">01 / Medios</h2>
              <div className="flex items-center gap-1.5">
                <label className={`flex min-h-10 cursor-pointer items-center border border-zinc-700 px-3 py-2 text-[10px] font-black text-zinc-300 ${loadingMedia ? "pointer-events-none opacity-50" : "hover:border-zinc-500 hover:text-white"}`}>
                  + Carpeta
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={(element) => {
                      if (!element) return;
                      element.setAttribute("webkitdirectory", "");
                      element.setAttribute("directory", "");
                    }}
                    onChange={(event) => {
                      const media = Array.from(event.target.files ?? []).filter(isEditableMediaFile);
                      event.target.value = "";
                      if (media.length) void handleMediaFiles(media);
                    }}
                  />
                </label>
                <label className={`flex min-h-10 cursor-pointer items-center bg-sky-500 px-3 py-2 text-[10px] font-black text-sky-950 ${loadingMedia ? "pointer-events-none opacity-50" : "hover:bg-sky-400"}`}>
                  {loadingMedia ? "Preparando…" : missingAssetIds.size ? `Reconectar ${missingAssetIds.size}` : "+ Importar"}
                  <input type="file" multiple accept="video/*,image/*" className="hidden" onChange={(event) => void handleMediaFiles(event.target.files)} />
                </label>
              </div>
            </div>
            <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
              {assets.length === 0 && missingAssetIds.size === 0 && <div className="border border-dashed border-sky-800/70 bg-sky-950/15 px-4 py-7 text-center"><p className="font-bold text-sky-100">Importa todos tus planos juntos</p><p className="mt-2 text-[10px] leading-relaxed text-zinc-400">Puedes elegir vídeos, imágenes o una carpeta completa. MP4, MOV, WebM, JPG y PNG.</p></div>}
              {expectedAssets.filter((asset) => missingAssetIds.has(asset.id)).map((asset) => (
                <div key={`missing-${asset.id}`} className="flex items-center gap-2 border border-red-900/60 bg-red-950/15 p-2">
                  <span className="text-base text-red-300">○</span>
                  <div className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-zinc-300">{asset.name}</span><span className="font-mono text-[8px] uppercase text-red-300/70">Pendiente · se conserva su ID y montaje</span></div>
                  <button type="button" aria-label={`Quitar ${asset.name}`} title="Quitar de medios (borra también sus tomas)" onClick={() => removeAsset(asset.id)} className="px-1 text-xs text-zinc-600 hover:text-red-400">×</button>
                </div>
              ))}
              {assets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 border border-zinc-800 bg-black/40 p-2">
                  <span className="text-lg">{asset.kind === "video" ? "🎞️" : "🖼️"}</span>
                  <button type="button" onClick={() => appendAssetAsClip(asset)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[10px] font-bold text-zinc-200">{asset.name}</span>
                    <span className="font-mono text-[9px] text-zinc-600">{asset.width}×{asset.height}{asset.kind === "video" ? ` · ${asset.duration.toFixed(1)}s` : ""}</span>
                  </button>
                  <button type="button" onClick={() => removeAsset(asset.id)} className="px-1 text-xs text-zinc-600 hover:text-red-400">×</button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-zinc-600">Consejo: importa en orden narrativo. Los proyectos guardados reconectan los archivos por nombre sin perder el montaje.</p>
          </section>

          <section className={`${inspectorTab === "media" ? "block" : "hidden"} border border-sky-900/45 bg-zinc-950 p-4`}>
            <h2 className="text-xs font-black uppercase tracking-wider text-sky-100">02 / Música</h2>
            <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">La canción permite detectar BPM, golpes y el mejor tramo. También puedes montar solo con imagen.</p>
            <label className="mt-3 block min-h-11 cursor-pointer border border-dashed border-zinc-700 bg-black/30 px-3 py-3 text-center text-[10px] font-bold text-zinc-300 hover:border-zinc-500">
              {audioFile ? audioFile.name : "Seleccionar canción"}
              <input type="file" accept="audio/*" className="hidden" onChange={(event) => void handleAudioFile(event.target.files?.[0] ?? null)} />
            </label>
            {audioBuffer && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[9px] text-zinc-500">Inicio canción
                  <input type="number" min="0" max={audioBuffer.duration} step="0.1" value={activeProject.musicStart} disabled={activeProjectReadOnly} onChange={(event) => updateProject({ musicStart: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200 disabled:opacity-40" />
                </label>
                <label className="text-[9px] text-zinc-500">Volumen {Math.round(activeProject.musicVolume * 100)}%
                  <input type="range" min="0" max="120" value={Math.round(activeProject.musicVolume * 100)} disabled={activeProjectReadOnly} onChange={(event) => updateProject({ musicVolume: Number(event.target.value) / 100 })} className="mt-2 w-full accent-fuchsia-500 disabled:opacity-40" />
                </label>
              </div>
            )}
          </section>

          {selectedClip && (
            <section className={`${inspectorTab === "clip" ? "block" : "hidden"} ${activeProjectReadOnly ? "pointer-events-none opacity-60" : ""} border border-fuchsia-900/60 bg-fuchsia-950/10 p-3`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-xs font-black uppercase tracking-wider text-fuchsia-200">03 / Toma seleccionada</h2>
                {selectedAsset
                  ? <span className="font-mono text-[9px] text-zinc-600">{selectedAsset.kind}</span>
                  : <button type="button" onClick={() => selectInspectorTab("media")} className="pointer-events-auto font-mono text-[9px] font-bold text-red-300 underline">Reconectar</button>}
              </div>
              <input value={selectedClip.label} onChange={(event) => updateClip(selectedClip.id, { label: event.target.value })} className="mt-3 w-full border-b border-zinc-700 bg-transparent py-1 text-xs font-bold text-white outline-none" aria-label="Nombre de toma" />
              <div className="mt-3 border border-zinc-800 bg-black/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-zinc-300">Encuadre del plano</p>
                  <button type="button" onClick={() => updateClip(selectedClip.id, { framingX: 0, framingY: 0, framingScale: 1 })} className="text-[8px] font-bold text-zinc-500 hover:text-white">Centrar</button>
                </div>
                <div className="mt-2 grid gap-2 text-[9px] text-zinc-500">
                  <label>Foco horizontal <span className="float-right font-mono text-zinc-300">{selectedClip.framingX}</span>
                    <input aria-label="Foco horizontal" type="range" min="-100" max="100" value={selectedClip.framingX} onChange={(event) => updateClip(selectedClip.id, { framingX: Number(event.target.value) })} className="mt-1 w-full accent-cyan-400" />
                  </label>
                  <label>Foco vertical <span className="float-right font-mono text-zinc-300">{selectedClip.framingY}</span>
                    <input aria-label="Foco vertical" type="range" min="-100" max="100" value={selectedClip.framingY} onChange={(event) => updateClip(selectedClip.id, { framingY: Number(event.target.value) })} className="mt-1 w-full accent-cyan-400" />
                  </label>
                  <label>Zoom base <span className="float-right font-mono text-zinc-300">{Math.round(selectedClip.framingScale * 100)}%</span>
                    <input aria-label="Zoom de encuadre" type="range" min="100" max="140" value={Math.round(selectedClip.framingScale * 100)} onChange={(event) => updateClip(selectedClip.id, { framingScale: Number(event.target.value) / 100 })} className="mt-1 w-full accent-cyan-400" />
                  </label>
                </div>
                <p className="mt-2 text-[8px] leading-relaxed text-zinc-600">Mueve el foco hacia la cara o la viñeta; el recorte mantiene 9:16 sin deformar.</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border border-zinc-800 bg-black/40 p-2.5 text-[9px] text-zinc-500">
                <label>Duración final
                  <input aria-label="Duración de toma" type="number" min="0.25" max="30" step="0.05" value={selectedClip.duration} onChange={(event) => {
                    const nextDuration = Math.max(0.25, Number(event.target.value) || 0.25);
                    const available = selectedAsset?.kind === "video"
                      ? Math.max(0.05, selectedAsset.duration - selectedClip.sourceStart)
                      : selectedClip.sourceDuration;
                    updateClip(selectedClip.id, {
                      duration: nextDuration,
                      sourceDuration: Math.min(available, nextDuration * selectedClip.playbackRate),
                    });
                  }} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                </label>
                <label>Velocidad real <span className="float-right font-mono text-fuchsia-300">{selectedClip.playbackRate.toFixed(2)}×</span>
                  <input aria-label="Velocidad de toma" type="range" min="0.5" max="2" step="0.05" value={selectedClip.playbackRate} onChange={(event) => {
                    const nextRate = Number(event.target.value);
                    const available = selectedAsset?.kind === "video"
                      ? Math.max(0.05, selectedAsset.duration - selectedClip.sourceStart)
                      : selectedClip.sourceDuration;
                    updateClip(selectedClip.id, {
                      playbackRate: nextRate,
                      sourceDuration: Math.min(available, selectedClip.duration * nextRate),
                    });
                  }} className="mt-2 w-full accent-fuchsia-500" />
                </label>
                <label className="col-span-2">Energía de cámara <span className="float-right font-mono text-cyan-300">{selectedClip.motionIntensity}%</span>
                  <input type="range" min="0" max="100" value={selectedClip.motionIntensity} onChange={(event) => updateClip(selectedClip.id, { motionIntensity: Number(event.target.value) })} className="mt-1 w-full accent-cyan-400" />
                </label>
              </div>

              <details className="mt-3 border border-zinc-800 bg-zinc-950/60 p-2.5">
                <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wider text-zinc-400">Transición, cámara y fuente</summary>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {EDIT_TRANSITIONS.map((tr) => (
                    <button key={tr.id} type="button" onClick={() => updateClip(selectedClip.id, { transition: tr.id })} className={`border px-2 py-1.5 text-left text-[10px] leading-tight ${selectedClip.transition === tr.id ? "border-fuchsia-500 bg-fuchsia-600 text-white" : "border-zinc-700 bg-black text-zinc-300 hover:border-zinc-500"}`}>
                      <span className="block font-bold">{tr.label}</span><span className="text-[8px] opacity-70">{tr.desc}</span>
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-[9px] text-zinc-500">Duración transición
                  <input type="range" min="0" max="0.6" step="0.02" value={selectedClip.transitionDuration} onChange={(event) => updateClip(selectedClip.id, { transitionDuration: Number(event.target.value) })} className="mt-1 w-full accent-fuchsia-500" />
                  <span className="float-right font-mono text-zinc-300">{selectedClip.transitionDuration.toFixed(2)}s</span>
                </label>
                <label className="mt-3 block text-[9px] text-zinc-500">Fuerza de transición <span className="float-right font-mono text-fuchsia-300">{selectedClip.transitionIntensity}%</span>
                  <input aria-label="Fuerza de transición" type="range" min="0" max="100" value={selectedClip.transitionIntensity} onChange={(event) => updateClip(selectedClip.id, { transitionIntensity: Number(event.target.value) })} className="mt-1 w-full accent-fuchsia-500" />
                </label>
                <label className="mt-2 block text-[9px] text-zinc-500">Dirección
                  <select value={selectedClip.transitionDirection} onChange={(event) => updateClip(selectedClip.id, { transitionDirection: event.target.value as EditTimelineClip["transitionDirection"] })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200">
                    <option value="auto">Automática según foco</option><option value="left">Izquierda</option><option value="right">Derecha</option><option value="up">Arriba</option><option value="down">Abajo</option>
                  </select>
                </label>
                <p className="mt-4 text-[9px] font-black uppercase tracking-wider text-zinc-400">Movimiento del plano</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {EDIT_MOTIONS.map((mo) => (
                    <button key={mo.id} type="button" onClick={() => updateClip(selectedClip.id, { motion: mo.id })} className={`border px-1 py-1.5 text-[9px] font-bold ${selectedClip.motion === mo.id ? "border-cyan-400 bg-cyan-600 text-white" : "border-zinc-700 bg-black text-zinc-400 hover:border-zinc-500"}`}>{mo.label}</button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
                  <label>Fuente desde
                    <input type="number" min="0" max={selectedAsset?.duration ?? 30} step="0.05" value={selectedClip.sourceStart} onChange={(event) => updateClip(selectedClip.id, { sourceStart: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                  </label>
                  <label>Tramo disponible
                    <input type="number" min="0.05" max={selectedAsset?.duration ?? 30} step="0.05" value={selectedClip.sourceDuration} onChange={(event) => updateClip(selectedClip.id, { sourceDuration: Math.max(0.05, Number(event.target.value) || 0.05) })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 font-mono text-zinc-200" />
                  </label>
                  <label>Curva de velocidad
                    <select value={selectedClip.velocityCurve} onChange={(event) => updateClip(selectedClip.id, { velocityCurve: event.target.value as EditTimelineClip["velocityCurve"] })} className="mt-1 w-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200">
                      <option value="linear">Lineal</option><option value="easeIn">Acelera</option><option value="easeOut">Frena</option><option value="punch">Golpe y asienta</option>
                    </select>
                  </label>
                  <label>Look de esta toma
                    <select value={selectedClip.style} onChange={(event) => updateClip(selectedClip.id, { style: event.target.value as EditTimelineClip["style"] })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200">
                      <option value="inherit">Usar look global</option>{EDIT_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                    </select>
                  </label>
                </div>
              </details>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => updateClip(selectedClip.id, { duration: snapEditTime(selectedClip.duration, activeProject.bpm, 2) })} className="border border-zinc-700 px-2 py-1 text-[9px] font-bold text-zinc-300">Imán ½ beat</button>
                <button type="button" onClick={() => {
                  const clone = { ...selectedClip, id: uid("clip"), label: `${selectedClip.label} copia` };
                  replaceActiveProject((current) => ({ ...current, clips: [...current.clips, clone] }));
                  setSelectedClipId(clone.id);
                }} className="border border-zinc-700 px-2 py-1 text-[9px] font-bold text-zinc-300">Duplicar</button>
                <button type="button" onClick={() => {
                  replaceActiveProject((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== selectedClip.id) }));
                  setSelectedClipId(null);
                }} className="border border-red-900 px-2 py-1 text-[9px] font-bold text-red-300">Eliminar</button>
              </div>
            </section>
          )}

          {!selectedClip && (
            <section className={`${inspectorTab === "clip" ? "block" : "hidden"} border border-dashed border-fuchsia-800/70 bg-fuchsia-950/10 px-5 py-10 text-center`}>
              <span aria-hidden="true" className="mx-auto mb-4 block h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_16px_rgba(232,121,249,0.8)]" />
              <h2 className="text-sm font-black text-fuchsia-100">Selecciona una toma</h2>
              <p className="mx-auto mt-2 max-w-xs text-[10px] leading-relaxed text-zinc-400">Haz clic en un clip de la timeline para ajustar su encuadre, velocidad, transición y movimiento.</p>
            </section>
          )}

          <section className={`${inspectorTab === "finish" ? "block" : "hidden"} ${activeProjectReadOnly ? "pointer-events-none opacity-60" : ""} border border-emerald-800/60 bg-gradient-to-br from-emerald-950/25 via-zinc-950 to-cyan-950/10 p-4`} data-testid="edit-professional-finish">
            <div>
              <span className="font-mono text-[8px] font-black uppercase tracking-wider text-emerald-300">Capa de acabado global</span>
              <h2 className="mt-1 text-sm font-black text-white">Unificar el look</h2>
              <p className="mt-2 text-[9px] leading-relaxed text-zinc-500">Aplica color, textura y atmósfera coherentes a todo el edit. No cambia cortes, textos ni encuadres.</p>
            </div>
            <div className="mt-3 grid gap-2">
              {EDIT_FINISH_RECIPES.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  data-testid={`edit-finish-${recipe.id}`}
                  disabled={activeProjectReadOnly}
                  onClick={() => applyFinishRecipe(recipe.id)}
                  className="border border-zinc-700 bg-black p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-950/20 disabled:opacity-35"
                >
                  <span className="block font-black text-zinc-100">{recipe.label}</span>
                  <span className="mt-1 block text-[9px] leading-relaxed text-zinc-500">{recipe.desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={`${inspectorTab === "finish" ? "block" : "hidden"} ${activeProjectReadOnly ? "pointer-events-none opacity-60" : ""} border border-zinc-800 bg-zinc-950 p-3`}>
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-xs font-black uppercase tracking-wider text-zinc-200">SFX y ambientes</h2><span className="font-mono text-[8px] text-zinc-600">{activeSfxCues.length} efectos</span></div>
            {previewingAssistDraft && assistSession && activeSfxCues.length > assistSession.baseSfxCues.length && (
              <p className="mb-2 border border-amber-900/50 bg-amber-950/15 p-2 text-[8px] text-amber-200">El borrador propone {activeSfxCues.length - assistSession.baseSfxCues.length} cues discretos. Puedes moverlos o eliminarlos antes de aplicar.</p>
            )}
            <SfxLoopTimeline
              loopDuration={Math.max(0.5, duration)}
              currentTime={currentTime}
              timeRef={timelineTimeRef}
              isPlaying={isPlaying}
              onTogglePlay={togglePlayback}
              cues={activeSfxCues}
              onCuesChange={updateActiveSfxCues}
              onSeekRequest={seekTo}
              audioContextRef={audioContextRef}
              activeFormatFilter="9x16"
              hasMedia={activeProject.clips.length > 0}
            />
          </section>

          <details className={`${inspectorTab === "finish" ? "block" : "hidden"} border border-zinc-800 bg-zinc-950 p-3`}>
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-200">Ajustes finos de imagen</summary>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
              <label>FPS
                <select value={activeProject.fps} onChange={(event) => updateProject({ fps: Number(event.target.value) as 30 | 60 })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200"><option value="60">60 fps</option><option value="30">30 fps</option></select>
              </label>
              <span className="flex items-end pb-1 font-mono text-[10px] text-zinc-500">9:16 · 1080×1920 · para Shorts</span>
              <label className="col-span-2">Filtro
                <select value={activeProject.style} onChange={(event) => updateProject({ style: event.target.value as AestheticStyle })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1 text-zinc-200">{EDIT_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select>
              </label>
              {EDIT_COLOR_CONTROLS.map(({ key, label }) => (
                <label key={key}>{label} <span className="float-right font-mono text-zinc-300">{activeProject.colorGrade[key]}</span>
                  <input type="range" min={key === "bloom" || key === "grain" || key === "fade" ? 0 : -100} max="100" value={activeProject.colorGrade[key]} onChange={(event) => updateProject({ colorGrade: { ...activeProject.colorGrade, [key]: Number(event.target.value) } })} className="mt-2 w-full accent-fuchsia-500" />
                </label>
              ))}
            </div>
          </details>

          <details className={`${inspectorTab === "finish" ? "block" : "hidden"} border border-zinc-800 bg-zinc-950 p-3`}>
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-200">05 / Atmósfera</summary>
            <div className="mt-3 space-y-2 text-[9px] text-zinc-500">
              <select value={activeProject.particles} onChange={(event) => updateProject({ particles: event.target.value as ParticleType })} className="w-full border border-zinc-800 bg-black px-2 py-1.5 text-zinc-200">{EDIT_PARTICLES.map((particle) => <option key={particle.id} value={particle.id}>{particle.label}</option>)}</select>
              <label>Densidad <span className="float-right">{activeProject.particleIntensity}%</span><input type="range" min="10" max="100" value={activeProject.particleIntensity} onChange={(event) => updateProject({ particleIntensity: Number(event.target.value) })} className="mt-2 w-full accent-amber-400" /></label>
              <label>Tamaño <span className="float-right">{activeProject.particleControls.size}%</span><input type="range" min="40" max="180" value={activeProject.particleControls.size} onChange={(event) => updateProject({ particleControls: { ...activeProject.particleControls, size: Number(event.target.value) } })} className="mt-2 w-full accent-amber-400" /></label>
              <label>Opacidad <span className="float-right">{activeProject.particleControls.opacity}%</span><input type="range" min="0" max="100" value={activeProject.particleControls.opacity} onChange={(event) => updateProject({ particleControls: { ...activeProject.particleControls, opacity: Number(event.target.value) } })} className="mt-2 w-full accent-amber-400" /></label>
              <label>Viento <span className="float-right">{activeProject.particleControls.wind}</span><input type="range" min="-100" max="100" value={activeProject.particleControls.wind} onChange={(event) => updateProject({ particleControls: { ...activeProject.particleControls, wind: Number(event.target.value) } })} className="mt-2 w-full accent-amber-400" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label>Color <input type="color" value={activeProject.particleControls.color || "#ffffff"} onChange={(event) => updateProject({ particleControls: { ...activeProject.particleControls, color: event.target.value } })} className="mt-1 h-7 w-full border border-zinc-800 bg-black" /></label>
                <label>Mezcla <select value={activeProject.particleControls.blendMode} onChange={(event) => updateProject({ particleControls: { ...activeProject.particleControls, blendMode: event.target.value as EditProject["particleControls"]["blendMode"] } })} className="mt-1 w-full border border-zinc-800 bg-black px-2 py-1.5 text-zinc-200"><option value="screen">Pantalla</option><option value="source-over">Normal</option><option value="lighter">Aditivo</option><option value="soft-light">Luz suave</option></select></label>
              </div>
              <button type="button" onClick={() => updateProject({ particleControls: { ...DEFAULT_PARTICLE_CONTROLS, opacity: 72, turbulence: 36, blendMode: "screen" } })} className="border border-zinc-700 px-2 py-1 text-zinc-400">Restablecer</button>
            </div>
          </details>

          <details className={`${inspectorTab === "finish" ? "block" : "hidden"} border border-zinc-800 bg-zinc-950 p-3`}>
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-200">06 / Textos y firma</summary>
            <div className="mt-3 space-y-2">
              <button type="button" onClick={addTextCue} className="w-full border border-cyan-800 bg-cyan-950/30 px-2 py-1.5 text-[10px] font-bold text-cyan-200">+ Texto en el cabezal</button>
              {activeProject.textCues.map((cue) => (
                <div key={cue.id} className="border border-zinc-800 bg-black/30 p-2">
                  <div className="grid grid-cols-[1fr_62px_24px] gap-1.5">
                    <input aria-label="Texto del rótulo" value={cue.text} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, text: event.target.value } : entry) })} className="min-w-0 border-b border-zinc-800 bg-transparent text-[10px] font-bold text-white outline-none focus:border-cyan-500" />
                    <input aria-label="Inicio del texto" type="number" step="0.05" value={cue.start} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, start: Math.max(0, Number(event.target.value) || 0) } : entry) })} className="bg-zinc-900 px-1 font-mono text-[9px] text-zinc-300" />
                    <button type="button" aria-label="Eliminar texto" onClick={() => updateProject({ textCues: activeProject.textCues.filter((entry) => entry.id !== cue.id) })} className="text-zinc-600 hover:text-red-400">×</button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px] text-zinc-500">
                    <label>Tipografía
                      <select value={cue.style} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, style: event.target.value as typeof cue.style } : entry) })} className="mt-1 w-full border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-zinc-200">
                        <option value="impact">Impacto</option>
                        <option value="condensed">Condensada</option>
                        <option value="editorial">Editorial itálica</option>
                        <option value="minimal">Minimal / créditos</option>
                      </select>
                    </label>
                    <label>Palabra en color
                      <input value={cue.emphasis} placeholder="Opcional" onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, emphasis: event.target.value } : entry) })} className="mt-1 w-full border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-zinc-200" />
                    </label>
                  </div>
                  <details className="mt-2 border-t border-zinc-900 pt-1.5">
                    <summary className="cursor-pointer text-[8px] font-bold uppercase tracking-wider text-zinc-600">Tamaño, posición y color</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
                      <label>Tamaño <span className="float-right font-mono">{cue.size}</span><input type="range" min="18" max="96" value={cue.size} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, size: Number(event.target.value) } : entry) })} className="mt-1 w-full accent-cyan-400" /></label>
                      <label>Altura <span className="float-right font-mono">{Math.round(cue.y * 100)}%</span><input type="range" min="10" max="88" value={Math.round(cue.y * 100)} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, y: Number(event.target.value) / 100 } : entry) })} className="mt-1 w-full accent-cyan-400" /></label>
                      <label>Duración<input type="number" min="0.2" max="8" step="0.1" value={cue.duration} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, duration: Math.max(0.2, Number(event.target.value) || 0.2) } : entry) })} className="mt-1 w-full border border-zinc-800 bg-zinc-950 px-1.5 py-1 font-mono text-zinc-200" /></label>
                      <div className="grid grid-cols-2 gap-1">
                        <label>Texto<input aria-label="Color del texto" type="color" value={cue.color} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, color: event.target.value } : entry) })} className="mt-1 h-7 w-full border border-zinc-800 bg-zinc-950" /></label>
                        <label>Acento<input aria-label="Color de acento" type="color" value={cue.accent} onChange={(event) => updateProject({ textCues: activeProject.textCues.map((entry) => entry.id === cue.id ? { ...entry, accent: event.target.value } : entry) })} className="mt-1 h-7 w-full border border-zinc-800 bg-zinc-950" /></label>
                      </div>
                    </div>
                    <p className="mt-2 text-[8px] text-zinc-600">Escribe <span className="font-mono text-zinc-400">|</span> para dividir el rótulo en dos líneas.</p>
                  </details>
                </div>
              ))}
              <label className="flex items-center gap-2 text-[10px] text-zinc-400"><input type="checkbox" checked={activeProject.watermarkEnabled} onChange={(event) => updateProject({ watermarkEnabled: event.target.checked })} className="accent-fuchsia-500" /> Marca de agua</label>
              {activeProject.watermarkEnabled && (
                <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
                  <input value={activeProject.watermarkText} onChange={(event) => updateProject({ watermarkText: event.target.value })} className="col-span-2 border border-zinc-800 bg-black px-2 py-1 text-zinc-200" />
                  <label>Opacidad<input type="range" min="5" max="60" value={Math.round(activeProject.watermarkOpacity * 100)} onChange={(event) => updateProject({ watermarkOpacity: Number(event.target.value) / 100 })} className="mt-2 w-full accent-fuchsia-500" /></label>
                  <label>Posición<select value={activeProject.watermarkStyle.position} onChange={(event) => updateProject({ watermarkStyle: { ...activeProject.watermarkStyle, position: event.target.value as NonNullable<EditProject["watermarkStyle"]["position"]> } })} className="mt-1 w-full border border-zinc-800 bg-black px-1 py-1 text-zinc-200"><option value="bottom-center">Abajo centro</option><option value="bottom-left">Abajo izq.</option><option value="bottom-right">Abajo der.</option><option value="top-center">Arriba centro</option></select></label>
                </div>
              )}
            </div>
          </details>

          <section className={`${inspectorTab === "finish" ? "block" : "hidden"} border border-zinc-700 bg-white p-3 text-black`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider">07 / Exportar MP4</h2>
                <p className="mt-1 text-[9px] text-zinc-600">1080×1920 · {project.fps} fps · audio 48 kHz · 9:16</p>
              </div>
              <span className="font-mono text-[10px]">{Math.round(exportProgress * 100)}%</span>
            </div>
            <div className="mt-3 h-1.5 bg-zinc-200"><div className="h-full bg-fuchsia-600 transition-[width]" style={{ width: `${exportProgress * 100}%` }} /></div>
            {previewingAssistDraft && <p className="mt-2 border border-amber-500 bg-amber-50 p-2 text-[9px] text-amber-900">Aplica el borrador para exportar exactamente esta versión.</p>}
            {missingAssetIds.size > 0 && <button type="button" onClick={() => selectInspectorTab("media")} className="mt-2 w-full border border-red-400 bg-red-50 p-2 text-left text-[9px] font-bold text-red-800">Reconecta {missingAssetIds.size} medio{missingAssetIds.size === 1 ? "" : "s"} antes de exportar →</button>}
            {exportStage && <p className="mt-2 text-[9px] text-zinc-600">{exportStage}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void exportVideo()} disabled={exporting || !project.clips.length || previewingAssistDraft || missingAssetIds.size > 0} className="flex-1 bg-black px-3 py-2 text-xs font-black text-white disabled:opacity-30">{exporting ? "EXPORTANDO…" : "EXPORTAR EDIT"}</button>
              {exporting && <button type="button" onClick={() => exportAbortRef.current?.abort()} className="border border-black px-3 text-xs font-bold">Cancelar</button>}
            </div>
            {resultUrl && <a href={resultUrl} download className="mt-2 block text-center text-[10px] font-bold text-fuchsia-700 underline">Descargar de nuevo</a>}
          </section>
          </div>
        </aside>
      </div>

      <p className="shrink-0 border-l-2 border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-[9px] text-zinc-500 lg:h-7">{status}</p>
    </div>
  );
}
