import { Input, ALL_FORMATS, BlobSource, VideoSampleSink } from "mediabunny";
import type { ExtractOptions, RawFrame } from "./types";

/**
 * Extrae frames de un video en timestamps equiespaciados.
 *
 * Ruta rápida: mediabunny + WebCodecs (decodifica cada paquete una sola vez,
 * ~10× más rápido que hacer seek por frame). Fallback: elemento <video> con
 * seeks individuales y timeouts de respaldo (navegadores sin WebCodecs).
 */
export async function extractFrames(
  file: File,
  opts: ExtractOptions,
  onProgress?: (ratio: number) => void
): Promise<{ frames: RawFrame[]; width: number; height: number }> {
  try {
    return await extractWithMediabunny(file, opts, onProgress);
  } catch (e) {
    // Sin WebCodecs, códec no soportado o error de demux: método clásico
    if (process.env.NODE_ENV !== "production") {
      console.info("extractFrames: fallback a <video>:", e instanceof Error ? e.message : e);
    }
    return extractWithVideoElement(file, opts, onProgress);
  }
}

/** Dimensiones de salida: ancho deseado, alto proporcional, par para codecs */
function outputSize(aspect: number, width: number): { w: number; h: number } {
  const w = Math.max(2, Math.floor(width / 2) * 2);
  const h = Math.max(2, Math.floor((w * aspect) / 2) * 2);
  return { w, h };
}

function makeCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D no disponible");
  return { canvas, ctx };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function extractWithMediabunny(
  file: File,
  opts: ExtractOptions,
  onProgress?: (ratio: number) => void
): Promise<{ frames: RawFrame[]; width: number; height: number }> {
  if (typeof VideoDecoder === "undefined") throw new Error("WebCodecs no disponible");

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("El video no tiene pista de imagen");
  if (!(await track.canDecode())) throw new Error("Códec de video no decodificable");

  const duration = await track.computeDuration();
  if (!(duration > 0)) throw new Error("Duración del video inválida");

  const start = Math.max(0, Math.min(opts.start, duration));
  const end = Math.max(start + 0.04, Math.min(opts.end, duration));
  const count = Math.max(1, Math.round((end - start) * opts.fps));
  const { w, h } = outputSize(track.displayHeight / track.displayWidth, opts.width);

  const { ctx } = makeCanvas(w, h);
  const sink = new VideoSampleSink(track);
  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) timestamps.push(Math.min(start + i / opts.fps, duration - 0.001));

  const frames: RawFrame[] = [];
  let done = 0;
  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    if (sample) {
      sample.draw(ctx, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      frames.push({ data: img.data, width: w, height: h });
      sample.close();
    } else if (frames.length > 0) {
      // Sin frame en ese timestamp: repetir el último disponible
      frames.push(frames[frames.length - 1]);
    } else {
      // Primer timestamp sin frame aún: el siguiente llenará el hueco
      frames.push({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    }
    done++;
    onProgress?.(done / count);
    if (done % 30 === 0) await tick();
  }

  if (frames.length === 0) throw new Error("No se pudo extraer ningún frame");
  return { frames, width: w, height: h };
}

/** Método clásico: elemento <video> con seeks individuales */
async function extractWithVideoElement(
  file: File,
  opts: ExtractOptions,
  onProgress?: (ratio: number) => void
): Promise<{ frames: RawFrame[]; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const timer = setTimeout(
      () => reject(new Error("El vídeo tardó demasiado en cargar")),
      15000
    );
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error("No se pudo leer el vídeo (códec no soportado)"));
    };
    await promise;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Duración del vídeo inválida");
    }

    const start = Math.max(0, Math.min(opts.start, duration));
    const end = Math.max(start + 0.04, Math.min(opts.end, duration));
    const count = Math.max(1, Math.round((end - start) * opts.fps));
    const { w, h } = outputSize(video.videoHeight / video.videoWidth, opts.width);
    const { ctx } = makeCanvas(w, h);

    const frames: RawFrame[] = [];
    for (let i = 0; i < count; i++) {
      const t = start + i / opts.fps;
      await seekTo(video, Math.min(t, duration - 0.001));
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      frames.push({ data: img.data, width: w, height: h });
      onProgress?.((i + 1) / count);
    }

    return { frames, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Busca un tiempo exacto esperando el frame presentado.
 * Respaldo: si `seeked` no llega en 2 s, continúa con el frame disponible
 * (pequeña imprecisión preferible a una extracción eterna).
 */
function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 2000): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    video.removeEventListener("seeked", onSeeked);
    resolve();
  };
  const onSeeked = () => finish();
  const timer = setTimeout(() => {
    if (video.readyState >= 2) finish();
  }, timeoutMs);
  video.addEventListener("seeked", onSeeked, { once: true });
  try {
    video.currentTime = time;
  } catch {
    finish();
  }
  return promise;
}
