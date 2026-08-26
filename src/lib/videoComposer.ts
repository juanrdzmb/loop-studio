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
import type { RawFrame } from "./types";
import { toImageData } from "./toImageData";

export interface ComposeOptions {
  /** Frames únicos del loop (ya con estilo aplicado) */
  frames: RawFrame[];
  /** FPS del GIF/loop */
  fps: number;
  /** Audio final (ya renderizado slowed) */
  audio: AudioBuffer;
  /** Duración total deseada del video en segundos */
  durationSeconds: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Compone un MP4 (H.264 + AAC) repitiendo los frames del loop hasta cubrir
 * la duración del audio. Usa WebCodecs vía mediabunny (acelerado por HW).
 */
export async function composeLoopVideo(opts: ComposeOptions): Promise<Blob> {
  if (opts.frames.length === 0) throw new Error("Sin frames para componer");

  const first = opts.frames[0];
  const width = Math.max(2, Math.floor(first.width / 2) * 2);
  const height = Math.max(2, Math.floor(first.height / 2) * 2);

  // Códec de video: H.264 preferido (compatible con YouTube), fallbacks
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "hevc", "vp9"], {
    width,
    height,
  });
  if (!videoCodec) throw new Error("Este navegador no puede codificar video (WebCodecs)");

  // Códec de audio: AAC preferido
  const audioCodec = (await canEncodeAudio("aac")) ? "aac" : (await canEncodeAudio("opus")) ? "opus" : null;
  if (!audioCodec) throw new Error("Este navegador no puede codificar audio");

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D no disponible");

  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: opts.fps });

  const audioSource = new AudioBufferSource({
    codec: audioCodec,
    bitrate: 192000,
  });
  output.addAudioTrack(audioSource);

  await output.start();

  // Video: repetir el loop hasta cubrir la duración pedida
  const frameDur = 1 / opts.fps;
  const totalFrames = Math.max(1, Math.floor(opts.durationSeconds * opts.fps));
  for (let i = 0; i < totalFrames; i++) {
    drawFrame(ctx, opts.frames[i % opts.frames.length], width, height);
    await videoSource.add(i * frameDur, frameDur);
    opts.onProgress?.(((i + 1) / totalFrames) * 0.9);
  }

  // Audio completo (recortado si se pidió una duración menor)
  await audioSource.add(trimAudio(opts.audio, opts.durationSeconds));
  opts.onProgress?.(0.95);

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("No se generó el buffer del video");
  return new Blob([buffer], { type: "video/mp4" });
}

/** Recorta el audio a los segundos indicados si excede la duración pedida */
function trimAudio(buffer: AudioBuffer, maxSeconds: number): AudioBuffer {
  if (buffer.duration <= maxSeconds) return buffer;
  const sr = buffer.sampleRate;
  const len = Math.floor(maxSeconds * sr);
  // Contexto mínimo solo para fabricar el buffer
  const factory = new OfflineAudioContext(
    Math.min(2, buffer.numberOfChannels),
    len,
    sr
  );
  const out = factory.createBuffer(buffer.numberOfChannels, len, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(0, len), c);
  }
  return out;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: RawFrame,
  w: number,
  h: number
) {
  if (frame.width === w && frame.height === h) {
    ctx.putImageData(toImageData(frame), 0, 0);
  } else {
    // Escalar si las dimensiones no coinciden exactamente
    const tmp = document.createElement("canvas");
    tmp.width = frame.width;
    tmp.height = frame.height;
    tmp.getContext("2d")!.putImageData(toImageData(frame), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w, h);
  }
}
