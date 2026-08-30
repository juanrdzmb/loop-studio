import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  EncodedVideoPacketSource,
  EncodedPacketSink,
  EncodedPacket,
  Input,
  BlobSource,
  ALL_FORMATS,
  VideoSampleSink,
  VideoSample,
  getFirstEncodableVideoCodec,
  canEncodeAudio,
  Quality,
  type VideoCodec,
} from "mediabunny";
import {
  type MangaMotionConfig,
  renderMangaMotionFrame,
  globalParticles,
  PhysicsParticleSystem,
} from "./mangaMotionEngine";
import {
  type LoopSfxCue,
  renderSfxCuesToOffline,
} from "./seinenSfxLibrary";
import { SAFE_MASTER_PEAK } from "./audioRepeat";
import { ensureWatermarkFont } from "./watermark";
import {
  getForwardLoopFrameState,
  type VisualAlignment,
} from "./forwardLoop";
import { getSmoothPingPongFrameState } from "./pingPongLoop";
import {
  sourceTransformAt,
  type ClipStabilization,
} from "./videoStabilization";

export interface MangaExportOptions {
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  /** Original media file. Enables WebCodecs decode (no HTMLVideo seek freeze). */
  sourceFile?: File | Blob | null;
  /** Inicio y final absolutos del tramo visual elegido dentro del archivo original. */
  sourceStart?: number;
  sourceEnd?: number;
  config: MangaMotionConfig;
  characterCutout?: HTMLImageElement | null;
  cleanBackground?: HTMLImageElement | null;
  audioBuffer?: AudioBuffer | null;
  sfxCues?: LoopSfxCue[];
  width?: number;
  height?: number;
  onProgress?: (ratio: number, stage?: string) => void;
  /** Cancelación cooperativa: al abortar, el export lanza ExportCancelledError. */
  signal?: AbortSignal;
  /** Sistema de partículas propio del slot (evita compartir estado entre 16:9 y 9:16). */
  particleSystem?: PhysicsParticleSystem;
  /** Alineación global opcional IN->OUT para crossfade motion-compensated. */
  sourceAlignment?: VisualAlignment | null;
  /** Trayectoria local de microestabilización compartida con el preview. */
  sourceStabilization?: ClipStabilization | null;
  stabilizationEnabled?: boolean;
}

export class ExportCancelledError extends Error {
  constructor() {
    super("Exportación cancelada");
    this.name = "ExportCancelledError";
  }
}

/** Error de atasco del encoder/decoder (watchdog). Permite reintentar con estrategia alternativa. */
export class ExportStallError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ExportStallError";
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Segundos sin avance antes de dar el export por atascado (encoder/decoder colgado). */
const WATCHDOG_TIMEOUT_MS = 45_000;
/** Atasco en el bucle de pintado (decode/encode por frame): mucho más ágil. */
const PAINT_WATCHDOG_TIMEOUT_MS = 15_000;
/** Límite para los cancel() de limpieza: la mutex del Output puede estar retenida por el
 * mismo atasco, y esperarla colgaría el catch tragándose el error real. */
const CANCEL_TIMEOUT_MS = 3000;

/**
 * Watchdog anti-cuelgue: mediabunny espera el evento `dequeue` del encoder cuando la cola
 * está llena; si el encoder hardware muere sin emitirlo, ese await nunca resuelve y el
 * export se queda congelado para siempre (sin error). Cada `await` crítico pasa por
 * `gate(promise)`: si no hay latido en el plazo, la promesa se rechaza con ExportStallError
 * y el export aborta (o reintenta) en vez de dejar la herramienta bloqueada.
 */
function createExportWatchdog(defaultTimeoutMs: number = WATCHDOG_TIMEOUT_MS) {
  let lastBeat = Date.now();
  // Un registro POR promesa gated (no un slot único): si dos gate() se solapan, el
  // antiguo reject() sobrescribía al nuevo y la primera promesa quedaba huérfana
  // (await colgado para siempre, sin watchdog que la salve).
  const pending = new Set<{ deadlineAt: number; reject: (err: Error) => void }>();
  const timer = setInterval(() => {
    if (pending.size === 0) return;
    const now = Date.now();
    if (now - lastBeat <= 0) return;
    for (const entry of pending) {
      if (now > entry.deadlineAt) {
        pending.delete(entry);
        lastBeat = now;
        entry.reject(
          new ExportStallError(
            `El export se detuvo sin progreso (bloqueo del decodificador/codificador). Se abortó para no congelar la herramienta.`
          )
        );
      }
    }
  }, 1000);
  return {
    touch: () => {
      lastBeat = Date.now();
    },
    gate: <T>(promise: Promise<T>, timeoutMs: number = defaultTimeoutMs): Promise<T> => {
      const { promise: gated, resolve, reject } = Promise.withResolvers<T>();
      const entry = { deadlineAt: Date.now() + timeoutMs, reject };
      pending.add(entry);
      void promise.then(
        (value) => {
          pending.delete(entry);
          lastBeat = Date.now();
          resolve(value);
        },
        (error) => {
          pending.delete(entry);
          lastBeat = Date.now();
          reject(error);
        }
      );
      return gated;
    },
    stop: () => {
      clearInterval(timer);
      pending.clear();
    },
  };
}

/** cancel() con techo de tiempo: nunca debe colgar el camino de error. */
function cancelOutputBounded(cancelPromise: Promise<void>): Promise<void> {
  return Promise.race([
    cancelPromise.catch(() => {}),
    new Promise<void>((r) => setTimeout(r, CANCEL_TIMEOUT_MS)),
  ]);
}

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

export const DEFAULT_CALM_PLAYBACK_RATE = 0.4;

export function clampCalmPlaybackRate(rate?: number): number {
  const value = Number.isFinite(rate) ? Number(rate) : DEFAULT_CALM_PLAYBACK_RATE;
  return Math.min(0.75, Math.max(0.25, value));
}

/** Piso del modo Extender: cámara lenta profunda sin congelar el movimiento. */
export const MIN_EXTEND_PLAYBACK_RATE = 0.15;

export function clampExtendPlaybackRate(rate: number): number {
  const value = Number.isFinite(rate) ? Number(rate) : 1;
  return Math.min(1, Math.max(MIN_EXTEND_PLAYBACK_RATE, value));
}

/**
 * Velocidad del modo Extender: el ciclo cubre la duración objetivo (canción
 * completa o N vueltas) reproduciendo el clip SIEMPRE hacia delante, como una
 * toma continua ralentizada. Si el clip ya cubre el target, queda a 1× y el
 * comportamiento es idéntico al fundido smooth.
 */
export function resolveExtendPlaybackRate(sourceDuration: number, targetDuration: number): number {
  const clip = Math.max(0.25, sourceDuration);
  const target = Math.max(
    clip,
    Number.isFinite(targetDuration) && targetDuration > 0 ? targetDuration : clip
  );
  return clampExtendPlaybackRate(clip / target);
}

