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
  const intensity = Math.max(0, Math.min(100, clip.motionIntensity ?? (clip.motion === "impact" ? 55 : clip.motion === "static" ? 0 : 32)));
  return {
    ...DEFAULT_MANGA_CONFIG,
    aspectRatio: project.format,
    duration: Math.max(frameDuration, clip.duration),
    fps,
    seamMode: "cut",
    enableSeamlessLoop: false,
    cameraMove: cameraForEditMotion(clip.motion),
    cameraIntensity: clip.motion === "static" ? 0 : intensity,
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
  const rawAlpha = Math.min(1, local / Math.max(0.001, edge), (cue.duration - local) / Math.max(0.001, edge));
  // punch en los primeros 0.14s: scale 0.82→1.06→1.0 con overshoot
  const punchWindow = Math.min(0.14, cue.duration * 0.28);
  let punchScale = 1;
  if (local < punchWindow) {
    const p = local / Math.max(0.001, punchWindow);
    const eased = 1 - Math.pow(1 - p, 3);
    const overshoot = Math.sin(p * Math.PI) * 0.06 * (1 - p);
    punchScale = 0.82 + eased * 0.18 + overshoot;
  } else if (cue.duration - local < punchWindow * 0.6) {
    const p = (cue.duration - local) / Math.max(0.001, punchWindow * 0.6);
    punchScale = 0.96 + p * 0.04;
  }
  const size = Math.max(18, cue.size * Math.min(width / 1080, height / 1920));
  const x = cue.x * width;
  const y = cue.y * height;

  ctx.save();
  ctx.globalAlpha = Math.max(0, rawAlpha);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size * punchScale}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.82)";
  ctx.lineWidth = Math.max(3, size * punchScale * 0.13);
  ctx.shadowColor = cue.accent;
  ctx.shadowBlur = size * punchScale * 0.22;
  // leve sacudida horizontal en el punch (2px)
  const shake = local < 0.08 ? Math.sin(local * 62) * 2 * (1 - local / 0.08) : 0;
  ctx.strokeText(cue.text.toUpperCase(), x + shake, y);
  ctx.fillStyle = cue.color;
  ctx.fillText(cue.text.toUpperCase(), x + shake, y);
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
    // slide + leve estirado horizontal (fake motion blur) + trail
    const blurAlpha = 0.22 * Math.sin(progress * Math.PI);
    ctx.save();
    ctx.globalAlpha = blurAlpha;
    ctx.drawImage(previous, -eased * width * 0.6, 0, width, height);
    ctx.restore();
    ctx.drawImage(previous, -eased * width, 0, width, height);
    ctx.drawImage(scene, (1 - eased) * width, 0, width, height);
    return;
  }
  if (clip.transition === "punch") {
    // zoom punch + hitstop simulation (2 frames congelados al inicio del corte se modelan vía timestamps)
    // visual: escala 0.94→1.08→1.0 con overshoot + leve skew
    const punchScale = progress < 0.55
      ? 0.94 + (progress / 0.55) * 0.14
      : 1.08 - ((progress - 0.55) / 0.45) * 0.08;
    const punchShake = Math.sin(progress * Math.PI * 6) * 3 * (1 - progress);
    ctx.save();
    ctx.translate(width / 2 + punchShake, height / 2);
    ctx.scale(punchScale, punchScale);
    ctx.translate(-width / 2, -height / 2);
    // escena entrante con crossfade suave
    ctx.globalAlpha = 0.35 + eased * 0.65;
    ctx.drawImage(scene, 0, 0);
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
    // capa previa desvanecida detrás (ghost)
    ctx.save();
    ctx.globalAlpha = (1 - eased) * 0.35;
    ctx.drawImage(previous, 0, 0, width, height);
    ctx.restore();
    return;
  }
  if (clip.transition === "zoom") {
    const zoomScale = 0.78 + eased * 0.22;
    const zoomAlpha = eased;
    // fondo previo ligeramente desenfocado (simulado por escala)
    ctx.save();
    ctx.globalAlpha = 1 - eased * 0.7;
    ctx.drawImage(previous, 0, 0, width, height);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = zoomAlpha;
    ctx.translate(width / 2, height / 2);
    ctx.scale(1 / zoomScale, 1 / zoomScale);
    // el truco inverso: la escena entrante hace zoom-in desde 0.78
    const invScale = 0.78 + eased * 0.22;
    ctx.scale(invScale, invScale);
    ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(scene, 0, 0);
    ctx.restore();
    return;
  }
  if (clip.transition === "shake") {
    const shakeX = Math.sin(progress * Math.PI * 8) * 9 * (1 - progress * 0.4);
    const shakeY = Math.cos(progress * Math.PI * 6.5) * 6 * (1 - progress * 0.5);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.globalAlpha = eased;
    ctx.drawImage(scene, 0, 0);
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
