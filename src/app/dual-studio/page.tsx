"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import FileDropzone from "@/components/FileDropzone";
import SfxLoopTimeline from "@/components/SfxLoopTimeline";
import AudioLoopPanel from "@/components/AudioLoopPanel";
import AudioPlaylistPanel from "@/components/AudioPlaylistPanel";
import TrimTimeline from "@/components/TrimTimeline";
import { LoopSfxCue, preloadCuratedSfx, stopActiveSfxPreview } from "@/lib/seinenSfxLibrary";
import {
  ParticleType,
  PhysicsParticleSystem,
  AestheticStyle,
  CameraMovement,
  ColorGradeConfig,
  DEFAULT_COLOR_GRADE,
  DEFAULT_MANGA_CONFIG,
  DEFAULT_PARTICLE_CONTROLS,
  MangaMotionConfig,
  ParticleControlOptions,
  renderMangaMotionFrame,
} from "@/lib/mangaMotionEngine";
import {
  exportMangaMotionVideo,
  sourceTimeForExport,
  computeVisualCycleDuration,
  computeVisualCrossfadeDuration,
  DEFAULT_EXTEND_MIN_PLAYBACK_RATE,
  resolveExtendPlaybackPlan,
  resolveExtendPlaybackRate,
  resolveOutputSize,
  ExportCancelledError,
} from "@/lib/mangaMotionExport";
import { getForwardLoopFrameState } from "@/lib/forwardLoop";
import { getSmoothPingPongFrameState } from "@/lib/pingPongLoop";
import { resolveParticleRenderPlan } from "@/lib/particleLoop";
import {
  buildClipFrameCache,
  disposeClipFrameCache,
  clipFrameAt,
  type ClipFrameCache,
} from "@/lib/clipFrameCache";
import {
  analyzeClipFrameStabilization,
  sourceTransformAt,
  type ClipStabilization,
} from "@/lib/videoStabilization";
import {
  saveExportMediaResult,
  analyzeMusic,
  analyzeVideoStabilization,
  transcodeVideoForBrowser,
  type LoopCandidate,
} from "@/lib/companion";
import {
  drawThumbnailChannelMark,
  ensureWatermarkFont,
  type WatermarkStyleOptions,
} from "@/lib/watermark";
import {
  pickBestAudioLoop,
  recommendVisualLoopForClip,
  type SeamMode,
  type VisualLoopSelection,
} from "@/lib/loopStrategy";
import { analyzeLocalLoops, estimateBeatPeriodSec } from "@/lib/audioLoopAnalyzer";
import {
  decodeAudioDataAsync,
  analyzeAudioHighlights,
  AudioHighlightAnalysis,
  buildProcessedOneShotBuffer,
  clampOneShotWindow,
  copyOneShotMaster,
  repeatOneShotMasterWithCrossfade,
  sourceWindowForOutput,
} from "@/lib/mangaAudioEngine";
import {
  ReverbSettings,
  REVERB_PRESETS,
  DEFAULT_SETTINGS,
  LoopBufferPlayer,
} from "@/lib/audioEngine";
import {
  buildAudioPlaylistMaster,
  type AudioPlaylistTrack,
  type PlaylistTimelineItem,
  type PlaylistTrackEffect,
} from "@/lib/audioPlaylist";
import {
  generateOrganicYoutubePack,
  CHARACTER_DATABASE,
  detectCharacter,
  cleanSongName,
  type YoutubePackResult,
} from "@/lib/youtubePackEngine";

const VISUAL_STYLES: { id: AestheticStyle; label: string; icon: string; desc: string }[] = [
  { id: "original", label: "Original Limpio", icon: "🖼️", desc: "Nitidez 1080p sin distorsión de color" },
  { id: "seinen_bw", label: "Seinen B&W", icon: "🖋️", desc: "Tinta manga de alto contraste (Berserk/Vagabond)" },
  { id: "retro_90s", label: "Retro 90s Anime", icon: "📼", desc: "Saturación celuloid analógica vintage" },
  { id: "dark_fantasy", label: "Dark Fantasy", icon: "🌑", desc: "Sombras frías sombrías y atmósfera densa" },
  { id: "cyberpunk_neon", label: "Cyberpunk Glow", icon: "🌆", desc: "Neón vibrante magenta y alto contraste" },
  { id: "screentone", label: "Screentone Halftone", icon: "📰", desc: "Trama clásica de imprenta manga tradicional" },
  { id: "vintage_sepia", label: "Pergamino Sepia", icon: "📜", desc: "Tono pergamino samurái antiguo y cálido" },
  { id: "golden_sunset", label: "Golden Hour Sunset", icon: "🌇", desc: "Crepúsculo ambarino épico" },
];

const CAMERA_OPTIONS: { id: CameraMovement; label: string; icon: string; desc: string }[] = [
  { id: "static", label: "Fija", icon: "🖼️", desc: "Imagen estable, sin movimiento de cámara" },
  { id: "slow_push", label: "Acercamiento suave", icon: "🔍", desc: "Zoom lento sin rotación ni vibración" },
  { id: "dutch_drift", label: "Deriva suave", icon: "🎥", desc: "Desplazamiento leve y estable" },
];

const PARTICLE_OPTIONS: { id: ParticleType; label: string; icon: string }[] = [
  { id: "none", label: "🚫 Sin Partículas", icon: "🚫" },
  { id: "embers_fire", label: "🔥 Brasas de Fuego (Berserk)", icon: "🔥" },
  { id: "sakura_petals", label: "🌸 Pétalos Sakura (Vagabond)", icon: "🌸" },
  { id: "bamboo_leaves", label: "🎋 Hojas de Bambú (Samurái)", icon: "🎋" },
  { id: "blood_drips", label: "🩸 Gotas de Sangre (Gore)", icon: "🩸" },
  { id: "golden_sparks", label: "✨ Chispas Doradas (Épico)", icon: "✨" },
  { id: "dark_ink_fog", label: "🌫️ Niebla de Tinta (Místico)", icon: "🌫️" },
  { id: "cinematic_rain", label: "🌧️ Lluvia Cinemática (Melancolía)", icon: "🌧️" },
  { id: "cinematic_dust", label: "🎞️ Polvo de Lente (Cinemático)", icon: "🎞️" },
  { id: "snow_ash", label: "❄️ Nieve y Ceniza (Atmosférico)", icon: "❄️" },
  { id: "light_leaks", label: "🌤️ Fugas de Luz (Analógico)", icon: "🌤️" },
];

const CREATIVE_PROFILES = [
  { id: "guts", label: "Berserk", detail: "Guts · fantasía oscura", icon: "⚔️" },
  { id: "thorfinn", label: "Vinland Saga", detail: "Thorfinn · norte y calma", icon: "🛶" },
  { id: "buntaro", label: "The Climber", detail: "Mori · soledad y altura", icon: "🏔️" },
  { id: "musashi", label: "Vagabond", detail: "Musashi · samurái", icon: "🌾" },
  { id: "knight", label: "Caballero", detail: "amor medieval lento", icon: "🛡️" },
] as const;

const DURATION_16X9_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
];

const DURATION_9X16_PRESETS = [
  { label: "15s", seconds: 15 },
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
];