export function computeVisualCycleDuration(
  config: Pick<MangaMotionConfig, "seamMode" | "enableSeamlessLoop" | "duration" | "calmPlaybackRate">,
  sourceDuration: number,
  isVideo: boolean
): number {
  if (!isVideo) {
    const d = Math.max(3, config.duration || 8);
    return Math.min(8, d);
  }
  const clip = Math.max(0.25, sourceDuration);
  const seam = config.seamMode || (config.enableSeamlessLoop ? "smooth" : "cut");
  if (seam === "pingpong") return clip * 2;
  if (seam === "extend") {
    // config.duration es la duración objetivo del video final (en preview RAF y
    // export llega igual): el ciclo se estira para cubrirla a cámara lenta.
    return clip / resolveExtendPlaybackRate(clip, config.duration);
  }
  if (seam === "calm") return clip / clampCalmPlaybackRate(config.calmPlaybackRate);
  return clip;
}

export function sourceTimeForExport(
  t: number,
  sourceDuration: number,
  seamMode: MangaMotionConfig["seamMode"],
  sourceStart: number = 0,
  calmPlaybackRate: number = DEFAULT_CALM_PLAYBACK_RATE,
  targetDuration?: number
): number {
  if (sourceDuration <= 0.05) return sourceStart;
  if (seamMode === "pingpong") {
    return getSmoothPingPongFrameState(t, sourceDuration, sourceStart).primaryTime;
  }
  let sourceClock: number;
  if (seamMode === "calm") {
    sourceClock = t * clampCalmPlaybackRate(calmPlaybackRate);
  } else if (seamMode === "extend") {
    // Sin target conocido, rate 1× (equivale a smooth). Preview/export siempre
    // pasan la duración objetivo para compartir la misma rate derivada.
    sourceClock = t * resolveExtendPlaybackRate(sourceDuration, targetDuration ?? sourceDuration);
  } else {
    sourceClock = t;
  }
  const m = sourceClock % sourceDuration;
  return sourceStart + (m < 0 ? m + sourceDuration : m);
}

export function computeVisualCrossfadeDuration(
  config: Pick<
    MangaMotionConfig,
    "enableSeamlessLoop" | "seamMode" | "loopCrossfadeDuration" | "calmPlaybackRate"
  >,
  cycleDuration: number
): number {
  // El boomerang suaviza AMBOS giros con el frame extremo en el compositor. No
  // debe añadir además un fundido final→inicio: sería una segunda transición.
  if (config.seamMode === "pingpong") {
    return 0;
  }
  if (
    !config.enableSeamlessLoop ||
    (config.seamMode !== "smooth" && config.seamMode !== "calm" && config.seamMode !== "extend")
  ) {
    return 0;
  }
  const base = config.loopCrossfadeDuration || 0.4;
  if (config.seamMode === "calm") {
    const slowedFade = Math.max(0.8, base / clampCalmPlaybackRate(config.calmPlaybackRate));
    // Calm escala pero dentro de 0.25-1.0 para smart forward
    return Math.max(0.25, Math.min(1.0, cycleDuration * 0.15, slowedFade));
  }
  // Smart Forward y Extender: crossfade cinemático 0.25-1.0 (recomendado 0.45-0.70),
  // curva cosine que evita ghosting largo.
  return Math.min(1.0, Math.max(0.25, Math.min(base, cycleDuration * 0.15)));
}

async function resolveSourceBlob(
  sourceFile: File | Blob | null | undefined,
  image: MangaExportOptions["image"]
): Promise<Blob | null> {
  if (sourceFile) return sourceFile;
  if (typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement && image.src) {
    try {
      const res = await fetch(image.src);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }
  return null;
}

function resolveOutputSize(
  config: MangaMotionConfig,
  rawW: number,
  rawH: number,
  opts: { width?: number; height?: number }
): { width: number; height: number } {
  let width = opts.width;
  let height = opts.height;
  if (!width || !height) {
    if (config.aspectRatio === "16:9") {
      width = rawW >= 3840 ? 3840 : 1920;
      height = rawW >= 3840 ? 2160 : 1080;
    } else if (config.aspectRatio === "9:16") {
      width = 1080;
      height = 1920;
    } else if (config.aspectRatio === "1:1") {
      width = 1080;
      height = 1080;
    } else {
      width = Math.min(1920, Math.max(720, rawW));
      height = Math.min(1080, Math.max(720, rawH));
    }
  }
  return { width: even(width), height: even(height) };
}

/** Detect the real frame rate of a video file (demux-only, no decoding). */
async function detectSourceFps(blob: Blob): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return 0;
    const stats = await track.computePacketStats(80);
    const rate = stats.averagePacketRate;
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
    let best = rate;
    let bestDiff = Infinity;
    for (const c of common) {
      const d = Math.abs(c - rate);
      if (d < bestDiff) {
        bestDiff = d;
        best = c;
      }
    }
    return bestDiff <= 1.5 ? best : Math.round(rate);
  } catch {
    return 0;
  } finally {
    input.dispose();
  }
}

type PingPongEndpointFrames = { start: ImageBitmap | null; end: ImageBitmap | null };

/** Decodifica únicamente los dos extremos necesarios para amortiguar los giros. */
async function decodePingPongEndpointFrames(
  blob: Blob,
  startTime: number,
  endTime: number,
  gate?: <T>(promise: Promise<T>, timeoutMs?: number) => Promise<T>
): Promise<PingPongEndpointFrames> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const result: PingPongEndpointFrames = { start: null, end: null };
  const toBitmap = async (sample: VideoSample | null): Promise<ImageBitmap | null> => {
    if (!sample) return null;
    let frame: VideoFrame | null = null;
    try {
      frame = sample.toVideoFrame();
      return await createImageBitmap(frame);
    } finally {
      try { frame?.close(); } catch {}
      sample.close();
    }
  };
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return result;
    const sink = new VideoSampleSink(track);
    const get = (time: number) => {
      const promise = sink.getSample(Math.max(0, time));
      return gate ? gate(promise, PAINT_WATCHDOG_TIMEOUT_MS) : promise;
    };
    result.start = await toBitmap(await get(startTime));
    result.end = await toBitmap(await get(Math.max(startTime, endTime)));
    return result;
  } catch (err) {
    try { result.start?.close(); } catch {}
    try { result.end?.close(); } catch {}
    console.warn("No se pudieron preparar los frames de giro del boomerang:", err);
    return { start: null, end: null };
  } finally {
    input.dispose();
  }
}

