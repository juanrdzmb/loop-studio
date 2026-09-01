let cachedScreentonePattern: CanvasPattern | null = null;
let cachedPatternCtx: CanvasRenderingContext2D | null = null;
let grainCanvas: HTMLCanvasElement | null = null;
const grainPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function getScreentonePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (cachedScreentonePattern && cachedPatternCtx === ctx) {
    return cachedScreentonePattern;
  }
  if (typeof document === "undefined") return null;
  const patCanvas = document.createElement("canvas");
  patCanvas.width = 6;
  patCanvas.height = 6;
  const patCtx = patCanvas.getContext("2d");
  if (patCtx) {
    patCtx.fillStyle = "#ffffff";
    patCtx.fillRect(0, 0, 6, 6);
    patCtx.fillStyle = "#000000";
    patCtx.beginPath();
    patCtx.arc(3, 3, 1.4, 0, Math.PI * 2);
    patCtx.fill();
    cachedScreentonePattern = ctx.createPattern(patCanvas, "repeat");
    cachedPatternCtx = ctx;
  }
  return cachedScreentonePattern;
}

function getFilmGrainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const cached = grainPatterns.get(ctx);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  if (!grainCanvas) {
    grainCanvas = document.createElement("canvas");
    grainCanvas.width = 96;
    grainCanvas.height = 96;
    const grainCtx = grainCanvas.getContext("2d");
    if (grainCtx) {
      const image = grainCtx.createImageData(96, 96);
      let seed = 0x51f15e;
      for (let i = 0; i < image.data.length; i += 4) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const value = 96 + (seed >>> 0) % 96;
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 150;
      }
      grainCtx.putImageData(image, 0, 0);
    }
  }
  const pattern = grainCanvas ? ctx.createPattern(grainCanvas, "repeat") : null;
  if (pattern) grainPatterns.set(ctx, pattern);
  return pattern;
}

/**
 * Manga Motion 2.5D Studio Engine (Clean, Pristine & High Definition)
 * 60 FPS Canvas Renderer with HD Export, Physics-driven Particles,
 * Interactive Katana Slash Arcs, Japanese Manga Typography & Seamless Looping.
 */

import {
  MangaTextItem,
  drawMangaTextBubble,
} from "./mangaTypographyEngine";
import { drawProfessionalWatermark, type WatermarkStyleOptions } from "./watermark";
import { getSmoothPingPongFrameState } from "./pingPongLoop";
import type { SourceFrameTransform } from "./videoStabilization";

export type AspectRatio = "9:16" | "16:9" | "1:1";
export type CameraMovement =
  | "static"
  | "slow_push"
  | "dutch_drift"
  | "whip_pan"
  | "vertigo_zoom"
  | "spiral_vortex"
  | "cinematic_scan"
  | "impact_shake";

export type ParticleType =
  | "none"
  | "bamboo_leaves"
  | "embers_fire"
  | "sakura_petals"
  | "cinematic_rain"
  | "cinematic_dust"
  | "snow_ash"
  | "light_leaks"
  | "dark_ink_fog"
  | "blood_drips"
  | "golden_sparks";

export type ParticleBlendMode = "source-over" | "screen" | "lighter" | "soft-light";

export interface ParticleControlOptions {
  size: number;        // 40..180 %
  opacity: number;     // 0..100 %
  wind: number;        // -100..100
  turbulence: number;  // 0..100
  color: string;       // vacío = paleta propia del efecto
  blendMode: ParticleBlendMode;
  blur: number;        // 0..12 px a 1080p
  seed: number;
  /** Duración del superciclo determinista. Preview y export deben compartirla. */
  loopDuration: number;
}

export const DEFAULT_PARTICLE_CONTROLS: ParticleControlOptions = {
  size: 100,
  opacity: 100,
  wind: 0,
  turbulence: 45,
  color: "",
  blendMode: "source-over",
  blur: 0,
  seed: 1337,
  loopDuration: 12,
};

export type SpeedLinesType = "none" | "radial_burst" | "horizontal_rush" | "vertical_fall";

export type AestheticStyle =
  | "original"
  | "seinen_bw"
  | "retro_90s"
  | "dark_fantasy"
  | "cyberpunk_neon"
  | "screentone"
  | "vintage_sepia"
  | "lofi_sunset"
  | "golden_sunset";

export type ColorGradeConfig = {
  exposure: number;    // -100..100
  contrast: number;    // -100..100
  saturation: number;  // -100..100
  temperature: number; // -100..100
  tint: number;        // -100..100
  fade: number;        // 0..100
  bloom: number;       // 0..100
  grain: number;       // 0..100
};

export const DEFAULT_COLOR_GRADE: ColorGradeConfig = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
  bloom: 0,
  grain: 0,
};

export type KatanaArcColor =
  | "getsuga_dark"     // Dark violet / cyan void
  | "nichirin_fire"    // Fiery orange / bright yellow
  | "thunder_cyan"     // Electric cyan blue
  | "blood_crimson"    // Intense samurai blood red
  | "divine_white";    // Pure radiant white blade

export interface KatanaSlashConfig {
  enabled: boolean;
  x: number;               // 0..1 Center X
  y: number;               // 0..1 Center Y
  angle: number;           // Degrees (-180..180)
  radius: number;          // Radius in px (120..400)
  arcSweep: number;        // Arc length in degrees (45..140)
  thickness: number;       // Thickness in px (4..35)
  color: KatanaArcColor;
  bladeShimmer: boolean;
  animationSpeed: number;  // 0.5..3.0
}

export interface MangaMotionConfig {
  // Format & Timing
  aspectRatio: AspectRatio;
  duration: number;        // 3..60 seconds
  fps: number;             // 30 or 60
  enableSeamlessLoop: boolean;
  loopCrossfadeDuration: number; // 1.0..3.0s
  seamMode: "smooth" | "pingpong" | "cut" | "calm" | "extend";
  /** Velocidad de la fuente en Continuo calmado (0.25..0.75; default 0.4).
   *  En modo "extend" la velocidad se deriva de duration y nunca baja del suelo elegido. */
  calmPlaybackRate?: number;
  /** Velocidad mínima del modo Extender híbrido (0.65..1; default 0.65). */
  extendMinPlaybackRate?: number;

  // Clean Camera Movement (Zero unwanted jitter)
  cameraMove: CameraMovement;
  cameraSpeed: number;     // 0.2..3.0
  cameraIntensity: number; // 0..100
  cameraAngle: number;     // -45..45 degrees (Dutch tilt)
  cameraBaseZoom: number;  // 1.0..2.5x base framing zoom
  /** Los edits usan un empuje lineal; los loops conservan la oscilación cerrada. */
  cameraOneWay?: boolean;
  cameraDirection?: -1 | 1;
  /** Punto de interés normalizado para reencuadrar sin deformar la fuente. */
  sourceFocus?: { x: number; y: number };
  /** Corrección por frame calculada por el estabilizador local. */
  sourceTransform?: SourceFrameTransform;