const DEFAULT_WATERMARK_STYLE: WatermarkStyleOptions = {
  position: "bottom-center",
  scale: 1,
  tracking: 1,
  color: "#ffffff",
  ruleScale: 1,
  offsetX: 0,
  offsetY: 0,
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function visualLoopSummary(mode: SeamMode, selection: VisualLoopSelection | null): string {
  const seam = mode === "pingpong"
    ? "Boomerang suave"
    : mode === "smooth"
      ? "Fundido continuo"
      : mode === "calm"
        ? "Continuo calmado"
        : mode === "extend"
          ? "Extendido"
          : "Corte directo";
  return selection ? `${seam} · ciclo ${selection.duration.toFixed(1)}s` : seam;
}

function particleControlsForPreview(
  controls: ParticleControlOptions,
  cycleDuration: number,
  targetDuration: number,
  particles: ParticleType
): ParticleControlOptions {
  const plan = resolveParticleRenderPlan(cycleDuration, targetDuration, particles !== "none");
  return { ...controls, loopDuration: plan.particleLoopDuration };
}

function loopQualityMeta(selection: VisualLoopSelection) {
  const quality = selection.quality
    ?? (selection.score >= 85 ? "excellent" : selection.score >= 68 ? "good" : "review");
  if (quality === "excellent") {
    return { label: "Unión excelente", className: "border-emerald-700/60 bg-emerald-950/30 text-emerald-200" };
  }
  if (quality === "good") {
    return { label: "Unión buena", className: "border-cyan-700/60 bg-cyan-950/30 text-cyan-200" };
  }
  return { label: "Revisar unión", className: "border-amber-700/60 bg-amber-950/30 text-amber-200" };
}

function VisualLoopQualityPanel({
  selection,
  candidates,
  format,
  onSelect,
}: {
  selection: VisualLoopSelection | null;
  candidates: VisualLoopSelection[];
  format: "16x9" | "9x16";
  onSelect: (candidate: VisualLoopSelection) => void;
}) {
  if (!selection || selection.label === "Recorte manual") return null;
  const meta = loopQualityMeta(selection);
  const alternatives = candidates
    .filter((candidate) => (
      Math.abs(candidate.start - selection.start) > 0.02
      || Math.abs(candidate.end - selection.end) > 0.02
    ))
    .slice(0, 3);
  const metrics = selection.metrics;

  return (
    <div className={`rounded-lg border p-2.5 text-[10px] ${meta.className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{meta.label}</span>
        <span className="font-mono">{Math.round(selection.score)}%</span>
      </div>
      {metrics && (
        <div className="mt-1 grid grid-cols-3 gap-1 text-zinc-400">
          <span>Imagen {Math.round(metrics.seamVisual)}%</span>
          <span>Movimiento {Math.round(metrics.motionMatch)}%</span>
          <span>Corte {Math.round(metrics.sceneCutRisk * 100)}%</span>
        </div>
      )}
      {format === "9x16" && alternatives.length > 0 && (
        <p className="mt-1 text-zinc-400">El Short completo se conserva hasta que aceptes otra unión.</p>
      )}
      {alternatives.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alternatives.map((candidate) => (
            <button
              key={`${candidate.start}-${candidate.end}`}
              type="button"
              onClick={() => onSelect(candidate)}
              className="rounded-md border border-current/30 bg-black/20 px-2 py-1 font-semibold hover:bg-white/10"
              title={candidate.reason}
            >
              Usar {candidate.start.toFixed(1)}–{candidate.end.toFixed(1)}s · {Math.round(candidate.score)}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const COLOR_GRADE_SLIDERS: Array<{
  key: keyof ColorGradeConfig;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "exposure", label: "Exposición", min: -100, max: 100 },
  { key: "contrast", label: "Contraste", min: -100, max: 100 },
  { key: "saturation", label: "Saturación", min: -100, max: 100 },
  { key: "temperature", label: "Temperatura", min: -100, max: 100 },
  { key: "tint", label: "Tinte", min: -100, max: 100 },
  { key: "fade", label: "Negros lavados", min: 0, max: 100 },
  { key: "bloom", label: "Bloom", min: 0, max: 100 },
  { key: "grain", label: "Grano fino", min: 0, max: 100 },
];

const COLOR_GRADE_PRESETS: Array<{ label: string; value: ColorGradeConfig }> = [
  { label: "Limpio", value: { ...DEFAULT_COLOR_GRADE } },
  { label: "Cine frío", value: { ...DEFAULT_COLOR_GRADE, exposure: -6, contrast: 16, saturation: -8, temperature: -18, tint: 5, fade: 8, bloom: 8, grain: 10 } },
  { label: "Ámbar", value: { ...DEFAULT_COLOR_GRADE, exposure: 4, contrast: 10, saturation: 8, temperature: 24, tint: 2, fade: 6, bloom: 12, grain: 8 } },
  { label: "Manga mate", value: { ...DEFAULT_COLOR_GRADE, exposure: -4, contrast: 22, saturation: -34, temperature: -5, tint: 4, fade: 14, bloom: 3, grain: 18 } },
];

function ColorGradeControls({
  value,
  onChange,
  accentClass,
  format,
}: {
  value: ColorGradeConfig;
  onChange: (value: ColorGradeConfig) => void;
  accentClass: string;
  format: "16:9" | "9:16";
}) {
  return (
    <details className="mt-3 rounded-lg border border-zinc-800 bg-black/20 p-2.5">
      <summary className="cursor-pointer text-[11px] font-bold text-zinc-300">🎛️ Color grading profesional</summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COLOR_GRADE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ ...preset.value })}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:border-zinc-500"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        {COLOR_GRADE_SLIDERS.map((control) => (
          <label key={control.key} className="flex flex-col gap-1 text-[10px] text-zinc-500">
            <span className="flex justify-between gap-2">
              <span>{control.label}</span>
              <span className="font-mono text-zinc-300">{value[control.key] > 0 && control.min < 0 ? "+" : ""}{value[control.key]}</span>
            </span>
            <input
              aria-label={`${control.label} ${format}`}
              type="range"
              min={control.min}
              max={control.max}
              value={value[control.key]}
              onChange={(event) => onChange({ ...value, [control.key]: Number(event.target.value) })}
              className={`h-1.5 w-full cursor-pointer rounded-lg bg-zinc-800 ${accentClass}`}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

function ParticleAdvancedControls({
  value,
  onChange,
  accentClass,
  format,
}: {
  value: ParticleControlOptions;
  onChange: (value: ParticleControlOptions) => void;
  accentClass: string;
  format: "16:9" | "9:16";
}) {
  const sliders: Array<{ key: "size" | "opacity" | "wind" | "turbulence" | "blur"; label: string; min: number; max: number; suffix: string }> = [
    { key: "size", label: "Tamaño", min: 40, max: 180, suffix: "%" },
    { key: "opacity", label: "Opacidad", min: 0, max: 100, suffix: "%" },
    { key: "wind", label: "Viento", min: -100, max: 100, suffix: "" },
    { key: "turbulence", label: "Turbulencia", min: 0, max: 100, suffix: "%" },
    { key: "blur", label: "Desenfoque", min: 0, max: 6, suffix: "px" },
  ];

  return (
    <details className="rounded-lg border border-zinc-800 bg-black/20 p-2">
      <summary className="cursor-pointer text-[10px] font-semibold text-zinc-400">Control avanzado</summary>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sliders.map((control) => (
          <label key={control.key} className="flex flex-col gap-0.5 text-[9px] text-zinc-500">
            <span className="flex justify-between">
              <span>{control.label}</span>
              <span className="font-mono text-zinc-300">{value[control.key]}{control.suffix}</span>
            </span>
            <input
              aria-label={`${control.label} de partículas ${format}`}
              type="range"
              min={control.min}
              max={control.max}
              value={value[control.key]}
              onChange={(event) => onChange({ ...value, [control.key]: Number(event.target.value) })}
              className={`h-1 w-full cursor-pointer ${accentClass}`}
            />
          </label>
        ))}
        <label className="flex items-center justify-between gap-2 text-[9px] text-zinc-500">
          <span>Color</span>
          <span className="flex items-center gap-1">
            <input
              aria-label={`Color de partículas ${format}`}
              type="color"
              value={value.color || "#ffffff"}
              onChange={(event) => onChange({ ...value, color: event.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <button type="button" onClick={() => onChange({ ...value, color: "" })} className="rounded bg-zinc-800 px-1.5 py-1 text-zinc-400">Auto</button>
          </span>
        </label>
        <label className="flex items-center justify-between gap-2 text-[9px] text-zinc-500">
          <span>Mezcla</span>
          <select
            aria-label={`Mezcla de partículas ${format}`}
            value={value.blendMode}
            onChange={(event) => onChange({ ...value, blendMode: event.target.value as ParticleControlOptions["blendMode"] })}
            className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-zinc-300"
          >
            <option value="source-over">Normal</option>
            <option value="screen">Pantalla</option>
            <option value="lighter">Aditivo</option>
            <option value="soft-light">Luz suave</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-[9px] text-zinc-500">
          <span>Semilla</span>
          <span className="flex items-center gap-1">
            <input
              aria-label={`Semilla de partículas ${format}`}
              type="number"
              min="1"
              max="999999"
              value={value.seed}
              onChange={(event) => onChange({ ...value, seed: Math.max(1, Number(event.target.value) || 1) })}
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 font-mono text-zinc-300"
            />
            <button type="button" onClick={() => onChange({ ...value, seed: (value.seed % 999999) + 1 })} className="rounded bg-zinc-800 px-1.5 py-1 text-zinc-300">Variar</button>
          </span>
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_PARTICLE_CONTROLS })}
          className="rounded border border-zinc-700 px-2 py-1 text-[9px] font-semibold text-zinc-400 hover:text-white"
        >
          Restablecer partículas
        </button>
      </div>
    </details>
  );
}

export default function DualStudioPage() {
  // View Layout
  const [viewLayout, setViewLayout] = useState<"16x9" | "9x16">("16x9");

  // Media Inputs - 100% INDEPENDENT
  const [video16x9File, setVideo16x9File] = useState<File | null>(null);
  const [video16x9El, setVideo16x9El] = useState<HTMLVideoElement | HTMLImageElement | null>(null);
  const [video16x9Url, setVideo16x9Url] = useState<string | null>(null);
  const [video16x9Duration, setVideo16x9Duration] = useState<number>(0);
  const [visualLoop16, setVisualLoop16] = useState<VisualLoopSelection | null>(null);
  const [visualCandidates16, setVisualCandidates16] = useState<VisualLoopSelection[]>([]);
  const [analyzingVideo16, setAnalyzingVideo16] = useState(false);

  const [video9x16File, setVideo9x16File] = useState<File | null>(null);
  const [video9x16El, setVideo9x16El] = useState<HTMLVideoElement | HTMLImageElement | null>(null);
  const [video9x16Url, setVideo9x16Url] = useState<string | null>(null);
  const [video9x16Duration, setVideo9x16Duration] = useState<number>(0);
  const [visualLoop9, setVisualLoop9] = useState<VisualLoopSelection | null>(null);
  const [visualCandidates9, setVisualCandidates9] = useState<VisualLoopSelection[]>([]);
  const [analyzingVideo9, setAnalyzingVideo9] = useState(false);

  // 2.5D Manga Motion Camera States
  const [camera16x9, setCamera16x9] = useState<CameraMovement>("static");
  const [cameraIntensity16x9] = useState<number>(20);

  const [camera9x16, setCamera9x16] = useState<CameraMovement>("static");
  const [cameraIntensity9x16] = useState<number>(20);

  // Common Master Audio Track
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>("");
  const [songTitle, setSongTitle] = useState<string>("");
  const [audioAnalysis, setAudioAnalysis] = useState<AudioHighlightAnalysis | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioPlaylistTrack[]>([]);
  const [playlistTimeline, setPlaylistTimeline] = useState<PlaylistTimelineItem[]>([]);
  const [playlistProcessing, setPlaylistProcessing] = useState(false);
  const [playlistProgressLabel, setPlaylistProgressLabel] = useState("");
  const playlistBuildRevisionRef = useRef(0);
  const playlistHasSlowed = audioTracks.some((track) => track.effect !== "original");

  // Character & Metadata Generation State
  const [character, setCharacter] = useState<string>("guts");
  const [seedOffset, setSeedOffset] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Watermark Settings (Silent VM)
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(false);
  const [watermarkText, setWatermarkText] = useState<string>("SILENT VIGIL");
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.28);
  const [watermarkStyle, setWatermarkStyle] = useState<WatermarkStyleOptions>(DEFAULT_WATERMARK_STYLE);

  // Audio trimming offsets & target durations
  const [target16x9Duration, setTarget16x9Duration] = useState<number>(60);
  const [longFormAudioMode, setLongFormAudioMode] = useState<"once" | "repeat">("once");
  const [longFormRepeatCount, setLongFormRepeatCount] = useState<number>(2);

  const [target9x16Duration, setTarget9x16Duration] = useState<number>(30);
  const [audioCandidates, setAudioCandidates] = useState<LoopCandidate[]>([]);
  const [candidatesSource, setCandidatesSource] = useState<null | "companion" | "heuristic" | "local">(null);
  const [audioLoop16, setAudioLoop16] = useState<LoopCandidate | null>(null);
  const [audioLoop9, setAudioLoop9] = useState<LoopCandidate | null>(null);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [seamHint16, setSeamHint16] = useState<string>("");
  const [seamHint9, setSeamHint9] = useState<string>("");

  // Audio preview volume & mute (volume also drives the exported audio)
  const [previewVolume16x9, setPreviewVolume16x9] = useState<number>(1.0);
  const [previewVolume9x16, setPreviewVolume9x16] = useState<number>(1.0);
  const [muted16x9, setMuted16x9] = useState<boolean>(false);
  const [muted9x16, setMuted9x16] = useState<boolean>(false);

  // Formato audible: coincide con la pestaña de trabajo visible.
  const [activePreviewFormat, setActivePreviewFormat] = useState<"16x9" | "9x16">("16x9");

  // Errores de audio (carga/reverb) visibles en el Estudio de canción
  const [audioError, setAudioError] = useState<string | null>(null);

  // Masters YA PROCESADOS: canción completa para 16:9 y toma exacta para 9:16.
  // No contienen repeticiones ni crossfades internos; preview y export comparten pipeline.
  const [processedLoop16, setProcessedLoop16] = useState<AudioBuffer | null>(null);
  const [processedLoop9, setProcessedLoop9] = useState<AudioBuffer | null>(null);
  const [processingLoop16, setProcessingLoop16] = useState(false);
  const [processingLoop9, setProcessingLoop9] = useState(false);

  // Shared AudioContext for SFX previews (single instance, shared with both timelines via ref)
  const sharedAudioCtxRef = useRef<AudioContext | null>(null);

  // Período de beat de la canción (para imantar el drag del recorte a la rejilla)
  const beatSnapSec = useMemo(
    () => (audioBuffer ? (estimateBeatPeriodSec(audioBuffer) ?? undefined) : undefined),
    [audioBuffer]
  );

  // Resolución real de export por formato: passthrough nativo del source
  // (1080p→1080p, 2K→2K, 4K→4K). La UI la muestra para no prometer 1080p fijo.
  const exportSizeFor = (format: "16x9" | "9x16") => {
    const el = format === "16x9" ? video16x9El : video9x16El;
    const isVideo = typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement;
    const isImage = typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement;
    const rawW = isVideo ? el.videoWidth : isImage ? el.naturalWidth : 0;
    const rawH = isVideo ? el.videoHeight : isImage ? el.naturalHeight : 0;
    return resolveOutputSize(
      { aspectRatio: format === "16x9" ? "16:9" : "9:16" },
      rawW || 1920,
      rawH || 1080,
      {}
    );
  };
  const exportSize16 = exportSizeFor("16x9");
  const exportSize9 = exportSizeFor("9x16");

  // Pre-export confirmation dialog
  const [confirmExport, setConfirmExport] = useState<null | "16x9" | "9x16" | "batch">(null);

  // Style & Effect Settings for 16:9 — inicial limpio, el usuario decide qué añadir
  const [style16x9, setStyle16x9] = useState<AestheticStyle>("original");
  const [particles16x9, setParticles16x9] = useState<ParticleType>("none");
  const [particleIntensity16x9, setParticleIntensity16x9] = useState<number>(50);
  const [particleSpeed16x9, setParticleSpeed16x9] = useState<number>(1.0);
  const [particleControls16x9, setParticleControls16x9] = useState<ParticleControlOptions>({ ...DEFAULT_PARTICLE_CONTROLS });
  const [colorGrade16x9, setColorGrade16x9] = useState<ColorGradeConfig>({ ...DEFAULT_COLOR_GRADE });
  const [seamMode16x9, setSeamMode16x9] = useState<SeamMode>("cut");
  const [calmPlaybackRate16x9] = useState<number>(0.4);
  const [extendMinRate16x9, setExtendMinRate16x9] = useState<number>(DEFAULT_EXTEND_MIN_PLAYBACK_RATE);
  const [stabilization16x9, setStabilization16x9] = useState<ClipStabilization | null>(null);
  const [stabilizationEnabled16x9, setStabilizationEnabled16x9] = useState(true);
  const [stabilizationStrength16x9, setStabilizationStrength16x9] = useState(100);

  // Style & Effect Settings for 9:16 — inicial limpio, el usuario decide qué añadir
  const [style9x16, setStyle9x16] = useState<AestheticStyle>("original");
  const [particles9x16, setParticles9x16] = useState<ParticleType>("none");
  const [particleIntensity9x16, setParticleIntensity9x16] = useState<number>(50);
  const [particleSpeed9x16, setParticleSpeed9x16] = useState<number>(1.0);
  const [particleControls9x16, setParticleControls9x16] = useState<ParticleControlOptions>({ ...DEFAULT_PARTICLE_CONTROLS });
  const [colorGrade9x16, setColorGrade9x16] = useState<ColorGradeConfig>({ ...DEFAULT_COLOR_GRADE });
  const [seamMode9x16, setSeamMode9x16] = useState<SeamMode>("cut");
  const [calmPlaybackRate9x16] = useState<number>(0.4);
  const [extendMinRate9x16, setExtendMinRate9x16] = useState<number>(DEFAULT_EXTEND_MIN_PLAYBACK_RATE);
  const [stabilization9x16, setStabilization9x16] = useState<ClipStabilization | null>(null);
  const [stabilizationEnabled9x16, setStabilizationEnabled9x16] = useState(true);
  const [stabilizationStrength9x16, setStabilizationStrength9x16] = useState(100);

  // Slowed + Reverb Audio Studio State
  const [enableSlowedReverb, setEnableSlowedReverb] = useState<boolean>(false);
  const [reverbSettings, setReverbSettings] = useState<ReverbSettings>(DEFAULT_SETTINGS);
  const [activeReverbPreset, setActiveReverbPreset] = useState<string>("clasico");

  const shortSourceWindowSec = sourceWindowForOutput(
    target9x16Duration,
    enableSlowedReverb,
    reverbSettings
  );
  const shortMinDuration = Math.max(5, Math.ceil(visualLoop9?.duration || video9x16Duration || 0));
  const setShortDuration = (seconds: number) => {
    const next = Math.min(60, Math.max(shortMinDuration, Math.round(seconds)));
    setTarget9x16Duration(next);
    draftKick9Ref.current += 1;
    setIsPlaying9x16(true);
  };
  const shortAudioSelection = useMemo<LoopCandidate | null>(() => {
    if (!audioBuffer) return null;
    const window = clampOneShotWindow(
      audioLoop9?.start ?? 0,
      shortSourceWindowSec,
      audioBuffer.duration
    );
    return {
      ...(audioLoop9 ?? { score: 0 }),
      ...window,
      label: audioLoop9?.label ?? `Fragmento de ${target9x16Duration}s`,
    };
  }, [audioBuffer, audioLoop9, shortSourceWindowSec, target9x16Duration]);
  const shortAudioCandidates = useMemo<LoopCandidate[]>(() => {
    if (!audioBuffer) return [];
    return audioCandidates.map((candidate) => {
      const window = clampOneShotWindow(candidate.start, shortSourceWindowSec, audioBuffer.duration);
      return { ...candidate, ...window };
    });
  }, [audioBuffer, audioCandidates, shortSourceWindowSec]);
  
  // Synchronized Audio Player Refs (ciclo procesado en loop nativo)
  const audioPlayer16x9Ref = useRef<LoopBufferPlayer | null>(null);
  const audioPlayer9x16Ref = useRef<LoopBufferPlayer | null>(null);

  // Format-dedicated SFX Cues
  const [sfx16x9Cues, setSfx16x9Cues] = useState<LoopSfxCue[]>([]);
  const [sfx9x16Cues, setSfx9x16Cues] = useState<LoopSfxCue[]>([]);

  // Independent Playback States
  const [isPlaying16x9, setIsPlaying16x9] = useState<boolean>(false);
  const [playbackTime16x9, setPlaybackTime16x9] = useState<number>(0);

  const [isPlaying9x16, setIsPlaying9x16] = useState<boolean>(false);
  const [playbackTime9x16, setPlaybackTime9x16] = useState<number>(0);

  // Canvas & Particle Engine Refs
  const canvas16x9Ref = useRef<HTMLCanvasElement | null>(null);
  const canvas9x16Ref = useRef<HTMLCanvasElement | null>(null);
  const blendCanvas16Ref = useRef<HTMLCanvasElement | null>(null);
  const blendCanvas9Ref = useRef<HTMLCanvasElement | null>(null);
  const particles16x9Ref = useRef<PhysicsParticleSystem>(new PhysicsParticleSystem());
  const particles9x16Ref = useRef<PhysicsParticleSystem>(new PhysicsParticleSystem());
  const blendParticles16Ref = useRef<PhysicsParticleSystem>(new PhysicsParticleSystem());
  const blendParticles9Ref = useRef<PhysicsParticleSystem>(new PhysicsParticleSystem());

  // Dynamic Setting Refs to decouple RAF loop from state re-renders (zero lag/freeze)
  const style16x9Ref = useRef(style16x9);
  const particles16x9RefState = useRef(particles16x9);
  const particleIntensity16x9Ref = useRef(particleIntensity16x9);
  const particleSpeed16x9Ref = useRef(particleSpeed16x9);
  const particleControls16x9Ref = useRef(particleControls16x9);
  const colorGrade16x9Ref = useRef(colorGrade16x9);
  const seamMode16x9Ref = useRef(seamMode16x9);
  const calmPlaybackRate16x9Ref = useRef(calmPlaybackRate16x9);
  const extendMinRate16x9Ref = useRef(extendMinRate16x9);
  const stabilization16x9Ref = useRef(stabilization16x9);
  const stabilizationEnabled16x9Ref = useRef(stabilizationEnabled16x9);
  const stabilizationStrength16x9Ref = useRef(stabilizationStrength16x9);

  const style9x16Ref = useRef(style9x16);
  const particles9x16RefState = useRef(particles9x16);
  const particleIntensity9x16Ref = useRef(particleIntensity9x16);
  const particleSpeed9x16Ref = useRef(particleSpeed9x16);
  const particleControls9x16Ref = useRef(particleControls9x16);
  const colorGrade9x16Ref = useRef(colorGrade9x16);
  const seamMode9x16Ref = useRef(seamMode9x16);
  const calmPlaybackRate9x16Ref = useRef(calmPlaybackRate9x16);
  const extendMinRate9x16Ref = useRef(extendMinRate9x16);
  const stabilization9x16Ref = useRef(stabilization9x16);
  const stabilizationEnabled9x16Ref = useRef(stabilizationEnabled9x16);
  const stabilizationStrength9x16Ref = useRef(stabilizationStrength9x16);

  const isPlaying16x9Ref = useRef(isPlaying16x9);
  const isPlaying9x16Ref = useRef(isPlaying9x16);

  const watermarkEnabledRef = useRef(watermarkEnabled);
  const watermarkTextRef = useRef(watermarkText);
  const watermarkOpacityRef = useRef(watermarkOpacity);
  const watermarkStyleRef = useRef(watermarkStyle);

  const camera16x9Ref = useRef(camera16x9);
  const cameraIntensity16x9Ref = useRef(cameraIntensity16x9);

  const camera9x16Ref = useRef(camera9x16);
  const cameraIntensity9x16Ref = useRef(cameraIntensity9x16);
  const target16x9DurationRef = useRef(target16x9Duration);
  const target9x16DurationRef = useRef(target9x16Duration);
  const video16x9ElRef = useRef(video16x9El);
  const video9x16ElRef = useRef(video9x16El);
  const audioLoop16Ref = useRef(audioLoop16);
  const audioLoop9Ref = useRef(audioLoop9);
  const visualLoop16Ref = useRef(visualLoop16);
  const visualLoop9Ref = useRef(visualLoop9);
  const seamLocked16Ref = useRef(false);
  const seamLocked9Ref = useRef(false);
  const clipCache16Ref = useRef<ClipFrameCache | null>(null);
  const clipCache9Ref = useRef<ClipFrameCache | null>(null);
  const draftKick16Ref = useRef(0);
  const draftKick9Ref = useRef(0);
  const elapsed16Ref = useRef(0);
  const elapsed9Ref = useRef(0);
  const [, setDraftReady16] = useState(false);
  const [, setDraftReady9] = useState(false);

  // Sequential Safe Export Queue State
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const isExportingRef = useRef(isExporting);
  useEffect(() => { isExportingRef.current = isExporting; }, [isExporting]);
  const exportAbortRef = useRef<AbortController | null>(null);

  const [, setExportStage] = useState<"idle" | "rendering_16x9" | "rendering_9x16" | "completed">("idle");
  const [exportProgress16x9, setExportProgress16x9] = useState<number>(0);
  const [exportProgress9x16, setExportProgress9x16] = useState<number>(0);
  const [exportStatusText, setExportStatusText] = useState<string>("");
  /** Fallo del export: se muestra DENTRO de la sección de export (el banner general
   * queda fuera de pantalla cuando el usuario está mirando las barras de progreso). */
  const [exportError, setExportError] = useState<string | null>(null);
  /** El export terminó pero el companion no pudo guardar el archivo en disco. */
  const [exportSaveWarning, setExportSaveWarning] = useState<string | null>(null);

  const [result16x9Url, setResult16x9Url] = useState<string | null>(null);
  const [result16x9Blob, setResult16x9Blob] = useState<Blob | null>(null);

  const [result9x16Url, setResult9x16Url] = useState<string | null>(null);
  const [result9x16Blob, setResult9x16Blob] = useState<Blob | null>(null);
  const [saved16x9Path, setSaved16x9Path] = useState<string | null>(null);
  const [saved9x16Path, setSaved9x16Path] = useState<string | null>(null);
  const [savedCoverPath, setSavedCoverPath] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => { style16x9Ref.current = style16x9; }, [style16x9]);
  useEffect(() => { particles16x9RefState.current = particles16x9; }, [particles16x9]);
  useEffect(() => { particleIntensity16x9Ref.current = particleIntensity16x9; }, [particleIntensity16x9]);
  useEffect(() => { particleSpeed16x9Ref.current = particleSpeed16x9; }, [particleSpeed16x9]);
  useEffect(() => { particleControls16x9Ref.current = particleControls16x9; }, [particleControls16x9]);
  useEffect(() => { colorGrade16x9Ref.current = colorGrade16x9; }, [colorGrade16x9]);
  useEffect(() => { seamMode16x9Ref.current = seamMode16x9; }, [seamMode16x9]);
  useEffect(() => { calmPlaybackRate16x9Ref.current = calmPlaybackRate16x9; }, [calmPlaybackRate16x9]);
  useEffect(() => { extendMinRate16x9Ref.current = extendMinRate16x9; }, [extendMinRate16x9]);
  useEffect(() => { stabilization16x9Ref.current = stabilization16x9; }, [stabilization16x9]);
  useEffect(() => { stabilizationEnabled16x9Ref.current = stabilizationEnabled16x9; }, [stabilizationEnabled16x9]);
  useEffect(() => { stabilizationStrength16x9Ref.current = stabilizationStrength16x9; }, [stabilizationStrength16x9]);
  useEffect(() => { camera16x9Ref.current = camera16x9; }, [camera16x9]);
  useEffect(() => { cameraIntensity16x9Ref.current = cameraIntensity16x9; }, [cameraIntensity16x9]);

  useEffect(() => { style9x16Ref.current = style9x16; }, [style9x16]);
  useEffect(() => { particles9x16RefState.current = particles9x16; }, [particles9x16]);
  useEffect(() => { particleIntensity9x16Ref.current = particleIntensity9x16; }, [particleIntensity9x16]);
  useEffect(() => { particleSpeed9x16Ref.current = particleSpeed9x16; }, [particleSpeed9x16]);
  useEffect(() => { particleControls9x16Ref.current = particleControls9x16; }, [particleControls9x16]);
  useEffect(() => { colorGrade9x16Ref.current = colorGrade9x16; }, [colorGrade9x16]);
  useEffect(() => { seamMode9x16Ref.current = seamMode9x16; }, [seamMode9x16]);
  useEffect(() => { calmPlaybackRate9x16Ref.current = calmPlaybackRate9x16; }, [calmPlaybackRate9x16]);
  useEffect(() => { extendMinRate9x16Ref.current = extendMinRate9x16; }, [extendMinRate9x16]);
  useEffect(() => { stabilization9x16Ref.current = stabilization9x16; }, [stabilization9x16]);
  useEffect(() => { stabilizationEnabled9x16Ref.current = stabilizationEnabled9x16; }, [stabilizationEnabled9x16]);
  useEffect(() => { stabilizationStrength9x16Ref.current = stabilizationStrength9x16; }, [stabilizationStrength9x16]);
  useEffect(() => { camera9x16Ref.current = camera9x16; }, [camera9x16]);
  useEffect(() => { cameraIntensity9x16Ref.current = cameraIntensity9x16; }, [cameraIntensity9x16]);
  useEffect(() => { target16x9DurationRef.current = target16x9Duration; }, [target16x9Duration]);
  useEffect(() => { target9x16DurationRef.current = target9x16Duration; }, [target9x16Duration]);
  useEffect(() => { video16x9ElRef.current = video16x9El; }, [video16x9El]);
  useEffect(() => { video9x16ElRef.current = video9x16El; }, [video9x16El]);
  useEffect(() => { audioLoop16Ref.current = audioLoop16; }, [audioLoop16]);
  useEffect(() => { audioLoop9Ref.current = audioLoop9; }, [audioLoop9]);
  useEffect(() => { visualLoop16Ref.current = visualLoop16; }, [visualLoop16]);
  useEffect(() => { visualLoop9Ref.current = visualLoop9; }, [visualLoop9]);

  useEffect(() => { isPlaying16x9Ref.current = isPlaying16x9; }, [isPlaying16x9]);
  useEffect(() => { isPlaying9x16Ref.current = isPlaying9x16; }, [isPlaying9x16]);

  // ── Arbitraje de audio y transferencia de formato ─────────────────────────────
  // Declarado AQUÍ a propósito: usa setters y refs definidos arriba y el compilador
  // de React (react-hooks/immutability) exige orden de declaración estricto.

  // Arbitraje de fuentes musicales ("una sola suena"): con las escuchas crudas de
  // paneles y la audición de costura eliminadas, solo quedan los dos previews
  // principales. Pausar vía estado para que el effect lo haga de verdad.
  const stopAudioExcept = useCallback((except?: "main16" | "main9") => {
    if (except !== "main16" && isPlaying16x9Ref.current) {
      isPlaying16x9Ref.current = false;
      setIsPlaying16x9(false);
    }
    if (except !== "main9" && isPlaying9x16Ref.current) {
      isPlaying9x16Ref.current = false;
      setIsPlaying9x16(false);
    }
  }, []);

  // Cambia el formato audible. Transferencia automática: si el formato actual estaba
  // sonando, se pausa y el nuevo arranca en SU propia posición (cada formato conserva
  // recorte, volumen y posición independientes). Si estaba en pausa, se respeta.
  const switchAudibleFormat = (next: "16x9" | "9x16") => {
    if (next === activePreviewFormat) {
      setViewLayout(next);
      return;
    }
    const prevAudible: "16x9" | "9x16" = viewLayout;
    const wasPlaying = prevAudible === "16x9" ? isPlaying16x9Ref.current : isPlaying9x16Ref.current;
    setActivePreviewFormat(next);
    setViewLayout(next);
    if (wasPlaying) {
      if (prevAudible === "16x9") {
        isPlaying16x9Ref.current = false;
        setIsPlaying16x9(false);
        isPlaying9x16Ref.current = true;
        setIsPlaying9x16(true);
      } else {
        isPlaying9x16Ref.current = false;
        setIsPlaying9x16(false);
        isPlaying16x9Ref.current = true;
        setIsPlaying16x9(true);
      }
    }
  };

  // Botones de layout: en vista de un solo formato, ese formato es el audible
  // (antes quedaban desincronizados y el transporte gobernaba el formato equivocado).
  const handleSetLayout = (layout: "16x9" | "9x16") => {
    switchAudibleFormat(layout);
    setViewLayout(layout);
  };

  useEffect(() => { watermarkEnabledRef.current = watermarkEnabled; }, [watermarkEnabled]);
  useEffect(() => { watermarkTextRef.current = watermarkText; }, [watermarkText]);
  useEffect(() => { watermarkOpacityRef.current = watermarkOpacity; }, [watermarkOpacity]);
  useEffect(() => { watermarkStyleRef.current = watermarkStyle; }, [watermarkStyle]);

  useEffect(() => {
    return () => {
      disposeClipFrameCache(clipCache16Ref.current);
      disposeClipFrameCache(clipCache9Ref.current);
    };
  }, []);

  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      sharedAudioCtxRef.current = ctx;
      void preloadCuratedSfx(ctx);
    } catch {}
    void ensureWatermarkFont();
  }, []);

  // Cada URL se libera sólo cuando se reemplaza su propio recurso. Antes, subir
  // el segundo clip revocaba el primero porque todos compartían el mismo effect.
  useEffect(() => {
    return () => { if (video16x9Url) URL.revokeObjectURL(video16x9Url); };
  }, [video16x9Url]);
  useEffect(() => {
    return () => { if (video9x16Url) URL.revokeObjectURL(video9x16Url); };
  }, [video9x16Url]);
  useEffect(() => {
    return () => { if (result16x9Url) URL.revokeObjectURL(result16x9Url); };
  }, [result16x9Url]);
  useEffect(() => {
    return () => { if (result9x16Url) URL.revokeObjectURL(result9x16Url); };
  }, [result9x16Url]);
  useEffect(() => {
    return () => {
      stopActiveSfxPreview();
      audioPlayer16x9Ref.current?.dispose();
      audioPlayer9x16Ref.current?.dispose();
    };
  }, []);

  // Handle 16:9 Media Upload (Video or Image)
  const loadClipCache = (file: File, which: "16x9" | "9x16") => {
    const is16 = which === "16x9";
    // Un clip nuevo entrante pausa el preview AQUÍ: si el usuario llega a pulsar
    // Reproducir mientras el borrador se prepara, su play explícito se respeta
    // y no se corta cuando el cache termina de construirse.
    if (is16) {
      isPlaying16x9Ref.current = false;
      setIsPlaying16x9(false);
      disposeClipFrameCache(clipCache16Ref.current);
      clipCache16Ref.current = null;
      setDraftReady16(false);
      setStabilization16x9(null);
    } else {
      isPlaying9x16Ref.current = false;
      setIsPlaying9x16(false);
      disposeClipFrameCache(clipCache9Ref.current);
      clipCache9Ref.current = null;
      setDraftReady9(false);
      setStabilization9x16(null);
    }
    void buildClipFrameCache(file, { maxWidth: 640, fps: 18 })
      .then((cache) => {
        if (is16) {
          disposeClipFrameCache(clipCache16Ref.current);
          clipCache16Ref.current = cache;
          setDraftReady16(true);
          draftKick16Ref.current += 1;
        } else {
          disposeClipFrameCache(clipCache9Ref.current);
          clipCache9Ref.current = cache;
          setDraftReady9(true);
          draftKick9Ref.current += 1;
        }

        // Doble ruta local: el companion aporta rotación/escala/RANSAC cuando
        // está disponible; LK en navegador conserva el funcionamiento autónomo.
        void Promise.allSettled([
          analyzeClipFrameStabilization(cache),
          analyzeVideoStabilization(file),
        ]).then(([localResult, companionResult]) => {
          const cacheIsCurrent = is16
            ? clipCache16Ref.current === cache
            : clipCache9Ref.current === cache;
          if (!cacheIsCurrent) return;

          const local = localResult.status === "fulfilled" ? localResult.value : null;
          const advanced = companionResult.status === "fulfilled" ? companionResult.value : null;
          const advancedUsable = advanced
            && advanced.keyframes.length >= 5
            && (advanced.autoEnabled || advanced.confidence >= 0.58);
          const analysis = advancedUsable ? advanced : local ?? advanced;
          if (!analysis) {
            console.warn(`No se pudo medir la microvibración ${which}`);
            return;
          }
          if (is16) setStabilization16x9(analysis);
          else setStabilization9x16(analysis);
        });
      })
      .catch((err: unknown) => {
        console.error("No se pudo preparar el borrador del clip:", err);
        const message = "No se pudo preparar el borrador del vídeo. Prueba un MP4 H.264; la exportación no se iniciará a ciegas.";
        setError(message);
        if (is16) setSeamHint16(message);
        else setSeamHint9(message);
      });
  };

  const analyzeVisualLoop = (file: File, which: "16x9" | "9x16", duration: number) => {
    const is16 = which === "16x9";
    const setAnalyzing = is16 ? setAnalyzingVideo16 : setAnalyzingVideo9;
    const setSelection = is16 ? setVisualLoop16 : setVisualLoop9;
    const setCandidates = is16 ? setVisualCandidates16 : setVisualCandidates9;
    const setHint = is16 ? setSeamHint16 : setSeamHint9;
    setAnalyzing(true);
    setCandidates([]);
    void recommendVisualLoopForClip(file, duration)
      .then(({ selection, candidates }) => {
        const keepsWholeShort = !is16
          && selection.start <= 0.02
          && Math.abs(selection.end - duration) <= 0.08;
        if (is16 || keepsWholeShort) setSelection(selection);
        const visibleCandidates = is16
          ? candidates
          : [selection, ...candidates].filter(
              (candidate, index, list) => list.findIndex(
                (other) => Math.abs(other.start - candidate.start) < 0.02
                  && Math.abs(other.end - candidate.end) < 0.02
              ) === index
            );
        setCandidates(visibleCandidates);
        setHint(
          is16 || keepsWholeShort
            ? `${selection.label} · ${selection.duration.toFixed(1)}s · ${Math.round(selection.score)}%. ${selection.reason}`
            : `Clip completo conservado · hay ${visibleCandidates.length} uniones analizadas para probar manualmente.`
        );
        const selectedNaturalLoop = candidates.some(
          (candidate) =>
            Math.abs(candidate.start - selection.start) < 0.02
            && Math.abs(candidate.end - selection.end) < 0.02
            && candidate.score >= 70
        );
        const locked = is16 ? seamLocked16Ref.current : seamLocked9Ref.current;
        if (!locked) {
          if (is16) {
            setSeamMode16x9("smooth");
            if (!selectedNaturalLoop) setCamera16x9("static");
          } else {
            setSeamMode9x16("smooth");
            if (!selectedNaturalLoop) setCamera9x16("static");
          }
        }
      })
      .catch((err) => {
        console.error("No se pudo analizar el loop visual:", err);
        const fallback: VisualLoopSelection = {
          start: 0,
          end: duration,
          duration,
          score: 0,
          fadeSec: Math.min(0.7, Math.max(0.2, duration * 0.1)),
          label: "Clip completo",
          reason: "No se pudo analizar el clip; se usará un fundido conservador.",
          source: "browser-fallback",
        };
        setSelection(fallback);
        setHint(fallback.reason);
      })
      .finally(() => setAnalyzing(false));
  };

  const updateVideoTrim = (which: "16x9" | "9x16", start: number, end: number) => {
    const duration = Math.max(0.2, end - start);
    const selection: VisualLoopSelection = {
      start,
      end,
      duration,
      score: 100,
      fadeSec: Math.max(0.25, Math.min(0.7, duration * 0.08)),
      label: "Recorte manual",
      reason: "Este tramo lo elegiste tú y no será acortado automáticamente.",
      source: "browser-fallback",
    };
    if (which === "16x9") {
      setVisualLoop16(selection);
      setVisualCandidates16([]);
      setSeamHint16(selection.reason);
      setIsPlaying16x9(false);
      draftKick16Ref.current += 1;
    } else {
      setVisualLoop9(selection);
      setVisualCandidates9([]);
      setSeamHint9(selection.reason);
      setIsPlaying9x16(false);
      draftKick9Ref.current += 1;
    }
  };

  const enableNaturalLoop = (which: "16x9" | "9x16") => {
    const is16 = which === "16x9";
    const selection = is16 ? visualLoop16 : visualLoop9;
    const sourceDuration = is16 ? video16x9Duration : video9x16Duration;
    const file = is16 ? video16x9File : video9x16File;
    if (is16) {
      seamLocked16Ref.current = true;
      setSeamMode16x9("smooth");
    } else {
      seamLocked9Ref.current = true;
      setSeamMode9x16("smooth");
    }
    const isFullClip = selection
      && selection.start <= 0.02
      && Math.abs(selection.end - sourceDuration) <= 0.05
      && selection.label !== "Recorte manual";
    if (file && isFullClip && file.type.startsWith("video/")) {
      analyzeVisualLoop(file, which, sourceDuration);
    } else {
      const message = "Loop natural aplicado al recorte exacto, sin modificar sus puntos de inicio y fin.";
      if (is16) setSeamHint16(message);
      else setSeamHint9(message);
    }
  };

  const applyVisualCandidate = (which: "16x9" | "9x16", candidate: VisualLoopSelection) => {
    if (which === "16x9") {
      setVisualLoop16(candidate);
      setSeamMode16x9("smooth");
      setSeamHint16(`${candidate.label} · ${candidate.duration.toFixed(1)}s. ${candidate.reason}`);
      setIsPlaying16x9(false);
      elapsed16Ref.current = 0;
      draftKick16Ref.current += 1;
    } else {
      setVisualLoop9(candidate);
      setSeamMode9x16("smooth");
      setSeamHint9(`${candidate.label} · ${candidate.duration.toFixed(1)}s. ${candidate.reason}`);
      setIsPlaying9x16(false);
      elapsed9Ref.current = 0;
      draftKick9Ref.current += 1;
    }
  };

  const setManualLoopMode = (which: "16x9" | "9x16", mode: SeamMode) => {
    if (which === "16x9") {
      seamLocked16Ref.current = true;
      setSeamMode16x9(mode);
      if (mode === "pingpong") {
        setCamera16x9("static");
        setSeamHint16("Boomerang suave: velocidad estable y giro amortiguado. Para humo, lluvia o acción intensa, Natural suele ocultar mejor la unión.");
      }
      setIsPlaying16x9(false);
      draftKick16Ref.current += 1;
    } else {
      seamLocked9Ref.current = true;
      setSeamMode9x16(mode);
      if (mode === "pingpong") {
        setCamera9x16("static");
        setSeamHint9("Boomerang suave: velocidad estable y giro amortiguado. Para humo, lluvia o acción intensa, Natural suele ocultar mejor la unión.");
      }
      setIsPlaying9x16(false);
      draftKick9Ref.current += 1;
    }
  };

  const showUnsupportedVideoError = (file: File) => {
    const isHevc = /hevc|hvc1|hev1/i.test(file.name) || file.name.toLowerCase().endsWith(".mov");
    setError(
      isHevc
        ? "No se pudo leer el vídeo: parece HEVC/H.265. Convierte el clip a MP4 H.264 (AVC) + AAC."
        : "No se pudo leer el vídeo. Prueba convertir el clip a MP4 H.264 + AAC (ffmpeg: -c:v libx264 -c:a aac)."
    );
  };

  const handleVideo16x9 = (file: File, allowCompanionTranscode = true) => {
    setError(null);
    seamLocked16Ref.current = false;
    setVisualLoop16(null);
    setVisualCandidates16([]);
    setVideo16x9File(file);
    const url = URL.createObjectURL(file);
    setVideo16x9Url(url);

    const detected = detectCharacter(file.name);
    if (detected) setCharacter(detected);

    // Resetear efectos a limpio: el usuario decide qué añadir
    setStyle16x9("original");
    setParticles16x9("none");
    setParticleControls16x9({ ...DEFAULT_PARTICLE_CONTROLS });
    setColorGrade16x9({ ...DEFAULT_COLOR_GRADE });
    setSeamMode16x9("cut");
    setExtendMinRate16x9(DEFAULT_EXTEND_MIN_PLAYBACK_RATE);
    setCamera16x9("static");
    setStabilizationEnabled16x9(true);
    setStabilizationStrength16x9(100);
    setWatermarkEnabled(false);
    setIsPlaying16x9(false);
    draftKick16Ref.current += 1;

    if (file.type.startsWith("image/") && !file.type.includes("gif")) {
      const img = new Image();
      img.onload = () => {
        setVideo16x9El(img);
        setVideo16x9Duration(10);
        setVisualLoop16({
          start: 0, end: 10, duration: 10, score: 100, fadeSec: 0.4,
          label: "Clip completo", reason: "Recorte manual sin automatismos.", source: "browser-fallback",
        });
        setSeamHint16("Imagen fija: no necesita análisis de costura.");
      };
      img.src = url;
    } else {
      const vid = document.createElement("video");
      vid.src = url;
      vid.muted = true;
      vid.loop = false;
      vid.playsInline = true;
      vid.autoplay = false;
      vid.onerror = () => {
        vid.onerror = null;
        if (!allowCompanionTranscode) {
          showUnsupportedVideoError(file);
          return;
        }
        setError("El navegador no puede abrir este formato. Convirtiendo localmente con el companion…");
        void transcodeVideoForBrowser(file)
          .then((converted) => handleVideo16x9(converted, false))
          .catch((transcodeError) => {
            console.warn("Conversión local 16:9 no disponible:", transcodeError);
            showUnsupportedVideoError(file);
          });
      };
      vid.onloadedmetadata = () => {
        setVideo16x9El(vid);
        const duration = Math.max(0.25, vid.duration || 5);
        setVideo16x9Duration(duration);
        setVisualLoop16({
          start: 0,
          end: duration,
          duration,
          score: 100,
          fadeSec: Math.max(0.25, Math.min(0.7, duration * 0.08)),
          label: "Clip completo",
          reason: "Recorte manual sin automatismos.",
          source: "browser-fallback",
        });
        setSeamHint16("Vídeo limpio: elige el recorte y activa un loop solo si lo necesitas.");
        loadClipCache(file, "16x9");
      };
    }
  };

  // Handle 9:16 Media Upload (Video or Image)
  const handleVideo9x16 = (file: File, allowCompanionTranscode = true) => {
    setError(null);
    seamLocked9Ref.current = false;
    setVisualLoop9(null);
    setVisualCandidates9([]);
    setVideo9x16File(file);
    const url = URL.createObjectURL(file);
    setVideo9x16Url(url);

    const detected = detectCharacter(file.name);
    if (detected) setCharacter(detected);

    // Resetear efectos a limpio: el usuario decide qué añadir
    setStyle9x16("original");
    setParticles9x16("none");
    setParticleControls9x16({ ...DEFAULT_PARTICLE_CONTROLS });
    setColorGrade9x16({ ...DEFAULT_COLOR_GRADE });
    setSeamMode9x16("cut");
    setExtendMinRate9x16(DEFAULT_EXTEND_MIN_PLAYBACK_RATE);
    setCamera9x16("static");
    setStabilizationEnabled9x16(true);
    setStabilizationStrength9x16(100);
    setWatermarkEnabled(false);
    setIsPlaying9x16(false);
    draftKick9Ref.current += 1;

    if (file.type.startsWith("image/") && !file.type.includes("gif")) {
      const img = new Image();
      img.onload = () => {
        setVideo9x16El(img);
        setVideo9x16Duration(10);
        setVisualLoop9({
          start: 0, end: 10, duration: 10, score: 100, fadeSec: 0.4,
          label: "Imagen fija", reason: "La imagen usa su composición completa.", source: "browser-fallback",
        });
        setSeamHint9("Imagen fija: no necesita análisis de costura.");
      };
      img.src = url;
    } else {
      const vid = document.createElement("video");
      vid.src = url;
      vid.muted = true;
      vid.loop = false;
      vid.playsInline = true;
      vid.autoplay = false;
      vid.onerror = () => {
        vid.onerror = null;
        if (!allowCompanionTranscode) {
          showUnsupportedVideoError(file);
          return;
        }
        setError("El navegador no puede abrir este formato. Convirtiendo localmente con el companion…");
        void transcodeVideoForBrowser(file)
          .then((converted) => handleVideo9x16(converted, false))
          .catch((transcodeError) => {
            console.warn("Conversión local 9:16 no disponible:", transcodeError);
            showUnsupportedVideoError(file);
          });
      };
      vid.onloadedmetadata = () => {
        const duration = Math.max(0.25, vid.duration || 5);
        setVideo9x16El(vid);
        setVideo9x16Duration(duration);
        // En Short nunca se recorta el clip automáticamente: así no aparece un
        // micro-loop aunque el companion estime mal FPS o duración.
        // Smart Forward: full-clip conserva todo con crossfade conservador 0.45-0.70
        const fullFade9 = Math.max(0.35, Math.min(0.70, Math.max(0.45, duration * 0.08)));
        setVisualLoop9({
          start: 0,
          end: duration,
          duration,
          score: 100,
          fadeSec: Math.max(0.25, Math.min(1.0, fullFade9)),
          label: "Clip completo",
          reason: "El Short conserva todos los fotogramas del vídeo subido.",
          source: "browser-fallback",
        });
        setSeamHint9(`Clip completo · ${duration.toFixed(1)}s. No se recorta automáticamente.`);
        if (duration <= 60) {
          setTarget9x16Duration((current) => Math.max(current, Math.ceil(duration)));
        }
        loadClipCache(file, "9x16");
      };
    }
  };

  // Las canciones se decodifican de una en una y el master se reconstruye en un
  // effect separado. Así el botón vuelve a responder entre archivos grandes.
  const handleAudioFiles = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setAudioError(null);
    setIsPlaying16x9(false);
    setIsPlaying9x16(false);
    setProcessedLoop16(null);
    setProcessedLoop9(null);
    setPlaylistProcessing(true);
    setPlaylistProgressLabel(`Decodificando 1/${files.length}…`);

    // Nacen dentro del gesto del selector para cumplir la política de autoplay.
    try {
      if (!audioPlayer16x9Ref.current) audioPlayer16x9Ref.current = new LoopBufferPlayer();
      if (!audioPlayer9x16Ref.current) audioPlayer9x16Ref.current = new LoopBufferPlayer();
    } catch (playerErr) {
      console.error("No se pudo preparar el reproductor de música:", playerErr);
      setAudioError("No se pudo preparar el reproductor de música.");
    }

    const decoded: AudioPlaylistTrack[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        setPlaylistProgressLabel(`Decodificando ${index + 1}/${files.length}: ${file.name}`);
        const buffer = await decodeAudioDataAsync(await file.arrayBuffer());
        decoded.push({
          id: typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          buffer,
          effect: "original",
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      setAudioTracks((current) => [...current, ...decoded]);
    } catch (err) {
      console.error(err);
      setPlaylistProcessing(false);
      setError("No se pudo decodificar una de las canciones seleccionadas.");
    }
  };

  const updatePlaylistEffect = (id: string, effect: PlaylistTrackEffect) => {
    setAudioTracks((current) => current.map((track) => track.id === id ? { ...track, effect } : track));
  };

  const movePlaylistTrack = (id: string, direction: -1 | 1) => {
    setAudioTracks((current) => {
      const index = current.findIndex((track) => track.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const removePlaylistTrack = (id: string) => {
    setAudioTracks((current) => current.filter((track) => track.id !== id));
  };

  useEffect(() => {
    const revision = ++playlistBuildRevisionRef.current;
    if (!audioTracks.length) {
      const clearTimer = window.setTimeout(() => {
        setAudioFile(null);
        setAudioBuffer(null);
        setAudioFileName("");
        setSongTitle("");
        setPlaylistTimeline([]);
        setPlaylistProcessing(false);
        setPlaylistProgressLabel("");
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    const timer = window.setTimeout(() => {
      setPlaylistProcessing(true);
      setPlaylistProgressLabel("Procesando efectos por canción…");
      void buildAudioPlaylistMaster(audioTracks, {
        transitionSeconds: 0.75,
        onProgress: (completed, total) => {
          if (revision === playlistBuildRevisionRef.current) {
            setPlaylistProgressLabel(`Procesando efectos ${completed}/${total}…`);
          }
        },
      }).then(({ buffer, timeline }) => {
        if (revision !== playlistBuildRevisionRef.current) return;
        const analysis = analyzeAudioHighlights(buffer);
        const full: LoopCandidate = {
          start: 0,
          end: buffer.duration,
          duration: buffer.duration,
          score: 0,
          label: audioTracks.length > 1 ? "Playlist completa" : "Canción completa",
        };
        const sourceWindow = sourceWindowForOutput(30, false, DEFAULT_SETTINGS);
        const fromDropStart = Math.max(0, analysis.dropTime - Math.min(4, sourceWindow * 0.2));
        const fromDrop: LoopCandidate = {
          ...clampOneShotWindow(fromDropStart, sourceWindow, buffer.duration),
          score: 0,
          label: analysis.dropTime > 0 ? "Drop con entrada" : "Desde el inicio",
        };
        setAudioFile(audioTracks[0]!.file);
        setAudioBuffer(buffer);
        setAudioFileName(audioTracks.length === 1 ? audioTracks[0]!.name : `${audioTracks.length} canciones`);
        setSongTitle(audioTracks.map((track) => cleanSongName(track.name)).join(" + "));
        setAudioAnalysis(analysis);
        setAudioLoop16(full);
        setAudioLoop9(fromDrop);
        setAudioCandidates([fromDrop]);
        setCandidatesSource("heuristic");
        setPlaylistTimeline(timeline);
        setEnableSlowedReverb(false);
      }).catch((err) => {
        if (revision !== playlistBuildRevisionRef.current) return;
        console.error("Error preparando la playlist:", err);
        setAudioError("No se pudo preparar la playlist. Prueba con menos canciones o un preset más suave.");
      }).finally(() => {
        if (revision === playlistBuildRevisionRef.current) {
          setPlaylistProcessing(false);
          setPlaylistProgressLabel("");
        }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [audioTracks]);

  // ── Masters procesados (preview = export) ────────────────────────────────────
  // 16:9 procesa el tema entero una sola vez. 9:16 procesa una ventana de salida
  // exacta, sin repetirla ni crear crossfades internos. El volumen queda en vivo.
  useEffect(() => {
    if (!audioBuffer) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProcessingLoop16(true);
      const masterPromise = audioTracks.length > 0
        ? Promise.resolve(audioBuffer)
        : buildProcessedOneShotBuffer({
            sourceBuffer: audioBuffer,
            enableSlowedReverb,
            reverbSettings,
          });
      masterPromise
        .then((buffer) => {
          const master = longFormAudioMode === "repeat"
            ? repeatOneShotMasterWithCrossfade(buffer, longFormRepeatCount)
            : buffer;
          if (!cancelled) {
            setProcessedLoop16(master);
            setTarget16x9Duration(master.duration);
          }
        })
        .catch((err) => {
          console.error("Error renderizando el ciclo de loop 16:9:", err);
          if (!cancelled) setAudioError("No se pudo renderizar el preview de música 16:9.");
        })
        .finally(() => {
          if (!cancelled) setProcessingLoop16(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [audioBuffer, audioTracks.length, enableSlowedReverb, reverbSettings, longFormAudioMode, longFormRepeatCount]);

  useEffect(() => {
    if (!audioBuffer) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProcessingLoop9(true);
      buildProcessedOneShotBuffer({
        sourceBuffer: audioBuffer,
        sourceStart: shortAudioSelection?.start ?? 0,
        targetDurationSec: target9x16Duration,
        enableSlowedReverb,
        reverbSettings,
      })
        .then((buffer) => {
          if (!cancelled) setProcessedLoop9(buffer);
        })
        .catch((err) => {
          console.error("Error renderizando el ciclo de loop 9:16:", err);
          if (!cancelled) setAudioError("No se pudo renderizar el preview de música 9:16.");
        })
        .finally(() => {
          if (!cancelled) setProcessingLoop9(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [audioBuffer, shortAudioSelection?.start, target9x16Duration, enableSlowedReverb, reverbSettings]);

  // ── Transporte de audio por formato ──────────────────────────────────────────
  // El player repite el master completo solo al reiniciar el preview del video.
  // La posición de arranque sale del reloj RAF (elapsed16Ref), no del state (evita
  // stale closures); el volumen/mute van en vivo vía GainNode.
  useEffect(() => {
    if (!audioFile || isExporting) {
      audioPlayer16x9Ref.current?.pause();
      return;
    }
    if (!audioPlayer16x9Ref.current) {
      audioPlayer16x9Ref.current = new LoopBufferPlayer();
    }
    const player = audioPlayer16x9Ref.current;

    // In split view only the active format is audible; in single-format views only that format
    const audible = viewLayout === "16x9";
    const effVolume = muted16x9 ? 0 : previewVolume16x9;

    let cancelled = false;
    if (isPlaying16x9 && effVolume > 0 && audible && processedLoop16) {
      player.setVolume(effVolume);
      if (player.decodedBuffer !== processedLoop16) {
        void player.setBuffer(processedLoop16).then(() => {
          if (cancelled || player.decodedBuffer !== processedLoop16 || player.isPlaying) return;
          const dur = Math.max(0.1, processedLoop16.duration);
          return player.play(elapsed16Ref.current % dur);
        });
      } else if (!player.isPlaying) {
        const dur = Math.max(0.1, processedLoop16.duration);
        void player.play(elapsed16Ref.current % dur);
      }
    } else {
      player.pause();
    }
    return () => { cancelled = true; };
  }, [isPlaying16x9, audioFile, audioBuffer, processedLoop16, previewVolume16x9, muted16x9, viewLayout, activePreviewFormat, isExporting]);

  // Transporte 9:16 (simétrico al 16:9)
  useEffect(() => {
    if (!audioFile || isExporting) {
      audioPlayer9x16Ref.current?.pause();
      return;
    }
    if (!audioPlayer9x16Ref.current) {
      audioPlayer9x16Ref.current = new LoopBufferPlayer();
    }
    const player = audioPlayer9x16Ref.current;

    const audible = viewLayout === "9x16";
    const effVolume = muted9x16 ? 0 : previewVolume9x16;

    let cancelled = false;
    if (isPlaying9x16 && effVolume > 0 && audible && processedLoop9) {
      player.setVolume(effVolume);
      if (player.decodedBuffer !== processedLoop9) {
        void player.setBuffer(processedLoop9).then(() => {
          if (cancelled || player.decodedBuffer !== processedLoop9 || player.isPlaying) return;
          const dur = Math.max(0.1, processedLoop9.duration);
          return player.play(elapsed9Ref.current % dur);
        });
      } else if (!player.isPlaying) {
        const dur = Math.max(0.1, processedLoop9.duration);
        void player.play(elapsed9Ref.current % dur);
      }
    } else {
      player.pause();
    }
    return () => { cancelled = true; };
  }, [isPlaying9x16, audioFile, audioBuffer, processedLoop9, previewVolume9x16, muted9x16, viewLayout, activePreviewFormat, isExporting]);

  const handleUpdateReverbPreset = (key: string) => {
    setActiveReverbPreset(key);
    const s = REVERB_PRESETS[key]?.settings || DEFAULT_SETTINGS;
    setReverbSettings(s);
  };

  const handleUpdateReverbSetting = <K extends keyof ReverbSettings>(
    key: K,
    val: ReverbSettings[K]
  ) => {
    const updated = { ...reverbSettings, [key]: val };
    setReverbSettings(updated);
  };

  // 16:9 Scrubber & Manual Seeking
  // Sin video cargado el seek sigue funcionando para la música (Estudio de canción):
  // solo se salta el mapeo al <video>, que antes hacía early-return y mudeaba el transporte.
  const handleSeek16x9 = (time: number) => {
    const exportT = Math.max(0, time);
    const media = video16x9ElRef.current;
    if (media instanceof HTMLVideoElement) {
      const selection = visualLoop16Ref.current;
      const vidDur = selection?.duration ?? (video16x9Duration > 0 ? video16x9Duration : 0);
      const vidT = vidDur > 0
        ? sourceTimeForExport(
            exportT,
            vidDur,
            seamMode16x9Ref.current,
            selection?.start ?? 0,
            calmPlaybackRate16x9Ref.current,
            target16x9DurationRef.current,
            extendMinRate16x9Ref.current
          )
        : exportT;
      media.currentTime = vidT;
    }
    elapsed16Ref.current = exportT;
    setPlaybackTime16x9(exportT);
    // El buffer del player YA es el ciclo procesado: la posición dentro de él es
    // el tiempo de video módulo la duración del ciclo (misma relación que el export).
    const player16 = audioPlayer16x9Ref.current;
    const cycle16 = player16?.decodedBuffer;
    if (player16 && cycle16 && cycle16.duration > 0) {
      player16.seek(exportT % cycle16.duration);
    }
  };

  // 9:16 Scrubber & Manual Seeking
  const handleSeek9x16 = (time: number) => {
    const exportT = Math.max(0, time);
    const media = video9x16ElRef.current;
    if (media instanceof HTMLVideoElement) {
      const selection = visualLoop9Ref.current;
      const vidDur = selection?.duration ?? (video9x16Duration > 0 ? video9x16Duration : 0);
      const vidT = vidDur > 0
        ? sourceTimeForExport(
            exportT,
            vidDur,
            seamMode9x16Ref.current,
            selection?.start ?? 0,
            calmPlaybackRate9x16Ref.current,
            target9x16DurationRef.current,
            extendMinRate9x16Ref.current
          )
        : exportT;
      media.currentTime = vidT;
    }
    elapsed9Ref.current = exportT;
    setPlaybackTime9x16(exportT);
    const player9 = audioPlayer9x16Ref.current;
    const cycle9 = player9?.decodedBuffer;
    if (player9 && cycle9 && cycle9.duration > 0) {
      player9.seek(exportT % cycle9.duration);
    }
  };

  // Full stop: pause playback and rewind video, timeline and music to 0
  const handleStop16x9 = () => {
    setIsPlaying16x9(false);
    handleSeek16x9(0);
  };
  const handleStop9x16 = () => {
    setIsPlaying9x16(false);
    handleSeek9x16(0);
  };

  const selectShortAudioCandidate = (candidate: LoopCandidate) => {
    if (!audioBuffer) return;
    setAudioLoop9({
      ...candidate,
      ...clampOneShotWindow(candidate.start, shortSourceWindowSec, audioBuffer.duration),
    });
  };

  // Re-análisis de puntos de entrada para el Short. El candidato solo decide dónde
  // empieza; la duración de salida permanece fija y nunca se loopea dentro del vídeo.
  const handleReanalyzeShort = () => {
    if (!audioFile || !audioBuffer) return;
    setAnalyzingAudio(true);
    setCandidatesSource(null);
    if (audioTracks.length > 1) {
      window.setTimeout(() => {
        try {
          const local = analyzeLocalLoops(audioBuffer, {
            minDuration: 8,
            maxDuration: Math.min(150, audioBuffer.duration / 2),
            candidates: 6,
          });
          setAudioCandidates(local);
          setCandidatesSource("local");
          if (local.length) {
            selectShortAudioCandidate(pickBestAudioLoop(local, {
              songDuration: audioBuffer.duration,
              targetSec: target9x16Duration,
              preferTime: audioAnalysis?.dropTime,
            }));
          }
        } catch (error) {
          console.warn("No se pudo analizar la playlist localmente:", error);
          setCandidatesSource("heuristic");
        } finally {
          setAnalyzingAudio(false);
        }
      }, 0);
      return;
    }
    void analyzeMusic(audioFile, {
      minDuration: 8,
      maxDuration: Math.min(150, audioBuffer.duration / 2),
      candidates: 10,
    })
      .then((cands) => {
        setAudioCandidates(cands);
        setCandidatesSource("companion");
        if (!cands.length) return;
        selectShortAudioCandidate(pickBestAudioLoop(cands, {
          songDuration: audioBuffer.duration,
          targetSec: target9x16Duration,
          preferTime: audioAnalysis?.dropTime,
        }));
      })
      .catch(async () => {
        try {
          const local = analyzeLocalLoops(audioBuffer, {
            minDuration: 8,
            maxDuration: Math.min(150, audioBuffer.duration / 2),
            candidates: 4,
          });
          if (local.length) {
            setAudioCandidates([
              ...local,
              {
                start: 0,
                end: audioBuffer.duration,
                duration: audioBuffer.duration,
                score: 0,
                label: "Canción completa",
              },
            ]);
            setCandidatesSource("local");
            selectShortAudioCandidate(pickBestAudioLoop(local, {
              songDuration: audioBuffer.duration,
              targetSec: target9x16Duration,
              preferTime: audioAnalysis?.dropTime,
            }));
          } else {
            setCandidatesSource("heuristic");
            setError(
              "No se pudo analizar la canción (companion no activo). Recorta a mano en el modo ✂️ Recortar."
            );
          }
        } catch {
          setCandidatesSource("heuristic");
          setError(
            "No se pudo analizar la canción (companion no activo). Recorta a mano en el modo ✂️ Recortar."
          );
        }
      })
      .finally(() => setAnalyzingAudio(false));
  };

  // Transporte de música (sección Slowed+Reverb): controla el formato audible actual.
  // Funciona SIN video cargado (los seek ya no hacen early-return sin media).
  const musicIs16 = activePreviewFormat === "16x9";
  const musicPlaying = musicIs16 ? isPlaying16x9 : isPlaying9x16;
  const musicSeek = musicIs16 ? handleSeek16x9 : handleSeek9x16;
  const musicTogglePlay = () => {
    if (musicPlaying) {
      if (musicIs16) {
        isPlaying16x9Ref.current = false;
        setIsPlaying16x9(false);
      } else {
        isPlaying9x16Ref.current = false;
        setIsPlaying9x16(false);
      }
      return;
    }
    stopAudioExcept(musicIs16 ? "main16" : "main9");
    if (musicIs16) {
      isPlaying16x9Ref.current = true;
      setIsPlaying16x9(true);
    } else {
      isPlaying9x16Ref.current = true;
      setIsPlaying9x16(true);
    }
  };
  const activeCycle = musicIs16 ? processedLoop16 : processedLoop9;
  const activeLoopDur = Math.max(0.5, activeCycle?.duration ?? 0.5);
  const musicDraftTime = musicIs16 ? playbackTime16x9 : playbackTime9x16;
  const musicLoopPos = musicDraftTime % activeLoopDur;

  const handleDownloadThumbnail = async (format: "16x9" | "9x16") => {
    const media = format === "16x9" ? video16x9El : video9x16El;
    if (!media) return;
    if (media instanceof HTMLVideoElement) {
      try {
        await new Promise<void>((resolve, reject) => {
          let timeout = 0;
          const cleanup = () => {
            window.clearTimeout(timeout);
            media.removeEventListener("seeked", done);
            media.removeEventListener("loadeddata", done);
            media.removeEventListener("canplay", done);
            media.removeEventListener("error", failed);
          };
          const done = () => {
            cleanup();
            resolve();
          };
          const failed = () => {
            cleanup();
            reject(new Error("No se pudo decodificar el vídeo"));
          };
          timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("El vídeo no entregó un fotograma a tiempo"));
          }, 4_000);
          media.addEventListener("seeked", done, { once: true });
          media.addEventListener("loadeddata", done, { once: true });
          media.addEventListener("canplay", done, { once: true });
          media.addEventListener("error", failed, { once: true });
          const duration = Number.isFinite(media.duration) ? media.duration : 0;
          const minimumFrameTime = Math.min(0.04, Math.max(0.001, duration / 2));
          media.currentTime = Math.min(Math.max(minimumFrameTime, media.currentTime || 0), Math.max(minimumFrameTime, duration - 0.001));
        });
      } catch {
        setError("La portada espera un fotograma real del vídeo. Espera un instante y vuelve a intentarlo.");
        return;
      }
    }
    const out = document.createElement("canvas");
    if (format === "16x9") {
      out.width = 1280;
      out.height = 720;
    } else {
      out.width = 1080;
      out.height = 1920;
    }
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const is16 = format === "16x9";
    const visual = is16 ? visualLoop16 : visualLoop9;
    const sourceDuration = Math.max(
      0.5,
      visual?.duration ?? ((is16 ? video16x9Duration : video9x16Duration) || 10)
    );
    const thumbnailSeamMode = is16 ? seamMode16x9 : seamMode9x16;
    const thumbnailParticles = is16 ? particles16x9 : particles9x16;
    const thumbnailTargetDuration = is16 ? target16x9Duration : target9x16Duration;
    const thumbnailCycle = computeVisualCycleDuration(
      {
        seamMode: thumbnailSeamMode,
        enableSeamlessLoop: true,
        duration: sourceDuration,
        calmPlaybackRate: is16 ? calmPlaybackRate16x9 : calmPlaybackRate9x16,
      },
      sourceDuration,
      media instanceof HTMLVideoElement
    );
    const config: MangaMotionConfig = {
      ...DEFAULT_MANGA_CONFIG,
      aspectRatio: is16 ? "16:9" : "9:16",
      duration: thumbnailCycle,
      cameraMove: is16 ? camera16x9 : camera9x16,
      cameraIntensity: is16 ? cameraIntensity16x9 : cameraIntensity9x16,
      aestheticStyle: is16 ? style16x9 : style9x16,
      colorGrade: is16 ? colorGrade16x9 : colorGrade9x16,
      particles: thumbnailParticles,
      particleIntensity: is16 ? particleIntensity16x9 : particleIntensity9x16,
      particleSpeed: is16 ? particleSpeed16x9 : particleSpeed9x16,
      particleControls: particleControlsForPreview(
        is16 ? particleControls16x9 : particleControls9x16,
        thumbnailCycle,
        thumbnailTargetDuration,
        thumbnailParticles
      ),
      seamMode: thumbnailSeamMode,
      calmPlaybackRate: is16 ? calmPlaybackRate16x9 : calmPlaybackRate9x16,
      // La portada siempre lleva la firma mínima de canal en esquina. No replica
      // la marca de agua central opcional del vídeo.
      watermarkEnabled: false,
    };
    renderMangaMotionFrame(
      ctx,
      media,
      config,
      out.width,
      out.height,
      is16 ? playbackTime16x9 : playbackTime9x16,
      null,
      new PhysicsParticleSystem(),
      0
    );
    drawThumbnailChannelMark(ctx, { width: out.width, height: out.height, text: watermarkText });
    out.toBlob((blob) => {
      if (!blob) return;
      const songClean = cleanSongName(audioFileName || "silent_vigil");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `portada_${format}_${songClean.toLowerCase().replace(/\s+/g, "_")}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      void persistToDark(blob, format === "16x9" ? "thumbs" : "covers").then((p) => {
        if (p.path) setSavedCoverPath(p.path);
      });
    }, "image/jpeg", 0.94);
  };

  // Copy to clipboard helper
  const copyToClipboard = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  // Smooth 60 FPS Unified Animation Loop
  useEffect(() => {
    let animId: number;
    let lastTime: number | null = null;
    let lastUi16 = 0;
    let lastUi9 = 0;

    let seenKick16 = draftKick16Ref.current;
    let seenKick9 = draftKick9Ref.current;

    const render = (now: number) => {
      const dt = lastTime == null ? 0 : Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (draftKick16Ref.current !== seenKick16) {
        seenKick16 = draftKick16Ref.current;
        elapsed16Ref.current = 0;
      }
      if (draftKick9Ref.current !== seenKick9) {
        seenKick9 = draftKick9Ref.current;
        elapsed9Ref.current = 0;
      }
      let elapsed16x9 = elapsed16Ref.current;
      let elapsed9x16 = elapsed9Ref.current;

      // When exporting, do NOT interfere with video decoder
      if (isExportingRef.current) {
        const v16 = video16x9ElRef.current;
        const v9 = video9x16ElRef.current;
        if (v16 instanceof HTMLVideoElement && !v16.paused) v16.pause();
        if (v9 instanceof HTMLVideoElement && !v9.paused) v9.pause();
        animId = requestAnimationFrame(render);
        return;
      }

      // ================= 1. RENDER 16:9 VIEWPORT =================
      const canvas16 = canvas16x9Ref.current;
      const media16 = video16x9El;
      if (canvas16 && canvas16.getContext("2d")) {
        const ctx = canvas16.getContext("2d")!;
        const W = canvas16.width;
        const H = canvas16.height;

        // El reloj avanza aunque no haya clip cargado: permite escuchar la música
        // (Estudio de canción / transporte) sin video y mantiene el scrubber vivo.
        const targetDur16 = Math.max(1, target16x9DurationRef.current);
        if (isPlaying16x9Ref.current) {
          elapsed16x9 += dt;
          // NO wrap at targetDur: dejamos elapsed monótono creciente para que
          // el pipeline visual (cámara, partículas) NO sufra discontinuidades
          // cuando el bucle se reinicia. sourceTimeForExport y renderMangaMotionFrame
          // usan internamente % para mantener el contenido cíclico.
          elapsed16Ref.current = elapsed16x9;
          if (now - lastUi16 > 100) {
            lastUi16 = now;
            setPlaybackTime16x9(elapsed16x9 % targetDur16);
          }
        }

        if (media16) {
          const visual16 = visualLoop16Ref.current;
          const vidDur16 = Math.max(1, visual16?.duration ?? (video16x9Duration || 10));
          const sourceStart16 = visual16?.start ?? 0;
          if (media16 instanceof HTMLVideoElement && !media16.paused) {
            media16.pause();
          }

          const seam16 = seamMode16x9Ref.current;
          const calmRate16 = calmPlaybackRate16x9Ref.current;
          const extendMin16 = extendMinRate16x9Ref.current;
          const rate16 = seam16 === "extend"
            ? resolveExtendPlaybackRate(vidDur16, targetDur16, extendMin16)
            : calmRate16;
          const cycle16 = computeVisualCycleDuration(
            {
              seamMode: seam16,
              enableSeamlessLoop: true,
              duration: targetDur16,
              calmPlaybackRate: calmRate16,
              extendMinPlaybackRate: extendMin16,
            },
            vidDur16,
            media16 instanceof HTMLVideoElement
          );
          const config16Live: MangaMotionConfig = {
            ...DEFAULT_MANGA_CONFIG,
            aspectRatio: "16:9",
            duration: cycle16,
            cameraMove: camera16x9Ref.current,
            cameraIntensity: cameraIntensity16x9Ref.current,
            aestheticStyle: style16x9Ref.current,
            colorGrade: colorGrade16x9Ref.current,
            particles: particles16x9RefState.current,
            particleIntensity: particleIntensity16x9Ref.current,
            particleSpeed: particleSpeed16x9Ref.current,
            particleControls: particleControlsForPreview(
              particleControls16x9Ref.current,
              cycle16,
              targetDur16,
              particles16x9RefState.current
            ),
            seamMode: seam16,
            calmPlaybackRate: calmRate16,
            extendMinPlaybackRate: extendMin16,
            loopCrossfadeDuration: visual16?.fadeSec ?? DEFAULT_MANGA_CONFIG.loopCrossfadeDuration,
            watermarkEnabled: watermarkEnabledRef.current,
            watermarkText: watermarkTextRef.current,
            watermarkOpacity: watermarkOpacityRef.current,
            watermarkStyle: watermarkStyleRef.current,
          };

          const cache16 = clipCache16Ref.current;
          const srcT16 = sourceTimeForExport(
            elapsed16x9,
            vidDur16,
            seam16,
            sourceStart16,
            calmRate16,
            targetDur16,
            extendMin16
          );
          const frame16 = cache16 ? clipFrameAt(cache16, srcT16) : null;
          const previewSource16 = frame16
            || (!(media16 instanceof HTMLVideoElement) || media16.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
              ? media16
              : null);
          // Si el <video> todavía no tiene un frame decodificado, conservar el canvas
          // anterior. Pintar en ese estado compondría únicamente el fondo negro.
          if (previewSource16) {
            renderMangaMotionFrame(
              ctx,
              previewSource16,
              {
                ...config16Live,
                sourceTransform: sourceTransformAt(
                  stabilization16x9Ref.current,
                  srcT16,
                  stabilizationEnabled16x9Ref.current,
                  stabilizationStrength16x9Ref.current / 100
                ),
              },
              W,
              H,
              elapsed16x9,
              null,
              particles16x9Ref.current,
              dt * 60
            );
          }

          if (cache16 && seam16 === "pingpong") {
            const pingState = getSmoothPingPongFrameState(elapsed16x9, vidDur16, sourceStart16);
            const endpointFrame = pingState.endpoint
              ? clipFrameAt(cache16, pingState.endpointTime)
              : null;
            if (endpointFrame && pingState.endpointMix > 0) {
              const blend = blendCanvas16Ref.current ?? document.createElement("canvas");
              blendCanvas16Ref.current = blend;
              if (blend.width !== W || blend.height !== H) {
                blend.width = W;
                blend.height = H;
              }
              const blendCtx = blend.getContext("2d");
              if (blendCtx) {
                renderMangaMotionFrame(
                  blendCtx,
                  endpointFrame,
                  {
                    ...config16Live,
                    particles: "none",
                    sourceTransform: sourceTransformAt(
                      stabilization16x9Ref.current,
                      pingState.endpointTime,
                      stabilizationEnabled16x9Ref.current,
                      stabilizationStrength16x9Ref.current / 100
                    ),
                  },
                  W,
                  H,
                  elapsed16x9,
                  null,
                  blendParticles16Ref.current,
                  0
                );
                ctx.save();
                ctx.globalAlpha = pingState.endpointMix;
                ctx.drawImage(blend, 0, 0);
                ctx.restore();
              }
            }
          }

          const fade16 = computeVisualCrossfadeDuration(config16Live, cycle16);
          if (cache16 && fade16 > 0) {
            const isForward16 = seam16 === "smooth" || seam16 === "calm" || seam16 === "extend";
            const fwd16 = isForward16
              ? getForwardLoopFrameState(
                  elapsed16x9,
                  cycle16,
                  vidDur16,
                  sourceStart16,
                  fade16,
                  visual16?.alignment ?? null,
                  seam16 === "calm" ? calmRate16 : seam16 === "extend" ? rate16 : 1
                )
              : null;
            const inTrans16 = fwd16 ? fwd16.inTransition : elapsed16x9 % cycle16 >= cycle16 - fade16;
            if (inTrans16) {
              const headFrame = clipFrameAt(cache16, sourceStart16);
              if (headFrame) {
                const blend = blendCanvas16Ref.current ?? document.createElement("canvas");
                blendCanvas16Ref.current = blend;
                if (blend.width !== W || blend.height !== H) {
                  blend.width = W;
                  blend.height = H;
                }
                const blendCtx = blend.getContext("2d");
                if (blendCtx) {
                  renderMangaMotionFrame(
                    blendCtx,
                    headFrame,
                    { ...config16Live, particles: "none" },
                    W,
                    H,
                    0,
                    null,
                    blendParticles16Ref.current,
                    0
                  );
                  const alpha = fwd16 ? fwd16.mix : 0.5 - 0.5 * Math.cos(((elapsed16x9 % cycle16) - (cycle16 - fade16)) / fade16 * Math.PI);
                  const ali = fwd16?.alignment;
                  if (ali) {
                    const rot = (ali.rotation * Math.PI) / 180;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    ctx.translate(W / 2 + ali.dx, H / 2 + ali.dy);
                    ctx.rotate(rot);
                    ctx.scale(ali.scale, ali.scale);
                    ctx.drawImage(blend, -W / 2, -H / 2, W, H);
                    ctx.restore();
                  } else {
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    ctx.drawImage(blend, 0, 0);
                    ctx.restore();
                  }
                }
              }
            }
          }

          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(16, 16, 420, 52);
          ctx.fillStyle = "#f5d0fe";
          ctx.font = "600 22px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(
            `BORRADOR ${targetDur16 >= 60 ? `${targetDur16 / 60} min` : `${targetDur16}s`} · ${
              seam16 === "pingpong"
                ? "boomerang suave"
                : seam16 === "smooth"
                  ? "fundido"
                  : seam16 === "calm"
                    ? `continuo ${calmRate16.toFixed(2)}x`
                    : seam16 === "extend"
                      ? `extender ${rate16.toFixed(2)}x`
                      : "corte"
            }${cache16 ? "" : " · cargando clip…"}`,
            28,
            50
          );
          ctx.restore();
        } else {
          ctx.fillStyle = "#09090b";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#71717a";
          ctx.font = "bold 20px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("🖥️ Sube un video o imagen 16:9 para previsualizar", W / 2, H / 2);
        }
      }

      // ================= 2. RENDER 9:16 VIEWPORT =================
      const canvas9 = canvas9x16Ref.current;
      const media9 = video9x16El;
      if (canvas9 && canvas9.getContext("2d")) {
        const ctx = canvas9.getContext("2d")!;
        const W = canvas9.width;
        const H = canvas9.height;

        const targetDur9 = Math.max(1, target9x16DurationRef.current);
        if (isPlaying9x16Ref.current) {
          elapsed9x16 += dt;
          // Misma política que 16:9: SIN wrap para evitar parpadeo negro en el
          // reinicio del bucle. La envolvente de cámara/partículas se mantiene
          // continua; sourceTimeForExport hace el ciclo interno.
          elapsed9Ref.current = elapsed9x16;
          if (now - lastUi9 > 100) {
            lastUi9 = now;
            setPlaybackTime9x16(elapsed9x16 % targetDur9);
          }
        }

        if (media9) {
          const visual9 = visualLoop9Ref.current;
          const vidDur9 = Math.max(1, visual9?.duration ?? (video9x16Duration || 10));
          const sourceStart9 = visual9?.start ?? 0;
          if (media9 instanceof HTMLVideoElement && !media9.paused) {
            media9.pause();
          }

          const seam9 = seamMode9x16Ref.current;
          const calmRate9 = calmPlaybackRate9x16Ref.current;
          const extendMin9 = extendMinRate9x16Ref.current;
          const rate9 = seam9 === "extend"
            ? resolveExtendPlaybackRate(vidDur9, targetDur9, extendMin9)
            : calmRate9;
          const cycle9 = computeVisualCycleDuration(
            {
              seamMode: seam9,
              enableSeamlessLoop: true,
              duration: targetDur9,
              calmPlaybackRate: calmRate9,
              extendMinPlaybackRate: extendMin9,
            },
            vidDur9,
            media9 instanceof HTMLVideoElement
          );
          const config9Live: MangaMotionConfig = {
            ...DEFAULT_MANGA_CONFIG,
            aspectRatio: "9:16",
            duration: cycle9,
            cameraMove: camera9x16Ref.current,
            cameraIntensity: cameraIntensity9x16Ref.current,
            aestheticStyle: style9x16Ref.current,
            colorGrade: colorGrade9x16Ref.current,
            particles: particles9x16RefState.current,
            particleIntensity: particleIntensity9x16Ref.current,
            particleSpeed: particleSpeed9x16Ref.current,
            particleControls: particleControlsForPreview(
              particleControls9x16Ref.current,
              cycle9,
              targetDur9,
              particles9x16RefState.current
            ),
            seamMode: seam9,
            calmPlaybackRate: calmRate9,
            extendMinPlaybackRate: extendMin9,
            loopCrossfadeDuration: visual9?.fadeSec ?? DEFAULT_MANGA_CONFIG.loopCrossfadeDuration,
            watermarkEnabled: watermarkEnabledRef.current,
            watermarkText: watermarkTextRef.current,
            watermarkOpacity: watermarkOpacityRef.current,
            watermarkStyle: watermarkStyleRef.current,
          };

          const cache9 = clipCache9Ref.current;
          const srcT9 = sourceTimeForExport(
            elapsed9x16,
            vidDur9,
            seam9,
            sourceStart9,
            calmRate9,
            targetDur9,
            extendMin9
          );
          const frame9 = cache9 ? clipFrameAt(cache9, srcT9) : null;
          const previewSource9 = frame9
            || (!(media9 instanceof HTMLVideoElement) || media9.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
              ? media9
              : null);
          if (previewSource9) {
            renderMangaMotionFrame(
              ctx,
              previewSource9,
              {
                ...config9Live,
                sourceTransform: sourceTransformAt(
                  stabilization9x16Ref.current,
                  srcT9,
                  stabilizationEnabled9x16Ref.current,
                  stabilizationStrength9x16Ref.current / 100
                ),
              },
              W,
              H,
              elapsed9x16,
              null,
              particles9x16Ref.current,
              dt * 60
            );
          }

          if (cache9 && seam9 === "pingpong") {
            const pingState = getSmoothPingPongFrameState(elapsed9x16, vidDur9, sourceStart9);
            const endpointFrame = pingState.endpoint
              ? clipFrameAt(cache9, pingState.endpointTime)
              : null;
            if (endpointFrame && pingState.endpointMix > 0) {
              const blend = blendCanvas9Ref.current ?? document.createElement("canvas");
              blendCanvas9Ref.current = blend;
              if (blend.width !== W || blend.height !== H) {
                blend.width = W;
                blend.height = H;
              }
              const blendCtx = blend.getContext("2d");
              if (blendCtx) {
                renderMangaMotionFrame(
                  blendCtx,
                  endpointFrame,
                  {
                    ...config9Live,
                    particles: "none",
                    sourceTransform: sourceTransformAt(
                      stabilization9x16Ref.current,
                      pingState.endpointTime,
                      stabilizationEnabled9x16Ref.current,
                      stabilizationStrength9x16Ref.current / 100
                    ),
                  },
                  W,
                  H,
                  elapsed9x16,
                  null,
                  blendParticles9Ref.current,
                  0
                );
                ctx.save();
                ctx.globalAlpha = pingState.endpointMix;
                ctx.drawImage(blend, 0, 0);
                ctx.restore();
              }
            }
          }

          const fade9 = computeVisualCrossfadeDuration(config9Live, cycle9);
          if (cache9 && fade9 > 0) {
            const isForward9 = seam9 === "smooth" || seam9 === "calm" || seam9 === "extend";
            const fwd9 = isForward9
              ? getForwardLoopFrameState(
                  elapsed9x16,
                  cycle9,
                  vidDur9,
                  sourceStart9,
                  fade9,
                  visual9?.alignment ?? null,
                  seam9 === "calm" ? calmRate9 : seam9 === "extend" ? rate9 : 1
                )
              : null;
            const inTrans9 = fwd9 ? fwd9.inTransition : elapsed9x16 % cycle9 >= cycle9 - fade9;
            if (inTrans9) {
              const headFrame = clipFrameAt(cache9, sourceStart9);
              if (headFrame) {
                const blend = blendCanvas9Ref.current ?? document.createElement("canvas");
                blendCanvas9Ref.current = blend;
                if (blend.width !== W || blend.height !== H) {
                  blend.width = W;
                  blend.height = H;
                }
                const blendCtx = blend.getContext("2d");
                if (blendCtx) {
                  renderMangaMotionFrame(
                    blendCtx,
                    headFrame,
                    { ...config9Live, particles: "none" },
                    W,
                    H,
                    0,
                    null,
                    blendParticles9Ref.current,
                    0
                  );
                  const alpha = fwd9 ? fwd9.mix : 0.5 - 0.5 * Math.cos(((elapsed9x16 % cycle9) - (cycle9 - fade9)) / fade9 * Math.PI);
                  const ali = fwd9?.alignment;
                  if (ali) {
                    const rot = (ali.rotation * Math.PI) / 180;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    ctx.translate(W / 2 + ali.dx, H / 2 + ali.dy);
                    ctx.rotate(rot);
                    ctx.scale(ali.scale, ali.scale);
                    ctx.drawImage(blend, -W / 2, -H / 2, W, H);
                    ctx.restore();
                  } else {
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    ctx.drawImage(blend, 0, 0);
                    ctx.restore();
                  }
                }
              }
            }
          }

          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(16, 16, 520, 56);
          ctx.fillStyle = "#fde68a";
          ctx.font = "600 28px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(
            `BORRADOR ${targetDur9}s · ${
              seam9 === "pingpong"
                ? "boomerang suave"
                : seam9 === "smooth"
                  ? "fundido"
                  : seam9 === "calm"
                    ? `continuo ${calmRate9.toFixed(2)}x`
                    : seam9 === "extend"
                      ? `extender ${rate9.toFixed(2)}x`
                      : "corte"
            }${cache9 ? "" : " · cargando clip…"}`,
            28,
            54
          );
          ctx.restore();
        } else {
          ctx.fillStyle = "#09090b";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#71717a";
          ctx.font = "bold 20px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("📱 Sube un video o imagen 9:16 para previsualizar", W / 2, H / 2);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [video16x9El, video16x9Duration, video9x16El, video9x16Duration]);

  // Single source of truth for export configs (used by singles AND batch export)
  const buildExportConfig = (
    format: "16x9" | "9x16",
    durationOverride?: number
  ): MangaMotionConfig =>
    format === "16x9"
      ? {
          ...DEFAULT_MANGA_CONFIG,
          aspectRatio: "16:9",
          duration: durationOverride ?? target16x9Duration,
          cameraMove: camera16x9,
          cameraIntensity: cameraIntensity16x9,
          aestheticStyle: style16x9,
          colorGrade: colorGrade16x9,
          particles: particles16x9,
          particleIntensity: particleIntensity16x9,
          particleSpeed: particleSpeed16x9,
          particleControls: particleControls16x9,
          seamMode: seamMode16x9,
          calmPlaybackRate: calmPlaybackRate16x9,
          extendMinPlaybackRate: extendMinRate16x9,
          enableSeamlessLoop: true,
          loopCrossfadeDuration: visualLoop16?.fadeSec ?? 0.4,
          watermarkEnabled: watermarkEnabled,
          watermarkText: watermarkText,
          watermarkOpacity: watermarkOpacity,
          watermarkStyle,
        }
      : {
          ...DEFAULT_MANGA_CONFIG,
          aspectRatio: "9:16",
          duration: durationOverride ?? target9x16Duration,
          cameraMove: camera9x16,
          cameraIntensity: cameraIntensity9x16,
          aestheticStyle: style9x16,
          colorGrade: colorGrade9x16,
          particles: particles9x16,
          particleIntensity: particleIntensity9x16,
          particleSpeed: particleSpeed9x16,
          particleControls: particleControls9x16,
          seamMode: seamMode9x16,
          calmPlaybackRate: calmPlaybackRate9x16,
          extendMinPlaybackRate: extendMinRate9x16,
          enableSeamlessLoop: true,
          loopCrossfadeDuration: visualLoop9?.fadeSec ?? 0.4,
          watermarkEnabled: watermarkEnabled,
          watermarkText: watermarkText,
          watermarkOpacity: watermarkOpacity,
          watermarkStyle,
        };

  // Master audio por formato, usando el mismo pipeline one-shot del preview.
  const buildExportAudio = async (format: "16x9" | "9x16"): Promise<AudioBuffer | null> => {
    if (!audioBuffer) return null;
    if (format === "16x9") {
      if (processedLoop16 && !processingLoop16) {
        return copyOneShotMaster(
          processedLoop16,
          processedLoop16.duration,
          previewVolume16x9
        );
      }
      return buildProcessedOneShotBuffer({
        sourceBuffer: audioBuffer,
        enableSlowedReverb,
        reverbSettings,
        volume: previewVolume16x9,
      });
    }
    if (processedLoop9 && !processingLoop9) {
      return copyOneShotMaster(
        processedLoop9,
        target9x16Duration,
        previewVolume9x16
      );
    }
    return buildProcessedOneShotBuffer({
      sourceBuffer: audioBuffer,
      sourceStart: shortAudioSelection?.start ?? 0,
      targetDurationSec: target9x16Duration,
      enableSlowedReverb,
      reverbSettings,
      volume: previewVolume9x16,
    });
  };

  const shortExportConstraint = (): string | null => {
    if (video9x16Duration > 60) return "El clip 9:16 dura más de 60 s. Usa un clip más corto para conservarlo completo en un Short.";
    if (target9x16Duration < shortMinDuration) return "La duración del Short debe cubrir el clip completo.";
    if (audioBuffer && shortSourceWindowSec > audioBuffer.duration + 0.01) {
      return "La canción no alcanza para esta duración de Short sin repetirse. Elige una duración menor o una canción más larga.";
    }
    return null;
  };

  const persistToDark = async (
    blob: Blob,
    kind: "16x9" | "shorts" | "thumbs" | "covers"
  ): Promise<{ path: string | null; error: string | null }> => {
    const song = cleanSongName(audioFileName);
    return saveExportMediaResult(blob, {
      kind,
      character,
      song,
    });
  };

  // Export Single 16:9 Format (Full HD 1080p / 4K)
  const handleExport16x9Only = async () => {
    if (!video16x9El) {
      setError("Por favor, sube un video o imagen 16:9 primero.");
      return;
    }
    setIsExporting(true);
    const pause16 = video16x9ElRef.current;
    const pause9 = video9x16ElRef.current;
    if (pause16 instanceof HTMLVideoElement) pause16.pause();
    if (pause9 instanceof HTMLVideoElement) pause9.pause();
    setError(null);
    setExportError(null);
    setExportSaveWarning(null);
    setExportStage("rendering_16x9");
    setExportStatusText(`🎬 Renderizando Video 16:9 (${target16x9Duration >= 60 ? `${(target16x9Duration/60).toFixed(0)} min` : `${target16x9Duration}s`} HD)...`);
    setExportProgress16x9(5);
    const abort = new AbortController();
    exportAbortRef.current = abort;

    try {
      const audio16x9Buffer = await buildExportAudio("16x9");
      const config16 = buildExportConfig("16x9", audio16x9Buffer?.duration);

      const res16 = await exportMangaMotionVideo({
        image: video16x9El,
        sourceFile: video16x9File,
        sourceStart: visualLoop16?.start,
        sourceEnd: visualLoop16?.end,
        sourceAlignment: visualLoop16?.alignment ?? null,
        sourceStabilization: stabilization16x9,
        stabilizationEnabled: stabilizationEnabled16x9,
        stabilizationStrength: stabilizationStrength16x9 / 100,
        config: config16,
        audioBuffer: audio16x9Buffer,
        sfxCues: sfx16x9Cues,
        signal: abort.signal,
        particleSystem: particles16x9Ref.current,
        onProgress: (ratio, stage) => {
          setExportProgress16x9(Math.round(ratio * 100));
          if (stage) setExportStatusText(`🎬 16:9 · ${stage}`);
        },
      });

      const url16 = URL.createObjectURL(res16.blob);
      setResult16x9Url(url16);
      setResult16x9Blob(res16.blob);
      setExportProgress16x9(100);
      const dark16 = await persistToDark(res16.blob, "16x9");
      if (dark16.path) setSaved16x9Path(dark16.path);
      if (dark16.error) setExportSaveWarning(dark16.error);
      setExportStage("completed");
      setExportStatusText(
        dark16.path ? `✅ 16:9 listo · guardado en Dark` : "✅ ¡Video 16:9 exportado con éxito!"
      );
    } catch (err: unknown) {
      if (err instanceof ExportCancelledError) {
        setExportStage("idle");
        setExportError(null);
        setExportStatusText("⏹ Exportación 16:9 cancelada");
        setExportProgress16x9(0);
      } else {
        const msg = err instanceof Error ? err.message : "Error exportando 16:9";
        setError(msg);
        // Visible en la propia sección de export (el banner general puede quedar
        // fuera del viewport y el usuario solo veía cómo desaparecía el progreso).
        setExportError(`16:9: ${msg}`);
        setExportStatusText(`❌ 16:9 · ${msg}`);
        setExportStage("idle");
      }
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
    }
  };

  // Export Single 9:16 Format (1080x1920 Vertical HD)
  const handleExport9x16Only = async () => {
    if (!video9x16El) {
      setError("Por favor, sube un video o imagen 9:16 primero.");
      return;
    }
    const shortConstraint = shortExportConstraint();
    if (shortConstraint) {
      setError(shortConstraint);
      setExportError(`9:16: ${shortConstraint}`);
      return;
    }
    setIsExporting(true);
    const pause16b = video16x9ElRef.current;
    const pause9b = video9x16ElRef.current;
    if (pause16b instanceof HTMLVideoElement) pause16b.pause();
    if (pause9b instanceof HTMLVideoElement) pause9b.pause();
    setError(null);
    setExportError(null);
    setExportSaveWarning(null);
    setExportStage("rendering_9x16");
    setExportStatusText("📱 Renderizando Video 9:16 (Vertical Shorts HD)...");
    setExportProgress9x16(5);
    const abort9 = new AbortController();
    exportAbortRef.current = abort9;

    try {
      const audio9x16Buffer = await buildExportAudio("9x16");
      const config9 = buildExportConfig("9x16", audio9x16Buffer?.duration);

      const res9 = await exportMangaMotionVideo({
        image: video9x16El,
        sourceFile: video9x16File,
        sourceStart: visualLoop9?.start,
        sourceEnd: visualLoop9?.end,
        sourceAlignment: visualLoop9?.alignment ?? null,
        sourceStabilization: stabilization9x16,
        stabilizationEnabled: stabilizationEnabled9x16,
        stabilizationStrength: stabilizationStrength9x16 / 100,
        config: config9,
        audioBuffer: audio9x16Buffer,
        sfxCues: sfx9x16Cues,
        signal: abort9.signal,
        particleSystem: particles9x16Ref.current,
        onProgress: (ratio, stage) => {
          setExportProgress9x16(Math.round(ratio * 100));
          if (stage) setExportStatusText(`📱 9:16 · ${stage}`);
        },
      });

      const url9 = URL.createObjectURL(res9.blob);
      setResult9x16Url(url9);
      setResult9x16Blob(res9.blob);
      setExportProgress9x16(100);
      const dark9 = await persistToDark(res9.blob, "shorts");
      if (dark9.path) setSaved9x16Path(dark9.path);
      if (dark9.error) setExportSaveWarning(dark9.error);
      setExportStage("completed");
      setExportStatusText(dark9.path ? `✅ 9:16 listo · guardado en Dark` : "✅ ¡Video 9:16 exportado con éxito!");
    } catch (err: unknown) {
      if (err instanceof ExportCancelledError) {
        setExportStage("idle");
        setExportError(null);
        setExportStatusText("⏹ Exportación 9:16 cancelada");
        setExportProgress9x16(0);
      } else {
        const msg = err instanceof Error ? err.message : "Error exportando 9:16";
        setError(msg);
        setExportError(`9:16: ${msg}`);
        setExportStatusText(`❌ 9:16 · ${msg}`);
        setExportStage("idle");
      }
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
    }
  };

  // Execute Sequential Safe Batch Export (16:9 first, then 9:16)
  const handleSequentialBatchExport = async () => {
    if (!video16x9El && !video9x16El) {
      setError("Por favor, sube al menos un video o imagen para exportar.");
      return;
    }
    const shortConstraint = video9x16El ? shortExportConstraint() : null;
    if (shortConstraint) {
      setError(shortConstraint);
      setExportError(`9:16: ${shortConstraint}`);
      return;
    }

    setIsExporting(true);
    const pause16c = video16x9ElRef.current;
    const pause9c = video9x16ElRef.current;
    if (pause16c instanceof HTMLVideoElement) pause16c.pause();
    if (pause9c instanceof HTMLVideoElement) pause9c.pause();
    setError(null);
    setExportError(null);
    setExportSaveWarning(null);
    setResult16x9Url(null);
    setResult9x16Url(null);
    const abortBatch = new AbortController();
    exportAbortRef.current = abortBatch;

    try {
      // ----------------------------------------------------
      // PASO 1: Exportar Video 16:9 (Landscape Full HD)
      // ----------------------------------------------------
      if (video16x9El) {
        if (abortBatch.signal.aborted) throw new ExportCancelledError();
        setExportStage("rendering_16x9");
        setExportStatusText(`🎬 Paso 1/2: Renderizando Video 16:9 (${target16x9Duration >= 60 ? `${(target16x9Duration/60).toFixed(0)} min` : `${target16x9Duration}s`})...`);
        setExportProgress16x9(5);

        const audio16x9Buffer = await buildExportAudio("16x9");
        const config16 = buildExportConfig("16x9", audio16x9Buffer?.duration);

        const res16 = await exportMangaMotionVideo({
          image: video16x9El,
          sourceFile: video16x9File,
          sourceStart: visualLoop16?.start,
          sourceEnd: visualLoop16?.end,
          sourceAlignment: visualLoop16?.alignment ?? null,
          sourceStabilization: stabilization16x9,
          stabilizationEnabled: stabilizationEnabled16x9,
          stabilizationStrength: stabilizationStrength16x9 / 100,
          config: config16,
          audioBuffer: audio16x9Buffer,
          sfxCues: sfx16x9Cues,
          signal: abortBatch.signal,
          particleSystem: particles16x9Ref.current,
          onProgress: (ratio, stage) => {
            setExportProgress16x9(Math.round(ratio * 100));
            if (stage) setExportStatusText(`🎬 16:9 · ${stage}`);
          },
        });

        const url16 = URL.createObjectURL(res16.blob);
        setResult16x9Url(url16);
        setResult16x9Blob(res16.blob);
        setExportProgress16x9(100);
        const dark16 = await persistToDark(res16.blob, "16x9");
        if (dark16.path) setSaved16x9Path(dark16.path);
        if (dark16.error) setExportSaveWarning(dark16.error);
      }

      await new Promise((r) => setTimeout(r, 200));

      // ----------------------------------------------------
      // PASO 2: Exportar Video 9:16 (Vertical Shorts HD)
      // ----------------------------------------------------
      if (video9x16El) {
        if (abortBatch.signal.aborted) throw new ExportCancelledError();
        setExportStage("rendering_9x16");
        setExportStatusText("📱 Paso 2/2: Renderizando Video 9:16 (Vertical Shorts / Reels)...");
        setExportProgress9x16(5);

        const audio9x16Buffer = await buildExportAudio("9x16");
        const config9 = buildExportConfig("9x16", audio9x16Buffer?.duration);

        const res9 = await exportMangaMotionVideo({
          image: video9x16El,
          sourceFile: video9x16File,
          sourceStart: visualLoop9?.start,
          sourceEnd: visualLoop9?.end,
          sourceAlignment: visualLoop9?.alignment ?? null,
          sourceStabilization: stabilization9x16,
          stabilizationEnabled: stabilizationEnabled9x16,
          stabilizationStrength: stabilizationStrength9x16 / 100,
          config: config9,
          audioBuffer: audio9x16Buffer,
          sfxCues: sfx9x16Cues,
          signal: abortBatch.signal,
          particleSystem: particles9x16Ref.current,
          onProgress: (ratio, stage) => {
            setExportProgress9x16(Math.round(ratio * 100));
            if (stage) setExportStatusText(`📱 9:16 · ${stage}`);
          },
        });

        const url9 = URL.createObjectURL(res9.blob);
        setResult9x16Url(url9);
        setResult9x16Blob(res9.blob);
        setExportProgress9x16(100);
        const dark9 = await persistToDark(res9.blob, "shorts");
        if (dark9.path) setSaved9x16Path(dark9.path);
        if (dark9.error) setExportSaveWarning(dark9.error);
      }

      setExportStage("completed");
      setExportStatusText("🎉 Pack Dual listo · guardado en ~/Vídeos/Dark/Youtube/export");
    } catch (err: unknown) {
      if (err instanceof ExportCancelledError) {
        setExportStage("idle");
        setExportError(null);
        setExportStatusText("⏹ Exportación cancelada");
      } else {
        const msg = err instanceof Error ? err.message : "Fallo en la exportación secuencial.";
        setError(msg);
        setExportError(msg);
        setExportStatusText(`❌ ${msg}`);
        setExportStage("idle");
      }
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
    }
  };

  // Organic YouTube Pack Metadata (memoized: only rebuilt when inputs actually change)
  const ytPack: YoutubePackResult = useMemo(
    () =>
      generateOrganicYoutubePack({
        songFileName: songTitle || audioFileName,
        characterId: character,
        isSlowedReverb: enableSlowedReverb || playlistHasSlowed,
        targetDurationMinutes: target16x9Duration / 60,
        seedOffset,
      }),
    [audioFileName, songTitle, character, enableSlowedReverb, playlistHasSlowed, target16x9Duration, seedOffset]
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-3 sm:p-5 lg:p-7 flex flex-col gap-5 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-fuchsia-950/40 border border-zinc-800 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-fuchsia-600 via-pink-500 to-amber-500 flex items-center justify-center text-2xl shadow-lg shadow-fuchsia-950/60 shrink-0">
            🎬
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Loop Studio <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-amber-400">16:9 + Shorts</span>
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Un flujo guiado para preparar el loop visual, la música, los SFX y el pack de publicación.
            </p>
          </div>
        </div>

        {/* Layout Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800 self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => handleSetLayout("16x9")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewLayout === "16x9"
                ? "bg-fuchsia-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🖥️ Video 16:9
          </button>
          <button
            type="button"
            onClick={() => handleSetLayout("9x16")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewLayout === "9x16"
                ? "bg-amber-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            📱 Short 9:16
          </button>
        </div>
      </div>

      <nav aria-label="Pasos del estudio" className="sticky top-2 z-40 grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-1.5 shadow-xl backdrop-blur md:grid-cols-4">
        {[
          { href: "#paso-1", number: "1", label: "Archivos", ready: Boolean((video16x9El || video9x16El) && audioBuffer) },
          { href: "#paso-2", number: "2", label: "Música", ready: Boolean(processedLoop16 || processedLoop9) },
          { href: "#paso-3", number: "3", label: "Revisar", ready: Boolean(video16x9El || video9x16El) },
          { href: "#paso-4", number: "4", label: "Exportar", ready: Boolean(result16x9Url || result9x16Url) },
        ].map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono ${step.ready ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}>
              {step.ready ? "✓" : step.number}
            </span>
            {step.label}
          </Link>
        ))}
      </nav>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center justify-between shadow-lg">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-white font-bold">
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: Independent Media Upload Slots */}
      <div id="paso-1" className="grid scroll-mt-24 grid-cols-1 md:grid-cols-2 gap-4">
        {/* Slot 1: Media 16:9 (Video or Image) */}
        {viewLayout === "16x9" && <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-fuchsia-400 flex items-center gap-1.5">
              <span>🖥️</span> Video / Imagen 16:9 (Landscape)
            </span>
            {video16x9Duration > 0 && (
              <span className="text-[10px] font-mono bg-fuchsia-950/80 text-fuchsia-300 px-2 py-0.5 rounded border border-fuchsia-800/50">
                {video16x9Duration.toFixed(1)}s
              </span>
            )}
          </div>
          <FileDropzone
            onFile={handleVideo16x9}
            accept="video/*,image/*"
            label={video16x9File ? `✅ ${video16x9File.name}` : "Arrastra video o imagen 16:9 aquí"}
            compact
          />
        </div>}

        {/* Slot 2: Media 9:16 (Video or Image) */}
        {viewLayout === "9x16" && <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span>📱</span> Video / Imagen 9:16 (Vertical Shorts)
            </span>
            {video9x16Duration > 0 && (
              <span className="text-[10px] font-mono bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-800/50">
                {video9x16Duration.toFixed(1)}s
              </span>
            )}
          </div>
          <FileDropzone
            onFile={handleVideo9x16}
            accept="video/*,image/*"
            label={video9x16File ? `✅ ${video9x16File.name}` : "Arrastra video o imagen 9:16 aquí"}
            compact
          />
        </div>}

        <div className="md:col-span-2">
          <AudioPlaylistPanel
            tracks={audioTracks}
            timeline={playlistTimeline}
            processing={playlistProcessing}
            progressLabel={playlistProgressLabel}
            onAdd={(files) => void handleAudioFiles(files)}
            onEffectChange={updatePlaylistEffect}
            onMove={movePlaylistTrack}
            onRemove={removePlaylistTrack}
          />
          {audioBuffer && (
            <label className="mt-3 flex flex-col gap-1 text-[10px] text-zinc-400">
              Nombre de la canción para títulos
              <input
                type="text"
                value={songTitle}
                onChange={(event) => setSongTitle(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                placeholder="Artista — Canción"
              />
            </label>
          )}
        </div>
      </div>

      {(viewLayout === "16x9" ? video16x9File : video9x16File) && (
        <section
          aria-label="Universo creativo del vídeo"
          className="rounded-2xl border border-fuchsia-900/40 bg-gradient-to-r from-zinc-900 to-fuchsia-950/20 p-4 shadow-md"
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-white">Elige el universo del clip</h2>
              <p className="text-[11px] text-zinc-400">Define el tono de títulos, descripción, etiquetas y textos de publicación.</p>
            </div>
            <span className="rounded-full border border-fuchsia-500/30 bg-zinc-950 px-2 py-1 text-[10px] font-mono text-fuchsia-200">
              {CHARACTER_DATABASE[character]?.series}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {CREATIVE_PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setCharacter(profile.id)}
                aria-pressed={character === profile.id}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  character === profile.id
                    ? "border-fuchsia-400 bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-950/40"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-fuchsia-500/60 hover:bg-zinc-800"
                }`}
              >
                <span className="block text-xs font-black">{profile.icon} {profile.label}</span>
                <span className="mt-0.5 block text-[10px] opacity-75">{profile.detail}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 2: Control Panel: Personaje & Watermark */}
      <details className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
        <summary className="cursor-pointer select-none text-sm font-bold text-zinc-300">
          🧰 Extras · personaje y marca de agua
        </summary>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Character & Atmosphere Selector */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <span>👤</span> Personaje / Serie / Atmósfera:
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {CHARACTER_DATABASE[character]?.series}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.values(CHARACTER_DATABASE).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCharacter(c.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer flex flex-col ${
                  character === c.id
                    ? "bg-fuchsia-600 text-white shadow"
                    : "bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
                }`}
              >
                <span className="font-bold">{c.name}</span>
                <span className="text-[9px] opacity-75 truncate">{c.series}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Watermark "Silent VM" Central Settings */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between gap-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <span>🛡️</span> Watermark Central Fijo:
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-fuchsia-300 font-mono text-[10px] font-bold">
                {watermarkText}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(e) => setWatermarkEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-fuchsia-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-400">Texto Watermark:</label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                disabled={!watermarkEnabled}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-zinc-400 text-[11px]">
                <span>Opacidad Central:</span>
                <span className="font-mono text-fuchsia-400 font-bold">{Math.round(watermarkOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.7"
                step="0.05"
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                disabled={!watermarkEnabled}
                className="accent-fuchsia-500 cursor-pointer mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-2 text-[10px] sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-zinc-400">
              Posición
              <select
                aria-label="Posición de la marca de agua"
                value={watermarkStyle.position ?? "bottom-center"}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({
                  ...current,
                  position: event.target.value as NonNullable<WatermarkStyleOptions["position"]>,
                }))}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
              >
                <option value="bottom-center">Abajo · centro</option>
                <option value="bottom-left">Abajo · izquierda</option>
                <option value="bottom-right">Abajo · derecha</option>
                <option value="top-center">Arriba · centro</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-zinc-400">
              <span className="flex justify-between"><span>Tamaño</span><b>{Math.round((watermarkStyle.scale ?? 1) * 100)}%</b></span>
              <input
                aria-label="Tamaño de la marca de agua"
                type="range"
                min="60"
                max="180"
                step="5"
                value={Math.round((watermarkStyle.scale ?? 1) * 100)}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({ ...current, scale: Number(event.target.value) / 100 }))}
                className="accent-fuchsia-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-400">
              <span className="flex justify-between"><span>Espaciado</span><b>{Math.round((watermarkStyle.tracking ?? 1) * 100)}%</b></span>
              <input
                aria-label="Espaciado de la marca de agua"
                type="range"
                min="50"
                max="180"
                step="5"
                value={Math.round((watermarkStyle.tracking ?? 1) * 100)}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({ ...current, tracking: Number(event.target.value) / 100 }))}
                className="accent-fuchsia-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-400">
              Color
              <input
                aria-label="Color de la marca de agua"
                type="color"
                value={watermarkStyle.color ?? "#ffffff"}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({ ...current, color: event.target.value }))}
                className="h-7 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-400">
              <span className="flex justify-between"><span>Línea</span><b>{Math.round((watermarkStyle.ruleScale ?? 1) * 100)}%</b></span>
              <input
                aria-label="Longitud de línea de la marca de agua"
                type="range"
                min="50"
                max="180"
                step="5"
                value={Math.round((watermarkStyle.ruleScale ?? 1) * 100)}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({ ...current, ruleScale: Number(event.target.value) / 100 }))}
                className="accent-fuchsia-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-400">
              <span className="flex justify-between"><span>Horizontal</span><b>{Math.round((watermarkStyle.offsetX ?? 0) * 100)}%</b></span>
              <input
                aria-label="Desplazamiento horizontal de la marca de agua"
                type="range"
                min="-20"
                max="20"
                value={Math.round((watermarkStyle.offsetX ?? 0) * 100)}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({ ...current, offsetX: Number(event.target.value) / 100 }))}
                className="accent-fuchsia-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-400">
              <span className="flex justify-between"><span>Vertical</span><b>{Math.round((watermarkStyle.offsetY ?? 0) * 100)}%</b></span>
              <input
                aria-label="Desplazamiento vertical de la marca de agua"
                type="range"
                min="-20"
                max="20"
                value={Math.round((watermarkStyle.offsetY ?? 0) * 100)}
                disabled={!watermarkEnabled}
                onChange={(event) => setWatermarkStyle((current) => ({ ...current, offsetY: Number(event.target.value) / 100 }))}
                className="accent-fuchsia-500"
              />
            </label>
            <button
              type="button"
              onClick={() => setWatermarkStyle({ ...DEFAULT_WATERMARK_STYLE })}
              className="self-end rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-semibold text-zinc-300 hover:border-fuchsia-600 hover:text-white"
            >
              Restablecer Silent Vigil
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            El preset original sigue siendo el valor inicial; los cambios se ven igual en preview y exportación.
          </p>
        </div>
      </div>
      </details>

      {/* SECTION 3: Estudio de canción (slowed + reverb) — funciona con o sin video */}
      <div id="paso-2" className="scroll-mt-24" />
      {audioBuffer && (
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-cyan-900/40 shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950 text-lg">🎛️</span>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Estudio del master
                  <span className="rounded-full border border-cyan-800/60 bg-cyan-950/50 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                    {audioTracks.length} {audioTracks.length === 1 ? "CANCIÓN" : "CANCIONES"}
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Selecciona Original, Suave, Clásico o Profundo en cada pista de la playlist. Preview y export usan el mismo master.
                </p>
              </div>
            </div>
          </div>

          {audioError && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center justify-between">
              <span>🎵⚠️ {audioError}</span>
              <button type="button" onClick={() => setAudioError(null)} className="text-red-400 hover:text-white font-bold">
                ✕
              </button>
            </div>
          )}

          <AudioLoopPanel
            audioBuffer={audioBuffer}
            candidates={musicIs16 ? [] : shortAudioCandidates}
            selected={musicIs16 ? audioLoop16 : shortAudioSelection}
            onSelect={(candidate) => {
              if (!musicIs16) selectShortAudioCandidate(candidate);
            }}
            onAnalyze={handleReanalyzeShort}
            analyzing={analyzingAudio}
            targetSeconds={musicIs16 ? target16x9Duration : target9x16Duration}
            activeFormat={activePreviewFormat}
            onFormatChange={switchAudibleFormat}
            snapSec={beatSnapSec}
            selectionMode={musicIs16 ? "full-song" : "fixed-window"}
            sourceWindowSeconds={shortSourceWindowSec}
            fullSongRepetitions={musicIs16 && longFormAudioMode === "repeat" ? longFormRepeatCount : 1}
            fullMasterLabel={audioTracks.length > 1 ? "Playlist completa" : "Canción completa"}
            sourceHint={
              analyzingAudio
                ? "Analizando la canción para sugerir buenos puntos de entrada…"
                : candidatesSource === "heuristic"
                  ? "Sugerencias básicas locales; puedes colocar el fragmento a mano."
                  : candidatesSource === "local"
                    ? "Puntos sugeridos por análisis local de ritmo y energía."
                    : candidatesSource === "companion"
                      ? "Puntos sugeridos por el análisis del companion."
                      : "Elige dónde empieza el Short; la salida conserva su duración exacta."
            }
          />

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-900/40 bg-zinc-950/70 p-3">
            <button
              type="button"
              onClick={musicTogglePlay}
              disabled={playlistProcessing || (musicIs16 ? processingLoop16 : processingLoop9)}
              className={`rounded-xl px-4 py-2 text-xs font-black transition disabled:cursor-wait disabled:opacity-40 ${musicPlaying
                ? "bg-zinc-700 text-white hover:bg-zinc-600"
                : "bg-cyan-400 text-zinc-950 hover:bg-cyan-300"}`}
            >
              {musicPlaying ? "⏸ Pausar" : "▶ Reproducir"}
            </button>
            <button
              type="button"
              onClick={() => musicSeek(0)}
              className="rounded-xl border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-600 hover:text-white"
            >
              ⏮ Inicio
            </button>
            <label className="flex min-w-[220px] flex-1 items-center gap-2">
              <span className="sr-only">Posición del master</span>
              <input
                aria-label="Posición del master"
                type="range"
                min={0}
                max={Math.max(0.1, activeLoopDur)}
                step={0.05}
                value={Math.min(musicLoopPos, Math.max(0.1, activeLoopDur))}
                onChange={(event) => musicSeek(Number(event.target.value))}
                className="w-full accent-cyan-400"
              />
              <span className="shrink-0 font-mono text-[10px] text-cyan-300">
                {formatDuration(musicLoopPos)} / {formatDuration(activeLoopDur)}
              </span>
            </label>
            <span className="text-[10px] text-zinc-500">
              {playlistProcessing || (musicIs16 ? processingLoop16 : processingLoop9)
                ? "Preparando master…"
                : `Escuchando ${musicIs16 ? "16:9" : "Short"}`}
            </span>
          </div>

          {enableSlowedReverb && (
            <div className="flex flex-col gap-4 animate-in fade-in">
              {/* Presets */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <span className="text-xs text-zinc-400 font-semibold shrink-0">Presets:</span>
                {Object.entries(REVERB_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleUpdateReverbPreset(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                      activeReverbPreset === key
                        ? "bg-cyan-500 text-zinc-950 shadow-md font-bold"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Transporte de música: A/B de presets en vivo mientras escuchas el recorte */}
              <div className="hidden" aria-hidden="true">
                <button
                  type="button"
                  onClick={musicTogglePlay}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                    musicPlaying
                      ? "bg-zinc-700 hover:bg-zinc-600 text-white"
                      : "bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-md"
                  }`}
                  title={musicPlaying ? "Pausar la canción" : "Escuchar el recorte con este preset"}
                >
                  {musicPlaying ? "⏸ Pausar" : "▶️ Escuchar"}
                </button>
                <button
                  type="button"
                  onClick={() => musicSeek(0)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  title="Volver al inicio del recorte"
                >
                  ⏮ Inicio
                </button>
                <button
                  type="button"
                  onClick={() => musicSeek(Math.max(0, musicDraftTime - 5))}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  title="Atrás 5 segundos"
                >
                  ⏪ 5s
                </button>
                <button
                  type="button"
                  onClick={() => musicSeek(musicDraftTime + 5)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  title="Adelante 5 segundos"
                >
                  ⏩ 5s
                </button>
                <div className="flex-1 min-w-[180px] flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={activeLoopDur}
                    step={0.05}
                    value={musicLoopPos}
                    onChange={(e) => musicSeek(parseFloat(e.target.value))}
                    className="flex-1 accent-cyan-400 cursor-pointer"
                    title="Posición dentro del recorte"
                  />
                  <span className="font-mono text-[10px] text-cyan-300 shrink-0">
                    {musicLoopPos.toFixed(1)}s / {activeLoopDur.toFixed(1)}s
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0 flex items-center gap-2">
                  {((musicIs16 ? processingLoop16 : processingLoop9)) ? (
                    <span className="text-cyan-400 font-semibold animate-pulse">
                      ⏳ Renderizando preview…
                    </span>
                  ) : (
                    <>
                      <span>
                        loop procesado: {activeLoopDur.toFixed(1)}s
                      </span>
                      <span>· funciona sin video</span>
                    </>
                  )}
                </span>
              </div>

              {/* Sliders avanzados: plegados por defecto (presets cubren el 90% de los casos) */}
              <details className="hidden" aria-hidden="true">
                <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                  ⚙️ Ajustes avanzados de slowed+reverb
                </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs pt-3">
                {/* Speed */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Velocidad / Pitch:</span>
                    <span className="font-mono text-cyan-400 font-bold">{reverbSettings.speed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.3"
                    step="0.01"
                    value={reverbSettings.speed}
                    onChange={(e) => handleUpdateReverbSetting("speed", parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Reverb Mix */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Mezcla Reverb:</span>
                    <span className="font-mono text-cyan-400 font-bold">{Math.round(reverbSettings.reverbMix * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.02"
                    value={reverbSettings.reverbMix}
                    onChange={(e) => handleUpdateReverbSetting("reverbMix", parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Decay */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Cola Reverb (Decay):</span>
                    <span className="font-mono text-cyan-400 font-bold">{reverbSettings.decay.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="6.0"
                    step="0.1"
                    value={reverbSettings.decay}
                    onChange={(e) => handleUpdateReverbSetting("decay", parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Lowpass */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Filtro Lowpass:</span>
                    <span className="font-mono text-cyan-400 font-bold">{(reverbSettings.lowpassHz / 1000).toFixed(1)} kHz</span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="20000"
                    step="500"
                    value={reverbSettings.lowpassHz}
                    onChange={(e) => handleUpdateReverbSetting("lowpassHz", parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Bass Boost */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Refuerzo Graves:</span>
                    <span className="font-mono text-cyan-400 font-bold">+{reverbSettings.bassDb || 0} dB</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="12"
                    step="1"
                    value={reverbSettings.bassDb || 0}
                    onChange={(e) => handleUpdateReverbSetting("bassDb", parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Crackle */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Vinilo / Crackle:</span>
                    <span className="font-mono text-cyan-400 font-bold">{Math.round((reverbSettings.crackle || 0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={reverbSettings.crackle || 0}
                    onChange={(e) => handleUpdateReverbSetting("crackle", parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: Dual Format Workspaces with Dedicated SFX Timelines & Cover Capture */}
      <div id="paso-3" className="grid scroll-mt-24 grid-cols-1 gap-6">
        {/* ==================== 16:9 DEDICATED WORKSPACE ==================== */}
        {viewLayout === "16x9" && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-zinc-900/50 border border-fuchsia-900/30 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${video16x9El && isPlaying16x9 ? "bg-fuchsia-500 animate-pulse" : "bg-zinc-600"}`} />
                <h2 className="font-bold text-sm text-white">16:9 Landscape (YouTube Desktop HD)</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadThumbnail("16x9")}
                  disabled={!video16x9El}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-fuchsia-950 hover:border-fuchsia-500/50 text-fuchsia-300 text-[11px] font-bold border border-zinc-700 transition-all cursor-pointer flex items-center gap-1 shadow"
                  title="Capturar fotograma actual como portada 16:9"
                >
                  <span>📸 Portada 16:9</span>
                </button>
                <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-fuchsia-300">
                  1920×1080
                </span>
              </div>
            </div>

            {/* 16:9 Canvas Screen */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center shadow-2xl">
              <canvas ref={canvas16x9Ref} data-testid="preview-canvas-16x9" width={1920} height={1080} className="w-full h-full object-contain" />
            </div>

            {/* 16:9 Interactive Transport Controls & Audio Volume */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSeek16x9(0)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Ir al inicio"
                  >
                    ⏮️ 0s
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek16x9(playbackTime16x9 - 0.5)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Retroceder 0.5s"
                  >
                    ⏪ -0.5s
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlaying16x9(!isPlaying16x9)}
                    className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                      isPlaying16x9 ? "bg-fuchsia-600 text-white shadow-md shadow-fuchsia-950/50" : "bg-zinc-800 text-white"
                    }`}
                  >
                    {isPlaying16x9 ? "⏸️ Pausar" : "▶️ Reproducir"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek16x9(playbackTime16x9 + 0.5)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Adelantar 0.5s"
                  >
                    ⏩ +0.5s
                  </button>
                  <button
                    type="button"
                    onClick={handleStop16x9}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-red-900 hover:text-red-200 text-zinc-300 cursor-pointer"
                    title="Detener y rebobinar (video + música a 0)"
                  >
                    ⏹️ Stop
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {audioBuffer && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setMuted16x9(!muted16x9);
                            if (!muted16x9 && previewVolume16x9 <= 0) setPreviewVolume16x9(1.0);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 border transition-all cursor-pointer ${
                            !muted16x9 && previewVolume16x9 > 0
                              ? "bg-fuchsia-950/80 border-fuchsia-500/50 text-fuchsia-300"
                              : "bg-zinc-900 border-zinc-700 text-zinc-500"
                          }`}
                        >
                          <span>{!muted16x9 && previewVolume16x9 > 0 ? "🔊 Música ON" : "🔇 Música Mute"}</span>
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={previewVolume16x9}
                          onChange={(e) => {
                            setPreviewVolume16x9(parseFloat(e.target.value));
                            if (parseFloat(e.target.value) > 0) setMuted16x9(false);
                          }}
                          className="w-20 accent-fuchsia-500 cursor-pointer"
                          title="Volumen de la música (preview y export)"
                        />
                        <span className="font-mono text-[10px] text-zinc-500 w-8">
                          {Math.round(previewVolume16x9 * 100)}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="font-mono text-fuchsia-400 font-bold">
                    ⏱️ {playbackTime16x9.toFixed(2)}s / {(target16x9Duration >= 60 ? `${(target16x9Duration / 60).toFixed(1)} min` : `${target16x9Duration}s`)}
                  </div>
                </div>
              </div>

              <input
                type="range"
                aria-label="Posición del preview 16:9"
                min="0"
                max={target16x9Duration}
                step="0.02"
                value={playbackTime16x9}
                onChange={(e) => handleSeek16x9(parseFloat(e.target.value))}
                className="w-full accent-fuchsia-500 cursor-pointer"
              />
            </div>

            <div data-testid="visual-loop-16x9" className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-950/15 p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-fuchsia-200">✂️ Recorte y loop</p>
                <span className="rounded-full bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-400">
                  {visualLoop16 ? `${visualLoop16.duration.toFixed(1)}s seleccionados` : "Sin vídeo"}
                </span>
              </div>
              {visualLoop16 && video16x9Duration > 0 && (
                <div className="mt-3">
                  <TrimTimeline
                    duration={video16x9Duration}
                    start={visualLoop16.start}
                    end={visualLoop16.end}
                    currentTime={visualLoop16.start + (playbackTime16x9 % visualLoop16.duration)}
                    onChange={({ start, end }) => updateVideoTrim("16x9", start, end)}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-zinc-300" htmlFor="continuity-16x9">Continuidad</label>
                <select
                  id="continuity-16x9"
                  aria-label="Modo de continuidad 16:9"
                  value={seamMode16x9}
                  onChange={(event) => {
                    const mode = event.target.value as SeamMode;
                    if (mode === "smooth") enableNaturalLoop("16x9");
                    else setManualLoopMode("16x9", mode);
                  }}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
                >
                  <option value="cut">■ Sin loop · corte directo</option>
                  <option value="smooth">✨ Natural · recomendado</option>
                  <option value="pingpong">↔ Boomerang suave · ida y vuelta</option>
                  <option value="extend">⏳ Extender fluido · sin cámara lenta extrema</option>
                </select>
                {seamMode16x9 === "extend" && video16x9Duration > 0 && (() => {
                  const clipDur = visualLoop16?.duration ?? video16x9Duration;
                  const plan = resolveExtendPlaybackPlan(clipDur, target16x9Duration, extendMinRate16x9);
                  return (
                    <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-2">
                      <div className="flex items-center justify-between text-[10px] text-cyan-100">
                        <span>Velocidad mínima</span>
                        <span className="font-mono font-bold text-cyan-300">{extendMinRate16x9.toFixed(2)}×</span>
                      </div>
                      <input
                        aria-label="Velocidad mínima de Extender 16:9"
                        type="range"
                        min="65"
                        max="100"
                        step="5"
                        value={Math.round(extendMinRate16x9 * 100)}
                        onChange={(event) => setExtendMinRate16x9(Number(event.target.value) / 100)}
                        className="mt-1 w-full accent-cyan-400"
                      />
                      <p className="mt-1 text-[10px] text-cyan-200">
                        {plan.rate.toFixed(2)}× · {plan.repeatCount} {plan.repeatCount === 1 ? "pasada" : "pasadas"} con unión Natural.
                      </p>
                    </div>
                  );
                })()}
                {stabilization16x9 && (
                  <p data-testid="stabilization-status-16x9" className={stabilization16x9.autoEnabled ? "text-[10px] text-emerald-300" : "text-[10px] text-zinc-500"}>
                    {stabilization16x9.autoEnabled && stabilizationEnabled16x9 ? "✓ " : ""}{stabilization16x9.reason}
                  </p>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                {analyzingVideo16 ? "Buscando una unión natural…" : seamHint16 || "El vídeo empieza limpio. Recorta y activa un loop cuando quieras."}
              </p>
              {!analyzingVideo16 && seamMode16x9 === "smooth" && (
                <div className="mt-2">
                  <VisualLoopQualityPanel
                    selection={visualLoop16}
                    candidates={visualCandidates16}
                    format="16x9"
                    onSelect={(candidate) => applyVisualCandidate("16x9", candidate)}
                  />
                </div>
              )}
            </div>

            {/* 16:9 Visual Controls */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <summary className="cursor-pointer text-xs font-bold text-zinc-400">Ajustes visuales y estabilización</summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-400 font-semibold">🎨 Filtro Visual:</label>
                <select
                  aria-label="Filtro visual 16:9"
                  value={style16x9}
                  onChange={(e) => setStyle16x9(e.target.value as AestheticStyle)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs cursor-pointer"
                >
                  {VISUAL_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-400 font-semibold">🎥 Cámara 2.5D:</label>
                <select
                  aria-label="Cámara 2.5D 16:9"
                  value={camera16x9}
                  onChange={(e) => setCamera16x9(e.target.value as CameraMovement)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs cursor-pointer"
                >
                  {CAMERA_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-400 font-semibold">✨ Partículas:</label>
                <select
                  aria-label="Partículas 16:9"
                  value={particles16x9}
                  onChange={(e) => setParticles16x9(e.target.value as ParticleType)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs cursor-pointer"
                >
                  {PARTICLE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.label}
                    </option>
                  ))}
                </select>
                {particles16x9 !== "none" && (
                  <div className="flex flex-col gap-2 pt-1.5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Intensidad</span>
                        <span className="font-mono text-fuchsia-400">{particleIntensity16x9}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={particleIntensity16x9}
                        onChange={(e) => setParticleIntensity16x9(parseInt(e.target.value))}
                        className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Velocidad</span>
                        <span className="font-mono text-fuchsia-400">{particleSpeed16x9.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="25"
                        value={Math.round(particleSpeed16x9 * 10)}
                        onChange={(e) => setParticleSpeed16x9(parseInt(e.target.value) / 10)}
                        className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                    <ParticleAdvancedControls
                      value={particleControls16x9}
                      onChange={setParticleControls16x9}
                      accentClass="accent-fuchsia-500"
                      format="16:9"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-[11px] font-semibold text-zinc-300">Corrección de microvibración</span>
                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={stabilizationEnabled16x9}
                    disabled={!stabilization16x9?.autoEnabled}
                    onChange={(event) => setStabilizationEnabled16x9(event.target.checked)}
                    className="accent-emerald-500"
                  />
                  {stabilization16x9?.autoEnabled ? "Aplicar corrección conservadora" : "Sin corrección necesaria"}
                </label>
                {stabilization16x9?.autoEnabled && stabilizationEnabled16x9 && (
                  <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
                    <span className="flex justify-between">
                      <span>Intensidad</span>
                      <span className="font-mono text-emerald-300">{stabilizationStrength16x9}%</span>
                    </span>
                    <input
                      aria-label="Intensidad de estabilización 16:9"
                      type="range"
                      min="25"
                      max="100"
                      step="5"
                      value={stabilizationStrength16x9}
                      onChange={(event) => setStabilizationStrength16x9(Number(event.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </label>
                )}
                {stabilization16x9 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                    {stabilization16x9.source === "companion-opencv" ? "Análisis avanzado · LK + RANSAC" : "Análisis básico en navegador"}
                  </span>
                )}
                <p className="text-[10px] leading-snug text-zinc-500">{stabilization16x9?.reason ?? "Se analiza al preparar el vídeo."}</p>
              </div>
            </div>
            <ColorGradeControls
              value={colorGrade16x9}
              onChange={setColorGrade16x9}
              accentClass="accent-fuchsia-500"
              format="16:9"
            />
            </details>

            {/* 16:9 DURATION SELECTOR PRESETS */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span className="font-semibold text-zinc-300">⏱️ Duración del Video Final 16:9:</span>
                <span className="font-mono text-fuchsia-400 font-bold">
                  {formatDuration(target16x9Duration)}
                </span>
              </div>
              {audioBuffer ? (
                <div className="flex flex-col gap-2 text-[11px] text-zinc-400">
                  <p className="rounded-md border border-cyan-900/70 bg-cyan-950/20 px-2 py-1 text-cyan-200">
                    Original: {formatDuration(audioBuffer.duration)} · Master procesado: {formatDuration(target16x9Duration)}
                    {enableSlowedReverb ? " (incluye velocidad slowed y cola de reverb)" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLongFormAudioMode("once")}
                      className={`px-2.5 py-1 rounded-lg font-bold ${longFormAudioMode === "once" ? "bg-fuchsia-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
                    >
                      {audioTracks.length > 1 ? "Playlist completa" : "Canción completa"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLongFormAudioMode("repeat")}
                      className={`px-2.5 py-1 rounded-lg font-bold ${longFormAudioMode === "repeat" ? "bg-fuchsia-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
                    >
                      {audioTracks.length > 1 ? "Repetir playlist" : "Repetir canción"}
                    </button>
                    {longFormAudioMode === "repeat" && (
                      <select
                        aria-label="Número de vueltas de la canción"
                        value={longFormRepeatCount}
                        onChange={(e) => setLongFormRepeatCount(parseInt(e.target.value, 10))}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-white"
                      >
                        {[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} vueltas</option>)}
                      </select>
                    )}
                  </div>
                  <p>
                    {longFormAudioMode === "repeat"
                      ? `${longFormRepeatCount} vueltas totales · duración exacta ${longFormRepeatCount}× el master procesado · uniones con fundido musical.`
                      : "El vídeo termina al acabar la canción completa procesada, sin repetirla."}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {DURATION_16X9_PRESETS.map((preset) => (
                    <button
                      key={preset.seconds}
                      type="button"
                      onClick={() => {
                        setTarget16x9Duration(preset.seconds);
                        draftKick16Ref.current += 1;
                        setIsPlaying16x9(true);
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        target16x9Duration === preset.seconds
                          ? "bg-fuchsia-600 text-white shadow-md"
                          : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>


            {/* 16:9 DEDICATED SFX TIMELINE */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <summary className="cursor-pointer text-xs font-bold text-zinc-400">🧰 Extras · efectos de sonido</summary>
            <div className="pt-3">
              <SfxLoopTimeline
                loopDuration={target16x9Duration}
                currentTime={playbackTime16x9}
                timeRef={elapsed16Ref}
                isPlaying={isPlaying16x9}
                onTogglePlay={() => setIsPlaying16x9(!isPlaying16x9)}
                cues={sfx16x9Cues}
                onCuesChange={setSfx16x9Cues}
                onSeekRequest={handleSeek16x9}
                audioContextRef={sharedAudioCtxRef}
                activeFormatFilter="16x9"
                hasMedia={Boolean(video16x9El)}
              />
            </div>
            </details>

            {/* 16:9 Fast Export Action */}
            <button
              type="button"
              onClick={() => setConfirmExport("16x9")}
              disabled={isExporting || !video16x9El}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow ${
                isExporting || !video16x9El
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-fuchsia-950/50 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              }`}
            >
              <span>⚡</span>
              <span>Exportar Solo 16:9 (Ultra Rápido Full HD)</span>
            </button>
          </div>
        )}

        {/* ==================== 9:16 DEDICATED WORKSPACE ==================== */}
        {viewLayout === "9x16" && (
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-zinc-900/50 border border-amber-900/30 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${video9x16El && isPlaying9x16 ? "bg-amber-500 animate-pulse" : "bg-zinc-600"}`} />
                <h2 className="font-bold text-sm text-white">9:16 Vertical (Shorts / Reels / TikTok)</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadThumbnail("9x16")}
                  disabled={!video9x16El}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-amber-950 hover:border-amber-500/50 text-amber-300 text-[11px] font-bold border border-zinc-700 transition-all cursor-pointer flex items-center gap-1 shadow"
                  title="Capturar fotograma actual como portada 9:16"
                >
                  <span>📸 Portada 9:16</span>
                </button>
                <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-amber-300">
                  1080×1920
                </span>
              </div>
            </div>

            {/* 9:16 Canvas Screen */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center shadow-2xl">
              <div className="h-full aspect-[9/16] bg-zinc-950 border-x border-zinc-800 shadow-2xl">
                <canvas ref={canvas9x16Ref} data-testid="preview-canvas-9x16" width={1080} height={1920} className="w-full h-full object-contain" />
              </div>
            </div>

            {/* 9:16 Interactive Transport Controls & Scrubber */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSeek9x16(0)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Ir al inicio"
                  >
                    ⏮️ 0s
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek9x16(playbackTime9x16 - 0.5)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Retroceder 0.5s"
                  >
                    ⏪ -0.5s
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlaying9x16(!isPlaying9x16)}
                    className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                      isPlaying9x16 ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-950/50" : "bg-zinc-800 text-white"
                    }`}
                  >
                    {isPlaying9x16 ? "⏸️ Pausar" : "▶️ Reproducir"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek9x16(playbackTime9x16 + 0.5)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Adelantar 0.5s"
                  >
                    ⏩ +0.5s
                  </button>
                  <button
                    type="button"
                    onClick={handleStop9x16}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-red-900 hover:text-red-200 text-zinc-300 cursor-pointer"
                    title="Detener y rebobinar (video + música a 0)"
                  >
                    ⏹️ Stop
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {audioBuffer && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setMuted9x16(!muted9x16);
                            if (!muted9x16 && previewVolume9x16 <= 0) setPreviewVolume9x16(1.0);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 border transition-all cursor-pointer ${
                            !muted9x16 && previewVolume9x16 > 0
                              ? "bg-amber-950/80 border-amber-500/50 text-amber-300"
                              : "bg-zinc-900 border-zinc-700 text-zinc-500"
                          }`}
                        >
                          <span>{!muted9x16 && previewVolume9x16 > 0 ? "🔊 Música ON" : "🔇 Música Mute"}</span>
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={previewVolume9x16}
                          onChange={(e) => {
                            setPreviewVolume9x16(parseFloat(e.target.value));
                            if (parseFloat(e.target.value) > 0) setMuted9x16(false);
                          }}
                          className="w-20 accent-amber-500 cursor-pointer"
                          title="Volumen de la música (preview y export)"
                        />
                        <span className="font-mono text-[10px] text-zinc-500 w-8">
                          {Math.round(previewVolume9x16 * 100)}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="font-mono text-amber-400 font-bold">
                    ⏱️ {playbackTime9x16.toFixed(2)}s / {target9x16Duration}s
                  </div>
                </div>
              </div>

              <input
                type="range"
                aria-label="Posición del preview 9:16"
                min="0"
                max={target9x16Duration}
                step="0.02"
                value={playbackTime9x16}
                onChange={(e) => handleSeek9x16(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div data-testid="visual-loop-9x16" className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-amber-200">✂️ Recorte y loop</p>
                <span className="rounded-full bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-400">
                  {visualLoop9 ? `${visualLoop9.duration.toFixed(1)}s seleccionados` : "Sin vídeo"}
                </span>
              </div>
              {visualLoop9 && video9x16Duration > 0 && (
                <div className="mt-3">
                  <TrimTimeline
                    duration={video9x16Duration}
                    start={visualLoop9.start}
                    end={visualLoop9.end}
                    currentTime={visualLoop9.start + (playbackTime9x16 % visualLoop9.duration)}
                    onChange={({ start, end }) => updateVideoTrim("9x16", start, end)}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-zinc-300" htmlFor="continuity-9x16">Continuidad</label>
                <select
                  id="continuity-9x16"
                  aria-label="Modo de continuidad 9:16"
                  value={seamMode9x16}
                  onChange={(event) => {
                    const mode = event.target.value as SeamMode;
                    if (mode === "smooth") enableNaturalLoop("9x16");
                    else setManualLoopMode("9x16", mode);
                  }}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
                >
                  <option value="cut">■ Sin loop · corte directo</option>
                  <option value="smooth">✨ Natural · recomendado</option>
                  <option value="pingpong">↔ Boomerang suave · ida y vuelta</option>
                  <option value="extend">⏳ Extender fluido · sin cámara lenta extrema</option>
                </select>
                {seamMode9x16 === "extend" && video9x16Duration > 0 && (() => {
                  const clipDur = visualLoop9?.duration ?? video9x16Duration;
                  const plan = resolveExtendPlaybackPlan(clipDur, target9x16Duration, extendMinRate9x16);
                  return (
                    <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-2">
                      <div className="flex items-center justify-between text-[10px] text-cyan-100">
                        <span>Velocidad mínima</span>
                        <span className="font-mono font-bold text-cyan-300">{extendMinRate9x16.toFixed(2)}×</span>
                      </div>
                      <input
                        aria-label="Velocidad mínima de Extender 9:16"
                        type="range"
                        min="65"
                        max="100"
                        step="5"
                        value={Math.round(extendMinRate9x16 * 100)}
                        onChange={(event) => setExtendMinRate9x16(Number(event.target.value) / 100)}
                        className="mt-1 w-full accent-cyan-400"
                      />
                      <p className="mt-1 text-[10px] text-cyan-200">
                        {plan.rate.toFixed(2)}× · {plan.repeatCount} {plan.repeatCount === 1 ? "pasada" : "pasadas"} con unión Natural.
                      </p>
                    </div>
                  );
                })()}
                {stabilization9x16 && (
                  <p data-testid="stabilization-status-9x16" className={stabilization9x16.autoEnabled ? "text-[10px] text-emerald-300" : "text-[10px] text-zinc-500"}>
                    {stabilization9x16.autoEnabled && stabilizationEnabled9x16 ? "✓ " : ""}{stabilization9x16.reason}
                  </p>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                {analyzingVideo9 ? "Buscando una unión natural…" : seamHint9 || "El vídeo empieza limpio. Recorta y activa un loop cuando quieras."}
              </p>
              {!analyzingVideo9 && seamMode9x16 === "smooth" && (
                <div className="mt-2">
                  <VisualLoopQualityPanel
                    selection={visualLoop9}
                    candidates={visualCandidates9}
                    format="9x16"
                    onSelect={(candidate) => applyVisualCandidate("9x16", candidate)}
                  />
                </div>
              )}
            </div>

            {/* 9:16 Visual Controls */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <summary className="cursor-pointer text-xs font-bold text-zinc-400">Ajustes visuales y estabilización</summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-400 font-semibold">🎨 Filtro Visual:</label>
                <select
                  aria-label="Filtro visual 9:16"
                  value={style9x16}
                  onChange={(e) => setStyle9x16(e.target.value as AestheticStyle)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs cursor-pointer"
                >
                  {VISUAL_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-400 font-semibold">🎥 Cámara 2.5D:</label>
                <select
                  aria-label="Cámara 2.5D 9:16"
                  value={camera9x16}
                  onChange={(e) => setCamera9x16(e.target.value as CameraMovement)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs cursor-pointer"
                >
                  {CAMERA_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-400 font-semibold">✨ Partículas:</label>
                <select
                  aria-label="Partículas 9:16"
                  value={particles9x16}
                  onChange={(e) => setParticles9x16(e.target.value as ParticleType)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-white text-xs cursor-pointer"
                >
                  {PARTICLE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.label}
                    </option>
                  ))}
                </select>
                {particles9x16 !== "none" && (
                  <div className="flex flex-col gap-2 pt-1.5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Intensidad</span>
                        <span className="font-mono text-amber-400">{particleIntensity9x16}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={particleIntensity9x16}
                        onChange={(e) => setParticleIntensity9x16(parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Velocidad</span>
                        <span className="font-mono text-amber-400">{particleSpeed9x16.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="25"
                        value={Math.round(particleSpeed9x16 * 10)}
                        onChange={(e) => setParticleSpeed9x16(parseInt(e.target.value) / 10)}
                        className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                    <ParticleAdvancedControls
                      value={particleControls9x16}
                      onChange={setParticleControls9x16}
                      accentClass="accent-amber-500"
                      format="9:16"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-[11px] font-semibold text-zinc-300">Corrección de microvibración</span>
                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={stabilizationEnabled9x16}
                    disabled={!stabilization9x16?.autoEnabled}
                    onChange={(event) => setStabilizationEnabled9x16(event.target.checked)}
                    className="accent-emerald-500"
                  />
                  {stabilization9x16?.autoEnabled ? "Aplicar corrección conservadora" : "Sin corrección necesaria"}
                </label>
                {stabilization9x16?.autoEnabled && stabilizationEnabled9x16 && (
                  <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
                    <span className="flex justify-between">
                      <span>Intensidad</span>
                      <span className="font-mono text-emerald-300">{stabilizationStrength9x16}%</span>
                    </span>
                    <input
                      aria-label="Intensidad de estabilización 9:16"
                      type="range"
                      min="25"
                      max="100"
                      step="5"
                      value={stabilizationStrength9x16}
                      onChange={(event) => setStabilizationStrength9x16(Number(event.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </label>
                )}
                {stabilization9x16 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                    {stabilization9x16.source === "companion-opencv" ? "Análisis avanzado · LK + RANSAC" : "Análisis básico en navegador"}
                  </span>
                )}
                <p className="text-[10px] leading-snug text-zinc-500">{stabilization9x16?.reason ?? "Se analiza al preparar el vídeo."}</p>
              </div>
            </div>
            <ColorGradeControls
              value={colorGrade9x16}
              onChange={setColorGrade9x16}
              accentClass="accent-amber-500"
              format="9:16"
            />
            </details>

            {/* 9:16 DURATION SELECTOR PRESETS */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span className="font-semibold text-zinc-300">⏱️ Duración del Short 9:16:</span>
                <span className="font-mono text-amber-400 font-bold">{target9x16Duration}s</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {DURATION_9X16_PRESETS.map((preset) => (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => setShortDuration(preset.seconds)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      target9x16Duration === preset.seconds
                        ? "bg-amber-500 text-zinc-950 shadow-md"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <label className="flex items-center gap-1 text-zinc-400">
                  <span>Personalizado</span>
                  <input
                    aria-label="Duración personalizada del Short"
                    type="number"
                    min={shortMinDuration}
                    max="60"
                    step="1"
                    value={target9x16Duration}
                    onChange={(e) => setShortDuration(parseFloat(e.target.value) || shortMinDuration)}
                    className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-amber-300"
                  />
                  <span>s</span>
                </label>
              </div>
              <p className="text-[10px] text-zinc-500">
                {video9x16Duration > 0
                  ? `Mínimo ${shortMinDuration}s para conservar el clip completo de ${video9x16Duration.toFixed(1)}s.`
                  : "Elige entre 5 y 60 segundos; al cargar un vídeo se respeta su duración completa."}
              </p>
            </div>


            {/* 9:16 DEDICATED SFX TIMELINE */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <summary className="cursor-pointer text-xs font-bold text-zinc-400">🧰 Extras · efectos de sonido</summary>
            <div className="pt-3">
              <SfxLoopTimeline
                loopDuration={target9x16Duration}
                currentTime={playbackTime9x16}
                timeRef={elapsed9Ref}
                isPlaying={isPlaying9x16}
                onTogglePlay={() => setIsPlaying9x16(!isPlaying9x16)}
                cues={sfx9x16Cues}
                onCuesChange={setSfx9x16Cues}
                onSeekRequest={handleSeek9x16}
                audioContextRef={sharedAudioCtxRef}
                activeFormatFilter="9x16"
                hasMedia={Boolean(video9x16El)}
              />
            </div>
            </details>

            {/* 9:16 Fast Export Action */}
            <button
              type="button"
              onClick={() => setConfirmExport("9x16")}
              disabled={isExporting || !video9x16El}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow ${
                isExporting || !video9x16El
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-950/50 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              }`}
            >
              <span>⚡</span>
              <span>Exportar Solo 9:16 (Ultra Rápido Vertical HD)</span>
            </button>
          </div>
        )}
      </div>

      {/* SECTION 5: Sequential Fast Batch Export Engine */}
      <div id="paso-4" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🚀</span> Exportación final
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Genera MP4 a la resolución nativa del vídeo (1080p, 2K o 4K), a los FPS del original, con audio 48 kHz y los SFX colocados en la línea de tiempo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setConfirmExport("batch")}
            disabled={isExporting || (!video16x9El && !video9x16El)}
            className={`px-7 py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-xl ${
              isExporting || (!video16x9El && !video9x16El)
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-gradient-to-r from-fuchsia-600 via-pink-600 to-amber-500 hover:from-fuchsia-500 hover:to-amber-400 text-white shadow-fuchsia-950/60 hover:scale-105 active:scale-95 cursor-pointer"
            }`}
          >
            {isExporting ? (
              <>
                <span className="animate-spin text-base">⏳</span>
                <span>{exportStatusText || "Procesando..."}</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Exportar pack 16:9 + 9:16</span>
              </>
            )}
          </button>

          {isExporting && (
            <button
              type="button"
              onClick={() => exportAbortRef.current?.abort()}
              className="px-5 py-3 rounded-xl font-black text-sm bg-red-600/90 hover:bg-red-500 text-white shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              <span>⏹</span>
              <span>Cancelar</span>
            </button>
          )}
        </div>

        {/* Estado persistente del export (también tras completar o cancelar).
            Si hubo fallo se pinta en rojo y DENTRO de esta sección: el usuario está
            mirando aquí cuando el progreso desaparece; el banner superior de error
            general puede quedar fuera del viewport. */}
        {!isExporting && exportStatusText && (
          <p
            className={`text-xs font-semibold pt-1 ${
              exportStatusText.startsWith("❌") ? "text-red-400" : "text-zinc-300"
            }`}
          >
            {exportStatusText}
          </p>
        )}

        {!isExporting && exportError && (
          <div className="mt-2 p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300 flex flex-col gap-1">
            <span className="font-black text-red-300">❌ La exportación falló</span>
            <span>{exportError}</span>
            <span className="text-red-400/80">
              Puedes reintentar con el mismo botón de export; si vuelve a fallar, prueba el modo
              pingpong/fundido o una duración menor.
            </span>
          </div>
        )}

        {!isExporting && exportSaveWarning && (
          <div className="mt-2 p-3 rounded-xl bg-amber-950/50 border border-amber-800 text-xs text-amber-300">
            <span className="font-black">⚠️ No se pudo guardar en ~/Vídeos/Dark: </span>
            <span>{exportSaveWarning}</span>
            <span className="block text-amber-400/80 mt-0.5">
              El vídeo se generó bien: descárgalo con los botones de abajo.
            </span>
          </div>
        )}

        {/* Live Export Progress Bars */}
        {isExporting && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-fuchsia-300">16:9 YouTube HD ({target16x9Duration >= 60 ? `${(target16x9Duration/60).toFixed(0)} min` : `${target16x9Duration}s`})</span>
                <span className="font-mono text-white">{exportProgress16x9}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-600 to-pink-500 transition-all duration-150"
                  style={{ width: `${exportProgress16x9}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-amber-300">9:16 Shorts Vertical ({target9x16Duration}s)</span>
                <span className="font-mono text-white">{exportProgress9x16}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-150"
                  style={{ width: `${exportProgress9x16}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Completed Results Showcase */}
        {(result16x9Url || result9x16Url) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-zinc-800 animate-in fade-in">
            {result16x9Url && (
              <div className="p-4 rounded-xl bg-zinc-950 border border-fuchsia-500/40 flex flex-col gap-3 shadow-2xl">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-fuchsia-400">✅ Video 16:9 Full HD Listo</span>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {result16x9Blob ? `${(result16x9Blob.size / (1024 * 1024)).toFixed(1)} MB` : ""}
                  </span>
                </div>
                <video src={result16x9Url} controls className="w-full rounded-lg aspect-video bg-black shadow" />
                <a
                  href={result16x9Url}
                  download={`loop_16x9_${target16x9Duration}s_${cleanSongName(audioFileName)}.mp4`}
                  className="w-full py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs text-center shadow transition-all cursor-pointer"
                >
                  ⬇️ Descargar Video 16:9 (Full HD)
                </a>
                {saved16x9Path && (
                  <p className="text-[10px] text-zinc-500 font-mono break-all">Dark: {saved16x9Path}</p>
                )}
              </div>
            )}

            {result9x16Url && (
              <div className="p-4 rounded-xl bg-zinc-950 border border-amber-500/40 flex flex-col gap-3 shadow-2xl">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-400">✅ Video 9:16 Vertical HD Listo</span>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {result9x16Blob ? `${(result9x16Blob.size / (1024 * 1024)).toFixed(1)} MB` : ""}
                  </span>
                </div>
                <video src={result9x16Url} controls className="w-full rounded-lg aspect-video bg-black shadow object-contain" />
                <a
                  href={result9x16Url}
                  download={`loop_9x16_${target9x16Duration}s_${cleanSongName(audioFileName)}.mp4`}
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs text-center shadow transition-all cursor-pointer"
                >
                  ⬇️ Descargar Video 9:16 (Shorts HD)
                </a>
                {saved9x16Path && (
                  <p className="text-[10px] text-zinc-500 font-mono break-all">Dark: {saved9x16Path}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 6: Organic YouTube & Shorts Metadata Pack (SEO & Algoritmo) */}
      <details className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
        <summary className="cursor-pointer select-none text-sm font-bold text-zinc-300">
          🧰 Extras · portadas y textos de publicación
        </summary>
      <div data-testid="publishing-pack" className="p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-lg shadow-md shadow-red-950/60">
              📈
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Pack de YouTube & Shorts Orgánico (SEO & Algoritmo)
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${enableSlowedReverb || playlistHasSlowed ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                  {enableSlowedReverb || playlistHasSlowed ? "Slowed + Reverb" : "Normal Audio"}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Títulos y textos distintos cada vez: frases del personaje, no plantilla SEO. Pulsa regenerar si no te convence.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSeedOffset((prev) => prev + 1)}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow"
          >
            <span>🔄</span>
            <span>Regenerar Comentarios & Ganchos</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          {/* Left Column: 16:9 Main Video YouTube Pack */}
          <div className="flex flex-col gap-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="font-bold text-fuchsia-400 text-xs flex items-center gap-1.5">
              <span>🖥️</span> YouTube 16:9 (Horizontal / Long Form)
            </span>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">Título del Video:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("title", ytPack.title)}
                  className="text-fuchsia-400 hover:text-fuchsia-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "title" ? "✓ Copiado" : "📋 Copiar Título"}
                </button>
              </div>
              <div data-testid="youtube-title" className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-[11px] select-all">
                {ytPack.title}
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">Descripción Orgánica (Corta & Concisa):</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("desc", ytPack.description)}
                  className="text-fuchsia-400 hover:text-fuchsia-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "desc" ? "✓ Copiado" : "📋 Copiar Descripción"}
                </button>
              </div>
              <textarea
                data-testid="youtube-description"
                readOnly
                rows={7}
                value={ytPack.description}
                className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 font-sans text-[11px] leading-relaxed resize-none select-all"
              />
            </div>

            {/* Pinned Comment */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">📌 Comentario Fijado (Dinámico y Único):</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("pinned", ytPack.pinnedComment)}
                  className="text-fuchsia-400 hover:text-fuchsia-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "pinned" ? "✓ Copiado" : "📋 Copiar Comentario"}
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-[11px] select-all">
                {ytPack.pinnedComment}
              </div>
            </div>

            {/* Tags & Hashtags */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">Tags de YouTube (Separados por Coma):</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("tags", ytPack.tagsLine)}
                  className="text-fuchsia-400 hover:text-fuchsia-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "tags" ? "✓ Copiado" : "📋 Copiar Tags"}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] select-all truncate">
                {ytPack.tagsLine}
              </div>
            </div>
          </div>

          {/* Right Column: 9:16 Shorts / Reels / TikTok Pack */}
          <div className="flex flex-col gap-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
              <span>📱</span> YouTube Shorts & TikTok (Vertical 9:16)
            </span>

            {/* Shorts Title */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">Título Shorts (&lt;55 car.):</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("stitle", ytPack.shortsTitle)}
                  className="text-amber-400 hover:text-amber-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "stitle" ? "✓ Copiado" : "📋 Copiar Título Short"}
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-[11px] select-all">
                {ytPack.shortsTitle}
              </div>
            </div>

            {/* Shorts Description */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">Descripción Shorts:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("sdesc", ytPack.shortsDescription)}
                  className="text-amber-400 hover:text-amber-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "sdesc" ? "✓ Copiado" : "📋 Copiar Descripción"}
                </button>
              </div>
              <textarea
                readOnly
                rows={5}
                value={ytPack.shortsDescription}
                className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 font-sans text-[11px] leading-relaxed resize-none select-all"
              />
            </div>

            {/* Shorts Tags */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-semibold">Tags de Shorts:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("stags", ytPack.shortsTagsLine)}
                  className="text-amber-400 hover:text-amber-300 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === "stags" ? "✓ Copiado" : "📋 Copiar Tags"}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] select-all truncate">
                {ytPack.shortsTagsLine}
              </div>
            </div>

            {/* Quick Summary Card */}
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex flex-col gap-1.5 mt-auto">
              <span className="text-amber-300 font-bold text-[11px]">💡 Consejo de Algoritmo YouTube:</span>
              <p className="text-[10px] text-zinc-300 leading-relaxed">
                Un clic en <strong>📸 Portada 16:9</strong> guarda un thumb YouTube 1280×720 en <span className="font-mono">Vídeos/Dark/Youtube/export/thumbs</span>. El 9:16 va a <span className="font-mono">covers</span>.{savedCoverPath ? ` Última: ${savedCoverPath}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
          <div className="rounded-xl border border-pink-500/25 bg-pink-950/15 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-bold text-pink-300">Instagram Reels</span>
              <button
                type="button"
                onClick={() => copyToClipboard("instagram", ytPack.instagramCaption)}
                className="text-[11px] font-bold text-pink-300 hover:text-pink-200"
              >
                {copiedKey === "instagram" ? "✓ Copiado" : "📋 Copiar caption"}
              </button>
            </div>
            <textarea
              data-testid="instagram-caption"
              readOnly
              rows={5}
              value={ytPack.instagramCaption}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-[11px] leading-relaxed text-zinc-200"
            />
          </div>
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-bold text-cyan-300">TikTok</span>
              <button
                type="button"
                onClick={() => copyToClipboard("tiktok", ytPack.tiktokCaption)}
                className="text-[11px] font-bold text-cyan-300 hover:text-cyan-200"
              >
                {copiedKey === "tiktok" ? "✓ Copiado" : "📋 Copiar caption"}
              </button>
            </div>
            <textarea
              data-testid="tiktok-caption"
              readOnly
              rows={5}
              value={ytPack.tiktokCaption}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-[11px] leading-relaxed text-zinc-200"
            />
          </div>
        </div>
      </div>
      </details>

      {/* ==================== PRE-EXPORT CONFIRMATION MODAL ==================== */}
      {confirmExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span>🛡️</span> Confirma tu exportación
              </h4>
              <button
                type="button"
                onClick={() => setConfirmExport(null)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex flex-col gap-2 text-xs">
              {confirmExport !== "batch" && (
                <SummaryRow
                  label="Formato"
                  value={confirmExport === "16x9"
                    ? `🖥️ 16:9 · ${exportSize16.width}×${exportSize16.height}`
                    : `📱 9:16 · ${exportSize9.width}×${exportSize9.height}`}
                />
              )}
              {confirmExport === "batch" && (
                <>
                  <SummaryRow label="Formatos" value="🖥️ 16:9 + 📱 9:16 (secuencial)" />
                  <SummaryRow
                    label="Duraciones"
                    value={`${formatDuration(target16x9Duration)} · ${formatDuration(target9x16Duration)}`}
                  />
                </>
              )}
              {confirmExport === "16x9" && (
                <SummaryRow label="Duración" value={formatDuration(target16x9Duration)} />
              )}
              {confirmExport === "9x16" && <SummaryRow label="Duración" value={formatDuration(target9x16Duration)} />}
              <SummaryRow
                label="Loop"
                value={
                  confirmExport === "batch"
                    ? `16:9 ${visualLoopSummary(seamMode16x9, visualLoop16)} · 9:16 ${visualLoopSummary(seamMode9x16, visualLoop9)}`
                    : confirmExport === "9x16"
                      ? visualLoopSummary(seamMode9x16, visualLoop9)
                      : visualLoopSummary(seamMode16x9, visualLoop16)
                }
              />
              {audioBuffer ? (
                <>
                  <SummaryRow
                    label="Música"
                    value={
                      confirmExport === "batch"
                        ? `16:9 ${audioTracks.length > 1 ? "playlist completa" : "canción completa"} · 9:16 ${shortAudioSelection?.start.toFixed(1) ?? "0.0"}s → ${shortAudioSelection?.end.toFixed(1) ?? target9x16Duration.toFixed(1)}s${enableSlowedReverb || playlistHasSlowed ? " · slowed+reverb" : ""}`
                        : confirmExport === "9x16"
                        ? `${shortAudioSelection?.start.toFixed(1) ?? "0.0"}s → ${shortAudioSelection?.end.toFixed(1) ?? target9x16Duration.toFixed(1)}s · una toma${enableSlowedReverb || playlistHasSlowed ? " · slowed+reverb" : ""}`
                        : `${audioTracks.length > 1 ? "playlist completa" : "canción completa"} · una toma${enableSlowedReverb || playlistHasSlowed ? " · slowed+reverb" : ""}`
                    }
                  />
                  <SummaryRow
                    label="Vol. música"
                    value={
                      confirmExport === "batch"
                        ? `16:9 ${Math.round(previewVolume16x9 * 100)}% · 9:16 ${Math.round(previewVolume9x16 * 100)}%`
                        : `${Math.round((confirmExport === "9x16" ? previewVolume9x16 : previewVolume16x9) * 100)}%`
                    }
                  />
                </>
              ) : (
                <SummaryRow label="Música" value="Sin canción" />
              )}
              <SummaryRow
                label="SFX"
                value={
                  confirmExport === "batch"
                    ? `16:9 ${sfx16x9Cues.length} · 9:16 ${sfx9x16Cues.length}`
                    : `${(confirmExport === "9x16" ? sfx9x16Cues : sfx16x9Cues).length} marcador(es)`
                }
              />
              <SummaryRow
                label="Calidad"
                value={confirmExport === "9x16"
                  ? `Nativa ${exportSize9.width}×${exportSize9.height} · FPS igual al video original`
                  : confirmExport === "batch"
                    ? `Nativa ${exportSize16.width}×${exportSize16.height} + ${exportSize9.width}×${exportSize9.height} · FPS del original`
                    : `Nativa ${exportSize16.width}×${exportSize16.height} · FPS igual al video original`}
              />
              <p className="text-[10px] text-zinc-500 pt-1">
                El preview que viste arriba es exactamente lo que se renderizará. Este proceso corre en tu GPU; no cierres la pestaña.
              </p>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmExport(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmExport;
                  setConfirmExport(null);
                  if (target === "16x9") void handleExport16x9Only();
                  else if (target === "9x16") void handleExport9x16Only();
                  else void handleSequentialBatchExport();
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-amber-500 hover:from-fuchsia-500 hover:to-amber-400 text-white text-xs font-black cursor-pointer shadow-lg"
              >
                ✅ Sí, exportar ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-400 shrink-0">{label}:</span>
      <span className="font-mono text-zinc-100 text-right">{value}</span>
    </div>
  );
}