/** Split cycle frames into maximal monotonic runs of source times (forward = stream, backward = segments). */
function monotonicRuns(
  srcTimes: number[]
): Array<{ start: number; end: number; descending: boolean }> {
  const runs: Array<{ start: number; end: number; descending: boolean }> = [];
  let start = 0;
  while (start < srcTimes.length - 1) {
    let end = start + 1;
    const descending = srcTimes[end]! < srcTimes[start]!;
    while (end < srcTimes.length) {
      const prev = srcTimes[end - 1]!;
      const cur = srcTimes[end]!;
      if (descending ? cur <= prev : cur >= prev) {
        end++;
      } else {
        break;
      }
    }
    runs.push({ start, end, descending });
    start = end;
  }
  if (start < srcTimes.length) {
    runs.push({ start, end: start + 1, descending: false });
  }
  return runs;
}

/**
 * Streams the source clip through the compositor at FULL resolution — frames are painted
 * the moment they are decoded, so a 1080p source stays 1080p sharp end to end.
 * Forward runs decode straight through; backward (pingpong) runs decode in bounded
 * chunks that are painted in reverse, keeping memory flat (~150 MB) for any clip length.
 */
async function renderCycleStreaming(
  blob: Blob,
  srcTimes: number[],
  cycleTimes: number[],
  width: number,
  height: number,
  paintFrame: (source: CanvasImageSource, t: number, sourceTime: number) => void,
  onFrame: (cycleIndex: number) => Promise<void>,
  onProgress?: (painted: number, total: number, phase?: "paint" | "decode") => void,
  gate?: <T>(promise: Promise<T>, timeoutMs?: number) => Promise<T>,
  shouldCancel?: () => void
): Promise<void> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const total = srcTimes.length;
  const runs = monotonicRuns(srcTimes);
  const decodeGate = <T>(p: Promise<T>) => (gate ? gate(p, PAINT_WATCHDOG_TIMEOUT_MS) : p);

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("El video no tiene pista de imagen");
    if (!(await track.canDecode())) {
      const name = (blob as File)?.name || "";
      const hint = /\.(mkv|mov|avi)$/i.test(name) ? " Prueba exportar el clip a MP4 (H.264/AAC) antes de subirlo." : "";
      throw new Error(`Códec de video no decodificable (WebCodecs).${hint}`);
    }
    const sink = new VideoSampleSink(track);
    // El staging conserva la geometría nativa. Antes adoptaba directamente el
    // tamaño 9:16 y estiraba una fuente horizontal antes del recorte `cover`.
    const sourceWidth = Math.max(2, track.displayWidth || width);
    const sourceHeight = Math.max(2, track.displayHeight || height);
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = sourceWidth;
    srcCanvas.height = sourceHeight;
    const srcCtx = srcCanvas.getContext("2d");
    if (!srcCtx) throw new Error("No se pudo obtener el canvas de fuente");
    srcCtx.imageSmoothingEnabled = true;
    srcCtx.imageSmoothingQuality = "high";
    const bytesPerFrame = sourceWidth * sourceHeight * 4;
    // ~256 MB por segmento: acota el buffer de samples del pingpong y reduce los saltos.
    const maxSegment = Math.max(4, Math.min(90, Math.floor((256 * 1024 * 1024) / bytesPerFrame)));

    let painted = 0;

    // Gate con limpieza de sample tardío: si el watchdog rechaza, el `iterator.next()`
    // subyacente aún puede resolver después con un VideoSample que quedaría huérfano
    // y dispararía el warning de GC de mediabunny. Lo cerramos proactivamente.
    const nextSample = async <S extends VideoSample | null>(
      iterator: AsyncGenerator<S>
    ): Promise<S | undefined> => {
      const raw = iterator.next();
      try {
        const r = await decodeGate(raw);
        return r.value;
      } catch (err) {
        void raw
          .then((r) => {
            try {
              (r.value as unknown as VideoSample | null)?.close();
            } catch {}
          })
          .catch(() => {});
        throw err;
      }
    };
    // El cierre del iterador marca el decoder como terminado y libera los samples
    // que mediabunny ya había predecodificado. Esperarlo ANTES de dispose() evita
    // que un frame tardío quede entre ambos pasos y acabe recogido por el GC.
    const closeIterator = async (iterator: AsyncGenerator<VideoSample | null>) => {
      try {
        const result = await iterator.return?.(undefined);
        try {
          (result?.value as VideoSample | null | undefined)?.close();
        } catch {
          /* already closed or no sample */
        }
      } catch {
        /* El Input se puede haber invalidado al cancelar; no bloquea la limpieza. */
      }
    };

    for (const run of runs) {
      shouldCancel?.();
      if (run.descending) {
        // Tramo inverso del pingpong: decodificar cada segmento HACIA ADELANTE con
        // `samples(start, end)` — la ruta secuencial optimizada de mediabunny (un
        // decodificador por segmento, pre-decode en streaming, sin seeks por frame) —
        // y pintar el buffer al revés. Antes se pedía el run entero con
        // samplesAtTimestamps en orden descendente: al no ser monótona la petición,
        // mediabunny caía al camino de búsqueda por timestamp (1 seek por frame) y el
        // decodificador HW se atascaba justo en el giro del pingpong (~43%) →
        // watchdog → export abortado.
        const frameDur =
          cycleTimes.length > 1 ? Math.max(1e-4, cycleTimes[1]! - cycleTimes[0]!) : 1 / 30;
        for (let a = run.start; a < run.end; ) {
          shouldCancel?.();
          const b = Math.min(run.end, a + maxSegment);
          const segLen = b - a;
          // Dentro del segmento srcTimes desciende: el menor está en b-1 y el mayor en a.
          const startTs = Math.max(0, srcTimes[b - 1]! - frameDur);
          const endTs = srcTimes[a]! + frameDur;
          const iterator = sink.samples(startTs, endTs)[Symbol.asyncIterator]();
          const buf: VideoSample[] = [];
          try {
            // Drenar el segmento hacia adelante emitiendo progreso ("decode"): sin
            // este reporte la barra se congelaba en el giro (~43%). Emitimos cada
            // sample para que el progreso sea real y no a saltos; el throttling
            // fino lo hace el caller (cada frame), pero el watchdog ve latido continuo.
            let drainedCount = 0;
            for (;;) {
              const sample = await nextSample(iterator);
              if (sample === undefined) break;
              // `samples()` puede emitir null para huecos de timestamps. No es un
              // frame que se pueda pintar ni cerrar; conservarlo en el buffer haría
              // fallar el tramo inverso al leer su timestamp.
              if (sample) buf.push(sample);
              drainedCount++;
              // Progreso real: cada sample mueve la barra, no cada 4
              onProgress?.(painted + drainedCount, total, "decode");
            }
          } finally {
            await closeIterator(iterator);
          }
          try {
            // Pintar el segmento en orden inverso: el índice de ciclo a+k pide el
            // último frame decodificado con timestamp <= srcTimes[a+k]. Como srcTimes
            // desciende al crecer k, un puntero que baja recorre buf una sola vez.
            // Si buf es menor que segLen (VFR) varios índices comparten frame; si es
            // mayor, los frames extra por debajo del objetivo quedan sin consumir.
            let ptr = buf.length - 1;
            for (let k = 0; k < segLen; k++) {
              shouldCancel?.();
              const i = a + k;
              const target = srcTimes[i]!;
              while (ptr > 0 && buf[ptr]!.timestamp > target) ptr--;
              const sample = buf.length > 0 ? buf[ptr]! : null;
              if (sample) {
                try {
                  sample.draw(srcCtx, 0, 0, sourceWidth, sourceHeight);
                } catch {
                  /* frame corrupto: se pinta el vecino ya dibujado */
                }
              }
              paintFrame(srcCanvas, cycleTimes[i]!, srcTimes[i]!);
              await onFrame(i);
              painted++;
            }
          } finally {
            // Cerrar SIEMPRE los samples del segmento, aunque onFrame aborte (watchdog/cancel)
            for (const sample of buf) {
              try {
                sample.close();
              } catch {
                /* already closed */
              }
            }
            buf.length = 0;
          }
          onProgress?.(painted, total, "paint");
          await tick();
          a = b;
        }
      } else {
        const asc: number[] = [];
        for (let i = run.start; i < run.end; i++) asc.push(srcTimes[i]!);
        let i = run.start;
        const iterator = sink.samplesAtTimestamps(asc)[Symbol.asyncIterator]();
        try {
          // El srcCanvas es transparente hasta que se dibuja el primer sample. Si los
          // primeros timestamps pedidos caen antes del primer PTS del source (edit
          // lists, offsets de contenedor), samplesAtTimestamps devuelve null y el
          // frame compuesto sale casi negro (#09090b de fondo). El tiling replica ese
          // frame 0 en cada frontera de ciclo (~11 s en pingpong) → "pantallazo negro"
          // antes de cada loop. Fix: drenar hasta el primer sample real y usarlo para
          // todos los índices previos (mismo espíritu que el gap-fill del run inverso).
          let primed = false;
          while (i < run.end) {
            shouldCancel?.();
            const sample = await nextSample(iterator);
            if (sample === undefined) break;
            if (sample) {
              try {
                sample.draw(srcCtx, 0, 0, sourceWidth, sourceHeight);
              } finally {
                sample.close();
              }
              primed = true;
              // Este sample corresponde al índice i; los índices sin muestra
              // (run.start..i-1) comparten su contenido. Cada índice recibe su
              // paintFrame propio (los efectos dependen del tiempo de ciclo) sobre
              // ese mismo contenido: jamás se compone sobre el canvas transparente.
              for (let k = run.start; k <= i; k++) {
                shouldCancel?.();
                paintFrame(srcCanvas, cycleTimes[k]!, srcTimes[k]!);
                await onFrame(k);
                painted++;
              }
              i++;
              break;
            }
            // null: el timestamp precede al primer frame del track → índice sin muestra
            i++;
          }
          if (!primed) {
            throw new Error("No se pudo decodificar el inicio del ciclo (sin frames en el run ascendente)");
          }
          while (i < run.end) {
            shouldCancel?.();
            const sample = await nextSample(iterator);
            if (sample === undefined) break;
            if (sample) {
              try {
                sample.draw(srcCtx, 0, 0, sourceWidth, sourceHeight);
              } finally {
                sample.close();
              }
            }
            paintFrame(srcCanvas, cycleTimes[i]!, srcTimes[i]!);
            await onFrame(i);
            i++;
            painted++;
            if (i % 8 === 0) await tick();
          }
        } finally {
          await closeIterator(iterator);
        }
        for (; i < run.end; i++) {
          shouldCancel?.();
          paintFrame(srcCanvas, cycleTimes[i]!, srcTimes[i]!);
          await onFrame(i);
          painted++;
        }
        onProgress?.(painted, total);
      }
    }
  } finally {
    input.dispose();
  }
}

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
    if (Math.abs(video.currentTime - time) < 0.0005) {
      finish();
    } else {
      video.currentTime = time;
    }
  } catch {
    finish();
  }
  return promise;
}

