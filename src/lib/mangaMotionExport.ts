import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  getFirstEncodableVideoCodec,
  canEncodeAudio,
  QUALITY_HIGH,
} from "mediabunny";
import {
  type MangaMotionConfig,
  renderMangaMotionFrame,
} from "./mangaMotionEngine";

export interface MangaExportOptions {
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  config: MangaMotionConfig;
  characterCutout?: HTMLImageElement | null;
  cleanBackground?: HTMLImageElement | null;
  audioBuffer?: AudioBuffer | null;
  width?: number;
  height?: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Render and encode Manga Motion 2.5D animation directly to MP4 via WebCodecs (mediabunny).
 * Supports synchronized video + audio track multiplexing.
 */
export async function exportMangaMotionVideo(
  opts: MangaExportOptions
): Promise<{ blob: Blob; width: number; height: number }> {
  const { image, config, characterCutout, cleanBackground, audioBuffer, onProgress } = opts;

  // Default export resolutions
  let targetW = opts.width;
  let targetH = opts.height;

  if (!targetW || !targetH) {
    if (config.aspectRatio === "9:16") {
      targetW = 720;
      targetH = 1280;
    } else if (config.aspectRatio === "16:9") {
      targetW = 1280;
      targetH = 720;
    } else {
      targetW = 1080;
      targetH = 1080;
    }
  }

  // Ensure even dimensions for H.264 encoder compatibility
  const width = Math.max(2, Math.floor(targetW / 2) * 2);
  const height = Math.max(2, Math.floor(targetH / 2) * 2);

  // Check WebCodecs video encoder support
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "hevc", "vp9"], {
    width,
    height,
  });
  if (!videoCodec) {
    throw new Error("El navegador no soporta codificación acelerada de video (WebCodecs)");
  }

  // Check audio encoder support if audio provided
  let audioCodec: "aac" | "opus" | null = null;
  if (audioBuffer) {
    audioCodec = (await canEncodeAudio("aac"))
      ? "aac"
      : (await canEncodeAudio("opus"))
      ? "opus"
      : null;
  }

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("No se pudo obtener el contexto 2D del Canvas");
  }

  const fps = config.fps || 60;
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: QUALITY_HIGH,
    keyFrameInterval: 2,
  });

  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (audioBuffer && audioCodec) {
    audioSource = new AudioBufferSource({
      codec: audioCodec,
      bitrate: 192000,
    });
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const duration = Math.max(3, Math.min(60, config.duration));
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const frameDur = 1 / fps;
  const crossfadeDur = config.enableSeamlessLoop ? Math.min(2.5, config.loopCrossfadeDuration || 1.8) : 0;
  const crossfadeStart = duration - crossfadeDur;

  let startCanvas: HTMLCanvasElement | null = null;
  let startCtx: CanvasRenderingContext2D | null = null;
  if (config.enableSeamlessLoop && crossfadeDur > 0) {
    startCanvas = document.createElement("canvas");
    startCanvas.width = width;
    startCanvas.height = height;
    startCtx = startCanvas.getContext("2d", { willReadFrequently: true });
  }

  for (let i = 0; i < totalFrames; i++) {
    const t = i * frameDur;
    renderMangaMotionFrame(
      ctx,
      image,
      config,
      width,
      height,
      t,
      null
    );

    if (config.enableSeamlessLoop && crossfadeDur > 0 && t >= crossfadeStart && startCanvas && startCtx) {
      const progressInFade = (t - crossfadeStart) / crossfadeDur;
      const alpha = 0.5 - 0.5 * Math.cos(progressInFade * Math.PI);
      const tStart = progressInFade * crossfadeDur;
      renderMangaMotionFrame(startCtx, image, config, width, height, tStart, null);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(startCanvas, 0, 0);
      ctx.restore();
    }

    await videoSource.add(i * frameDur, frameDur);

    if (onProgress && i % 4 === 0) {
      onProgress(((i + 1) / totalFrames) * (audioSource ? 0.9 : 1.0));
    }
  }

  if (audioSource && audioBuffer) {
    await audioSource.add(audioBuffer);
    if (onProgress) onProgress(0.96);
  }

  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("No se pudo generar el buffer del video MP4");
  }

  const blob = new Blob([buffer], { type: "video/mp4" });
  if (onProgress) onProgress(1.0);

  return { blob, width, height };
}
