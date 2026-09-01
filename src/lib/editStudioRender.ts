import {
  DEFAULT_MANGA_CONFIG,
  type CameraMovement,
  type MangaMotionConfig,
} from "./mangaMotionEngine";
import type {
  EditMotion,
  EditProject,
  EditTextCue,
  EditTextStyle,
  EditTimelineClip,
} from "./editStudio";
import { normalizeEditClip, normalizeEditTextCue } from "./editStudio";

export function cameraForEditMotion(motion: EditMotion): CameraMovement {
  if (motion === "push" || motion === "pull" || motion === "parallax") return "slow_push";
  if (motion === "drift" || motion === "parallaxDrift") return "dutch_drift";
  if (motion === "impact") return "impact_shake";
  if (motion === "whip") return "whip_pan";
  if (motion === "vertigo") return "vertigo_zoom";
  if (motion === "spiral") return "spiral_vortex";
  if (motion === "scan") return "cinematic_scan";
  return "static";
}

export function buildEditFrameConfig(
  project: EditProject,
  clip: EditTimelineClip,
  fps: number,
  frameDuration: number
): MangaMotionConfig {
  const normalized = normalizeEditClip(clip);
  const intensity = normalized.motionIntensity;
  return {
    ...DEFAULT_MANGA_CONFIG,
    aspectRatio: project.format,
    duration: Math.max(frameDuration, normalized.duration),
    fps,
    seamMode: "cut",
    enableSeamlessLoop: false,
    cameraMove: cameraForEditMotion(normalized.motion),
    cameraIntensity: normalized.motion === "static" ? 0 : intensity,
    cameraBaseZoom: normalized.framingScale,
    cameraOneWay: normalized.motion === "push" || normalized.motion === "pull" || normalized.motion === "parallax" || normalized.motion === "parallaxDrift",
    cameraDirection: normalized.motion === "pull" ? -1 : 1,
    sourceFocus: {
      x: 0.5 + normalized.framingX / 200,
      y: 0.5 + normalized.framingY / 200,
    },
    aestheticStyle: normalized.style === "inherit" ? project.style : normalized.style,
    colorGrade: project.colorGrade,
    particles: "none",
    watermarkEnabled: false,
  };
}

const TEXT_STYLES: Record<EditTextStyle, {
  family: string;
  weight: number;
  italic: boolean;
  uppercase: boolean;
  widthScale: number;
  tracking: number;
  stroke: number;
  angle: number;
}> = {
  impact: {
    family: '"SilentVigil", Montserrat, ui-sans-serif, system-ui, sans-serif',
    weight: 900,
    italic: false,
    uppercase: true,
    widthScale: 1,
    tracking: 0.018,
    stroke: 0.13,
    angle: 0,
  },
  condensed: {
    family: '"SilentVigil", Montserrat, ui-sans-serif, system-ui, sans-serif',
    weight: 900,
    italic: false,
    uppercase: true,
    widthScale: 0.76,
    tracking: 0.045,
    stroke: 0.11,
    angle: 0,
  },
  editorial: {
    family: '"SilentVigil", Montserrat, ui-sans-serif, system-ui, sans-serif',
    weight: 900,
    italic: true,
    uppercase: false,
    widthScale: 0.94,
    tracking: 0.012,
    stroke: 0.075,
    angle: -3.5,
  },
  minimal: {
    family: '"SilentVigil", Montserrat, ui-sans-serif, system-ui, sans-serif',
    weight: 500,
    italic: false,
    uppercase: true,
    widthScale: 1,
    tracking: 0.2,
    stroke: 0.055,
    angle: 0,
  },
};

function setTextFont(
  ctx: CanvasRenderingContext2D,
  style: (typeof TEXT_STYLES)[EditTextStyle],
  size: number
) {
  ctx.font = `${style.italic ? "italic " : ""}${style.weight} ${size}px ${style.family}`;
}

function trackedLineWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  const chars = Array.from(text);
  return chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0)
    + Math.max(0, chars.length - 1) * tracking;
}

function drawTrackedEditLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  tracking: number,
  color: string,
  accent: string,
  emphasis: string,
  stroke: boolean
) {
  const chars = Array.from(text);
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, value) => sum + value, 0)
    + Math.max(0, chars.length - 1) * tracking;
  const normalizedText = text.toLocaleLowerCase();
  const normalizedEmphasis = emphasis.trim().toLocaleLowerCase();
  const emphasisStart = normalizedEmphasis ? normalizedText.indexOf(normalizedEmphasis) : -1;
  const emphasisEnd = emphasisStart >= 0 ? emphasisStart + normalizedEmphasis.length : -1;
  let cursor = -total / 2;

  ctx.textAlign = "left";
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index]!;
    if (stroke) ctx.strokeText(char, cursor, y);
    ctx.fillStyle = emphasisStart >= 0 && index >= emphasisStart && index < emphasisEnd
      ? accent
      : color;
    ctx.fillText(char, cursor, y);
    cursor += widths[index]! + tracking;
  }
}

export function drawEditTextCue(
  ctx: CanvasRenderingContext2D,
  cue: EditTextCue,
  width: number,
  height: number,
  time: number
) {
  const normalized = normalizeEditTextCue(cue);
  const local = time - normalized.start;
  if (local < 0 || local >= normalized.duration) return;
  const style = TEXT_STYLES[normalized.style];
  const edge = Math.min(0.14, normalized.duration * 0.22);
  const rawAlpha = Math.min(1, local / Math.max(0.001, edge), (normalized.duration - local) / Math.max(0.001, edge));
  const entranceWindow = Math.min(0.18, normalized.duration * 0.3);
  const entrance = Math.max(0, Math.min(1, local / Math.max(0.001, entranceWindow)));
  const entranceEase = 1 - Math.pow(1 - entrance, 3);
  let entranceScale = 1;
  let offsetY = 0;
  let trackingFactor = 1;
  if (normalized.style === "impact") {
    const overshoot = Math.sin(entrance * Math.PI) * 0.065 * (1 - entrance);
    entranceScale = 0.82 + entranceEase * 0.18 + overshoot;
  } else if (normalized.style === "condensed") {
    entranceScale = 0.9 + entranceEase * 0.1;
    offsetY = (1 - entranceEase) * 14 * Math.min(width / 1080, height / 1920);
  } else if (normalized.style === "editorial") {
    entranceScale = 0.94 + entranceEase * 0.06;
  } else {
    trackingFactor = 1 + (1 - entranceEase) * 1.8;
  }

  const outputScale = Math.min(width / 1080, height / 1920);
  let size = Math.max(10, normalized.size * outputScale);
  const rawLines = normalized.text.split("|").map((line) => line.trim()).filter(Boolean);
  const lines = (rawLines.length ? rawLines : [normalized.text]).map((line) => style.uppercase ? line.toLocaleUpperCase() : line);
  setTextFont(ctx, style, size);
  const baseTracking = size * style.tracking * trackingFactor;
  const widest = Math.max(...lines.map((line) => trackedLineWidth(ctx, line, baseTracking) * style.widthScale), 1);
  const maxWidth = width * 0.84;
  if (widest > maxWidth) {
    size = Math.max(10, size * maxWidth / widest);
    setTextFont(ctx, style, size);
  }
  const tracking = size * style.tracking * trackingFactor;
  const x = normalized.x * width;
  const y = normalized.y * height + offsetY;
  const lineHeight = size * 1.08;

  ctx.save();
  ctx.globalAlpha = Math.max(0, rawAlpha);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.82)";
  ctx.lineWidth = Math.max(1.5, size * style.stroke);
  ctx.shadowColor = normalized.accent;
  ctx.shadowBlur = size * (normalized.style === "minimal" ? 0.08 : 0.18);
  if (normalized.style === "editorial" && entrance < 1) {
    ctx.filter = `blur(${((1 - entranceEase) * size * 0.055).toFixed(2)}px)`;
  }
  const shake = normalized.style === "impact" && local < 0.08
    ? Math.sin(local * 62) * 2 * outputScale * (1 - local / 0.08)
    : 0;
  ctx.translate(x + shake, y);
  ctx.rotate(style.angle * Math.PI / 180);
  ctx.scale(style.widthScale * entranceScale, entranceScale);
  lines.forEach((line, index) => {
    const lineY = (index - (lines.length - 1) / 2) * lineHeight;
    drawTrackedEditLine(
      ctx,
      line,
      lineY,
      tracking,
      normalized.color,
      normalized.accent,
      style.uppercase ? normalized.emphasis.toLocaleUpperCase() : normalized.emphasis,
      normalized.style !== "minimal" || normalized.emphasis.length > 0
    );
  });
  ctx.restore();
}

