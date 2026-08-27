"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import TrimTimeline from "@/components/TrimTimeline";
import SongLoopWaveform from "@/components/SongLoopWaveform";
import { downloadBlob } from "@/lib/gifEncoder";
import { studioStore } from "@/lib/sessionStore";
import { ParticleType, PhysicsParticleSystem } from "@/lib/mangaMotionEngine";
import {
  analyzeMusic,
  analyzeVideo,
  companionHealth,
  identifyCharacter,
  listCharacters,
  listOverlays,
  listVisualStyles,
  planLayers,
  renderLoop,
  saveExportImage,
  youtubePack,
  type CastMember,
  type CharacterGuess,
  type CompanionHealth,
  type LayerPlan,
  type LoopCandidate,
  type OverlayOption,
  type RenderProgress,
  type VisualStyleOption,
  type YoutubePack,
} from "@/lib/companion";
export type CameraMovement =
  | "static"
  | "slow_push"
  | "dutch_drift"
  | "whip_pan"
  | "vertigo_zoom"
  | "spiral_vortex"
  | "cinematic_scan"
  | "impact_shake";

export const CAMERA_MODE_DEFAULTS: Record<
  CameraMovement,
  { cameraSpeed: number; cameraIntensity: number; cameraAngle: number; cameraBaseZoom: number }
> = {
  static: { cameraSpeed: 1.0, cameraIntensity: 0, cameraAngle: 0, cameraBaseZoom: 1.0 },
  slow_push: { cameraSpeed: 0.8, cameraIntensity: 40, cameraAngle: 0, cameraBaseZoom: 1.0 },
  dutch_drift: { cameraSpeed: 0.6, cameraIntensity: 35, cameraAngle: -8, cameraBaseZoom: 1.12 },
  whip_pan: { cameraSpeed: 1.2, cameraIntensity: 50, cameraAngle: 0, cameraBaseZoom: 1.15 },
  vertigo_zoom: { cameraSpeed: 0.7, cameraIntensity: 45, cameraAngle: 0, cameraBaseZoom: 1.0 },
  spiral_vortex: { cameraSpeed: 0.9, cameraIntensity: 35, cameraAngle: -5, cameraBaseZoom: 1.12 },
  cinematic_scan: { cameraSpeed: 0.7, cameraIntensity: 40, cameraAngle: 0, cameraBaseZoom: 1.18 },
  impact_shake: { cameraSpeed: 1.4, cameraIntensity: 60, cameraAngle: 0, cameraBaseZoom: 1.06 },
};

export function getVisualStyleCss(styleId: string): string {
  switch (styleId) {
    case "seinen_bw":
      return "grayscale(100%) contrast(160%) brightness(95%)";
    case "retro_90s":
    case "vintage_anime":
      return "contrast(118%) saturate(130%) sepia(18%)";
    case "dark_fantasy":
      return "contrast(140%) saturate(75%) hue-rotate(190deg) brightness(90%)";
    case "cyberpunk_neon":
      return "contrast(135%) saturate(160%) hue-rotate(320deg)";
    case "screentone":
      return "contrast(170%) grayscale(100%) brightness(92%)";
    case "vintage_sepia":
      return "sepia(70%) contrast(110%) brightness(92%)";
    case "anime_lofi":
      return "saturate(140%) hue-rotate(15deg) contrast(105%)";
    case "golden_sunset":
      return "contrast(1.16) brightness(1.02) saturate(1.34) sepia(0.42) hue-rotate(-14deg)";
    case "clean":
    default:
      return "none";
  }
}

export function getCameraTransformCss(
  cameraMode: CameraMovement,
  t: number,
  duration: number = 10,
  speed: number = 1.0,
  intensity: number = 30,
  angle: number = 0,
  baseZoom: number = 1.0
): string {
  const cycleProgress = (t % Math.max(1, duration)) / Math.max(1, duration);
  const intNorm = intensity / 100;
  const animTime = t * speed;
  let zoom = Math.max(1.0, baseZoom);
  let rot = angle;
  let panX = 0;
  let panY = 0;

  if (cameraMode === "slow_push") {
    const push = 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
    zoom = baseZoom * (1.0 + 0.14 * push * intNorm);
    rot = angle + Math.sin(cycleProgress * Math.PI * 2) * 1.5 * intNorm;
  } else if (cameraMode === "dutch_drift") {
    rot = angle + Math.sin(cycleProgress * Math.PI * 2) * 5.0 * intNorm;
    zoom = baseZoom * (1.12 + 0.08 * intNorm);
    panX = Math.sin(cycleProgress * Math.PI * 2) * 5 * intNorm;
    panY = Math.cos(cycleProgress * Math.PI * 2) * 4 * intNorm;
  } else if (cameraMode === "whip_pan") {
    const snap = Math.sin(cycleProgress * Math.PI * 4);
    const easeWhip = Math.sign(snap) * Math.pow(Math.abs(snap), 3);
    zoom = baseZoom * (1.15 + 0.1 * Math.abs(easeWhip) * intNorm);
    panX = easeWhip * 12 * intNorm;
    rot = angle + easeWhip * 4 * intNorm;
  } else if (cameraMode === "vertigo_zoom") {
    const vCycle = Math.sin(cycleProgress * Math.PI * 2);
    zoom = baseZoom * (1.0 + 0.28 * (0.5 + 0.5 * vCycle) * intNorm);
    panY = -vCycle * 4 * intNorm;
  } else if (cameraMode === "spiral_vortex") {
    const sPhase = animTime * 1.5;
    rot = angle + Math.sin(sPhase) * 7.5 * intNorm;
    zoom = baseZoom * (1.12 + 0.14 * (0.5 + 0.5 * Math.sin(sPhase * 2)) * intNorm);
    panX = Math.cos(sPhase) * 5 * intNorm;
    panY = Math.sin(sPhase) * 5 * intNorm;
  } else if (cameraMode === "cinematic_scan") {
    const sProg = 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
    zoom = baseZoom * (1.18 + 0.08 * intNorm);
    panX = (sProg - 0.5) * 12 * intNorm;
    panY = (sProg - 0.5) * 15 * intNorm;
  } else if (cameraMode === "impact_shake") {
    const shakeFreq = animTime * 28.0;
    const decay = Math.exp(-((t % 1.5) * 3.2));
    zoom = baseZoom * (1.06 + 0.08 * decay * intNorm);
    panX = (Math.sin(shakeFreq) + Math.cos(shakeFreq * 1.6)) * 6.0 * decay * intNorm;
    panY = (Math.cos(shakeFreq * 1.2) + Math.sin(shakeFreq * 2.0)) * 6.0 * decay * intNorm;
    rot = angle + Math.sin(shakeFreq * 0.8) * 2.0 * decay * intNorm;
  }

  return `scale(${zoom.toFixed(3)}) rotate(${rot.toFixed(2)}deg) translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px)`;
}

export function getPixelScale(size: number): number {
  return size > 1 ? size * 1.5 : 1;
}

export function parseGifMetadata(buffer: ArrayBuffer): {
  duration: number;
  width: number;
  height: number;
  frameCount: number;
} {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (bytes.length < 13) {
    return { duration: 3.0, width: 640, height: 480, frameCount: 1 };
  }

  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== "GIF87a" && sig !== "GIF89a") {
    return { duration: 3.0, width: 640, height: 480, frameCount: 1 };
  }

  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = bytes[10];
  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 3 * (1 << ((packed & 0x07) + 1)) : 0;

  let pos = 13 + gctSize;
  let totalDelayHundredths = 0;
  let frameCount = 0;
  let gceDelay = 0;

  while (pos < bytes.length) {
    const blockType = bytes[pos++];
    if (blockType === 0x3b) {
      break;
    }

    if (blockType === 0x21) {
      if (pos >= bytes.length) break;
      const extType = bytes[pos++];

      if (extType === 0xf9) {
        const blockSize = bytes[pos++];
        if (blockSize === 4 && pos + 4 <= bytes.length) {
          const delay = view.getUint16(pos + 1, true);
          gceDelay = delay <= 1 ? 10 : delay;
          pos += blockSize;
          if (pos < bytes.length && bytes[pos] === 0x00) {
            pos++;
          }
        } else {
          pos += blockSize;
          while (pos < bytes.length && bytes[pos] !== 0x00) {
            pos += bytes[pos] + 1;
          }
          if (pos < bytes.length) pos++;
        }
      } else {
        while (pos < bytes.length) {
          const subBlockLen = bytes[pos++];
          if (subBlockLen === 0) break;
          pos += subBlockLen;
        }
      }
    } else if (blockType === 0x2c) {
      if (pos + 9 > bytes.length) break;
      const imgPacked = bytes[pos + 8];
      pos += 9;
      const hasLct = (imgPacked & 0x80) !== 0;
      if (hasLct) {
        const lctSize = 3 * (1 << ((imgPacked & 0x07) + 1));
        pos += lctSize;
      }
      if (pos < bytes.length) {
        pos++;
      }
      while (pos < bytes.length) {
        const subBlockLen = bytes[pos++];
        if (subBlockLen === 0) break;
        pos += subBlockLen;
      }

      frameCount++;
      totalDelayHundredths += gceDelay > 0 ? gceDelay : 10;
      gceDelay = 0;
    }
  }

  const duration =
    totalDelayHundredths > 0
      ? totalDelayHundredths / 100
      : Math.max(1, frameCount * 0.1);

  return {
    duration: Math.max(0.1, duration),
    width: width || 640,
    height: height || 480,
    frameCount: Math.max(1, frameCount),
  };
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}


