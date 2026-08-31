import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from "mediabunny";
import {
  PhysicsParticleSystem,
  renderMangaMotionFrame,
} from "./mangaMotionEngine";
import {
  editOutputSize,
  editTimelineDuration,
  editTimelinePlacements,
  type EditAssetMeta,
  type EditProject,
  type EditTimelineClip,
} from "./editStudio";
import {
  buildEditFrameConfig,
  composeEditTransition,
  drawEditTextCue,
} from "./editStudioRender";
import {
  drawProfessionalWatermark,
  ensureWatermarkFont,
} from "./watermark";
import {
  renderSfxCuesToOffline,
  type LoopSfxCue,
} from "./seinenSfxLibrary";

export interface EditStudioExportAsset extends EditAssetMeta {
  file: File;
}

export interface EditStudioExportOptions {
  project: EditProject;
  assets: EditStudioExportAsset[];
  audioBuffer?: AudioBuffer | null;
  sfxCues?: LoopSfxCue[];
  signal?: AbortSignal;
  onProgress?: (ratio: number, stage: string) => void;
}

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
}

async function buildEditAudioMaster(
  project: EditProject,
  duration: number,
  audioBuffer: AudioBuffer | null,
  cues: LoopSfxCue[]
): Promise<AudioBuffer | null> {
  if (!audioBuffer && cues.length === 0) return null;
  const sampleRate = 48_000;
  const frames = Math.max(1, Math.round(duration * sampleRate));
  const offline = new OfflineAudioContext(2, frames, sampleRate);
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.16;
  limiter.connect(offline.destination);

  if (audioBuffer) {
    const source = offline.createBufferSource();
    const gain = offline.createGain();
    source.buffer = audioBuffer;
    source.loop = duration > Math.max(0.1, audioBuffer.duration - project.musicStart);
    source.loopStart = 0;
    source.loopEnd = audioBuffer.duration;
    gain.gain.setValueAtTime(Math.max(0, Math.min(1.5, project.musicVolume)), 0);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1.5, project.musicVolume)), Math.min(0.02, duration));
    gain.gain.setValueAtTime(Math.max(0, Math.min(1.5, project.musicVolume)), Math.max(0, duration - 0.02));
    gain.gain.linearRampToValueAtTime(0, duration);
    source.connect(gain);
    gain.connect(limiter);
    source.start(0, Math.max(0, project.musicStart) % Math.max(0.01, audioBuffer.duration));
    source.stop(duration);
  }

  await renderSfxCuesToOffline(offline, limiter, cues, duration, duration);
  const rendered = await offline.startRendering();

  let peak = 0;
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    const data = rendered.getChannelData(channel);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  }
  const safePeak = 10 ** (-1 / 20);
  if (peak > safePeak) {
    const scale = safePeak / peak;
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
      const data = rendered.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }
  return rendered;
}