async function mixMasterAudio(
  duration: number,
  audioBuffer: AudioBuffer | null,
  sfxCues: LoopSfxCue[],
  sourceDuration: number,
  fmtFilter: "16x9" | "9x16" | undefined,
  gate?: <T>(promise: Promise<T>) => Promise<T>
): Promise<AudioBuffer | null> {
  if (!audioBuffer && sfxCues.length === 0) return null;
  // YouTube recomienda 48 kHz; OfflineAudioContext remuestrea música y SFX al master.
  const sampleRate = 48000;
  const outLength = Math.max(1, Math.ceil(duration * sampleRate));
  const offlineAudio = new OfflineAudioContext(2, outLength, sampleRate);
  if (audioBuffer) {
    const musicSrc = offlineAudio.createBufferSource();
    musicSrc.buffer = audioBuffer;
    musicSrc.loop = false;
    musicSrc.connect(offlineAudio.destination);
    musicSrc.start(0);
  }
  await renderSfxCuesToOffline(
    offlineAudio,
    offlineAudio.destination,
    sfxCues,
    sourceDuration,
    duration,
    fmtFilter
  );
  const rendering = offlineAudio.startRendering();
  const rendered = gate ? await gate(rendering) : await rendering;

  // Música + varios SFX pueden superar 0 dBFS aunque cada fuente esté limpia.
  // Reducir el master completo evita clipping/petardeo sin alterar su balance.
  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const data = rendered.getChannelData(c);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > SAFE_MASTER_PEAK) {
    const gain = SAFE_MASTER_PEAK / peak;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const data = rendered.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
  }
  return rendered;
}

const YOUTUBE_AUDIO_BITRATE = 384_000;