function VideoSong16x9Player({
  videoUrl,
  isGif,
  visualStyle,
  pixelSize,
  cameraMode,
  cameraSpeed,
  cameraIntensity,
  cameraAngle,
  cameraZoom,
  particles,
  particleIntensity,
  particleSpeed,
  videoDuration,
  vStart = 0,
  vEnd = 0,
  seamMode = "smooth",
  seamFade = 0.5,
}: {
  videoUrl: string;
  isGif?: boolean;
  visualStyle: string;
  pixelSize: number;
  cameraMode: CameraMovement;
  cameraSpeed: number;
  cameraIntensity: number;
  cameraAngle: number;
  cameraZoom: number;
  particles: ParticleType;
  particleIntensity: number;
  particleSpeed: number;
  videoDuration: number;
  vStart?: number;
  vEnd?: number;
  seamMode?: "smooth" | "pingpong" | "cut";
  seamFade?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const headVideoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const particlesRef = useRef<PhysicsParticleSystem>(new PhysicsParticleSystem());
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentLoopTime, setCurrentLoopTime] = useState<number>(0);

  const effStart = Math.max(0, vStart);
  const effEnd = vEnd > effStart + 0.1 ? vEnd : effStart + (videoDuration || 10);
  const loopDur = Math.max(0.5, effEnd - effStart);

  // Sync play/pause with underlying video
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let elapsed = 0;

    const render = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (isPlaying) {
        elapsed += dt;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const W = canvas.width;
      const H = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, W, H);

      let sourceEl: CanvasImageSource | null = null;
      let headEl: CanvasImageSource | null = null;
      let blendAlpha = 0;
      let sw = 0;
      let sh = 0;
      let curLoopSec = 0;

      if (isGif) {
        const img = imgRef.current;
        if (img && img.naturalWidth) {
          sourceEl = img;
          sw = img.naturalWidth;
          sh = img.naturalHeight;
          curLoopSec = elapsed % loopDur;
        }
      } else {
        const vid = videoRef.current;
        const headVid = headVideoRef.current;
        if (vid && vid.videoWidth) {
          sourceEl = vid;
          sw = vid.videoWidth;
          sh = vid.videoHeight;

          // Non-blocking smooth loop wrap
          if (isPlaying) {
            if (vid.paused) {
              vid.play().catch(() => {});
            }
            if (vid.currentTime >= effEnd || vid.currentTime < effStart - 0.2) {
              vid.currentTime = effStart;
            }
          }

          curLoopSec = Math.max(0, Math.min(loopDur, vid.currentTime - effStart));

          // Real-time smooth seam crossfade with head frame
          if (seamMode === "smooth" && loopDur > seamFade) {
            const fadeStart = loopDur - seamFade;
            if (curLoopSec >= fadeStart) {
              const headT = effStart + (curLoopSec - fadeStart);
              if (headVid && headVid.videoWidth) {
                headEl = headVid;
                if (Math.abs(headVid.currentTime - headT) > 0.15) {
                  headVid.currentTime = headT;
                }
                const progress = (curLoopSec - fadeStart) / seamFade;
                blendAlpha = 0.5 - 0.5 * Math.cos(progress * Math.PI);
              }
            }
          }
        }
      }

      setCurrentLoopTime(curLoopSec);

      // Calculate camera transformations
      const cycleProgress = curLoopSec / loopDur;
      const intNorm = cameraIntensity / 100;
      const cAnim = elapsed * cameraSpeed;
      let zoom = Math.max(1.0, cameraZoom);
      let rot = (cameraAngle * Math.PI) / 180;
      let panX = 0;
      let panY = 0;

      if (cameraMode === "slow_push") {
        const push = 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
        zoom = cameraZoom * (1.0 + 0.14 * push * intNorm);
        rot = (cameraAngle * Math.PI) / 180 + Math.sin(cycleProgress * Math.PI * 2) * 0.026 * intNorm;
      } else if (cameraMode === "dutch_drift") {
        rot = (cameraAngle * Math.PI) / 180 + Math.sin(cycleProgress * Math.PI * 2) * 0.087 * intNorm;
        zoom = cameraZoom * (1.12 + 0.08 * intNorm);
        panX = Math.sin(cycleProgress * Math.PI * 2) * 14 * intNorm;
        panY = Math.cos(cycleProgress * Math.PI * 2) * 10 * intNorm;
      } else if (cameraMode === "whip_pan") {
        const snap = Math.sin(cycleProgress * Math.PI * 4);
        const easeWhip = Math.sign(snap) * Math.pow(Math.abs(snap), 3);
        zoom = cameraZoom * (1.15 + 0.1 * Math.abs(easeWhip) * intNorm);
        panX = easeWhip * 32 * intNorm;
        rot = (cameraAngle * Math.PI) / 180 + easeWhip * 0.07 * intNorm;
      } else if (cameraMode === "vertigo_zoom") {
        const vCycle = Math.sin(cycleProgress * Math.PI * 2);
        zoom = cameraZoom * (1.0 + 0.28 * (0.5 + 0.5 * vCycle) * intNorm);
        panY = -vCycle * 12 * intNorm;
      } else if (cameraMode === "spiral_vortex") {
        const sPhase = cAnim * 1.5;
        rot = (cameraAngle * Math.PI) / 180 + Math.sin(sPhase) * 0.13 * intNorm;
        zoom = cameraZoom * (1.12 + 0.14 * (0.5 + 0.5 * Math.sin(sPhase * 2)) * intNorm);
        panX = Math.cos(sPhase) * 14 * intNorm;
        panY = Math.sin(sPhase) * 14 * intNorm;
      } else if (cameraMode === "cinematic_scan") {
        const sProg = 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
        zoom = cameraZoom * (1.18 + 0.08 * intNorm);
        panX = (sProg - 0.5) * 35 * intNorm;
        panY = (sProg - 0.5) * 45 * intNorm;
      } else if (cameraMode === "impact_shake") {
        const shakeFreq = cAnim * 28.0;
        const decay = Math.exp(-((elapsed % 1.5) * 3.2));
        zoom = cameraZoom * (1.06 + 0.08 * decay * intNorm);
        panX = (Math.sin(shakeFreq) + Math.cos(shakeFreq * 1.6)) * 16.0 * decay * intNorm;
        panY = (Math.cos(shakeFreq * 1.2) + Math.sin(shakeFreq * 2.0)) * 16.0 * decay * intNorm;
        rot = (cameraAngle * Math.PI) / 180 + Math.sin(shakeFreq * 0.8) * 0.035 * decay * intNorm;
      }

      ctx.translate(W / 2 + panX, H / 2 + panY);
      ctx.rotate(rot);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H / 2);

      if (visualStyle && visualStyle !== "clean") {
        ctx.filter = getVisualStyleCss(visualStyle);
      } else {
        ctx.filter = "none";
      }

      if (sourceEl && sw > 0 && sh > 0) {
        const targetRatio = W / H;
        const srcRatio = sw / sh;
        let drawW = W;
        let drawH = H;
        let offX = 0;
        let offY = 0;

        if (srcRatio > targetRatio) {
          drawW = H * srcRatio;
          offX = (W - drawW) / 2;
        } else {
          drawH = W / srcRatio;
          offY = (H - drawH) / 2;
        }
        ctx.drawImage(sourceEl, offX, offY, drawW, drawH);

        if (headEl && blendAlpha > 0.01) {
          ctx.save();
          ctx.globalAlpha = blendAlpha;
          ctx.drawImage(headEl, offX, offY, drawW, drawH);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = "#09090b";
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();

      if (pixelSize > 1) {
        const block = pixelSize * 2;
        const smallW = Math.max(16, Math.round(W / block));
        const smallH = Math.max(16, Math.round(H / block));
        const off = document.createElement("canvas");
        off.width = smallW;
        off.height = smallH;
        const octx = off.getContext("2d");
        if (octx) {
          octx.imageSmoothingEnabled = false;
          octx.drawImage(canvas, 0, 0, smallW, smallH);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(off, 0, 0, smallW, smallH, 0, 0, W, H);
          ctx.restore();
        }
      }

      if (visualStyle === "screentone") {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = "#ffffff";
        for (let y = 0; y < H; y += 6) {
          for (let x = 0; x < W; x += 6) {
            ctx.beginPath();
            ctx.arc(x + 3, y + 3, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      if (particles && particles !== "none") {
        particlesRef.current.update(particles, particleIntensity, W, H, elapsed, particleSpeed);
        particlesRef.current.draw(ctx, particles);
      }

      if (visualStyle !== "clean") {
        ctx.save();
        const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.68);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.42)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    isPlaying,
    isGif,
    visualStyle,
    pixelSize,
    cameraMode,
    cameraSpeed,
    cameraIntensity,
    cameraAngle,
    cameraZoom,
    particles,
    particleIntensity,
    particleSpeed,
    effStart,
    effEnd,
    loopDur,
    seamMode,
    seamFade,
  ]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black aspect-video max-h-80 w-full shadow-2xl flex flex-col items-center justify-center">
      {isGif ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={imgRef} src={videoUrl} alt="source gif" className="hidden" />
      ) : (
        <>
          <video ref={videoRef} src={videoUrl} muted playsInline autoPlay className="hidden" />
          <video ref={headVideoRef} src={videoUrl} muted playsInline className="hidden" />
        </>
      )}
      <canvas ref={canvasRef} width={960} height={540} className="w-full h-full object-contain" />
      
      {/* Top status badges */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span>16:9 HD · 60 FPS</span>
      </div>

      {/* Live Playhead and Seam Indicator */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 pt-6 flex flex-col gap-1.5 pointer-events-auto">
        <div className="flex items-center justify-between text-[11px] text-zinc-300">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-2.5 py-1 rounded bg-zinc-800/90 hover:bg-zinc-700 text-xs text-zinc-200 border border-white/10 flex items-center gap-1 shadow"
            >
              {isPlaying ? "⏸️" : "▶️"}
            </button>
            <span className="font-mono text-cyan-400 font-bold">
              {currentLoopTime.toFixed(1)}s / {loopDur.toFixed(1)}s
            </span>
            <span className="text-[10px] text-zinc-300 bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-700">
              {seamMode === "smooth"
                ? `🌊 Fundido (${seamFade.toFixed(2)}s)`
                : seamMode === "pingpong"
                ? "🔄 Boomerang"
                : "✂️ Corte Directo"}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 hidden sm:inline">
            {seamMode === "smooth" ? "✨ Costura suave activa" : "Bucle continuo en tiempo real"}
          </span>
        </div>

        {/* Timeline progress track with highlighted seam blend zone */}
        <div className="relative w-full h-1.5 bg-zinc-800/90 rounded-full overflow-hidden border border-white/10">
          {seamMode === "smooth" && loopDur > seamFade && (
            <div
              className="absolute right-0 top-0 bottom-0 bg-cyan-500/40 border-l border-cyan-400/80"
              style={{ width: `${(seamFade / loopDur) * 100}%` }}
              title={`Zona de Suavizado (${seamFade.toFixed(2)}s)`}
            />
          )}
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 transition-[width] duration-75"
            style={{ width: `${(currentLoopTime / loopDur) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}


export default function VideoLoopPage() {
  const [health, setHealth] = useState<CompanionHealth | null>(null);
  const [overlays, setOverlays] = useState<OverlayOption[]>([]);
  const [visualStyles, setVisualStyles] = useState<VisualStyleOption[]>([]);
  const [visualStyle, setVisualStyle] = useState("anime_lofi");
  const [pixelSize, setPixelSize] = useState<number>(1);
  const [cameraMode, setCameraMode] = useState<CameraMovement>("static");
  const [cameraSpeed, setCameraSpeed] = useState<number>(1.0);
  const [cameraIntensity, setCameraIntensity] = useState<number>(30);
  const [cameraAngle, setCameraAngle] = useState<number>(0);
  const [cameraZoom, setCameraZoom] = useState<number>(1.0);
  const [particles, setParticles] = useState<ParticleType>("none");
  const [particleIntensity, setParticleIntensity] = useState<number>(50);
  const [particleSpeed, setParticleSpeed] = useState<number>(1.0);
  const [animTime, setAnimTime] = useState<number>(0);
  const [seamMode, setSeamMode] = useState<"smooth" | "pingpong" | "cut">("smooth");
  const [seamFade, setSeamFade] = useState<number>(0.5);

  const handleSelectCameraMode = (mode: CameraMovement) => {
    const defaults = CAMERA_MODE_DEFAULTS[mode];
    setCameraMode(mode);
    setCameraSpeed(defaults.cameraSpeed);
    setCameraIntensity(defaults.cameraIntensity);
    setCameraAngle(defaults.cameraAngle);
    setCameraZoom(defaults.cameraBaseZoom);
    setPlan(null);
    setPreviewUrl(null);
  };
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCandidates, setVideoCandidates] = useState<LoopCandidate[]>([]);
  const [videoSel, setVideoSel] = useState<LoopCandidate | null>(null);
  const [manualTrim, setManualTrim] = useState({ start: 0, end: 0 });
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [useManualVideo, setUseManualVideo] = useState(false);
  const [videoMode, setVideoMode] = useState<"full" | "loops" | "trim">("full");
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [windowSec, setWindowSec] = useState(120);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCandidates, setAudioCandidates] = useState<LoopCandidate[]>([]);
  const [audioSel, setAudioSel] = useState<LoopCandidate | null>(null);
  const [targetMin, setTargetMin] = useState(1);
  const [shortsSec, setShortsSec] = useState(25);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [widened, setWidened] = useState(false);
  const [audioMode, setAudioMode] = useState<"loops" | "trim" | "full">("full");

  const [atmosphere, setAtmosphere] = useState("auto");
  const [sfxOn, setSfxOn] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [intensity, setIntensity] = useState(0.45);

  const [plan, setPlan] = useState<LayerPlan | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [shortsUrl, setShortsUrl] = useState<string | null>(null);
  const [shortsSize, setShortsSize] = useState(0);
  const [shortsBusy, setShortsBusy] = useState(false);

  const [cast, setCast] = useState<CastMember[]>([]);
  const [guess, setGuess] = useState<CharacterGuess | null>(null);
  const [character, setCharacter] = useState<string | null>(null);
  const [charLocked, setCharLocked] = useState(false);
  const [yt, setYt] = useState<YoutubePack | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [renderPct, setRenderPct] = useState(0);
  const [renderStage, setRenderStage] = useState("");

  const companionUp = !!health?.ok;

  useEffect(() => {
    let animId: number;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setAnimTime((prev) => prev + dt);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    companionHealth().then(setHealth);
    listOverlays().then(setOverlays);
    listVisualStyles().then(setVisualStyles);
    listCharacters().then(setCast);
  }, []);
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (shortsUrl) URL.revokeObjectURL(shortsUrl);
    };
  }, [resultUrl, previewUrl, shortsUrl]);

  const isGif = Boolean(
    videoFile &&
      (videoFile.type === "image/gif" || videoFile.name.toLowerCase().endsWith(".gif"))
  );

  const handleVideo = useCallback(async (f: File) => {
    setError(null);
    setResultUrl(null);
    setPreviewUrl(null);
    setPlan(null);
    setGuess(null);
    setCharacter(null);
    setCharLocked(false);
    setYt(null);
    setVideoFile(f);
    setVideoCandidates([]);
    setVideoSel(null);
    setVideoMode("full");
    setUseManualVideo(false);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });

    const isGifFile = f.type === "image/gif" || f.name.toLowerCase().endsWith(".gif");

    if (isGifFile) {
      try {
        const arr = await f.arrayBuffer();
        const meta = parseGifMetadata(arr);
        setVideoDuration(meta.duration);
        setManualTrim({ start: 0, end: meta.duration });
        setVideoSel({
          start: 0,
          end: meta.duration,
          duration: meta.duration,
          score: 100,
          label: "Full GIF loop (seamless)",
        });
      } catch {
        setVideoDuration(3.0);
        setManualTrim({ start: 0, end: 3.0 });
        setVideoSel({
          start: 0,
          end: 3.0,
          duration: 3.0,
          score: 100,
          label: "Full GIF loop (seamless)",
        });
      }
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = URL.createObjectURL(f);
      v.onloadedmetadata = () => {
        setVideoDuration(v.duration);
        setManualTrim({ start: 0, end: v.duration });
        setVideoSel({
          start: 0,
          end: v.duration,
          duration: v.duration,
          score: 100,
          label: "Full clip (seamless crossfade)",
        });
        URL.revokeObjectURL(v.src);
      };
      v.onerror = () => {
        setError("Could not load video metadata");
        URL.revokeObjectURL(v.src);
      };
    }
  }, []);

  // Auto-cargar video o audio de la sesión (ej. desde Manga Motion 2.5D)
  useEffect(() => {
    const file = studioStore.videoFile;
    if (file && !videoFile) {
      const timer = setTimeout(() => {
        void handleVideo(file);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [handleVideo, videoFile]);

  const handleAudio = useCallback(async (f: File) => {
    setError(null);
    setResultUrl(null);
    setPreviewUrl(null);
    setPlan(null);
    setAudioFile(f);
    setAudioCandidates([]);
    setSongTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    try {
      const arr = await f.arrayBuffer();
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(arr);
      void ctx.close();
      setAudioBuffer(buf);
      setAudioDuration(buf.duration);
      setAudioSel({ start: 0, end: buf.duration, duration: buf.duration, score: 100 });
      setAudioMode("full");
    } catch {
      setError("Could not decode the audio");
    }
  }, []);

  const runVideoAnalysis = useCallback(async () => {
    if (!videoFile || analyzingVideo) return;
    setAnalyzingVideo(true);
    setError(null);
    try {
      const cands = await analyzeVideo(videoFile, { length: 0, downsample: 3, windowSec });
      setVideoCandidates(cands);
      setVideoMode("loops");
      setUseManualVideo(false);
      if (cands.length > 0) setVideoSel(cands[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error analizando video");
    } finally {
      setAnalyzingVideo(false);
    }
  }, [videoFile, analyzingVideo, windowSec]);

  const switchVideoMode = useCallback(
    (mode: "full" | "loops" | "trim") => {
      setVideoMode(mode);
      setPlan(null);
      setPreviewUrl(null);
      if (mode === "full") {
        setUseManualVideo(false);
        if (videoDuration > 0) {
          setVideoSel({
            start: 0,
            end: videoDuration,
            duration: videoDuration,
            score: 100,
            label: "Full clip (seamless crossfade)",
          });
        }
      } else if (mode === "loops") {
        setUseManualVideo(false);
        if (videoCandidates.length > 0) {
          setVideoSel(videoCandidates[0]);
        }
      } else if (mode === "trim") {
        setUseManualVideo(true);
        setVideoSel(null);
      }
    },
    [videoDuration, videoCandidates]
  );

  const runAudioAnalysis = useCallback(async () => {
    if (!audioFile || analyzingAudio) return;
    setAnalyzingAudio(true);
    setError(null);
    setWidened(false);
    try {
      const t = Math.max(5, targetMin * 60);
      let cands = await analyzeMusic(audioFile, {
        minDuration: Math.max(2, Math.round(t * 0.7)),
        maxDuration: Math.round(t * 1.35),
      });
      if (cands.length === 0 && t >= 5) {
        cands = await analyzeMusic(audioFile, {
          minDuration: Math.max(2, Math.round(t * 0.35)),
          maxDuration: t * 3,
        });
        setWidened(true);
      }
      cands.sort((a, b) => Math.abs(a.duration - t) - Math.abs(b.duration - t));
      setAudioCandidates(cands);
      setAudioMode("loops");
      if (cands.length > 0) setAudioSel(cands[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error analizando la canción");
    } finally {
      setAnalyzingAudio(false);
    }
  }, [audioFile, analyzingAudio, targetMin]);

  const switchAudioMode = useCallback(
    (mode: "loops" | "trim" | "full") => {
      setAudioMode(mode);
      setPlan(null);
      setPreviewUrl(null);
      if (!audioBuffer) return;
      if (mode === "full") {
        setAudioSel({
          start: 0,
          end: audioBuffer.duration,
          duration: audioBuffer.duration,
          score: 100,
        });
      } else if (mode === "loops" && audioCandidates.length > 0) {
        setAudioSel(audioCandidates[0]);
      }
    },
    [audioBuffer, audioCandidates]
  );

  const vStart = useManualVideo || !videoSel ? manualTrim.start : videoSel.start;
  const vEnd = useManualVideo || !videoSel ? manualTrim.end : videoSel.end;
  const vDur = Math.max(0, vEnd - vStart);
  const aDur = audioSel ? audioSel.duration : 0;
  const targetSec = Math.max(8, targetMin * 60);
  const songLoops = aDur > 0 ? Math.max(1, Math.ceil(targetSec / aDur)) : 0;
  const videoLoops = vDur > 0 ? Math.max(1, Math.ceil(targetSec / vDur)) : 0;

  const canWork =
    companionUp && videoFile && audioFile && audioSel && (videoSel || useManualVideo);

  useEffect(() => {
    if (!videoFile || !companionUp) return;
    const end = vEnd > vStart ? vEnd : Math.min(videoDuration || 8, 8);
    let cancel = false;
    identifyCharacter(videoFile, {
      start: vStart,
      end,
      filename: videoFile.name,
    })
      .then((g) => {
        if (cancel) return;
        setGuess(g);
        if (!charLocked) setCharacter(g.id);
      })
      .catch(() => {
        /* el usuario puede elegir a mano */
      });
    return () => {
      cancel = true;
    };
  }, [videoFile, companionUp, vStart, vEnd, videoDuration, charLocked]);

  useEffect(() => {
    if (!character || !companionUp) return;
    let cancel = false;
    youtubePack({
      character,
      song: songTitle || audioFile?.name,
      artist: songArtist,
      minutes: targetMin,
      atmosphere,
    })
      .then((p) => {
        if (!cancel) setYt(p);
      })
      .catch(() => {
        if (!cancel) setYt(null);
      });
    return () => {
      cancel = true;
    };
  }, [character, companionUp, audioFile, songTitle, songArtist, targetMin, atmosphere]);


  const onRenderProg = useCallback((p: RenderProgress) => {
    setRenderPct(p.pct);
    setRenderStage(p.stage);
  }, []);

  const runPreview = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || previewBusy) return;
    setPreviewBusy(true);
    setError(null);
    setRenderPct(0);
    setRenderStage("planning");
    try {
      const next = await planLayers(audioFile, {
        audioStart: audioSel.start,
        audioEnd: audioSel.end,
        target: targetSec,
        atmosphere: atmosphere === "off" ? "off" : (particles !== "none" ? particles : atmosphere),
        visualStyle,
        pixelSize,
        sfxOn: atmosphere !== "off" && sfxOn,
        intensity: particleIntensity / 100,
        watermark,
        video: videoFile,
        videoStart: vStart,
        videoEnd: vEnd,
      });
      setPlan(next);
      const blob = await renderLoop(
        videoFile,
        audioFile,
        {
          videoStart: vStart,
          videoEnd: vEnd,
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          targetDuration: Math.min(20, targetSec),
          preview: true,
          plan: next,
          seamMode,
          seamFade,
        },
        onRenderProg
      );
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  }, [
    videoFile,
    audioFile,
    audioSel,
    previewBusy,
    targetSec,
    atmosphere,
    visualStyle,
    pixelSize,
    sfxOn,
    intensity,
    watermark,
    vStart,
    vEnd,
    onRenderProg,
  ]);

  const generate = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || busy) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    setRenderPct(0);
    setRenderStage("planning");
    try {
      let used = plan;
      if (!used) {
        used = await planLayers(audioFile, {
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          target: targetSec,
          atmosphere: atmosphere === "off" ? "off" : (particles !== "none" ? particles : atmosphere),
          visualStyle,
          pixelSize,
          sfxOn: atmosphere !== "off" && sfxOn,
          intensity: particleIntensity / 100,
          watermark,
          video: videoFile,
          videoStart: vStart,
          videoEnd: vEnd,
        });
        setPlan(used);
      }
      const blob = await renderLoop(
        videoFile,
        audioFile,
        {
          videoStart: vStart,
          videoEnd: vEnd,
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          targetDuration: targetSec,
          preview: false,
          plan: used,
          seamMode,
          seamFade,
        },
        onRenderProg
      );
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }, [
    videoFile,
    audioFile,
    audioSel,
    busy,
    plan,
    targetSec,
    atmosphere,
    visualStyle,
    pixelSize,
    sfxOn,
    intensity,
    watermark,
    vStart,
    vEnd,
    onRenderProg,
  ]);

  const generateShort = useCallback(async () => {
    if (!videoFile || !audioFile || !audioSel || shortsBusy) return;
    setShortsBusy(true);
    setError(null);
    setRenderPct(0);
    setRenderStage("planning");
    try {
      let used = plan;
      if (!used) {
        used = await planLayers(audioFile, {
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          target: shortsSec,
          atmosphere,
          visualStyle,
          pixelSize,
          sfxOn,
          intensity,
          watermark,
          video: videoFile,
          videoStart: vStart,
          videoEnd: vEnd,
        });
        setPlan(used);
      }
      const blob = await renderLoop(
        videoFile,
        audioFile,
        {
          videoStart: vStart,
          videoEnd: vEnd,
          audioStart: audioSel.start,
          audioEnd: audioSel.end,
          targetDuration: shortsSec,
          preview: false,
          aspect: "shorts",
          plan: used,
        },
        onRenderProg
      );
      setShortsUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setShortsSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Short render failed");
    } finally {
      setShortsBusy(false);
    }
  }, [
    videoFile,
    audioFile,
    audioSel,
    shortsBusy,
    plan,
    shortsSec,
    atmosphere,
    visualStyle,
    pixelSize,
    sfxOn,
    intensity,
    watermark,
    vStart,
    vEnd,
    onRenderProg,
  ]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold mb-1">Video + Song</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              companionUp
                ? "border-green-700 bg-green-900/40 text-green-400"
                : "border-red-800 bg-red-950/50 text-red-400"
            }`}
          >
            {companionUp ? "● Companion online" : "● Companion offline"}
          </span>
        </div>
        <p className="text-zinc-400 text-sm mt-1">
          Upload a clip and a song. Set the length in minutes — video and song loop
          seamlessly to fill it. Atmosphere and SFX land automatically. Preview 20s
          before you generate.
        </p>
        {!companionUp && (
          <div className="mt-3 rounded-lg bg-amber-950/60 border border-amber-800 px-4 py-3 text-sm text-amber-300">
            Start the companion:{" "}
            <code className="bg-black/40 px-1.5 py-0.5 rounded">cd companion && ./start.sh</code>
          </div>
        )}
      </section>

      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">1 · Pick the video loop</h2>
        {!videoFile ? (
          <FileDropzone
            accept="video/*,image/gif,.gif"
            label="Drop your video or GIF or click"
            hint="We find seamless loops; the chosen slice fades and repeats"
            onFile={handleVideo}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-400">
                ✓ {videoFile.name} ({videoDuration.toFixed(1)}s)
              </p>
              <button
                onClick={() => {
                  setVideoFile(null);
                  setVideoCandidates([]);
                  setVideoSel(null);
                }}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["full", "Full video (seamless crossfade)"],
                  ["loops", "A detected video loop"],
                  ["trim", "Trim by hand"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => switchVideoMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    videoMode === mode
                      ? "border-cyan-500 bg-cyan-500/15"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {videoMode === "full" && (
              <div className="space-y-2">
                <div className="text-xs bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 text-zinc-300">
                  {isGif
                    ? `Full GIF loop (${videoDuration.toFixed(1)}s) will repeat seamlessly across the whole song duration.`
                    : `Full clip (${videoDuration.toFixed(1)}s) will repeat with a seamless 2-second crossfade into the start (0 jump cuts).`}
                </div>
                {videoUrl && (
                  <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-black aspect-video max-h-60 flex items-center justify-center">
                    <div
                      className="w-full h-full flex items-center justify-center overflow-hidden"
                      style={{ imageRendering: pixelSize > 1 ? "pixelated" : "auto" }}
                    >
                      {isGif ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={videoUrl}
                          alt="GIF loop preview"
                          style={{
                            filter: getVisualStyleCss(visualStyle),
                            imageRendering: pixelSize > 1 ? "pixelated" : "auto",
                            transform: `${getCameraTransformCss(cameraMode, animTime, videoDuration || 10, cameraSpeed, cameraIntensity, cameraAngle, cameraZoom)} ${pixelSize > 1 ? `scale(${getPixelScale(pixelSize)})` : ""}`,
                            width: pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
                            height: pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
                          }}
                          className="object-contain pointer-events-none transition-[filter,transform] duration-200"
                        />
                      ) : (
                        <video
                          src={videoUrl}
                          muted
                          loop
                          autoPlay
                          playsInline
                          style={{
                            filter: getVisualStyleCss(visualStyle),
                            imageRendering: pixelSize > 1 ? "pixelated" : "auto",
                            transform: `${getCameraTransformCss(cameraMode, animTime, videoDuration || 10, cameraSpeed, cameraIntensity, cameraAngle, cameraZoom)} ${pixelSize > 1 ? `scale(${getPixelScale(pixelSize)})` : ""}`,
                            width: pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
                            height: pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
                          }}
                          className="object-contain transition-[filter,transform] duration-200"
                        />
                      )}
                    </div>
                    {visualStyle !== "clean" && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.38) 100%)",
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
            {videoMode === "loops" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    Analyze first
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="number"
                        min={0}
                        max={3600}
                        value={windowSec}
                        onChange={(e) => setWindowSec(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5"
                      />
                      <span className="text-zinc-400 text-xs">s · 0 = all</span>
                    </div>
                  </label>
                  <button
                    onClick={runVideoAnalysis}
                    disabled={!companionUp || analyzingVideo}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40"
                  >
                    {analyzingVideo ? "Finding the best cut…" : "Find seamless loops"}
                  </button>
                </div>

                {videoCandidates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-400">
                      Hover to preview · click to pick. Export fades end into start so the cut
                      disappears.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {videoCandidates.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setVideoSel(c)}
                          className={`rounded-lg text-left text-sm border overflow-hidden ${
                            videoSel === c
                              ? "border-cyan-500 bg-cyan-500/15"
                              : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"
                          }`}
                        >
                          {videoUrl && (
                            <video
                              src={videoUrl}
                              muted
                              loop
                              playsInline
                              preload="metadata"
                              className="w-full aspect-video object-cover bg-black"
                              onLoadedMetadata={(e) => {
                                e.currentTarget.currentTime = c.start;
                              }}
                              onMouseEnter={(e) => {
                                setPreviewIdx(i);
                                const v = e.currentTarget;
                                v.currentTime = c.start;
                                void v.play().catch(() => {});
                              }}
                              onMouseLeave={(e) => {
                                setPreviewIdx(null);
                                e.currentTarget.pause();
                              }}
                              onTimeUpdate={(e) => {
                                if (previewIdx !== i) return;
                                const v = e.currentTarget;
                                if (v.currentTime >= c.end || v.currentTime < c.start - 0.5) {
                                  v.currentTime = c.start;
                                }
                              }}
                            />
                          )}
                          <div className="px-2.5 py-2 space-y-1">
                            {c.label ? (
                              <div className="text-[11px] font-semibold text-cyan-300 truncate">
                                {c.label}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-200">
                                {fmt(c.start)} → {fmt(c.end)}
                              </span>
                              <span className="text-zinc-400 font-mono text-[11px]">
                                {c.duration.toFixed(1)}s
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-0.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                  c.score >= 90
                                    ? "bg-green-500/20 text-green-300 border border-green-500/30"
                                    : c.score >= 80
                                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                Match {c.score.toFixed(0)}%
                              </span>
                              {c.duration >= 3.0 && (
                                <span className="text-[10px] text-zinc-400">Toma larga</span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {videoMode === "trim" && (
              <TrimTimeline
                duration={videoDuration}
                start={manualTrim.start}
                end={manualTrim.end}
                onChange={setManualTrim}
              />
            )}

            {/* Transición y Suavizado de Bucle (Loop Seam Smoothing) */}
            <div className="space-y-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-zinc-300">
                  🌊 Transición de Bucle (Suavizado de Costura Continuo)
                </span>
                <span className="text-cyan-400 font-mono">
                  {seamMode === "smooth"
                    ? `Fundido Suave (${seamFade.toFixed(2)}s)`
                    : seamMode === "pingpong"
                    ? "Ida y Vuelta (Boomerang)"
                    : "Corte Directo"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: "smooth",
                    label: "🌊 Fundido Suave (Recomendado)",
                    desc: "Transición imperceptible en el retorno. 0 saltos.",
                  },
                  {
                    id: "pingpong",
                    label: "🔄 Ida y Vuelta (Boomerang)",
                    desc: "Movimiento continuo infinito hacia adelante y atrás.",
                  },
                  {
                    id: "cut",
                    label: "✂️ Corte Directo",
                    desc: "Para loops ya perfectos fotograma a fotograma.",
                  },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSeamMode(m.id as "smooth" | "pingpong" | "cut");
                      setPlan(null);
                      setPreviewUrl(null);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      seamMode === m.id
                        ? "border-cyan-500 bg-cyan-950/60 text-white font-semibold ring-1 ring-cyan-400/40 shadow-sm"
                        : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{m.label}</div>
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
              {seamMode === "smooth" && (
                <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-1.5 text-xs">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Duración del Suavizado de Costura (Crossfade de Enlace)</span>
                    <span className="font-mono text-cyan-400">{seamFade.toFixed(2)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.2"
                    step="0.05"
                    value={seamFade}
                    onChange={(e) => {
                      setSeamFade(parseFloat(e.target.value));
                      setPlan(null);
                      setPreviewUrl(null);
                    }}
                    className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded"
                  />
                  <p className="text-[10px] text-zinc-500">
                    El video arranca limpio en el segundo 0 y se funde suavemente solo en la costura de cada repetición para un movimiento continuo sin saltos.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
        <h2 className="font-semibold">2 · Song and final length</h2>
        {!audioFile ? (
          <FileDropzone
            accept="audio/*"
            label="Drop the song or click"
            hint="It will loop to cover the minutes you ask for"
            onFile={handleAudio}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-400">
                ✓ {audioFile.name} ({fmt(audioDuration)})
              </p>
              <button
                onClick={() => {
                  setAudioFile(null);
                  setAudioBuffer(null);
                  setAudioCandidates([]);
                  setAudioSel(null);
                }}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                ✕
              </button>
            </div>

            <label className="block text-sm">
              <span className="text-zinc-200 font-medium">How many minutes should the video last?</span>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={0.25}
                  max={180}
                  step={0.25}
                  value={targetMin}
                  onChange={(e) =>
                    setTargetMin(Math.max(0.25, Math.min(180, parseFloat(e.target.value) || 1)))
                  }
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5"
                />
                <span className="text-zinc-400 text-xs">minutes</span>
                {[1, 3, 5, 10, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => setTargetMin(m)}
                    className={`px-2 py-1 rounded text-xs border ${
                      targetMin === m
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["full", "Full song (loops if needed)"],
                  ["loops", "A detected song loop"],
                  ["trim", "Trim by hand"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => switchAudioMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    audioMode === mode
                      ? "border-fuchsia-500 bg-fuchsia-500/15"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {audioMode === "loops" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={runAudioAnalysis}
                  disabled={!companionUp || analyzingAudio}
                  className="px-4 py-2 rounded-lg font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40"
                >
                  {analyzingAudio ? "Analyzing beats…" : "Detect song loops"}
                </button>
                {widened && (
                  <span className="text-xs text-amber-400">Search window was widened</span>
                )}
              </div>
            )}

            {audioBuffer && (
              <SongLoopWaveform
                audioBuffer={audioBuffer}
                candidates={audioMode === "loops" ? audioCandidates : []}
                selected={audioSel}
                onSelect={setAudioSel}
                trimMode={audioMode === "trim"}
              />
            )}

            {audioMode === "loops" && audioCandidates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {audioCandidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setAudioSel(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      audioSel === c
                        ? "border-fuchsia-500 bg-fuchsia-500/15"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    #{i + 1} · {fmt(c.start)} → {fmt(c.end)} ({c.duration.toFixed(1)}s) · Score{" "}
                    {c.score.toFixed(0)}%
                  </button>
                ))}
              </div>
            )}

            {aDur > 0 && (
              <p className="text-sm bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300">
                The result will last{" "}
                <strong>{targetMin >= 1 ? `${targetMin} min` : `${targetSec.toFixed(0)}s`}</strong>
                {songLoops > 1 && (
                  <> · the song crossfades end→start and repeats ~{songLoops} times</>
                )}
                {videoLoops > 1 && <> · the video repeats ~{videoLoops} times with a fade</>}
                .
              </p>
            )}
          </div>
        )}
      </section>

      {canWork && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
          <h2 className="font-semibold">3 · Atmosphere (auto, you approve)</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            Fog, smoke and particles blend in screen mode at low opacity. Ambience sits
            under the song (low-pass). SFX (thunder, metal) land in quiet valleys.
          </p>

          <div>
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-zinc-300">🌫️ Atmósfera y Efectos Ambientales</span>
              <span className="text-cyan-400 font-mono">
                {atmosphere === "off" ? "DESACTIVADA (LIMPIO)" : atmosphere.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "auto", label: "✨ Auto (Recomendado)" },
                { id: "off", label: "🚫 Ninguna / Desactivada (Limpio)" },
                ...(overlays.length ? overlays.filter(o => o.id !== "auto" && o.id !== "off") : [
                  { id: "fog", label: "Niebla Mística" },
                  { id: "smoke", label: "Humo Sutil" },
                  { id: "rain", label: "Lluvia" },
                  { id: "particles", label: "Partículas" },
                  { id: "fire", label: "Fuego / Brasas" },
                ]),
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setAtmosphere(o.id);
                    setPlan(null);
                    setPreviewUrl(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    atmosphere === o.id
                      ? "border-cyan-500 bg-cyan-500/15"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Manga Visual Filters & Color Grading */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-zinc-300">🎨 Filtros Visuales Anime & Manga (1080p)</span>
              <span className="text-fuchsia-400 font-mono">
                {visualStyle.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "clean", label: "🖼️ Original Limpio", hint: "Colores originales sin filtros + nitidez 1080p" },
                { id: "seinen_bw", label: "🖋️ Seinen B&W", hint: "Tinta manga de alto contraste tradicional (Berserk/Vagabond)" },
                { id: "retro_90s", label: "📼 Retro 90s Anime", hint: "Saturación analógica y textura cel (Evangelion / Bebop)" },
                { id: "dark_fantasy", label: "🌑 Dark Fantasy", hint: "Sombras de acero frío y atmósfera sombría" },
                { id: "cyberpunk_neon", label: "🌆 Cyberpunk Glow", hint: "Neón magenta, cyan y contraste anime" },
                { id: "screentone", label: "📰 Screentone", hint: "Trama de imprenta manga halftone" },
                { id: "vintage_sepia", label: "📜 Pergamino Sepia", hint: "Tono pergamino samurái antiguo" },
                { id: "anime_lofi", label: "🌅 Lo-Fi Sunset", hint: "Resplandor dorado suave y atardecer pastel" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setVisualStyle(s.id);
                    setPlan(null);
                    setPreviewUrl(null);
                  }}
                  title={s.hint}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    visualStyle === s.id
                      ? "border-fuchsia-500 bg-fuchsia-950/60 text-white font-semibold ring-1 ring-fuchsia-400/40 shadow-sm"
                      : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                  }`}
                >
                  <div className="text-xs font-bold truncate">{s.label}</div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Atmospheric HD Particle Effects */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-zinc-300">✨ Partículas Atmosféricas HD (Manga Motion 2.5)</span>
              <span className="text-amber-400 font-mono">
                {particles.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "none", label: "🚫 Ninguna", desc: "Sin partículas visuales" },
                { id: "bamboo_leaves", label: "🎋 Hojas de Bambú", desc: "Vagabond / Viento tradicional" },
                { id: "embers_fire", label: "🔥 Brasas Ardientes", desc: "Berserk / Fuego ascendente" },
                { id: "sakura_petals", label: "🌸 Pétalos Sakura", desc: "Brisa suave anime Shonen" },
                { id: "cinematic_rain", label: "🌧️ Lluvia Cinemática", desc: "Gotas de lluvia continua" },
                { id: "dark_ink_fog", label: "🌫️ Humo de Tinta", desc: "Niebla mística oscura" },
                { id: "blood_drips", label: "🩸 Gotas de Sangre", desc: "Combate Seinen dramático" },
                { id: "golden_sparks", label: "✨ Destellos Anime", desc: "Estrellas doradas luminosas" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setParticles(p.id as ParticleType)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    particles === p.id
                      ? "border-amber-500 bg-amber-950/60 text-white font-semibold ring-1 ring-amber-400/40 shadow-sm"
                      : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                  }`}
                >
                  <div className="text-xs font-bold truncate">{p.label}</div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
            {particles !== "none" && (
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Intensidad de Partículas</span>
                    <span className="font-mono text-amber-400">{particleIntensity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={particleIntensity}
                    onChange={(e) => setParticleIntensity(parseInt(e.target.value))}
                    className="w-full accent-amber-500 h-1 bg-zinc-800 rounded"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Velocidad de Partículas</span>
                    <span className="font-mono text-amber-400">{particleSpeed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="3.0"
                    step="0.1"
                    value={particleSpeed}
                    onChange={(e) => setParticleSpeed(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1 bg-zinc-800 rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cinematic Manga Camera Modes */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-zinc-300">🎥 Efectos Cinemáticos Manga & Modos de Cámara</span>
              <span className="text-cyan-400 font-mono">
                {cameraMode.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "static", label: "🛑 Estática Fija", desc: "100% nítida, sin movimiento" },
                { id: "slow_push", label: "🔍 Zoom Lento", desc: "Acercamiento dramático suave" },
                { id: "dutch_drift", label: "📐 Plano Holandés", desc: "Inclinación cinemática flotante" },
                { id: "whip_pan", label: "⚡ Latigazo Anime", desc: "Whip Pan horizontal con inercia" },
                { id: "vertigo_zoom", label: "🌀 Efecto Vértigo", desc: "Dolly Zoom / Despertar" },
                { id: "spiral_vortex", label: "🌪️ Vórtice Espiral", desc: "Espiral de combate Shonen" },
                { id: "cinematic_scan", label: "📜 Escaneo Diagonal", desc: "Lectura de viñeta completa" },
                { id: "impact_shake", label: "🫨 Sacudida & Hitstop", desc: "Golpe e impacto de combate" },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCameraMode(c.id as CameraMovement)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    cameraMode === c.id
                      ? "border-cyan-500 bg-cyan-950/60 text-white font-semibold ring-1 ring-cyan-400/40 shadow-sm"
                      : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                  }`}
                >
                  <div className="text-xs font-bold truncate">{c.label}</div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">{c.desc}</div>
                </button>
              ))}
            </div>

            {/* Live Camera Sliders */}
            {cameraMode !== "static" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Velocidad</span>
                    <span className="font-mono text-cyan-400">{cameraSpeed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={cameraSpeed}
                    onChange={(e) => setCameraSpeed(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Intensidad</span>
                    <span className="font-mono text-cyan-400">{cameraIntensity}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={cameraIntensity}
                    onChange={(e) => setCameraIntensity(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Inclinación</span>
                    <span className="font-mono text-cyan-400">{cameraAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    step="1"
                    value={cameraAngle}
                    onChange={(e) => setCameraAngle(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Zoom Base</span>
                    <span className="font-mono text-cyan-400">{cameraZoom.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.05"
                    value={cameraZoom}
                    onChange={(e) => setCameraZoom(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded"
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>Retro Pixelation / Pixel Art style</span>
              <span className="text-cyan-400 font-medium">
                {pixelSize === 1 ? "Smooth 1080p (Off)" : `${pixelSize * 2}px pixel blocks`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { size: 1, label: "Smooth (Off)" },
                { size: 2, label: "Subtle (2px)" },
                { size: 3, label: "Anime Pixel (3px)" },
                { size: 4, label: "Retro 16-Bit (4px)" },
                { size: 6, label: "8-Bit Classic (6px)" },
              ].map((p) => (
                <button
                  key={p.size}
                  type="button"
                  onClick={() => {
                    setPixelSize(p.size);
                    setPlan(null);
                    setPreviewUrl(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    pixelSize === p.size
                      ? "border-cyan-500 bg-cyan-500/15 text-cyan-300 font-medium"
                      : "border-zinc-700 hover:border-zinc-500 text-zinc-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="block text-xs text-zinc-400">
              Custom pixel size: {pixelSize === 1 ? "1 (Off)" : `${pixelSize} (${pixelSize * 2}px block size)`}
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={pixelSize}
                onChange={(e) => {
                  setPixelSize(parseInt(e.target.value) || 1);
                  setPlan(null);
                  setPreviewUrl(null);
                }}
                className="w-full accent-cyan-500 mt-1"
              />
            </label>
          </div>

          {videoUrl && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold text-zinc-300">📺 Previsualización en Vivo 16:9 (Filtros + Partículas + Cámara)</span>
                <span className="text-cyan-400 font-mono text-[11px]">
                  {visualStyle.toUpperCase()} · {cameraMode.toUpperCase()} · {particles.toUpperCase()}
                </span>
              </div>
              <VideoSong16x9Player
                videoUrl={videoUrl}
                isGif={isGif}
                visualStyle={visualStyle}
                pixelSize={pixelSize}
                cameraMode={cameraMode}
                cameraSpeed={cameraSpeed}
                cameraIntensity={cameraIntensity}
                cameraAngle={cameraAngle}
                cameraZoom={cameraZoom}
                particles={particles}
                particleIntensity={particleIntensity}
                particleSpeed={particleSpeed}
                videoDuration={videoDuration}
                vStart={vStart}
                vEnd={vEnd}
                seamMode={seamMode}
                seamFade={seamFade}
              />
            </div>
          )}
          <label className="block text-sm">
            Intensity: {Math.round(intensity * 100)}%
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.05}
              value={intensity}
              onChange={(e) => {
                setIntensity(parseFloat(e.target.value));
                setPlan(null);
                setPreviewUrl(null);
              }}
              className="w-full accent-cyan-500"
            />
          </label>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sfxOn}
                onChange={(e) => {
                  setSfxOn(e.target.checked);
                  setPlan(null);
                  setPreviewUrl(null);
                }}
                className="accent-fuchsia-500"
              />
              Auto SFX (thunder / metal in the quiet parts)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => {
                  setWatermark(e.target.checked);
                  setPlan(null);
                  setPreviewUrl(null);
                }}
                className="accent-fuchsia-500"
              />
              Silent Vigil Music watermark
            </label>
          </div>

          <button
            onClick={runPreview}
            disabled={previewBusy || !canWork}
            className="w-full py-2.5 rounded-lg font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40"
          >
            {previewBusy ? "Building 20s preview…" : "Preview how it would look (20 seconds)"}
          </button>
          {(previewBusy || busy) && <RenderBar pct={renderPct} stage={renderStage} />}

          {plan && (
            <div className="text-xs space-y-1 bg-zinc-950/50 border border-zinc-800 rounded-lg p-3">
              {plan.visualStyleLabel && (
                <div>
                  Visual Style: <strong>{plan.visualStyleLabel}</strong> (1080p Full HD upscale & grade)
                </div>
              )}
              <div>
                Atmosphere: <strong>{plan.overlayLabel ?? "none"}</strong>
                {plan.blend ? ` · blend ${plan.blend}` : ""}
                {plan.opacity != null ? ` · opacity ${(plan.opacity * 100).toFixed(0)}%` : ""}
              </div>
              {plan.look?.overlayReason ? (
                <div>
                  Picked {plan.overlayLabel} because {plan.look.overlayReason}
                </div>
              ) : null}
              {plan.ambienceLabel && (
                <div>
                  Ambience: {plan.ambienceLabel} (low, low-pass {plan.lowpassHz} Hz)
                </div>
              )}
              {plan.sfx.length > 0 && (
                <div>
                  SFX:{" "}
                  {plan.sfx
                    .slice(0, 6)
                    .map((s) => `${s.label} @ ${fmt(s.time)}${s.reason ? ` (${s.reason})` : ""}`)
                    .join(" · ")}
                  {plan.sfx.length > 6 ? "…" : ""}
                </div>
              )}
              {plan.chapters.length > 1 && (
                <div>
                  Long videos: atmosphere rotates every ~90s (
                  {plan.chapters.map((c) => c.label).join(" → ")})
                </div>
              )}
              {plan.watermark && <div>Watermark: Silent Vigil Music (top edge)</div>}
            </div>
          )}

          {previewUrl && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                Rough preview (20s, smaller resolution). The final export is the same
                graph at full length.
              </p>
              <video src={previewUrl} controls className="w-full rounded-lg border border-zinc-800" />
            </div>
          )}
        </section>
      )}

      {videoFile && (
        <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">4 · Character, YouTube pack & thumbnail</h2>
          <p className="text-xs text-zinc-400 -mt-2">
            Detects Guts, Thorfinn, Musashi or Buntarō from the drawing (and the filename).
            You can override. Copy uses the essays in <code>docs/</code> plus the title
            formula that actually ranks: Song (Slowed + Reverb) | mood.
          </p>
          {guess && (
            <p className="text-xs text-cyan-300">
              Guess: <strong>{guess.name}</strong> ({guess.series}) · {guess.confidence}% ·{" "}
              {guess.reason}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(cast.length
              ? cast
              : [
                  { id: "guts", name: "Guts", series: "Berserk", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "thorfinn", name: "Thorfinn", series: "Vinland Saga", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "musashi", name: "Miyamoto Musashi", series: "Vagabond", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "buntaro", name: "Buntarō Mori", series: "The Climber", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                  { id: "knight", name: "The Knight", series: "Chivalry Aesthetic", aka: "", playlist: "", hasEssay: true, hasRefs: false },
                ]
            ).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCharacter(c.id);
                  setCharLocked(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  character === c.id
                    ? "border-cyan-500 bg-cyan-500/15"
                    : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                {c.name}
                <span className="text-zinc-500 text-xs"> · {c.series}</span>
              </button>
            ))}
          </div>
          {yt && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-400">
                  Song title
                  <input
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                    placeholder="Golden Brown"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Artist
                  <input
                    value={songArtist}
                    onChange={(e) => setSongArtist(e.target.value)}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                    placeholder="The Stranglers"
                  />
                </label>
              </div>
              <FieldCopy label="Title" value={yt.title} copied={copied} onCopy={setCopied} />
              <FieldCopy
                label="Description"
                value={yt.description}
                copied={copied}
                multiline
                onCopy={setCopied}
              />
              <FieldCopy label="Tags" value={yt.tagsLine} copied={copied} onCopy={setCopied} />
              <FieldCopy label="Playlist" value={yt.playlist} copied={copied} onCopy={setCopied} />
              <FieldCopy
                label="Pinned comment"
                value={yt.pinnedComment}
                copied={copied}
                onCopy={setCopied}
              />
              <p className="text-xs text-zinc-500">{yt.thumbnailTip}</p>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500"
                onClick={() => {
                  void copyText(
                    `${yt.title}\n\n${yt.description}\n\nTags: ${yt.tagsLine}\nPlaylist: ${yt.playlist}\nPinned: ${yt.pinnedComment}`
                  ).then(() => setCopied("all"));
                }}
              >
                {copied === "all" ? "Copied pack" : "Copy long-form pack"}
              </button>
              {yt.shortsTitle && (
                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <div className="text-xs text-zinc-400">Shorts promo copy (English — paste on YouTube)</div>
                  <FieldCopy label="Shorts title" value={yt.shortsTitle} copied={copied} onCopy={setCopied} />
                  <FieldCopy
                    label="Shorts description"
                    value={yt.shortsDescription || ""}
                    copied={copied}
                    multiline
                    onCopy={setCopied}
                  />
                  <FieldCopy
                    label="Shorts tags"
                    value={yt.shortsTagsLine || ""}
                    copied={copied}
                    onCopy={setCopied}
                  />
                </div>
              )}
            </div>
          )}

          {videoUrl && (
            <ThumbnailPicker
              videoUrl={videoUrl}
              start={vStart}
              end={vEnd || videoDuration || 8}
              caption={yt?.name || character || ""}
              isGif={isGif}
              visualStyle={visualStyle}
              pixelSize={pixelSize}
            />
          )}
        </section>
      )}

      <div className="space-y-3">
        <button
          onClick={generate}
          disabled={!canWork || busy}
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-600 via-indigo-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-lg shadow-xl shadow-cyan-500/20"
        >
          {busy
            ? "Renderizando Master 16:9 HD…"
            : `Generar Video YouTube · ${targetMin >= 1 ? `${targetMin} min` : `${targetSec.toFixed(0)}s`} · 16:9 HD`}
        </button>
        <p className="text-xs text-zinc-500 text-center">
          Renderizado maestro 1080p Full HD 16:9 para YouTube (1920×1080) con loop continuo sin cortes y efectos en tiempo real.
        </p>
      </div>

      {(busy || shortsBusy) && <RenderBar pct={renderPct} stage={renderStage} />}

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {resultUrl && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold">
            YouTube 1080p Full HD ready{" "}
            <span className="text-xs text-zinc-400 font-normal">
              ({(resultSize / 1024 / 1024).toFixed(1)} MB · 1920×1080)
            </span>
          </h2>
          <video src={resultUrl} controls loop className="w-full rounded-lg border border-zinc-800" />
          <button
            onClick={() =>
              fetch(resultUrl)
                .then((r) => r.blob())
                .then((b) => downloadBlob(b, "silent-vigil-youtube-16x9.mp4"))
            }
            className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
          >
            Download 16:9 MP4
          </button>
        </div>
      )}
    </div>
  );
}

function FieldCopy({
  label,
  value,
  copied,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (k: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400">{label}</span>
        <button
          type="button"
          className="text-xs text-cyan-400 hover:text-cyan-300"
          onClick={() => {
            void copyText(value).then(() => onCopy(label));
          }}
        >
          {copied === label ? "Copied" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={8}
          className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono"
        />
      ) : (
        <div className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono break-words">
          {value}
        </div>
      )}
    </div>
  );
}

function RenderBar({ pct, stage }: { pct: number; stage: string }) {
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 transition-[width] duration-300"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <p className="text-xs text-zinc-400 text-center">
        {stage || "working"} · {Math.round(pct)}%
      </p>
    </div>
  );
}

function ThumbnailPicker({
  videoUrl,
  start,
  end,
  caption,
  isGif,
  visualStyle,
  pixelSize,
}: {
  videoUrl: string;
  start: number;
  end: number;
  caption: string;
  isGif?: boolean;
  visualStyle?: string;
  pixelSize?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [t, setT] = useState(start);
  const [preview, setPreview] = useState<string | null>(null);
  const [album, setAlbum] = useState<string | null>(null);

  const drawCover = useCallback((size: number, ratio: number) => {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let sourceEl: CanvasImageSource | null = null;

    if (isGif) {
      const img = imgRef.current;
      if (!img || !img.naturalWidth) return null;
      sourceWidth = img.naturalWidth;
      sourceHeight = img.naturalHeight;
      sourceEl = img;
    } else {
      const v = ref.current;
      if (!v || !v.videoWidth) return null;
      sourceWidth = v.videoWidth;
      sourceHeight = v.videoHeight;
      sourceEl = v;
    }

    const c = document.createElement("canvas");
    c.width = size;
    c.height = Math.round(size / ratio);
    const ctx = c.getContext("2d");
    if (!ctx || !sourceEl) return null;

    const vr = sourceWidth / sourceHeight;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (vr > ratio) {
      sw = sourceHeight * ratio;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / ratio;
      sy = (sourceHeight - sh) / 2;
    }

    if (visualStyle && visualStyle !== "clean") {
      ctx.filter = getVisualStyleCss(visualStyle);
    }
    ctx.drawImage(sourceEl, sx, sy, sw, sh, 0, 0, c.width, c.height);
    ctx.filter = "none";

    if (pixelSize && pixelSize > 1) {
      const block = pixelSize * 2;
      const smallW = Math.max(16, Math.round(c.width / block));
      const smallH = Math.max(16, Math.round(c.height / block));
      const off = document.createElement("canvas");
      off.width = smallW;
      off.height = smallH;
      const octx = off.getContext("2d");
      if (octx) {
        octx.imageSmoothingEnabled = false;
        octx.drawImage(c, 0, 0, smallW, smallH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, smallW, smallH, 0, 0, c.width, c.height);
      }
    }

    if (visualStyle && visualStyle !== "clean") {
      const grad = ctx.createRadialGradient(
        c.width / 2,
        c.height / 2,
        c.width * 0.35,
        c.width / 2,
        c.height / 2,
        c.width * 0.72
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);
    }

    return c;
  }, [isGif, visualStyle, pixelSize]);
  const grabThumb = useCallback(() => {
    const c = drawCover(1280, 16 / 9);
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx && caption) {
      const fade = ctx.createLinearGradient(0, 560, 0, 720);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 560, 1280, 160);
      ctx.font = "600 36px Montserrat, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(caption, 40, 680);
    }
    setPreview(c.toDataURL("image/jpeg", 0.92));
    c.toBlob((b) => {
      if (b) void saveExportImage(b, "thumbs");
    }, "image/jpeg", 0.92);
  }, [caption, drawCover]);

  const grabAlbum = useCallback(() => {
    const c = drawCover(3000, 1);
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 24;
      ctx.strokeRect(48, 48, 2904, 2904);
      if (caption) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 2760, 3000, 240);
        ctx.font = "600 72px Montserrat, system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(caption, 80, 2910);
      }
    }
    setAlbum(c.toDataURL("image/jpeg", 0.92));
    c.toBlob((b) => {
      if (b) void saveExportImage(b, "covers");
    }, "image/jpeg", 0.92);
  }, [caption, drawCover]);

  return (
    <div className="space-y-2 pt-2 border-t border-zinc-800">
      <div className="text-xs text-zinc-400">
        1280×720 thumbnail · 3000×3000 album (DistroKid / YouTube Music if the track is yours).
        The in-video Music card is Content ID — not something you attach by hand.
      </div>
      <div
        className="relative rounded-lg overflow-hidden border border-zinc-800 bg-black aspect-video flex items-center justify-center"
        style={{ imageRendering: pixelSize && pixelSize > 1 ? "pixelated" : "auto" }}
      >
        {isGif ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={videoUrl}
            alt="Thumbnail source preview"
            style={{
              filter: getVisualStyleCss(visualStyle || "clean"),
              imageRendering: pixelSize && pixelSize > 1 ? "pixelated" : "auto",
              transform: pixelSize && pixelSize > 1 ? `scale(${getPixelScale(pixelSize)})` : "none",
              width: pixelSize && pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
              height: pixelSize && pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
            }}
            className="object-contain transition-[filter,transform] duration-200"
          />
        ) : (
          <video
            ref={ref}
            src={videoUrl}
            muted
            playsInline
            style={{
              filter: getVisualStyleCss(visualStyle || "clean"),
              imageRendering: pixelSize && pixelSize > 1 ? "pixelated" : "auto",
              transform: pixelSize && pixelSize > 1 ? `scale(${getPixelScale(pixelSize)})` : "none",
              width: pixelSize && pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
              height: pixelSize && pixelSize > 1 ? `${100 / getPixelScale(pixelSize)}%` : "100%",
            }}
            className="object-cover transition-[filter,transform] duration-200"
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = start;
            }}
          />
        )}
      </div>
      {!isGif && (
        <label className="block text-xs text-zinc-400">
          Frame {t.toFixed(1)}s
          <input
            type="range"
            min={start}
            max={Math.max(start + 0.1, end)}
            step={0.05}
            value={t}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              setT(n);
              const v = ref.current;
              if (v) v.currentTime = n;
            }}
            className="w-full accent-cyan-500"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={grabThumb} className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 hover:border-zinc-500">
          Grab 1280×720
        </button>
        <button type="button" onClick={grabAlbum} className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 hover:border-zinc-500">
          Grab album 3000×3000
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = preview;
              a.download = "youtube-thumbnail-1280x720.jpg";
              a.click();
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-cyan-700 hover:bg-cyan-600"
          >
            Download thumbnail
          </button>
        )}
        {album && (
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = album;
              a.download = "album-cover-3000x3000.jpg";
              a.click();
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-cyan-700 hover:bg-cyan-600"
          >
            Download album cover
          </button>
        )}
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="YouTube thumbnail preview" className="w-full rounded-lg border border-zinc-800" />
      )}
      {album && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={album} alt="Album cover preview" className="w-48 rounded-lg border border-zinc-800" />
      )}
    </div>
  );
}