  // High Definition Particles
  particles: ParticleType;
  particleIntensity: number; // 0..100
  particleSpeed: number;     // 0.5..2.5
  particleControls?: Partial<ParticleControlOptions>;

  // Interactive Katana Slash Arc
  katanaArc: KatanaSlashConfig;

  // Manga Speedlines
  speedLines: SpeedLinesType;
  speedLinesIntensity: number; // 0..100
  speedLinesCenter: { x: number; y: number };

  // Eye Glow Effect
  eyeGlow: boolean;
  eyeGlowPos: { x: number; y: number };
  eyeGlowColor: string;
  eyeGlowSize: number;     // 10..60
  eyeGlowPulse: boolean;

  // Typography & Manga Speech Bubbles
  textItems: MangaTextItem[];

  // Aesthetics & Tone
  aestheticStyle: AestheticStyle;
  colorGrade?: ColorGradeConfig;
  vignette: number;        // 0..100
  grain: number;           // 0..100

  // Watermark (Central subtle branding)
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number; // 0..1
  watermarkStyle?: WatermarkStyleOptions;
}

export const CAMERA_MODE_DEFAULTS: Record<
  CameraMovement,
  {
    cameraSpeed: number;
    cameraIntensity: number;
    cameraAngle: number;
    cameraBaseZoom: number;
  }
> = {
  static: {
    cameraSpeed: 1.0,
    cameraIntensity: 0,
    cameraAngle: 0,
    cameraBaseZoom: 1.0,
  },
  slow_push: {
    cameraSpeed: 1.0,
    cameraIntensity: 30,
    cameraAngle: 0,
    cameraBaseZoom: 1.0,
  },
  dutch_drift: {
    cameraSpeed: 0.8,
    cameraIntensity: 35,
    cameraAngle: 12,
    cameraBaseZoom: 1.12,
  },
  whip_pan: {
    cameraSpeed: 1.0,
    cameraIntensity: 45,
    cameraAngle: 0,
    cameraBaseZoom: 1.15,
  },
  vertigo_zoom: {
    cameraSpeed: 0.9,
    cameraIntensity: 40,
    cameraAngle: 0,
    cameraBaseZoom: 1.0,
  },
  spiral_vortex: {
    cameraSpeed: 1.1,
    cameraIntensity: 40,
    cameraAngle: 0,
    cameraBaseZoom: 1.12,
  },
  cinematic_scan: {
    cameraSpeed: 0.8,
    cameraIntensity: 40,
    cameraAngle: 0,
    cameraBaseZoom: 1.15,
  },
  impact_shake: {
    cameraSpeed: 1.2,
    cameraIntensity: 50,
    cameraAngle: 0,
    cameraBaseZoom: 1.05,
  },
};

export const DEFAULT_MANGA_CONFIG: MangaMotionConfig = {
  aspectRatio: "9:16",
  duration: 10,
  fps: 60,
  enableSeamlessLoop: true,
  loopCrossfadeDuration: 1.8,
  seamMode: "smooth",
  calmPlaybackRate: 0.4,
  extendMinPlaybackRate: 0.65,

  cameraMove: "static",    // Clean static by default
  cameraSpeed: 1.0,
  cameraIntensity: 30,
  cameraAngle: 0,
  cameraBaseZoom: 1.0,

  particles: "none",       // Clean by default
  particleIntensity: 50,
  particleSpeed: 1.0,

  katanaArc: {
    enabled: false,
    x: 0.5,
    y: 0.5,
    angle: -35,
    radius: 220,
    arcSweep: 85,
    thickness: 14,
    color: "thunder_cyan",
    bladeShimmer: true,
    animationSpeed: 1.0,
  },

  speedLines: "none",
  speedLinesIntensity: 35,
  speedLinesCenter: { x: 0.5, y: 0.4 },

  eyeGlow: false,
  eyeGlowPos: { x: 0.5, y: 0.35 },
  eyeGlowColor: "#ff1122",
  eyeGlowSize: 28,
  eyeGlowPulse: true,

  textItems: [],

  aestheticStyle: "original",
  colorGrade: { ...DEFAULT_COLOR_GRADE },
  vignette: 0,
  grain: 0,

  watermarkEnabled: true,
  watermarkText: "SILENT VIGIL",
  watermarkOpacity: 0.28,
};

// Curated Pro Manga Presets
export interface MangaTemplate {
  id: string;
  name: string;
  desc: string;
  badge: string;
  config: Partial<MangaMotionConfig>;
}