async function tileCycleWithAudio(
  cycleBlob: Blob,
  cycleDuration: number,
  targetDuration: number,
  videoCodec: VideoCodec,
  audioBuffer: AudioBuffer | null,
  audioCodec: "aac" | "opus" | null,
  onProgress?: (ratio: number, stage?: string) => void,
  gate?: <T>(promise: Promise<T>) => Promise<T>,
  shouldCancel?: () => void
): Promise<Blob> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(cycleBlob) });
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("El ciclo visual no tiene pista de video");
    const decoderConfig = await track.getDecoderConfig();
    if (!decoderConfig) throw new Error("No se pudo leer la configuración del decoder del ciclo");
    const packetSink = new EncodedPacketSink(track);
    const packets: EncodedPacket[] = [];
    for await (const packet of packetSink.packets()) {
      packets.push(packet);
    }
    if (packets.length === 0) throw new Error("El ciclo visual no produjo paquetes de video");

    const measured =
      (await track.computeDuration()) ||
      cycleDuration ||
      Math.max(0.04, packets[packets.length - 1]!.timestamp + packets[packets.length - 1]!.duration);
    const cycleDur = Math.max(0.04, measured);
    const copies = Math.max(1, Math.ceil(targetDuration / cycleDur - 1e-6));

    output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    output.addVideoTrack(videoSource);
    let audioSource: AudioBufferSource | null = null;
    if (audioBuffer && audioCodec) {
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: YOUTUBE_AUDIO_BITRATE });
      output.addAudioTrack(audioSource);
    }
    await output.start();

    let first = true;
    // El sink entrega paquetes en orden de decodificación y clone() conserva su
    // sequenceNumber. Al repetir el ciclo, reutilizar esa numeración hace que dos
    // paquetes de vueltas distintas parezcan el mismo para el muxer/decoder (en
    // especial con B-frames), lo que puede enseñar un frame negro en la frontera.
    // La salida necesita una secuencia estrictamente creciente para TODO el vídeo.
    let outputSequenceNumber = 0;
    for (let copy = 0; copy < copies; copy++) {
      shouldCancel?.();
      const offset = copy * cycleDur;
      if (offset >= targetDuration - 1e-4) break;
      for (const packet of packets) {
        const ts = packet.timestamp + offset;
        if (ts >= targetDuration) continue;
        let duration = packet.duration;
        if (ts + duration > targetDuration) {
          duration = Math.max(0.001, targetDuration - ts);
        }
        const cloned = packet.clone({
          timestamp: ts,
          duration,
          sequenceNumber: outputSequenceNumber++,
        });
        const addPromise = first
          ? videoSource.add(cloned, { decoderConfig })
          : videoSource.add(cloned);
        await (gate ? gate(addPromise) : addPromise);
        first = false;
      }
      if (onProgress && copy % 2 === 0) {
        onProgress(0.78 + (copy / copies) * 0.12, `Montando ${(copy + 1) * cycleDur >= targetDuration ? targetDuration : (copy + 1) * cycleDur}s…`);
      }
    }

    videoSource.close();
    if (audioSource && audioBuffer) {
      const audioAdd = audioSource.add(audioBuffer);
      await (gate ? gate(audioAdd) : audioAdd);
    }
    await output.finalize();
    const target = output.target as BufferTarget;
    if (!target.buffer) throw new Error("No se pudo generar el buffer del video MP4");
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (err) {
    // Con techo de tiempo: la mutex puede estar retenida por el mismo atasco
    await cancelOutputBounded(output?.cancel() ?? Promise.resolve());
    throw err;
  } finally {
    input.dispose();
  }
}

/**
 * Render Manga Motion to MP4.
 * Video path: stream-decode the source clip at full resolution (WebCodecs), paint ONE visual
 * cycle, then remux-tile to the chosen duration so a 10-minute export costs about the same
 * as an 8-second cycle. No intermediate downscaling: what you see (1080p) is what you get.
 */