export async function exportEditStudioVideo(opts: EditStudioExportOptions): Promise<Blob> {
  const { project, assets, signal, onProgress } = opts;
  if (!project.clips.length) throw new Error("Añade al menos un clip a la línea de tiempo");
  const duration = editTimelineDuration(project.clips);
  if (!(duration > 0.1)) throw new Error("La línea de tiempo no tiene duración válida");
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  for (const clip of project.clips) {
    if (!assetMap.has(clip.assetId)) throw new Error(`Falta el archivo de ${clip.label}`);
  }
  checkCancelled(signal);

  const { width, height } = editOutputSize(project.format);
  const fps = project.fps;
  const frameDuration = 1 / fps;
  const placements = editTimelinePlacements(project.clips);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const exactDuration = totalFrames / fps;

  onProgress?.(0.01, "Preparando audio, SFX y tipografía…");
  const [audioMaster, videoCodec] = await Promise.all([
    buildEditAudioMaster(project, exactDuration, opts.audioBuffer ?? null, opts.sfxCues ?? []),
    getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], { width, height }),
    ensureWatermarkFont(),
  ]);
  if (!videoCodec) throw new Error("Este navegador no puede codificar el formato de vídeo elegido");
  const audioCodec = audioMaster
    ? (await canEncodeAudio("aac")) ? "aac" : (await canEncodeAudio("opus")) ? "opus" : null
    : null;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("Canvas de salida no disponible");
  const sceneCanvas = document.createElement("canvas");
  sceneCanvas.width = width;
  sceneCanvas.height = height;
  const sceneCtx = sceneCanvas.getContext("2d");
  if (!sceneCtx) throw new Error("Canvas de escena no disponible");
  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) throw new Error("Canvas de fuente no disponible");

  const targetBitrate = project.format === "9:16"
    ? (fps > 30 ? 18_000_000 : 14_000_000)
    : (fps > 30 ? 20_000_000 : 16_000_000);
  const quantizers: Partial<Record<VideoCodec, number>> = { avc: 18, hevc: 18, vp9: 22, av1: 84 };
  const videoSource = new CanvasSource(outputCanvas, {
    codec: videoCodec,
    quality: new Quality({
      bitrate: targetBitrate,
      bitrateMode: "variable",
      quantizer: quantizers[videoCodec],
    }),
    latencyMode: "quality",
    keyFrameInterval: 2,
  });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  output.addVideoTrack(videoSource, { frameRate: fps });
  const encodedAudio = audioMaster && audioCodec
    ? new AudioBufferSource({ codec: audioCodec, bitrate: 384_000 })
    : null;
  if (encodedAudio) output.addAudioTrack(encodedAudio);

  const particles = new PhysicsParticleSystem();
  particles.init(
    project.particles,
    width,
    height,
    project.particleIntensity,
    { ...project.particleControls, loopDuration: exactDuration }
  );
  let previousFrame: ImageBitmap | null = null;
  let encodedFrames = 0;

  const paintFrame = async (
    source: CanvasImageSource,
    clip: EditTimelineClip,
    localFrame: number,
    startFrame: number
  ) => {
    checkCancelled(signal);
    const globalFrame = startFrame + localFrame;
    if (globalFrame >= totalFrames) return;
    const globalTime = globalFrame * frameDuration;
    const localTime = localFrame * frameDuration;
    const frameConfig = buildEditFrameConfig(project, clip, fps, frameDuration);
    renderMangaMotionFrame(sceneCtx, source, frameConfig, width, height, localTime, null, undefined, 0);
    particles.update(
      project.particles,
      project.particleIntensity,
      width,
      height,
      globalTime,
      project.particleSpeed,
      fps / 60,
      { ...project.particleControls, loopDuration: exactDuration }
    );
    particles.draw(sceneCtx, project.particles, project.particleControls);
    composeEditTransition(outputCtx, sceneCanvas, previousFrame, clip, localTime, width, height);
    for (const cue of project.textCues) drawEditTextCue(outputCtx, cue, width, height, globalTime);
    if (project.watermarkEnabled) {
      drawProfessionalWatermark(outputCtx, {
        text: project.watermarkText,
        width,
        height,
        opacity: project.watermarkOpacity,
        shorts: project.format === "9:16",
        style: project.watermarkStyle,
      });
    }
    await videoSource.add(globalTime, frameDuration);
    encodedFrames++;
    if (encodedFrames % 4 === 0) {
      onProgress?.(0.04 + (encodedFrames / totalFrames) * 0.88, `Renderizando edit · ${(globalTime + frameDuration).toFixed(1)}s / ${exactDuration.toFixed(1)}s`);
    }
    if (encodedFrames % 10 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

  await output.start();
  try {
    for (const placement of placements) {
      checkCancelled(signal);
      const clip = placement.clip;
      const asset = assetMap.get(clip.assetId)!;
      const startFrame = Math.round(placement.start * fps);
      const endFrame = Math.min(totalFrames, Math.round(placement.end * fps));
      const clipFrames = Math.max(1, endFrame - startFrame);

      if (asset.kind === "image") {
        const bitmap = await createImageBitmap(asset.file);
        try {
          for (let localFrame = 0; localFrame < clipFrames; localFrame++) {
            await paintFrame(bitmap, clip, localFrame, startFrame);
          }
        } finally {
          bitmap.close();
        }
      } else {
        const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(asset.file) });
        try {
          const track = await input.getPrimaryVideoTrack();
          if (!track || !(await track.canDecode())) throw new Error(`No se puede decodificar ${asset.name}`);
          const trackDuration = await track.computeDuration();
          sourceCanvas.width = Math.max(2, track.displayWidth || asset.width || width);
          sourceCanvas.height = Math.max(2, track.displayHeight || asset.height || height);
          const sourceSpan = Math.max(frameDuration, Math.min(clip.sourceDuration, trackDuration - clip.sourceStart));
          const timestamps = Array.from({ length: clipFrames }, (_, index) => {
            const progress = clipFrames <= 1 ? 0 : index / (clipFrames - 1);
            return Math.max(0, Math.min(trackDuration - 0.001, clip.sourceStart + sourceSpan * progress));
          });
          const sink = new VideoSampleSink(track);
          const pendingBeforeFirst: number[] = [];
          let requestIndex = 0;
          let hasFrame = false;
          for await (const sample of sink.samplesAtTimestamps(timestamps)) {
            const localFrame = requestIndex++;
            if (sample) {
              try {
                sample.draw(sourceCtx, 0, 0, sourceCanvas.width, sourceCanvas.height);
              } finally {
                sample.close();
              }
              hasFrame = true;
              for (const pending of pendingBeforeFirst) {
                await paintFrame(sourceCanvas, clip, pending, startFrame);
              }
              pendingBeforeFirst.length = 0;
              await paintFrame(sourceCanvas, clip, localFrame, startFrame);
            } else if (hasFrame) {
              await paintFrame(sourceCanvas, clip, localFrame, startFrame);
            } else {
              pendingBeforeFirst.push(localFrame);
            }
          }
          if (!hasFrame) throw new Error(`${asset.name} no contiene fotogramas decodificables`);
          while (requestIndex < clipFrames) {
            await paintFrame(sourceCanvas, clip, requestIndex, startFrame);
            requestIndex++;
          }
        } finally {
          input.dispose();
        }
      }

      const oldPrevious = previousFrame;
      previousFrame = await createImageBitmap(outputCanvas);
      oldPrevious?.close();
    }

    videoSource.close();
    if (encodedAudio && audioMaster) await encodedAudio.add(audioMaster);
    onProgress?.(0.94, "Cerrando MP4 y verificando pistas…");
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength < 1024) throw new Error("El MP4 final está vacío o incompleto");
    onProgress?.(1, "Edit exportado");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    try {
      await output.cancel();
    } catch {
      /* el error original conserva el contexto útil */
    }
    throw error;
  } finally {
    previousFrame?.close();
  }
}