export const MANGA_TEMPLATES: MangaTemplate[] = [
  {
    id: "vagabond_zen",
    name: "🎋 Vagabond: Viento & Bambú",
    desc: "Hojas de bambú cayendo, paneo vertical suave y filtro Seinen",
    badge: "Vagabond",
    config: {
      cameraMove: "slow_push",
      cameraIntensity: 20,
      particles: "bamboo_leaves",
      particleIntensity: 45,
      aestheticStyle: "seinen_bw",
      vignette: 25,
      grain: 15,
      textItems: [
        {
          id: "sfx-saaa",
          type: "narration_box",
          text: "サァァ",
          subText: "Viento en el bambú",
          x: 0.82,
          y: 0.22,
          scale: 1.1,
          rotation: 0,
          fontSize: 26,
          textColor: "#ffffff",
          strokeColor: "#000000",
          strokeWidth: 2,
          bgColor: "#09090b",
          pulseType: "subtle_float",
        },
      ],
    },
  },
  {
    id: "bleach_getsuga",
    name: "⚔️ Bleach: Getsuga Tensho",
    desc: "Arco de katana cyan luminoso, speedlines y SFX 斬ッ",
    badge: "Bleach",
    config: {
      cameraMove: "slow_push",
      cameraIntensity: 30,
      particles: "golden_sparks",
      particleIntensity: 40,
      katanaArc: {
        enabled: true,
        x: 0.52,
        y: 0.48,
        angle: -40,
        radius: 240,
        arcSweep: 95,
        thickness: 18,
        color: "getsuga_dark",
        bladeShimmer: true,
        animationSpeed: 1.2,
      },
      speedLines: "radial_burst",
      speedLinesIntensity: 30,
      aestheticStyle: "dark_fantasy",
      vignette: 35,
      textItems: [
        {
          id: "sfx-zatt",
          type: "vertical_sfx",
          text: "斬ッ",
          subText: "ZATT",
          x: 0.85,
          y: 0.35,
          scale: 1.4,
          rotation: -8,
          fontSize: 38,
          textColor: "#38bdf8",
          strokeColor: "#000000",
          strokeWidth: 7,
          pulseType: "rumble_shake",
        },
      ],
    },
  },
  {
    id: "berserk_eclipse",
    name: "🩸 Berserk: Eclipse & Furia",
    desc: "Brasas incandescentes, ojo de furia rojo, SFX ドドド y aura oscura",
    badge: "Berserk",
    config: {
      cameraMove: "slow_push",
      cameraIntensity: 35,
      particles: "embers_fire",
      particleIntensity: 65,
      eyeGlow: true,
      eyeGlowPos: { x: 0.52, y: 0.36 },
      eyeGlowColor: "#ef4444",
      eyeGlowSize: 32,
      eyeGlowPulse: true,
      aestheticStyle: "dark_fantasy",
      vignette: 55,
      grain: 30,
      textItems: [
        {
          id: "sfx-dododo",
          type: "vertical_sfx",
          text: "ドドド",
          subText: "DODODO",
          x: 0.82,
          y: 0.32,
          scale: 1.35,
          rotation: -10,
          fontSize: 36,
          textColor: "#f43f5e",
          strokeColor: "#000000",
          strokeWidth: 8,
          pulseType: "rumble_shake",
        },
      ],
    },
  },
  {
    id: "demon_slayer_sakura",
    name: "🌸 Demon Slayer: Danza de Pétalos",
    desc: "Pétalos de sakura flotantes, arco de katana de fuego y destellos",
    badge: "Demon Slayer",
    config: {
      cameraMove: "slow_push",
      cameraIntensity: 25,
      particles: "sakura_petals",
      particleIntensity: 55,
      katanaArc: {
        enabled: true,
        x: 0.5,
        y: 0.52,
        angle: -30,
        radius: 220,
        arcSweep: 85,
        thickness: 16,
        color: "nichirin_fire",
        bladeShimmer: true,
        animationSpeed: 1.0,
      },
      aestheticStyle: "retro_90s",
      vignette: 20,
      grain: 10,
      textItems: [
        {
          id: "sfx-sub",
          type: "anime_subtitle",
          text: "全集中・水の呼吸",
          subText: "Concentración Total: Respiración",
          x: 0.5,
          y: 0.88,
          scale: 1.0,
          rotation: 0,
          fontSize: 28,
          textColor: "#facc15",
          strokeColor: "#000000",
          strokeWidth: 5,
        },
      ],
    },
  },
  {
    id: "jujutsu_domain",
    name: "⚡ Jujutsu: Dominio Maldito",
    desc: "Niebla de tinta espiritual, resplandor cyan y cuadro Seinen 領域展開",
    badge: "Jujutsu",
    config: {
      cameraMove: "slow_push",
      cameraIntensity: 25,
      particles: "dark_ink_fog",
      particleIntensity: 60,
      speedLines: "radial_burst",
      speedLinesIntensity: 25,
      aestheticStyle: "seinen_bw",
      vignette: 45,
      textItems: [
        {
          id: "txt-domain",
          type: "narration_box",
          text: "領域展開",
          subText: "Expansión de Dominio",
          x: 0.5,
          y: 0.15,
          scale: 1.15,
          rotation: 0,
          fontSize: 28,
          textColor: "#ffffff",
          strokeColor: "#38bdf8",
          strokeWidth: 2,
          bgColor: "#09090b",
          pulseType: "zoom_heartbeat",
        },
      ],
    },
  },
  {
    id: "clean_pristine",
    name: "🖼️ Original 100% Puro",
    desc: "Imagen original sin efectos para editar libremente desde cero",
    badge: "Limpio",
    config: {
      cameraMove: "static",
      particles: "none",
      speedLines: "none",
      eyeGlow: false,
      katanaArc: { ...DEFAULT_MANGA_CONFIG.katanaArc, enabled: false },
      aestheticStyle: "original",
      vignette: 0,
      grain: 0,
      textItems: [],
    },
  },
];

/**
 * High-Definition Particle Simulation System
 */
interface Particle {
  x: number;
  y: number;
  z: number;           // Depth 0.2 .. 1.0
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  rot: number;
  rot0: number;
  wobblePhase: number;
  displayPhase: number;
  travelCycles: number;
  spinCycles: number;
  scale: number;
  opacity: number;
  size: number;
  hue: number;
}

class PhysicsParticleSystem {
  private particles: Particle[] = [];
  private currentType: ParticleType = "none";
  private initKey = "";
  private randomState = 1;
  private controls: ParticleControlOptions = { ...DEFAULT_PARTICLE_CONTROLS };
  // El preview corre a 60 FPS sobre canvas 1080p: limitar la densidad evita que
  // partículas decorativas compitan con la reproducción del vídeo.
  private maxParticles = 140;

  private random(): number {
    let state = this.randomState | 0;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.randomState = state || 1;
    return (this.randomState >>> 0) / 0x100000000;
  }

  private normalizeControls(options?: Partial<ParticleControlOptions>): ParticleControlOptions {
    return {
      size: Math.max(40, Math.min(180, options?.size ?? DEFAULT_PARTICLE_CONTROLS.size)),
      opacity: Math.max(0, Math.min(100, options?.opacity ?? DEFAULT_PARTICLE_CONTROLS.opacity)),
      wind: Math.max(-100, Math.min(100, options?.wind ?? DEFAULT_PARTICLE_CONTROLS.wind)),
      turbulence: Math.max(0, Math.min(100, options?.turbulence ?? DEFAULT_PARTICLE_CONTROLS.turbulence)),
      color: options?.color ?? DEFAULT_PARTICLE_CONTROLS.color,
      blendMode: options?.blendMode ?? DEFAULT_PARTICLE_CONTROLS.blendMode,
      blur: Math.max(0, Math.min(12, options?.blur ?? DEFAULT_PARTICLE_CONTROLS.blur)),
      seed: Math.trunc(options?.seed ?? DEFAULT_PARTICLE_CONTROLS.seed),
      loopDuration: Math.max(0.5, options?.loopDuration ?? DEFAULT_PARTICLE_CONTROLS.loopDuration),
    };
  }

  init(
    type: ParticleType,
    targetW: number,
    targetH: number,
    intensity = 50,
    options?: Partial<ParticleControlOptions>
  ) {
    this.controls = this.normalizeControls(options);
    this.currentType = type;
    this.particles = [];
    const typeSeed = Array.from(type).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 17);
    this.randomState = (this.controls.seed ^ typeSeed) || 1;
    this.initKey = `${type}:${Math.round(targetW)}x${Math.round(targetH)}:${Math.round(intensity)}:${this.controls.seed}`;
    if (type === "none") return;

