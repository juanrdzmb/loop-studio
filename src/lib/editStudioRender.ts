import {
  DEFAULT_MANGA_CONFIG,
  type CameraMovement,
  type MangaMotionConfig,
} from "./mangaMotionEngine";
import type {
  EditMotion,
  EditProject,
  EditTextCue,
  EditTimelineClip,
} from "./editStudio";

export function cameraForEditMotion(motion: EditMotion): CameraMovement {
  if (motion === "push") return "slow_push";
  if (motion === "drift") return "dutch_drift";
  if (motion === "impact") return "impact_shake";
  return "static";
}

export function buildEditFrameConfig(
  project: EditProject,
  clip: EditTimelineClip,
  fps: number,
  frameDuration: number
): MangaMotionConfig {
  return {
    ...DEFAULT_MANGA_CONFIG,
    aspectRatio: project.format,
    duration: Math.max(frameDuration, clip.duration),
    fps,
    seamMode: "cut",
    enableSeamlessLoop: false,
    cameraMove: cameraForEditMotion(clip.motion),
    cameraIntensity: clip.motion === "impact" ? 45 : clip.motion === "static" ? 0 : 28,
    aestheticStyle: clip.style === "inherit" ? project.style : clip.style,
    colorGrade: project.colorGrade,
    particles: "none",
    watermarkEnabled: false,
  };
}

export function drawEditTextCue(
  ctx: CanvasRenderingContext2D,
  cue: EditTextCue,
  width: number,
  height: number,
  time: number
) {
  const local = time - cue.start;
  if (local < 0 || local >= cue.duration) return;
  const edge = Math.min(0.12, cue.duration * 0.2);
  const alpha = Math.min(1, local / Math.max(0.001, edge), (cue.duration - local) / Math.max(0.001, edge));
  const size = Math.max(18, cue.size * Math.min(width / 1080, height / 1920));
  const x = cue.x * width;
  const y = cue.y * height;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.82)";
  ctx.lineWidth = Math.max(3, size * 0.13);
  ctx.shadowColor = cue.accent;
  ctx.shadowBlur = size * 0.22;
  ctx.strokeText(cue.text.toUpperCase(), x, y);
  ctx.fillStyle = cue.color;
  ctx.fillText(cue.text.toUpperCase(), x, y);
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
  const transitionDuration = Math.min(clip.duration * 0.5, Math.max(0, clip.transitionDuration));
  const progress = transitionDuration > 0 ? Math.max(0, Math.min(1, localTime / transitionDuration)) : 1;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  if (!previous || clip.transition === "cut" || progress >= 1) {
    ctx.drawImage(scene, 0, 0);
    return;
  }
  const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
  if (clip.transition === "whip") {
    ctx.drawImage(previous, -eased * width, 0, width, height);
    ctx.drawImage(scene, (1 - eased) * width, 0, width, height);
    return;
  }

  ctx.drawImage(scene, 0, 0);
  ctx.save();
  ctx.globalAlpha = 1 - eased;
  ctx.drawImage(previous, 0, 0, width, height);
  ctx.restore();
  if (clip.transition === "flash") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.78;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