export async function exportMangaMotionVideo(
  opts: MangaExportOptions
): Promise<{ blob: Blob; width: number; height: number }> {
  const { image, config, audioBuffer, sfxCues = [], onProgress: rawOnProgress, signal } = opts;
  const watchdog = createExportWatchdog();
  const gate = watchdog.gate;
  const shouldCancel = () => {
    watchdog.touch();
    if (signal?.aborted) throw new ExportCancelledError();
  };
  let progressFloor = 0;
  const onProgress = rawOnProgress
    ? (ratio: number, stage?: string) => {
        watchdog.touch();
        // Progreso monótono: los reintentos internos (mismo ciclo re-renderizado) no
        // deben verse como una barra que retrocede en la UI. El texto de etapa sigue
        // explicando qué está pasando.
        const clamped = Math.min(1, Math.max(progressFloor, ratio));
        progressFloor = clamped;
        rawOnProgress(clamped, stage);
      }
    : undefined;
  const isVideo = typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement;
  const seamMode = config.seamMode || (config.enableSeamlessLoop ? "smooth" : "cut");

  const sourceBlob = isVideo ? await resolveSourceBlob(opts.sourceFile, image) : null;
  shouldCancel();

  const rawW = isVideo
    ? (image as HTMLVideoElement).videoWidth || 1920
    : (image as HTMLImageElement).naturalWidth || (image as HTMLCanvasElement).width || 1920;
  const rawH = isVideo
    ? (image as HTMLVideoElement).videoHeight || 1080
    : (image as HTMLImageElement).naturalHeight || (image as HTMLCanvasElement).height || 1080;

  const { width, height } = resolveOutputSize(config, rawW, rawH, opts);
  const targetDuration = Math.max(1, config.duration || 10);

  // FPS: match the source clip (detected from the container, demux-only). Images render at 60.
  let fps: number;
  if (isVideo) {
    const cap = config.fps || 60;
    let detected = 0;
    if (sourceBlob) {
      onProgress?.(0.01, "Leyendo velocidad de fotogramas del clip…");
      detected = await detectSourceFps(sourceBlob);
    }
    // Conservar 23.976/29.97/59.94: redondear introducía una cadencia irregular
    // visible como vibración en paneos lentos y en el tramo inverso.
    fps = detected > 0 ? Math.max(10, Math.min(cap, detected)) : Math.min(30, cap);
    if (typeof VideoDecoder === "undefined") fps = Math.min(fps, 30);
  } else {
    fps = config.fps || 60;
  }
  const frameDur = 1 / fps;

  const rawDuration = isVideo ? (image as HTMLVideoElement).duration : targetDuration;
  const mediaDuration = isVideo
    ? Math.max(0.25, Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : targetDuration)
    : targetDuration;
  const sourceStart = isVideo
    ? Math.max(0, Math.min(mediaDuration - 0.25, opts.sourceStart ?? 0))
    : 0;
  const sourceEnd = isVideo
    ? Math.max(sourceStart + 0.25, Math.min(mediaDuration, opts.sourceEnd ?? mediaDuration))
    : targetDuration;
  const sourceDuration = sourceEnd - sourceStart;
  const cycleDuration = computeVisualCycleDuration(config, sourceDuration, isVideo);
  const cycleFrames = Math.max(1, Math.round(cycleDuration * fps));

  // Per-cycle-frame plan: effect time (t) + source time (clamped into the clip)
  const srcTimes: number[] = [];
  const cycleTimes: number[] = [];
  for (let i = 0; i < cycleFrames; i++) {
    const t = i * frameDur;
    cycleTimes.push(t);
    if (isVideo) {
      const raw = sourceTimeForExport(
        t,
        sourceDuration,
        seamMode,
        sourceStart,
        config.calmPlaybackRate,
        targetDuration
      );
      srcTimes.push(Math.min(sourceEnd - 0.001, Math.max(sourceStart, raw)));
    } else {
      srcTimes.push(t);
    }
  }

  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "hevc"]);
  if (!videoCodec) {
    throw new Error("El navegador no soporta codificación de video por hardware (WebCodecs).");
  }
  shouldCancel();

  onProgress?.(0.02, "Mezclando audio maestro y SFX…");
  const fmtFilter: "16x9" | "9x16" | undefined =
    config.aspectRatio === "16:9" ? "16x9" : config.aspectRatio === "9:16" ? "9x16" : undefined;
  const masterAudioBuffer = await mixMasterAudio(
    targetDuration,
    audioBuffer ?? null,
    sfxCues,
    sourceDuration,
    fmtFilter,
    gate
  );
  shouldCancel();

  let audioCodec: "aac" | "opus" | null = null;
  if (masterAudioBuffer) {
    audioCodec = (await canEncodeAudio("aac"))
      ? "aac"
      : (await canEncodeAudio("opus"))
        ? "opus"
        : null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // Sin willReadFrequently: el canvas de salida solo recibe draws (nunca getImageData);
  // el flag forzaría raster por CPU y ralentizaría el pintado de filtros a full-res.
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del Canvas");

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = rawW;
  srcCanvas.height = rawH;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("No se pudo obtener el canvas de fuente");
  srcCtx.imageSmoothingEnabled = true;
  srcCtx.imageSmoothingQuality = "high";

  const cycleConfig: MangaMotionConfig = { ...config, duration: cycleDuration };
  const particleSys = opts.particleSystem ?? globalParticles;
  particleSys.init(cycleConfig.particles, width, height, cycleConfig.particleIntensity);
  const turnParticleSys = new PhysicsParticleSystem();
  turnParticleSys.init("none", width, height, 0);
  await ensureWatermarkFont();

  const pingPongEndpoints = seamMode === "pingpong" && sourceBlob
    ? await decodePingPongEndpointFrames(
        sourceBlob,
        sourceStart,
        Math.max(sourceStart, sourceEnd - frameDur),
        gate
      )
    : { start: null, end: null };
  const turnCanvas = document.createElement("canvas");
  turnCanvas.width = width;
  turnCanvas.height = height;
  const turnCtx = turnCanvas.getContext("2d");
  if (!turnCtx) throw new Error("No se pudo preparar el canvas del giro boomerang");
  turnCtx.imageSmoothingEnabled = true;
  turnCtx.imageSmoothingQuality = "high";

  // Smart Forward: crossfade cinemático 0.25-1.0 con curva cosine; calm escala proporcional.
  const crossfadeDur = computeVisualCrossfadeDuration(config, cycleDuration);
  const fadeFrames = crossfadeDur > 0 ? Math.max(1, Math.round(crossfadeDur * fps)) : 0;
  const isForwardSeam = seamMode === "smooth" || seamMode === "calm" || seamMode === "extend";
  const calmRateForState =
    seamMode === "calm"
      ? clampCalmPlaybackRate(config.calmPlaybackRate)
      : seamMode === "extend"
        ? resolveExtendPlaybackRate(sourceDuration, targetDuration)
        : 1;
  // Seam crossfade: conservar únicamente el primer frame compuesto como JPEG.
  // El final del ciclo funde hacia ESE frame exacto, por lo que el siguiente tile
  // arranca sin volver atrás desde un frame de cabeza avanzado.
  const headShots: (Blob | null)[] = [];
  const captureHeadShot = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
      } catch {
        resolve(null);
      }
    });
  const decodeHeadShot = (): Promise<ImageBitmap | null> => {
    const blob = headShots[0];
    if (!blob) return Promise.resolve(null);
    return createImageBitmap(blob).catch(() => null);
  };
  const headFrameFor = (): Promise<ImageBitmap | null> => decodeHeadShot();
  const closePendingHeadFrames = () => {};

  // Bitrate explícito orientado a la subida de YouTube: suficiente para partículas
  // sin inflar el archivo. A más de 30 fps se reserva margen adicional.
  const pixels = width * height;
  const pixelRatio = pixels / (1920 * 1080);
  const reference1080 = fps > 30 ? 16_000_000 : 12_000_000;
  const scaledBitrate = pixelRatio >= 3.5
    ? (fps > 30 ? 60_000_000 : 45_000_000)
    : pixelRatio * reference1080;
  const targetBitrate = Math.round(
    Math.min(60_000_000, Math.max(7_000_000, scaledBitrate)) / 100_000
  ) * 100_000;
  const codecQuantizer: Partial<Record<VideoCodec, number>> = {
    avc: 18,
    hevc: 18,
    vp9: 22,
    av1: 84,
  };

  // Factory del encoder del ciclo: el reintento tras un atasco necesita uno limpio
  // (el intento fallido dejó frames parciales en el Output anterior)
  const createCycleEncoder = () => {
    const source = new CanvasSource(canvas, {
      codec: videoCodec,
      quality: new Quality({
        bitrate: targetBitrate,
        quantizer: codecQuantizer[videoCodec],
        bitrateMode: "variable",
      }),
      latencyMode: "quality",
      // One keyframe per cycle: every tiled copy starts on an IDR, files stay lean
      keyFrameInterval: Math.max(0.5, cycleDuration),
    });
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    output.addVideoTrack(source, { frameRate: fps });
    return { source, output };
  };
  let enc = createCycleEncoder();
  let videoSource: CanvasSource = enc.source;
  let cycleOutput: Output<Mp4OutputFormat, BufferTarget> = enc.output;
  await cycleOutput.start();

  const drawComposited = (
    source: CanvasImageSource,
    t: number,
    sourceTime: number
  ) => {
    const frameConfig: MangaMotionConfig = {
      ...cycleConfig,
      sourceTransform: sourceTransformAt(
        opts.sourceStabilization,
        sourceTime,
        opts.stabilizationEnabled !== false
      ),
    };
    // dtScale = fps/60: las partículas avanzan en tiempo real igual que en el preview
    renderMangaMotionFrame(ctx, source, frameConfig, width, height, t, null, particleSys, fps / 60);

    if (seamMode === "pingpong") {
      const state = getSmoothPingPongFrameState(t, sourceDuration, sourceStart);
      const endpoint = state.endpoint === "start" ? pingPongEndpoints.start : pingPongEndpoints.end;
      if (state.inTransition && state.endpointMix > 0 && endpoint) {
        renderMangaMotionFrame(
          turnCtx,
          endpoint,
          {
            ...cycleConfig,
            particles: "none",
            sourceTransform: sourceTransformAt(
              opts.sourceStabilization,
              Math.min(sourceEnd - frameDur, Math.max(sourceStart, state.endpointTime)),
              opts.stabilizationEnabled !== false
            ),
          },
          width,
          height,
          t,
          null,
          turnParticleSys,
          0
        );
        ctx.save();
        ctx.globalAlpha = state.endpointMix;
        ctx.drawImage(turnCanvas, 0, 0);
        ctx.restore();
      }
    }
  };

  const finishFrame = async (i: number) => {
    shouldCancel();
    if (fadeFrames > 0 && i === 0) {
      const shot = await captureHeadShot();
      // Validación: un JPEG de 1080p con contenido real pesa ≥ 10 KB.
      // Un frame negro/vacío comprime a < 5 KB. Si el headshot es sospechoso,
      // lo descartamos y lo capturamos en el frame 1 (ya con el source primado).
      if (shot && shot.size >= 5000) {
        headShots.push(shot);
      } else {
        console.warn("Headshot frame 0 descartado (" + (shot?.size ?? "nulo") + " bytes) — se capturará en frame 1");
      }
    }
    if (fadeFrames > 0 && i === 1 && headShots.length === 0) {
      headShots.push(await captureHeadShot());
    }
    if (fadeFrames > 0 && i >= cycleFrames - fadeFrames && headShots.length > 0) {
      const head = await headFrameFor();
      if (head) {
        // Preview = Export: misma curva cosine y misma interpolación de alineación
        let alpha: number;
        let aliForDraw: VisualAlignment | undefined;
        if (isForwardSeam) {
          const st = getForwardLoopFrameState(
            i * frameDur,
            cycleDuration,
            sourceDuration,
            sourceStart,
            crossfadeDur,
            opts.sourceAlignment ?? null,
            calmRateForState
          );
          alpha = st.mix;
          aliForDraw = st.alignment ?? undefined;
        } else {
          alpha = 0.5 - 0.5 * Math.cos(((i - (cycleFrames - fadeFrames)) / Math.max(1, fadeFrames - 1)) * Math.PI);
        }
        if (aliForDraw) {
          const scaleX = rawW > 0 ? width / rawW : 1;
          const scaleY = rawH > 0 ? height / rawH : 1;
          const dx = aliForDraw.dx * scaleX;
          const dy = aliForDraw.dy * scaleY;
          const sc = aliForDraw.scale;
          const rot = (aliForDraw.rotation * Math.PI) / 180;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.translate(width / 2 + dx, height / 2 + dy);
          ctx.rotate(rot);
          ctx.scale(sc, sc);
          ctx.drawImage(head, -width / 2, -height / 2, width, height);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.drawImage(head, 0, 0);
          ctx.restore();
        }
        try {
          head.close();
        } catch {
          /* ignore */
        }
      }
    }
    const addPromise = videoSource.add(i * frameDur, frameDur);
    await gate(addPromise, PAINT_WATCHDOG_TIMEOUT_MS);
    if (onProgress && i % 4 === 0) {
      onProgress(0.12 + ((i + 1) / cycleFrames) * 0.62, `Pintando ciclo ${((i + 1) / fps).toFixed(1)}s / ${cycleDuration.toFixed(1)}s`);
    }
    if (i % 8 === 0) await tick();
  };

  // Ruta alternativa con seek por frame (HTMLVideoElement): lenta pero inmune a los
  // atascos del decodificador WebCodecs en segmentos reversos del pingpong.
  const renderCycleSeekBased = async (): Promise<void> => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    // Esta ruta no puede depender de la URL usada por el preview: esa URL puede
    // cambiar al cargar el otro formato. El Blob original sigue siendo la fuente
    // de verdad durante todo el export.
    const fallbackUrl = sourceBlob
      ? URL.createObjectURL(sourceBlob)
      : (image as HTMLVideoElement).src;
    video.src = fallbackUrl;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("El vídeo tardó demasiado en cargar (15 s). Prueba con un MP4 H.264 más corto o sin códec HEVC)")),
        15000
      );
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        // Si el navegador no reporta duración válida, no es un archivo reproducible
        if (!Number.isFinite(video.duration) || video.duration <= 0.05) {
          reject(new Error("El vídeo no reporta duración válida (archivo incompleto o códec no soportado)"));
          return;
        }
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        const srcName = (opts.sourceFile as File)?.name || "";
        const isHevc = /hevc|hvc1|hev1/i.test(srcName) || srcName.toLowerCase().endsWith(".mov");
        const hint = isHevc
          ? " — parece HEVC/H.265, que Chrome no decodifica en muchos equipos. Convierte a H.264 (AVC) y MP4."
          : " — prueba convertir el clip a MP4 H.264 + AAC (ffmpeg: -c:v libx264 -c:a aac).";
        reject(new Error(`No se pudo leer el vídeo (códec no soportado)${hint}`));
      };
      video.load();
    });
    video.pause();

    try {
      // ── Priming del primer frame ──
      // Sin este paso, drawImage en la primera iteración del bucle puede pintar un
      // frame negro/vacío porque el navegador dispara "seeked" antes de decodificar
      // el fotograma. El headshot capturado en finishFrame(0) sería negro → el
      // crossfade de cada ciclo desvanece a negro → pantallazo en cada repetición.
      await seekTo(video, srcTimes[0]!);
      // Doble RAF: "seeked" puede adelantarse a la decodificación real del frame.
      await new Promise<void>(r => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      srcCtx.drawImage(video, 0, 0, rawW, rawH);

      for (let i = 0; i < cycleFrames; i++) {
        shouldCancel();
        await seekTo(video, srcTimes[i]!);
        srcCtx.drawImage(video, 0, 0, rawW, rawH);
        drawComposited(srcCanvas, cycleTimes[i]!, srcTimes[i]!);
        await finishFrame(i);
      }
    } finally {
      video.removeAttribute("src");
      video.load();
      if (sourceBlob) URL.revokeObjectURL(fallbackUrl);
    }
  };

  try {
    onProgress?.(0.08, isVideo ? "Decodificando clip a resolución completa…" : "Renderizando ciclo visual…");

    if (isVideo && sourceBlob && typeof VideoDecoder !== "undefined") {
      try {
        // Progreso granular: actualiza cada frame (no cada 4) para que la barra
        // no salte 43% de golpe; el watchdog ve latido continuo en el tramo inverso.
        let lastStage = "";
        await renderCycleStreaming(
          sourceBlob,
          srcTimes,
          cycleTimes,
          width,
          height,
          drawComposited,
          finishFrame,
          (painted, total, phase) => {
            if (!onProgress) return;
            const seg = Math.min(cycleDuration, painted / fps).toFixed(1);
            const stage =
              phase === "decode"
                ? `Preparando tramo inverso… ${seg}s / ${cycleDuration.toFixed(1)}s`
                : `Pintando ${seg}s / ${cycleDuration.toFixed(1)}s`;
            // Evita spam idéntico pero no filtra por %4: el progreso ahora es real y continuo
            if (stage !== lastStage || painted % 2 === 0) {
              lastStage = stage;
              onProgress(0.08 + (painted / total) * 0.66, stage);
            } else {
              onProgress(0.08 + (painted / total) * 0.66, stage);
            }
          },
          gate,
          shouldCancel
        );
      } catch (err) {
        // Atasco del decodificador WebCodecs (típico en el giro del pingpong): un reintento
        // automático con la ruta de seeks salva el export en vez de dejarlo a medias.
        // También tratamos "sin frames" como stall transitorio (oft por edit lists / VFR).
        const isStall =
          err instanceof ExportStallError ||
          (err instanceof Error && /sin frames en el run ascendente|no decodificable/.test(err.message));
        if (isStall) {
          onProgress?.(0.1, "Decodificador atascado: reintentando con método alternativo…");
          // El reintento repinta desde el frame 0: reiniciar el estado de partículas y
          // descartar las cabezas del crossfade del intento anterior para que el ciclo
          // quede idéntico al original (las partículas venían a mitad de ciclo).
          particleSys.init(cycleConfig.particles, width, height, cycleConfig.particleIntensity);
          headShots.length = 0;
          // Descartar el encoder con frames parciales y arrancar uno limpio
          try {
            videoSource.close();
          } catch {
            /* ignore */
          }
          await cancelOutputBounded(cycleOutput.cancel());
          enc = createCycleEncoder();
          videoSource = enc.source;
          cycleOutput = enc.output;
          await cycleOutput.start();
          await renderCycleSeekBased();
        } else {
          throw err;
        }
      }
    } else if (isVideo) {
      await renderCycleSeekBased();
    } else {
      for (let i = 0; i < cycleFrames; i++) {
        drawComposited(image, cycleTimes[i]!, srcTimes[i]!);
        await finishFrame(i);
      }
    }

    videoSource.close();
    await gate(cycleOutput.finalize());
    const cycleTarget = cycleOutput.target as BufferTarget;
    if (!cycleTarget.buffer) throw new Error("No se pudo generar el ciclo visual");
    const cycleBlob = new Blob([cycleTarget.buffer], { type: "video/mp4" });

    onProgress?.(0.76, `Montando video de ${targetDuration >= 60 ? `${Math.round(targetDuration / 60)} min` : `${targetDuration}s`}…`);

    let finalBlob: Blob;
    if (targetDuration <= cycleDuration + 0.05 && !masterAudioBuffer) {
      finalBlob = cycleBlob;
    } else {
      try {
        finalBlob = await tileCycleWithAudio(
          cycleBlob,
          cycleDuration,
          targetDuration,
          videoCodec,
          masterAudioBuffer,
          audioCodec,
          onProgress,
          gate,
          shouldCancel
        );
      } catch (err) {
        console.warn("Remux del ciclo falló, se reintenta mux simple:", err);
        shouldCancel();
        if (targetDuration <= cycleDuration + 0.08 && masterAudioBuffer && audioCodec) {
          const fallback = new Output({
            format: new Mp4OutputFormat(),
            target: new BufferTarget(),
          });
          const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(cycleBlob) });
          try {
            const track = await input.getPrimaryVideoTrack();
            const decoderConfig = track ? await track.getDecoderConfig() : null;
            if (!track || !decoderConfig) throw err;
            const sink = new EncodedPacketSink(track);
            const vsrc = new EncodedVideoPacketSource(videoCodec);
            fallback.addVideoTrack(vsrc);
            const asrc = new AudioBufferSource({ codec: audioCodec, bitrate: YOUTUBE_AUDIO_BITRATE });
            fallback.addAudioTrack(asrc);
            await fallback.start();
            let first = true;
            for await (const packet of sink.packets()) {
              shouldCancel();
              if (first) {
                await gate(vsrc.add(packet, { decoderConfig }));
                first = false;
              } else {
                await gate(vsrc.add(packet));
              }
            }
            vsrc.close();
            await gate(asrc.add(masterAudioBuffer));
            await gate(fallback.finalize());
            const buf = (fallback.target as BufferTarget).buffer;
            if (!buf) throw err;
            finalBlob = new Blob([buf], { type: "video/mp4" });
          } catch (fallbackErr) {
            await cancelOutputBounded(fallback.cancel());
            throw fallbackErr;
          } finally {
            input.dispose();
          }
        } else {
          throw err;
        }
      }
    }

    // No ofrecer ni guardar un MP4 truncado. Se vuelve a abrir el contenedor final
    // y se comprueban sus pistas y duraciones antes de marcar el export como listo.
    onProgress?.(0.99, "Verificando el archivo final…");
    if (finalBlob.size < 1024) {
      throw new Error("El archivo exportado está vacío o incompleto.");
    }
    const validationInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(finalBlob) });
    try {
      const finalVideoTrack = await gate(validationInput.getPrimaryVideoTrack());
      if (!finalVideoTrack || !(await gate(finalVideoTrack.getDecoderConfig()))) {
        throw new Error("El MP4 final no contiene una pista de vídeo decodificable.");
      }
      const finalVideoDuration = await gate(finalVideoTrack.computeDuration());
      const durationTolerance = Math.max(0.25, 3 / fps);
      if (!Number.isFinite(finalVideoDuration) || Math.abs(finalVideoDuration - targetDuration) > durationTolerance) {
        throw new Error(
          `El MP4 final quedó truncado (${finalVideoDuration.toFixed(2)}s de ${targetDuration.toFixed(2)}s).`
        );
      }
      if (finalVideoTrack.displayWidth !== width || finalVideoTrack.displayHeight !== height) {
        throw new Error(
          `La resolución final no coincide (${finalVideoTrack.displayWidth}×${finalVideoTrack.displayHeight}, esperada ${width}×${height}).`
        );
      }
      if (masterAudioBuffer) {
        const finalAudioTrack = await gate(validationInput.getPrimaryAudioTrack());
        if (!finalAudioTrack) {
          throw new Error("El MP4 final perdió la pista de audio.");
        }
        const finalAudioDuration = await gate(finalAudioTrack.computeDuration());
        if (!Number.isFinite(finalAudioDuration) || Math.abs(finalAudioDuration - targetDuration) > 0.5) {
          throw new Error(
            `La pista de audio quedó incompleta (${finalAudioDuration.toFixed(2)}s de ${targetDuration.toFixed(2)}s).`
          );
        }
      }
    } finally {
      validationInput.dispose();
    }

    onProgress?.(1, "Listo");
    return { blob: finalBlob, width, height };
  } catch (err) {
    // Con techo de tiempo: la mutex del Output puede estar retenida por el mismo atasco
    await cancelOutputBounded(cycleOutput.cancel());
    throw err;
  } finally {
    closePendingHeadFrames();
    try { pingPongEndpoints.start?.close(); } catch {}
    try { pingPongEndpoints.end?.close(); } catch {}
    watchdog.stop();
  }
}