    const baseCount: Record<Exclude<ParticleType, "none">, number> = {
      bamboo_leaves: 34,
      embers_fire: 62,
      sakura_petals: 42,
      cinematic_rain: 120,
      cinematic_dust: 78,
      snow_ash: 82,
      light_leaks: 6,
      dark_ink_fog: 22,
      blood_drips: 48,
      golden_sparks: 58,
    };
    const density = 0.45 + Math.max(0, Math.min(100, intensity)) * 0.011;
    const count = Math.max(1, Math.min(this.maxParticles, Math.round(baseCount[type] * density)));

    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(type, targetW, targetH));
    }
  }

  private createParticle(type: ParticleType, targetW: number, targetH: number): Particle {
    const z = 0.25 + this.random() * 0.75;
    const baseX = this.random();
    const baseY = this.random();
    const rot0 = this.random() * Math.PI * 2;
    const p: Particle = {
      x: baseX * targetW,
      y: baseY * targetH,
      z,
      vx: 0,
      vy: 0,
      baseX,
      baseY,
      rot: rot0,
      rot0,
      wobblePhase: this.random() * Math.PI * 2,
      displayPhase: 0,
      travelCycles: 1 + Math.floor(this.random() * (type === "cinematic_rain" ? 5 : 3)),
      spinCycles: Math.floor(this.random() * 3) - 1,
      scale: 0.55 + this.random() * 0.9,
      opacity: 0.4 + this.random() * 0.6,
      size: 8 + this.random() * 18,
      hue: this.random(),
    };
    if (type === "cinematic_rain" || type === "light_leaks") {
      p.rot = 0;
      p.rot0 = 0;
      p.spinCycles = 0;
    }
    return p;
  }

  update(
    type: ParticleType,
    intensity: number,
    targetW: number,
    targetH: number,
    t: number,
    speedMult: number = 1.0,
    dtScale: number = 1.0,
    options?: Partial<ParticleControlOptions>
  ) {
    const nextControls = this.normalizeControls(options);
    const nextKey = `${type}:${Math.round(targetW)}x${Math.round(targetH)}:${Math.round(intensity)}:${nextControls.seed}`;
    if (nextKey !== this.initKey || type !== this.currentType) {
      this.init(type, targetW, targetH, intensity, nextControls);
    } else {
      this.controls = nextControls;
    }
    if (type === "none") return;

    const duration = this.controls.loopDuration;
    const phase = (((Number.isFinite(t) ? t : 0) % duration) + duration) % duration / duration;
    const speed = Math.max(0.25, Math.min(3, Number.isFinite(speedMult) ? speedMult : 1));
    const wind = this.controls.wind / 100;
    const turbulence = this.controls.turbulence / 100;
    const tau = Math.PI * 2;
    const mod1 = (value: number) => ((value % 1) + 1) % 1;
    // Normaliza las velocidades de streak al framerate real: a 60 fps dtScale=1,
    // a 30 fps dtScale=0.5 → las partículas se mueven la misma distancia real por segundo.
    const norm = Math.max(0.25, dtScale);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const travelCycles = Math.max(1, Math.round(p.travelCycles * speed * (0.72 + p.z * 0.4)));
      const waveCycles = travelCycles + 1 + (i % 2);
      const wave = Math.sin(tau * phase * waveCycles + p.wobblePhase);
      const fineWave = Math.sin(tau * phase * (waveCycles + 2) + p.wobblePhase * 1.7);
      const xWave = (wave + fineWave * 0.38) * turbulence * (0.018 + p.z * 0.035);
      const windWave = Math.sin(tau * phase) * wind * 0.14;
      const fallingY = mod1(p.baseY + phase * travelCycles);
      const risingY = mod1(p.baseY - phase * travelCycles);
      const edgeFade = Math.max(0, Math.min(1, Math.min(fallingY, 1 - fallingY) * 14));

      p.displayPhase = p.wobblePhase + tau * phase * waveCycles;
      p.rot = p.rot0 + tau * phase * p.spinCycles;
      p.opacity = (0.38 + p.hue * 0.62) * edgeFade;

      if (type === "cinematic_rain") {
        const xCycles = -Math.max(1, Math.round(travelCycles * 0.18)) + Math.round(wind * travelCycles * 0.55);
        p.x = mod1(p.baseX + phase * xCycles) * targetW;
        p.y = fallingY * targetH;
        p.vx = (xCycles * targetW) / duration / norm;
        p.vy = (travelCycles * targetH) / duration / norm;
      } else if (type === "embers_fire" || type === "golden_sparks") {
        p.x = mod1(p.baseX + xWave + windWave) * targetW;
        p.y = risingY * targetH;
        p.vx = (xWave + windWave) * targetW;
        p.vy = -(travelCycles * targetH) / duration / norm;
      } else if (type === "dark_ink_fog" || type === "cinematic_dust" || type === "light_leaks") {
        const slowCycles = 1 + (i % 2);
        p.x = mod1(p.baseX + Math.sin(tau * phase * slowCycles + p.wobblePhase) * (0.035 + turbulence * 0.045) + windWave) * targetW;
        p.y = mod1(p.baseY + Math.cos(tau * phase * slowCycles + p.wobblePhase) * (0.025 + turbulence * 0.035)) * targetH;
        p.opacity = 0.3 + p.hue * 0.7;
        p.vx = 0;
        p.vy = 0;
      } else {
        p.x = mod1(p.baseX + xWave + windWave) * targetW;
        p.y = fallingY * targetH;
        p.vx = (xWave + windWave) * targetW;
        p.vy = (travelCycles * targetH) / duration / norm;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, type: ParticleType, options?: Partial<ParticleControlOptions>) {
    if (type === "none") return;
    const controls = options ? this.normalizeControls(options) : this.controls;
    const sizeScale = controls.size / 100;
    const opacityScale = controls.opacity / 100;
    const color = controls.color.trim();

    ctx.save();
    ctx.globalCompositeOperation = controls.blendMode;
    if (controls.blur > 0) {
      ctx.filter = `blur(${controls.blur.toFixed(2)}px)`;
    }

    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity * opacityScale));

      // Lluvia: el streak se alinea al vector de velocidad REAL (sin rotación
      // aleatoria ni escala tipo "hoja"); la profundidad manda en longitud/grosor/alpha.
      if (type === "cinematic_rain") {
        this.drawRainStreak(ctx, p, sizeScale, color);
        ctx.restore();
        continue;
      }

      ctx.rotate(p.rot);
      ctx.scale(p.scale * p.z * sizeScale, p.scale * p.z * sizeScale);

      if (type === "bamboo_leaves") {
        this.drawBambooLeaf(ctx, p.size, p.displayPhase, color);
      } else if (type === "embers_fire") {
        this.drawEmberSpark(ctx, p.size, color);
      } else if (type === "sakura_petals") {
        this.drawSakuraPetal(ctx, p.size, color);
      } else if (type === "cinematic_dust") {
        this.drawCinematicDust(ctx, p.size, color);
      } else if (type === "snow_ash") {
        this.drawSnowAsh(ctx, p.size, p.hue, color);
      } else if (type === "light_leaks") {
        this.drawLightLeak(ctx, p.size * 18, color);
      } else if (type === "dark_ink_fog") {
        this.drawInkFog(ctx, p.size * 3.5, color);
      } else if (type === "blood_drips") {
        this.drawBloodDrop(ctx, p.size, color);
      } else if (type === "golden_sparks") {
        this.drawGoldenSpark(ctx, p.size, color);
      }

      ctx.restore();
    }
    ctx.restore();
  }

  // 1. Realistic 3D-projected Bamboo Leaf with Vein & Curved Silhouette
  private drawBambooLeaf(ctx: CanvasRenderingContext2D, size: number, phase: number, color = "") {
    const l = size * 2.2;
    const w = size * 0.45 * (0.6 + 0.4 * Math.cos(phase)); // 3D tilt flattening

    ctx.fillStyle = color || "#1c1917"; // Ink dark silhouette
    ctx.beginPath();
    ctx.moveTo(0, -l / 2);
    ctx.bezierCurveTo(w, -l * 0.2, w * 0.8, l * 0.3, 0, l / 2);
    ctx.bezierCurveTo(-w * 0.8, l * 0.3, -w, -l * 0.2, 0, -l / 2);
    ctx.closePath();
    ctx.fill();

    // Central vein
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -l / 2 + 2);
    ctx.lineTo(0, l / 2 - 2);
    ctx.stroke();
  }

  // 2. Glowing Incandescent Fire Ember
  private drawEmberSpark(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const rad = Math.max(3, size * 0.4);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 2.5);
    grad.addColorStop(0, "rgba(255, 255, 230, 1.0)"); // White-hot core
    grad.addColorStop(0.3, color || "rgba(251, 146, 60, 0.95)"); // Bright orange
    grad.addColorStop(0.72, color || "rgba(239, 68, 68, 0.6)");
    grad.addColorStop(1, "transparent");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Delicate Cherry Blossom Petal
  private drawSakuraPetal(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const s = size * 0.9;
    ctx.fillStyle = color || "rgba(251, 207, 232, 0.85)";
    ctx.strokeStyle = color || "rgba(244, 114, 182, 0.4)";
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.7, -s * 0.7, s * 0.8, s * 0.4, 0, s);
    ctx.bezierCurveTo(-s * 0.8, s * 0.4, -s * 0.7, -s * 0.7, 0, -s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 4. Lluvia: estela alineada al vector de velocidad real (halo suave + núcleo brillante)
  private drawRainStreak(ctx: CanvasRenderingContext2D, p: Particle, sizeScale: number, color = "") {
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const ux = p.vx / speed;
    const uy = p.vy / speed;
    // La estela apunta en contra del movimiento (motion blur); más larga y gruesa de cerca
    const len = p.size * (1.6 + 2.4 * p.z) * (0.55 + 0.45 * p.scale) * sizeScale;
    const lw = (0.7 + p.z * 1.4) * sizeScale;

    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ux * len, -uy * len);
    // Halo translúcido: cuerpo de gota en movimiento sin bordes duros
    ctx.strokeStyle = color || `rgba(191, 205, 250, ${0.08 + 0.14 * p.z})`;
    ctx.lineWidth = lw * 2.8;
    ctx.stroke();
    // Núcleo brillante
    ctx.strokeStyle = color || `rgba(228, 233, 247, ${0.32 + 0.34 * p.z})`;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // 5. Billowing Dark Ink Mist Cloud
  private drawCinematicDust(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const radius = Math.max(2, size * 0.32);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2.8);
    grad.addColorStop(0, "rgba(255,255,245,0.95)");
    grad.addColorStop(0.28, color || "rgba(224, 202, 164, 0.65)");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSnowAsh(ctx: CanvasRenderingContext2D, size: number, hue: number, color = "") {
    const radius = Math.max(1.5, size * (0.18 + hue * 0.16));
    ctx.fillStyle = color || (hue > 0.42 ? "rgba(241,245,249,0.92)" : "rgba(161,161,170,0.78)");
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.72, radius * 1.25, hue * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawLightLeak(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, color || "rgba(255, 218, 166, 0.48)");
    grad.addColorStop(0.38, color || "rgba(251, 146, 60, 0.2)");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.34, Math.PI * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Billowing Dark Ink Mist Cloud
  private drawInkFog(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, color || "rgba(9, 9, 11, 0.55)");
    grad.addColorStop(0.6, color || "rgba(24, 24, 27, 0.25)");
    grad.addColorStop(1, "transparent");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Blood Combat Droplet
  private drawBloodDrop(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const r = size * 0.45;
    ctx.fillStyle = color || "rgba(185, 28, 28, 0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Golden Sparkle Anime Star
  private drawGoldenSpark(ctx: CanvasRenderingContext2D, size: number, color = "") {
    const s = size * 0.5;
    ctx.fillStyle = color || "rgba(254, 240, 138, 0.9)";
    ctx.shadowColor = color || "#facc15";
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.25, -s * 0.25);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.25, s * 0.25);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.25, s * 0.25);
    ctx.lineTo(-s, 0);
    ctx.lineTo(-s * 0.25, -s * 0.25);
    ctx.closePath();
    ctx.fill();
  }
}

