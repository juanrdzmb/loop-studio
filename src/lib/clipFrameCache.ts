import { Input, BlobSource, ALL_FORMATS, VideoSampleSink } from "mediabunny";

export type ClipFrameCache = {
  duration: number;
  fps: number;
  frames: ImageBitmap[];
  width: number;
  height: number;
  /** Dimensiones reales del vídeo original (los frames van reescalados). */
  sourceWidth: number;
  sourceHeight: number;
};

export function clipFrameAt(cache: ClipFrameCache, sourceTime: number): ImageBitmap | null {
  if (!cache.frames.length || cache.duration <= 0) return null;
  const t = Math.max(0, Math.min(cache.duration - 1 / cache.fps, sourceTime));
  const idx = Math.min(cache.frames.length - 1, Math.max(0, Math.round(t * cache.fps)));
  return cache.frames[idx] ?? null;
}

export function disposeClipFrameCache(cache: ClipFrameCache | null | undefined) {
  if (!cache) return;
  for (const f of cache.frames) {
    try {
      f.close();
    } catch {
      /* ignore */
    }
  }
  cache.frames.length = 0;
}

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

/**
 * Decode the clip once, forward-only, into a compact bitmap strip.
 * Used for live boomerang (ida y vuelta real) and fast full-duration drafts.
 */
export async function buildClipFrameCache(
  file: File | Blob,
  opts?: { maxWidth?: number; fps?: number; maxMemoryMb?: number; onProgress?: (pct: number) => void }
): Promise<ClipFrameCache> {
  const maxWidth = opts?.maxWidth ?? 400;
  const fps = Math.max(8, Math.min(18, opts?.fps ?? 14));
  const maxMemoryBytes = Math.max(48, opts?.maxMemoryMb ?? 150) * 1024 * 1024;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("Sin pista de video");
    if (!(await track.canDecode())) throw new Error("No se puede decodificar el clip");
    const duration = await track.computeDuration();
    if (!(duration > 0.2)) throw new Error("Duración inválida");
    const srcW = track.displayWidth || 1080;
    const srcH = track.displayHeight || 1920;
    const count = Math.max(2, Math.round(duration * fps));
    // La caché es solo para el borrador. Acotarla evita que un clip largo reserve
    // cientos de MB o fuerce al navegador a paginar, lo que se percibe como tirones.
    const maxPixelsPerFrame = maxMemoryBytes / (count * 4);
    const memoryScale = Math.sqrt(maxPixelsPerFrame / Math.max(1, srcW * srcH));
    const scale = Math.min(1, maxWidth / Math.max(srcW, srcH), memoryScale);
    const width = even(srcW * scale);
    const height = even(srcH * scale);

    const timestamps: number[] = [];
    for (let i = 0; i < count; i++) {
      timestamps.push(Math.min(duration - 0.001, i / fps));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D no disponible");

    const sink = new VideoSampleSink(track);
    const frames: ImageBitmap[] = [];
    let i = 0;
    let lastBmp: ImageBitmap | null = null;
    let missingBeforeFirstFrame = 0;
    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      if (sample) {
        // draw/createImageBitmap también pueden fallar (por ejemplo, al cambiar de
        // archivo mientras se prepara el borrador). El sample pertenece a WebCodecs
        // y debe cerrarse incluso en esa salida excepcional.
        try {
          sample.draw(ctx, 0, 0, width, height);
        } finally {
          sample.close();
        }
        const bmp = await createImageBitmap(canvas);
        // Algunos MP4 empiezan con un PTS positivo (edit list). Mediabunny devuelve
        // null para los timestamps anteriores; omitirlos desplaza toda la caché y
        // deja el frame 0 sin una fuente fiable justo en la costura. En cuanto llega
        // el primer sample real, se usa también para esos huecos iniciales.
        while (missingBeforeFirstFrame > 0) {
          frames.push(await createImageBitmap(bmp));
          missingBeforeFirstFrame--;
        }
        frames.push(bmp);
        lastBmp = bmp;
      } else if (lastBmp) {
        frames.push(await createImageBitmap(lastBmp));
      } else {
        missingBeforeFirstFrame++;
      }
      i++;
      if (i % 8 === 0) opts?.onProgress?.(i / count);
      if (i % 12 === 0) await new Promise<void>((r) => setTimeout(r, 0));
    }
    if (!frames.length) throw new Error("No se pudo extraer el clip");
    // Si el iterador termina antes de responder a todos los timestamps, conservar el
    // último frame válido en vez de dejar índices inexistentes al final del ciclo.
    while (frames.length < count && lastBmp) {
      frames.push(await createImageBitmap(lastBmp));
    }
    opts?.onProgress?.(1);
    return { duration, fps, frames, width, height, sourceWidth: srcW, sourceHeight: srcH };
  } finally {
    input.dispose();
  }
}