function drawCenteredScale(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number,
  offsetX = 0,
  offsetY = 0
) {
  ctx.save();
  ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
  ctx.scale(scale, scale);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  ctx.restore();
}

interface EditDepthScratch {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const depthScratchByScene = new WeakMap<HTMLCanvasElement, EditDepthScratch>();

function depthScratchFor(scene: HTMLCanvasElement, width: number, height: number): EditDepthScratch | null {
  let scratch = depthScratchByScene.get(scene);
  if (!scratch) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    scratch = { canvas, ctx };
    depthScratchByScene.set(scene, scratch);
  }
  if (scratch.canvas.width !== width || scratch.canvas.height !== height) {
    scratch.canvas.width = width;
    scratch.canvas.height = height;
  }
  return scratch;
}

function drawParallaxScene(
  scene: HTMLCanvasElement,
  clip: EditTimelineClip,
  localTime: number,
  width: number,
  height: number
): CanvasImageSource {
  if (clip.motion !== "parallax" && clip.motion !== "parallaxDrift") return scene;
  const scratch = depthScratchFor(scene, width, height);
  if (!scratch) return scene;
  const normalized = normalizeEditClip(clip);
  const progress = Math.max(0, Math.min(1, localTime / Math.max(0.05, normalized.duration)));
  const travel = Math.sin((progress - 0.5) * Math.PI);
  const strength = (0.35 + normalized.motionIntensity / 100 * 0.65) * Math.min(width, height) * 0.018;
  const driftX = normalized.motion === "parallaxDrift" ? travel * strength : travel * strength * 0.35;
  const driftY = normalized.motion === "parallaxDrift" ? -travel * strength * 0.42 : 0;
  const focusX = width * (0.5 + normalized.framingX / 200);
  const focusY = height * (0.5 + normalized.framingY / 200);
  const { ctx } = scratch;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.94;
  ctx.filter = `blur(${Math.max(0.4, Math.min(width, height) * 0.0014).toFixed(2)}px)`;
  drawCenteredScale(ctx, scene, width, height, 1.035, -driftX * 0.42, -driftY * 0.42);
  ctx.filter = "none";

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(focusX, focusY, width * 0.35, height * 0.31, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 1;
  drawCenteredScale(ctx, scene, width, height, 1.018, driftX * 0.68, driftY * 0.68);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, height * 0.69);
  ctx.lineTo(width, height * 0.61);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.clip();
  drawCenteredScale(ctx, scene, width, height, 1.008, driftX, driftY);
  ctx.restore();

  const vignette = ctx.createRadialGradient(focusX, focusY, Math.min(width, height) * 0.12, focusX, focusY, Math.max(width, height) * 0.68);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  return scratch.canvas;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function transitionVector(clip: EditTimelineClip): { x: number; y: number } {
  const normalized = normalizeEditClip(clip);
  let direction = normalized.transitionDirection;
  if (direction === "auto") {
    if (Math.abs(normalized.framingX) >= 24) direction = normalized.framingX > 0 ? "right" : "left";
    else direction = hashString(normalized.id) % 2 === 0 ? "left" : "right";
  }
  if (direction === "left") return { x: -1, y: 0 };
  if (direction === "right") return { x: 1, y: 0 };
  if (direction === "up") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function drawInkReveal(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  clip: EditTimelineClip,
  progress: number,
  width: number,
  height: number
) {
  const seed = hashString(clip.id);
  ctx.save();
  ctx.beginPath();
  for (let index = 0; index < 38; index++) {
    const randomX = ((Math.imul(seed ^ (index * 7919), 1103515245) >>> 8) % 10000) / 10000;
    const randomY = ((Math.imul(seed ^ (index * 104729), 1664525) >>> 8) % 10000) / 10000;
    const threshold = index / 46 + randomX * 0.16;
    if (progress <= threshold) continue;
    const growth = Math.min(1, (progress - threshold) * 7.5);
    const radius = (0.035 + randomY * 0.09) * Math.max(width, height) * growth;
    ctx.moveTo(randomX * width + radius, randomY * height);
    ctx.arc(randomX * width, randomY * height, radius, 0, Math.PI * 2);
  }
  ctx.clip();
  ctx.drawImage(source, 0, 0, width, height);
  ctx.restore();
}

export function composeEditTransition(
  ctx: CanvasRenderingContext2D,
  scene: HTMLCanvasElement,
  previous: CanvasImageSource | null,
  clip: EditTimelineClip,
  localTime: number,
  width: number,
  height: number
) {
  const normalized = normalizeEditClip(clip);
  const transitionDuration = Math.min(normalized.duration * 0.5, Math.max(0, normalized.transitionDuration));
  const progress = transitionDuration > 0 ? Math.max(0, Math.min(1, localTime / transitionDuration)) : 1;
  const intensity = 0.35 + normalized.transitionIntensity / 100 * 0.85;
  const currentScene = drawParallaxScene(scene, normalized, localTime, width, height);
  const vector = transitionVector(normalized);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  if (!previous || normalized.transition === "cut" || progress >= 1) {
    ctx.drawImage(currentScene, 0, 0, width, height);
    return;
  }
  const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
  if (normalized.transition === "whip") {
    const spanX = vector.x * width * intensity;
    const spanY = vector.y * height * intensity;
    for (let trail = 3; trail >= 1; trail--) {
      const offset = trail / 5;
      ctx.save();
      ctx.globalAlpha = 0.055 * trail * Math.sin(progress * Math.PI);
      ctx.drawImage(previous, -spanX * Math.max(0, eased - offset * 0.12), -spanY * Math.max(0, eased - offset * 0.12), width, height);
      ctx.drawImage(currentScene, spanX * Math.max(0, 1 - eased + offset * 0.1), spanY * Math.max(0, 1 - eased + offset * 0.1), width, height);
      ctx.restore();
    }
    ctx.drawImage(previous, -spanX * eased, -spanY * eased, width, height);
    ctx.drawImage(currentScene, spanX * (1 - eased), spanY * (1 - eased), width, height);
    return;
  }
  if (normalized.transition === "panel") {
    ctx.drawImage(previous, 0, 0, width, height);
    const vertical = vector.x !== 0;
    const panels = 4;
    for (let panel = 0; panel < panels; panel++) {
      const panelProgress = Math.max(0, Math.min(1, (eased - panel * 0.055) / (1 - (panels - 1) * 0.055)));
      if (vertical) {
        const sourceX = panel * width / panels;
        const panelWidth = Math.ceil(width / panels) + 1;
        const offsetY = vector.x * (panel % 2 === 0 ? -1 : 1) * (1 - panelProgress) * height * intensity;
        ctx.drawImage(currentScene, sourceX, 0, panelWidth, height, sourceX, offsetY, panelWidth, height);
      } else {
        const sourceY = panel * height / panels;
        const panelHeight = Math.ceil(height / panels) + 1;
        const offsetX = vector.y * (panel % 2 === 0 ? -1 : 1) * (1 - panelProgress) * width * intensity;
        ctx.drawImage(currentScene, 0, sourceY, width, panelHeight, offsetX, sourceY, width, panelHeight);
      }
    }
    return;
  }
  if (normalized.transition === "ink") {
    ctx.drawImage(previous, 0, 0, width, height);
    drawInkReveal(ctx, currentScene, normalized, Math.min(1, eased * 1.08), width, height);
    if (progress > 0.1 && progress < 0.9) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.12 * intensity;
      ctx.fillStyle = "#140b18";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    return;
  }
  if (normalized.transition === "depth") {
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    drawCenteredScale(ctx, previous, width, height, 1 - eased * 0.035 * intensity, -vector.x * eased * width * 0.015, -vector.y * eased * height * 0.015);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = eased;
    drawCenteredScale(ctx, currentScene, width, height, 1.09 - eased * 0.09, vector.x * (1 - eased) * width * 0.025, vector.y * (1 - eased) * height * 0.025);
    ctx.restore();
    return;
  }
  if (normalized.transition === "punch") {
    // zoom punch + hitstop simulation (2 frames congelados al inicio del corte se modelan vía timestamps)
    // visual: escala 0.94→1.08→1.0 con overshoot + leve skew
    const punchScale = progress < 0.55
      ? 0.94 + (progress / 0.55) * 0.14
      : 1.08 - ((progress - 0.55) / 0.45) * 0.08;
    const punchShake = Math.sin(progress * Math.PI * 6) * 3 * intensity * (1 - progress);
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    drawCenteredScale(ctx, previous, width, height, 1 + eased * 0.035);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = eased;
    drawCenteredScale(ctx, currentScene, width, height, punchScale, punchShake);
    ctx.restore();
    // flash sutil en el impacto
    if (progress < 0.22) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = (1 - progress / 0.22) * 0.18;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    return;
  }
  if (normalized.transition === "zoom") {
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    drawCenteredScale(ctx, previous, width, height, 1 + eased * 0.09);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = eased;
    for (let trail = 3; trail >= 1; trail--) {
      ctx.globalAlpha = eased * 0.05 * trail * Math.sin(progress * Math.PI);
      drawCenteredScale(ctx, currentScene, width, height, 1.16 - eased * 0.16 + trail * 0.012 * intensity);
    }
    ctx.globalAlpha = eased;
    drawCenteredScale(ctx, currentScene, width, height, 1.16 - eased * 0.16);
    ctx.restore();
    return;
  }
  if (normalized.transition === "blur") {
    const blurPx = Math.max(2, Math.min(width, height) * 0.012);
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    ctx.filter = `blur(${(blurPx * eased).toFixed(2)}px)`;
    drawCenteredScale(ctx, previous, width, height, 1 + eased * 0.035);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = eased;
    ctx.filter = `blur(${(blurPx * (1 - eased)).toFixed(2)}px)`;
    drawCenteredScale(ctx, currentScene, width, height, 1.045 - eased * 0.045);
    ctx.restore();
    return;
  }
  if (normalized.transition === "shake") {
    const shakeX = Math.sin(progress * Math.PI * 8) * 9 * (1 - progress * 0.4);
    const shakeY = Math.cos(progress * Math.PI * 6.5) * 6 * (1 - progress * 0.5);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.globalAlpha = eased;
    ctx.drawImage(currentScene, 0, 0, width, height);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    ctx.translate(-shakeX * 0.6, -shakeY * 0.6);
    ctx.drawImage(previous, 0, 0, width, height);
    ctx.restore();
    // cromatic aberration fake muy sutil
    if (progress > 0.15 && progress < 0.55) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.07 * Math.sin((progress - 0.15) / 0.4 * Math.PI);
      ctx.fillStyle = "#ff2a6d";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    return;
  }

  ctx.drawImage(currentScene, 0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 1 - eased;
  ctx.drawImage(previous, 0, 0, width, height);
  ctx.restore();
  if (normalized.transition === "flash") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.58;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