export { PhysicsParticleSystem };
export const globalParticles = new PhysicsParticleSystem();

/**
 * Draw Interactive Katana Slash Arc with Luminous Blade Trail & Shimmer
 */
export function drawKatanaSlashArc(
  ctx: CanvasRenderingContext2D,
  arc: KatanaSlashConfig,
  targetW: number,
  targetH: number,
  t: number
) {
  if (!arc.enabled) return;

  const cx = arc.x * targetW;
  const cy = arc.y * targetH;
  const radius = arc.radius || 220;
  const baseAngle = ((arc.angle || 0) * Math.PI) / 180;
  const sweepRad = ((arc.arcSweep || 85) * Math.PI) / 180;
  const speed = arc.animationSpeed || 1.0;

  // Pulsing blade shimmer cycle
  const pulse = Math.sin(t * 3.5 * speed) * 0.5 + 0.5;
  const startAngle = baseAngle - sweepRad / 2;
  const endAngle = baseAngle + sweepRad / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Outer Colored Energy Aura
  ctx.beginPath();
  ctx.arc(0, 0, radius, startAngle, endAngle);
  let auraColor = "rgba(56, 189, 248, 0.4)";
  let coreColor = "rgba(224, 242, 254, 1.0)";

  if (arc.color === "getsuga_dark") {
    auraColor = "rgba(168, 85, 247, 0.6)";
    coreColor = "rgba(240, 171, 252, 1.0)";
    ctx.shadowColor = "#a855f7";
  } else if (arc.color === "nichirin_fire") {
    auraColor = "rgba(249, 115, 22, 0.7)";
    coreColor = "rgba(254, 240, 138, 1.0)";
    ctx.shadowColor = "#f97316";
  } else if (arc.color === "blood_crimson") {
    auraColor = "rgba(225, 29, 72, 0.75)";
    coreColor = "rgba(254, 205, 211, 1.0)";
    ctx.shadowColor = "#e11d48";
  } else if (arc.color === "thunder_cyan") {
    auraColor = "rgba(6, 182, 212, 0.65)";
    coreColor = "rgba(207, 250, 254, 1.0)";
    ctx.shadowColor = "#06b6d4";
  } else if (arc.color === "divine_white") {
    auraColor = "rgba(255, 255, 255, 0.5)";
    coreColor = "rgba(255, 255, 255, 1.0)";
    ctx.shadowColor = "#ffffff";
  }

  ctx.shadowBlur = 18 + pulse * 10;
  ctx.strokeStyle = auraColor;
  ctx.lineWidth = (arc.thickness || 14) * 1.6;
  ctx.lineCap = "round";
  ctx.stroke();

  // Razor White Inner Blade Core
  ctx.beginPath();
  ctx.arc(0, 0, radius, startAngle, endAngle);
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = Math.max(3, (arc.thickness || 14) * 0.45);
  ctx.stroke();

  // Blade Shimmer Glint along the arc path
  if (arc.bladeShimmer) {
    const shimmerProgress = (t * 1.8 * speed) % 1.0;
    const glintAngle = startAngle + sweepRad * shimmerProgress;
    const gx = Math.cos(glintAngle) * radius;
    const gy = Math.sin(glintAngle) * radius;

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(gx, gy, (arc.thickness || 14) * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Action Speedlines Generator
 */
function drawActionSpeedLines(
  ctx: CanvasRenderingContext2D,
  type: SpeedLinesType,
  intensity: number,
  center: { x: number; y: number },
  targetW: number,
  targetH: number,
  t: number
) {
  if (type === "none" || intensity <= 0) return;

  const count = Math.round(intensity * 0.6);
  const cx = center.x * targetW;
  const cy = center.y * targetH;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.4;

  if (type === "radial_burst") {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.sin(t * 12.0 + i) * 0.05;
      const innerDist = 90 + ((i * 37) % 60);
      const outerDist = Math.max(targetW, targetH) * 1.2;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerDist, cy + Math.sin(angle) * innerDist);
      ctx.lineTo(cx + Math.cos(angle) * outerDist, cy + Math.sin(angle) * outerDist);
      ctx.stroke();
    }
  } else if (type === "horizontal_rush") {
    for (let i = 0; i < count; i++) {
      const y = ((i * 43 + t * 450) % targetH);
      const xLen = 120 + ((i * 19) % 180);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(xLen, y);
      ctx.moveTo(targetW - xLen, y);
      ctx.lineTo(targetW, y);
      ctx.stroke();
    }
  } else if (type === "vertical_fall") {
    for (let i = 0; i < count; i++) {
      const x = ((i * 53 + t * 350) % targetW);
      const yLen = 100 + ((i * 23) % 160);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, yLen);
      ctx.moveTo(x, targetH - yLen);
      ctx.lineTo(x, targetH);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Main 60 FPS Frame Renderer (Pristine, Sharp, Zero Vibration)
 */
export function renderMangaMotionFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap | CanvasImageSource,
  config: MangaMotionConfig,
  targetW: number,
  targetH: number,
  t: number,
  selectedTextId: string | null = null,
  particleSystem?: PhysicsParticleSystem,
  dtScale: number = 1.0
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Clear Frame
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, targetW, targetH);

  const anyImg = img as unknown as { videoWidth?: number; videoHeight?: number; width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number };
  const imgW = anyImg.videoWidth || anyImg.width || anyImg.naturalWidth || anyImg.displayWidth || 640;
  const imgH = anyImg.videoHeight || anyImg.height || anyImg.naturalHeight || anyImg.displayHeight || 480;

  // 1. Professional Manga Motion Camera Calculations (8 Advanced Cinematic Modes)
  let camPanX = 0;
  let camPanY = 0;
  const baseZoom = Math.max(1.0, config.cameraBaseZoom || 1.0);
  let camZoom = baseZoom;
  const userAngle = (config.cameraAngle || 0) * (Math.PI / 180);
  let camRot = userAngle;

  const duration = Math.max(1, config.duration);
  const cycleProgress = (t % duration) / duration; // 0..1
  const speed = config.cameraSpeed || 1.0;
  const intensity = (config.cameraIntensity || 30) / 100;
  const animTime = t * speed;

  if (config.cameraMove === "static") {
    // 100% steady, pristine HD framing with custom base zoom and Dutch angle
    camZoom = baseZoom;
    camPanX = 0;
    camPanY = 0;
  } else if (config.cameraMove === "slow_push") {
    // Empuje suave sin rotación: la oscilación angular anterior se percibía como
    // temblor incluso con intensidades bajas.
    const pushFactor = config.cameraOneWay
      ? (config.cameraDirection === -1 ? 1 - cycleProgress : cycleProgress)
      : 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
    camZoom = baseZoom * (1.0 + 0.075 * pushFactor * intensity);
    camRot = userAngle;
  } else if (config.cameraMove === "dutch_drift") {
    // Deriva estable, sin ángulo holandés animado ni cambios de escala.
    camRot = userAngle;
    camZoom = baseZoom * (1.04 + 0.035 * intensity);
    camPanX = Math.sin(cycleProgress * Math.PI * 2) * targetW * 0.025 * intensity;
    camPanY = Math.cos(cycleProgress * Math.PI * 2) * targetH * 0.018 * intensity;
  } else if (config.cameraMove === "whip_pan") {
    // ⚡ Anime Whip Pan: Rapid horizontal snap with inertial easing
    const snap = Math.sin(cycleProgress * Math.PI * 4);
    const easeWhip = Math.sign(snap) * Math.pow(Math.abs(snap), 3);
    camZoom = baseZoom * (1.15 + 0.1 * Math.abs(easeWhip) * intensity);
    camPanX = easeWhip * targetW * 0.12 * intensity;
    camRot = userAngle + easeWhip * 0.06 * intensity;
  } else if (config.cameraMove === "vertigo_zoom") {
    // 🌀 Dolly Zoom / Vertigo effect (popular in awakening scenes)
    const vertigoCycle = Math.sin(cycleProgress * Math.PI * 2);
    camZoom = baseZoom * (1.0 + (0.28 * (0.5 + 0.5 * vertigoCycle)) * intensity);
    camPanY = -vertigoCycle * targetH * 0.04 * intensity;
  } else if (config.cameraMove === "spiral_vortex") {
    // 🌪️ Spiral combat vortex into character center
    const spiralPhase = animTime * 1.5;
    camRot = userAngle + Math.sin(spiralPhase) * 0.12 * intensity;
    camZoom = baseZoom * (1.12 + 0.14 * (0.5 + 0.5 * Math.sin(spiralPhase * 2)) * intensity);
    camPanX = Math.cos(spiralPhase) * targetW * 0.05 * intensity;
    camPanY = Math.sin(spiralPhase) * targetH * 0.05 * intensity;
  } else if (config.cameraMove === "cinematic_scan") {
    // 📜 Diagonal & vertical manga scan from top-corner to face
    const scanProg = 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
    camZoom = baseZoom * (1.18 + 0.08 * intensity);
    camPanX = (scanProg - 0.5) * targetW * 0.14 * intensity;
    camPanY = (scanProg - 0.5) * targetH * 0.18 * intensity;
  } else if (config.cameraMove === "impact_shake") {
    // 🫨 Heavy impact shake & hitstop jolt
    const shakeFreq = animTime * 28.0;
    const decay = Math.exp(-((t % 1.5) * 3.2));
    camZoom = baseZoom * (1.06 + 0.08 * decay * intensity);
    camPanX = (Math.sin(shakeFreq) + Math.cos(shakeFreq * 1.6)) * 7.0 * decay * intensity;
    camPanY = (Math.cos(shakeFreq * 1.2) + Math.sin(shakeFreq * 2.0)) * 7.0 * decay * intensity;
    camRot = userAngle + Math.sin(shakeFreq * 0.8) * 0.03 * decay * intensity;
  }

  const sourceTransform = config.sourceTransform;
  if (sourceTransform) {
    camPanX += sourceTransform.dx * targetW;
    camPanY += sourceTransform.dy * targetH;
    camZoom *= Math.max(1, sourceTransform.scale);
    camRot += (sourceTransform.rotation * Math.PI) / 180;
  }

  // 2. Draw Main Image (100% Sharp Original Ink)
  const scaleFill = Math.max(targetW / imgW, targetH / imgH) * camZoom;
  const dstW = imgW * scaleFill;
  const dstH = imgH * scaleFill;
  const sourceFocus = config.sourceFocus;
  if (sourceFocus) {
    const focusX = Math.max(0, Math.min(1, sourceFocus.x));
    const focusY = Math.max(0, Math.min(1, sourceFocus.y));
    const maxPanX = Math.max(0, (dstW - targetW) / 2);
    const maxPanY = Math.max(0, (dstH - targetH) / 2);
    const focusPanX = (0.5 - focusX) * maxPanX * 2;
    const focusPanY = (0.5 - focusY) * maxPanY * 2;
    camPanX = Math.max(-maxPanX, Math.min(maxPanX, camPanX + focusPanX));
    camPanY = Math.max(-maxPanY, Math.min(maxPanY, camPanY + focusPanY));
  }
  const centerX = targetW / 2 + camPanX;
  const centerY = targetH / 2 + camPanY;

  // Aesthetic Filter CSS String
  let filterStr = "none";
  if (config.aestheticStyle === "seinen_bw") {
    filterStr = "grayscale(100%) contrast(135%) brightness(98%)";
  } else if (config.aestheticStyle === "retro_90s") {
    filterStr = "contrast(110%) saturate(115%) sepia(12%)";
  } else if (config.aestheticStyle === "dark_fantasy") {
    filterStr = "contrast(122%) saturate(82%) brightness(94%) sepia(6%)";
  } else if (config.aestheticStyle === "cyberpunk_neon") {
    filterStr = "contrast(125%) saturate(140%) hue-rotate(330deg)";
  } else if (config.aestheticStyle === "vintage_sepia") {
    filterStr = "sepia(55%) contrast(108%) brightness(96%)";
  } else if (config.aestheticStyle === "lofi_sunset" || (config.aestheticStyle as string) === "anime_lofi") {
    filterStr = "saturate(120%) hue-rotate(8deg) contrast(104%)";
  } else if (config.aestheticStyle === "golden_sunset") {
    filterStr = "contrast(110%) brightness(101%) saturate(120%) sepia(30%) hue-rotate(-8deg)";
  }

  const colorGrade = { ...DEFAULT_COLOR_GRADE, ...config.colorGrade };
  const gradeFilters: string[] = [];
  if (colorGrade.exposure !== 0) {
    gradeFilters.push(`brightness(${Math.max(55, Math.min(145, 100 + colorGrade.exposure * 0.45))}%)`);
  }
  if (colorGrade.contrast !== 0) {
    gradeFilters.push(`contrast(${Math.max(45, Math.min(155, 100 + colorGrade.contrast * 0.55))}%)`);
  }
  if (colorGrade.saturation !== 0) {
    gradeFilters.push(`saturate(${Math.max(0, Math.min(200, 100 + colorGrade.saturation))}%)`);
  }
  if (gradeFilters.length > 0) {
    filterStr = `${filterStr === "none" ? "" : `${filterStr} `}${gradeFilters.join(" ")}`;
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(camRot);
  ctx.filter = filterStr;
  ctx.drawImage(img, -dstW / 2, -dstH / 2, dstW, dstH);
  if (colorGrade.bloom > 0) {
    const bloom = Math.max(0, Math.min(100, colorGrade.bloom)) / 100;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = bloom * 0.2;
    const bloomBlur = Math.max(1, Math.min(targetW, targetH) * (0.0015 + bloom * 0.003));
    ctx.filter = `${filterStr === "none" ? "" : `${filterStr} `}blur(${bloomBlur.toFixed(2)}px) brightness(112%)`;
    ctx.drawImage(img, -dstW / 2, -dstH / 2, dstW, dstH);
  }
  ctx.restore();

  // Corrección de temperatura/tinte por capas: evita una segunda lectura del canvas
  // y mantiene el estado neutro bit a bit idéntico al render anterior.
  const drawToneLayer = (value: number, positive: string, negative: string, strength: number) => {
    if (value === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.min(1, Math.abs(value) / 100) * strength;
    ctx.fillStyle = value > 0 ? positive : negative;
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.restore();
  };
  drawToneLayer(colorGrade.temperature, "#ff9b4a", "#3f78ff", 0.34);
  drawToneLayer(colorGrade.tint, "#d946ef", "#22c98a", 0.22);
  if (colorGrade.fade > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = (Math.max(0, Math.min(100, colorGrade.fade)) / 100) * 0.2;
    ctx.fillStyle = "#77727f";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.restore();
  }

  // 3. Fast GPU-Accelerated Screentone Halftone Pattern (Zero Lag at 60 FPS)
  if (config.aestheticStyle === "screentone") {
    const pat = getScreentonePattern(ctx);
    if (pat) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.restore();
    }
  }

  const grainAmount = Math.max(config.grain || 0, colorGrade.grain || 0);
  if (grainAmount > 0) {
    const grainPattern = getFilmGrainPattern(ctx);
    if (grainPattern) {
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = (Math.max(0, Math.min(100, grainAmount)) / 100) * 0.2;
      ctx.fillStyle = grainPattern;
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.restore();
    }
  }

  // 4. Action Speed Lines
  drawActionSpeedLines(
    ctx,
    config.speedLines,
    config.speedLinesIntensity,
    config.speedLinesCenter,
    targetW,
    targetH,
    t
  );

  // 5. Katana Slash Arc
  drawKatanaSlashArc(ctx, config.katanaArc, targetW, targetH, t);

  // 6. Eye Glow Flare
  if (config.eyeGlow) {
    const gx = config.eyeGlowPos.x * targetW + camPanX * 0.5;
    const gy = config.eyeGlowPos.y * targetH + camPanY * 0.5;
    const baseSize = config.eyeGlowSize || 28;
    const pulseFactor = config.eyeGlowPulse ? 0.8 + 0.4 * Math.sin(t * 5.5) : 1.0;
    const radius = baseSize * pulseFactor;

    ctx.save();
    ctx.shadowColor = config.eyeGlowColor || "#ff1122";
    ctx.shadowBlur = 24 * pulseFactor;

    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, config.eyeGlowColor || "#ff1122");
    grad.addColorStop(1, "rgba(255, 0, 0, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gx, gy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Horizontal Flare Streak
    ctx.strokeStyle = config.eyeGlowColor || "#ff1122";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(gx - radius * 2.2, gy);
    ctx.lineTo(gx + radius * 2.2, gy);
    ctx.stroke();

    ctx.restore();
  }

  // 7. High Definition Particles (instancia propia por canvas/slot; la singleton solo
  // es el default para compatibilidad con páginas que no pasan una)
  const particleSys = particleSystem ?? globalParticles;
  particleSys.update(
    config.particles,
    config.particleIntensity,
    targetW,
    targetH,
    t,
    config.particleSpeed || 1.0,
    dtScale,
    {
      ...config.particleControls,
      loopDuration: config.particleControls?.loopDuration ?? config.duration,
    }
  );
  particleSys.draw(ctx, config.particles, config.particleControls);

  // 8. Manga Typography & Speech Bubbles
  if (config.textItems && config.textItems.length > 0) {
    for (const item of config.textItems) {
      drawMangaTextBubble(
        ctx,
        item,
        targetW,
        targetH,
        t,
        selectedTextId === item.id
      );
    }
  }

  // 9. Vignette & Cinematic Border Shadow
  if (config.vignette > 0) {
    const vigRatio = config.vignette / 100;
    ctx.save();
    const vigGrad = ctx.createRadialGradient(
      targetW / 2,
      targetH / 2,
      targetW * 0.35,
      targetW / 2,
      targetH / 2,
      targetW * 0.75
    );
    vigGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    vigGrad.addColorStop(1, `rgba(0, 0, 0, ${0.85 * vigRatio})`);
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.restore();
  }

  if (config.watermarkEnabled !== false) {
    const opacity = typeof config.watermarkOpacity === "number" ? config.watermarkOpacity : 0.28;
    drawProfessionalWatermark(ctx, {
      text: config.watermarkText || "SILENT VIGIL",
      width: targetW,
      height: targetH,
      opacity,
      shorts: config.aspectRatio === "9:16",
      style: config.watermarkStyle,
    });
  }
}

/**
 * HD Video MP4 Exporter with Seamless Loop Blending & Audio Sync
 */
export async function exportMangaMotionVideo(params: {
  image: HTMLImageElement | HTMLCanvasElement;
  config: MangaMotionConfig;
  audioBuffer?: AudioBuffer | null;
  onProgress?: (progress: number) => void;
}): Promise<{ blob: Blob; url: string }> {
  const { image, config, audioBuffer, onProgress } = params;

  // Aspect ratio dimensions for HD export
  let targetW = 1080;
  let targetH = 1920;
  if (config.aspectRatio === "16:9") {
    targetW = 1920;
    targetH = 1080;
  } else if (config.aspectRatio === "1:1") {
    targetW = 1080;
    targetH = 1080;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = targetW;
  exportCanvas.height = targetH;
  const ctx = exportCanvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2D canvas context for HD export");

  // Loop duration (up to 60s)
  const duration = Math.max(3, Math.min(60, config.duration));
  const fps = config.fps || 60;
  const totalFrames = Math.round(duration * fps);

  // Setup Audio Track if provided
  let audioStreamNode: MediaStreamAudioDestinationNode | null = null;
  let audioCtx: AudioContext | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;

  if (audioBuffer) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    audioStreamNode = audioCtx.createMediaStreamDestination();
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioStreamNode);
  }

  // Combine Canvas Stream and Audio Stream
  const canvasStream = exportCanvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioStreamNode ? audioStreamNode.stream.getAudioTracks() : []),
  ]);

  const mimeTypes = [
    "video/mp4;codecs=avc1.4d002a,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  let chosenMime = "video/webm";
  for (const m of mimeTypes) {
    if (MediaRecorder.isTypeSupported(m)) {
      chosenMime = m;
      break;
    }
  }

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType: chosenMime,
    videoBitsPerSecond: 18_000_000, // 18 Mbps high bitrate for crisp HD
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      if (audioCtx) void audioCtx.close();
      const finalBlob = new Blob(chunks, { type: chosenMime });
      const url = URL.createObjectURL(finalBlob);
      resolve({ blob: finalBlob, url });
    };

    mediaRecorder.onerror = (err) => {
      if (audioCtx) void audioCtx.close();
      reject(err);
    };

    mediaRecorder.start();
    if (sourceNode && audioCtx) {
      sourceNode.start(0);
    }

    let currentFrame = 0;
    const crossfadeDur = config.enableSeamlessLoop ? Math.min(2.5, config.loopCrossfadeDuration || 1.8) : 0;
    const crossfadeStart = duration - crossfadeDur;

    const renderNextFrame = () => {
      if (currentFrame >= totalFrames) {
        mediaRecorder.stop();
        return;
      }

      const t = currentFrame / fps;

      renderMangaMotionFrame(ctx, image, config, targetW, targetH, t);

      // Seamless Loop Crossfade Blend on tail frames
      if (config.enableSeamlessLoop && crossfadeDur > 0 && t >= crossfadeStart) {
        const progressInFade = (t - crossfadeStart) / crossfadeDur;
        const alpha = 0.5 - 0.5 * Math.cos(progressInFade * Math.PI); // Smooth cosine ease

        const startCanvas = document.createElement("canvas");
        startCanvas.width = targetW;
        startCanvas.height = targetH;
        const startCtx = startCanvas.getContext("2d");
        if (startCtx) {
          const tStart = progressInFade * crossfadeDur;
          renderMangaMotionFrame(startCtx, image, config, targetW, targetH, tStart);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.drawImage(startCanvas, 0, 0);
          ctx.restore();
        }
      }

      currentFrame++;
      if (onProgress) onProgress(currentFrame / totalFrames);

      // Request next frame in sync with recorder
      setTimeout(renderNextFrame, 1000 / fps);
    };

    renderNextFrame();
  });
}

/**
 * Organic Ping-Pong / Boomerang Time Calculator
 * Uses smooth sinusoidal easing (cos-based ease-in-out) so the motion decelerates
 * smoothly before turning around and accelerates naturally on return,
 * eliminating violent mechanical whiplash / bounce.
 */
/**
 * Constant-speed boomerang (one continuous take).
 * The old cosine ease parked the camera at each turn — it looked lagged, then sped up.
 * The organic variant only eases near each turn and keeps its velocity and acceleration
 * continuous when it rejoins the 1× central section.
 */
export function calculateOrganicPingPongTime(
  t: number,
  duration: number,
  easeType: "organic" | "linear" = "linear"
): number {
  if (duration <= 0.05) return 0;
  // `easeType` se conserva por compatibilidad con las páginas existentes. Ambos
  // modos usan ahora cadencia lineal: la suavidad visual se aplica como una mezcla
  // acotada del frame extremo, sin detener ni acelerar el reloj de la fuente.
  void easeType;
  return getSmoothPingPongFrameState(t, duration).primaryTime;
}
