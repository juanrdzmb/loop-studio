/**
 * Manga Audio Engine & Style Sound Matcher (Clean & Pristine)
 * Real-time synchronized music playback, slowed+reverb audio processing,
 * interactive waveform trimmer, and seamless segment extraction.
 */

import {
  type ReverbSettings,
  renderSlowedReverb,
  ensureReverbWorklet,
  buildGraph,
  teardownGraph,
  liveUpdateGraph,
  type Graph,
} from "./audioEngine";
import { SAFE_MASTER_PEAK } from "./audioRepeat";
export { SAFE_MASTER_PEAK, repeatOneShotMasterWithCrossfade } from "./audioRepeat";

export type MangaAudioVibe =
  | "none"
  | "dark_fantasy"
  | "vagabond_zen"
  | "shonen_impact"
  | "rain_melancholy"
  | "shadow_monarch";

export interface MangaAudioConfig {
  vibe: MangaAudioVibe;
  useSlowedReverb: boolean;
  reverbSettings: ReverbSettings;
  musicVolume: number; // 0..1
  audioStartTime: number; // start offset in seconds of the uploaded track
}

export const DEFAULT_MANGA_AUDIO_CONFIG: MangaAudioConfig = {
  vibe: "dark_fantasy",
  useSlowedReverb: true,
  reverbSettings: {
    speed: 0.85,
    reverbMix: 0.35,
    decay: 2.6,
    lowpassHz: 11000,
    volume: 1.0,
    bassDb: 3.0,
    trebleDb: 0,
    crackle: 0, // 0 to avoid artificial noise
  },
  musicVolume: 1.0,
  audioStartTime: 0,
};

export const MANGA_AUDIO_VIBES: {
  id: MangaAudioVibe;
  name: string;
  desc: string;
  badge: string;
  config: Partial<MangaAudioConfig>;
}[] = [
  {
    id: "dark_fantasy",
    name: "Dark Fantasy (Berserk / Slowed)",
    desc: "Slowed 0.85x + Reverberación Profunda + Graves Potentes",
    badge: "Berserk Vibe",
    config: {
      vibe: "dark_fantasy",
      useSlowedReverb: true,
      reverbSettings: {
        speed: 0.85,
        reverbMix: 0.38,
        decay: 3.0,
        lowpassHz: 9500,
        volume: 1.0,
        bassDb: 3.5,
        crackle: 0,
      },
    },
  },
  {
    id: "vagabond_zen",
    name: "Vagabond Zen (Lofi Calm)",
    desc: "Slowed 0.90x + Reverberación Cálida y Acústica",
    badge: "Seinen Chill",
    config: {
      vibe: "vagabond_zen",
      useSlowedReverb: true,
      reverbSettings: {
        speed: 0.9,
        reverbMix: 0.25,
        decay: 1.8,
        lowpassHz: 12000,
        volume: 1.0,
        bassDb: 2.0,
        crackle: 0,
      },
    },
  },
  {
    id: "shonen_impact",
    name: "Shonen High Impact",
    desc: "Velocidad Normal 1.0x + Graves Contundentes para Acción",
    badge: "High Energy",
    config: {
      vibe: "shonen_impact",
      useSlowedReverb: false,
      reverbSettings: {
        speed: 1.0,
        reverbMix: 0.1,
        decay: 1.0,
        lowpassHz: 18000,
        volume: 1.0,
        bassDb: 4.5,
        crackle: 0,
      },
    },
  },
  {
    id: "rain_melancholy",
    name: "Melancholy Night",
    desc: "Slowed 0.80x + Tono Opaco Suave",
    badge: "Melancholic",
    config: {
      vibe: "rain_melancholy",
      useSlowedReverb: true,
      reverbSettings: {
        speed: 0.8,
        reverbMix: 0.42,
        decay: 3.2,
        lowpassHz: 8000,
        volume: 1.0,
        bassDb: 2.5,
        crackle: 0,
      },
    },
  },
  {
    id: "shadow_monarch",
    name: "Shadow Monarch (Trap / Epic)",
    desc: "Slowed 0.88x + Reverb Espacial + Sub-Graves",
    badge: "Webtoon Epic",
    config: {
      vibe: "shadow_monarch",
      useSlowedReverb: true,
      reverbSettings: {
        speed: 0.88,
        reverbMix: 0.4,
        decay: 2.8,
        lowpassHz: 10000,
        volume: 1.0,
        bassDb: 4.0,
        crackle: 0,
      },
    },
  },
];

/**
 * Slice an AudioBuffer to extract a specific segment with precision
 */
export function sliceAudioBuffer(
  buffer: AudioBuffer,
  startTimeSec: number,
  durationSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const numCh = buffer.numberOfChannels;
  const startSample = Math.max(0, Math.min(buffer.length - 1, Math.floor(startTimeSec * sr)));
  const lengthSamples = Math.max(1, Math.min(buffer.length - startSample, Math.ceil(durationSec * sr)));

  const ctx = new OfflineAudioContext(numCh, lengthSamples, sr);
  const sliced = ctx.createBuffer(numCh, lengthSamples, sr);

  for (let c = 0; c < numCh; c++) {
    const srcData = buffer.getChannelData(c);
    const dstData = sliced.getChannelData(c);
    dstData.set(srcData.subarray(startSample, startSample + lengthSamples));
  }

  return sliced;
}

/**
 * Real-Time Music Player with Slowed+Reverb & Segment Seeking
 */
export class MangaLiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private graph: Graph | null = null;
  private isMuted = false;
  private playing = false;
  private currentConfig: MangaAudioConfig = { ...DEFAULT_MANGA_AUDIO_CONFIG };

  /** Public access to the live AudioContext (creates it on demand) so SFX timelines can share one context. */
  getAudioContext(): AudioContext | null {
    return this.ctx ?? this.ensureContext();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    return this.ctx;
  }

  public async resumeContext(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn("AudioContext resume failed:", err);
      }
    }
  }

  public async loadMusic(file: File): Promise<number> {
    this.stop();
    const ctx = this.ensureContext();
    await this.resumeContext();
    await ensureReverbWorklet(ctx);

    const arr = await file.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(arr);
    return this.buffer.duration;
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  public get duration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  public get decodedBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  private lastPlayTimestamp = 0;

  public async play(config: MangaAudioConfig, offsetSeconds = 0) {
    if (!this.buffer || this.isMuted) return;
    const now = performance.now();
    if (now - this.lastPlayTimestamp < 100) {
      return; // Prevent rapid buffer teardown stutter
    }
    this.lastPlayTimestamp = now;

    const ctx = this.ensureContext();
    await this.resumeContext();
    try {
      await ensureReverbWorklet(ctx);
    } catch (err) {
      console.warn("ensureReverbWorklet failed in play:", err);
    }

    this.currentConfig = { ...config };

    if (this.graph) {
      teardownGraph(this.graph);
      this.graph = null;
    }

    const settings: ReverbSettings = {
      ...config.reverbSettings,
      volume: Math.max(0, config.musicVolume),
    };

    try {
      this.graph = buildGraph(ctx, this.buffer, settings, ctx.destination);

      const speed = Math.max(0.1, settings.speed);
      const sourceOffset = (config.audioStartTime || 0) + offsetSeconds * speed;
      const safeOffset = Math.max(0, Math.min(this.buffer.duration - 0.05, sourceOffset));

      this.graph.master.gain.setValueAtTime(settings.volume, ctx.currentTime);
      this.graph.source.start(0, safeOffset);
      this.playing = true;

      this.graph.source.onended = () => {
        if (this.playing) {
          this.playing = false;
          if (this.graph) {
            teardownGraph(this.graph);
            this.graph = null;
          }
        }
      };
    } catch (err) {
      console.error("Error starting manga audio graph:", err);
      this.playing = false;
    }
  }

  public pause() {
    if (!this.graph || !this.playing) return;
    try {
      teardownGraph(this.graph);
    } catch {
      // ignore
    }
    this.graph = null;
    this.playing = false;
  }

  public stop() {
    this.pause();
  }

  public async seek(offsetSeconds: number, config: MangaAudioConfig, forceRestart: boolean = true) {
    if (!this.buffer) return;
    this.currentConfig = { ...config };

    if (this.playing || forceRestart) {
      this.pause();
      await this.play(config, offsetSeconds);
    }
  }

  public updateLiveSettings(config: MangaAudioConfig) {
    this.currentConfig = { ...config };
    if (!this.ctx || !this.graph || !this.playing) return;

    const settings: ReverbSettings = {
      ...config.reverbSettings,
      volume: Math.max(0, config.musicVolume),
    };

    liveUpdateGraph(this.ctx, this.graph, settings);
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.pause();
    }
  }


  public async loadBuffer(buffer: AudioBuffer) {
    this.stop();
    this.buffer = buffer;
    const ctx = this.ensureContext();
    await this.resumeContext();
    try {
      await ensureReverbWorklet(ctx);
    } catch (err) {
      console.warn("ensureReverbWorklet failed in loadBuffer:", err);
    }
  }

  public destroy() {
    this.dispose();
  }
  public dispose() {
    this.stop();
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close();
    }
    this.ctx = null;
    this.buffer = null;
  }
}

/**
 * Render Audio Waveform on Canvas with glowing playhead
 */
export function drawAudioWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer | null,
  currentT: number,
  duration: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0c0a12";
  ctx.fillRect(0, 0, w, h);

  if (!buffer) {
    ctx.fillStyle = "#4a4060";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sin pista de audio (Sube una canción para ver el espectro)", w / 2, h / 2);
    return;
  }

  const data = buffer.getChannelData(0);
  const totalSamples = data.length;
  const numBars = 120;
  const step = Math.floor(totalSamples / numBars);

  const progress = duration > 0 ? (currentT % duration) / duration : 0;
  const playheadX = progress * w;

  for (let i = 0; i < numBars; i++) {
    const x = (i / numBars) * w;
    const barWidth = (w / numBars) * 0.75;

    let maxVal = 0;
    const startIdx = i * step;
    for (let j = 0; j < step; j += 8) {
      const v = Math.abs(data[startIdx + j] || 0);
      if (v > maxVal) maxVal = v;
    }

    const barHeight = Math.max(4, maxVal * (h * 0.85));
    const y = (h - barHeight) / 2;

    const isPast = x <= playheadX;
    if (isPast) {
      ctx.fillStyle = "#d946ef";
      ctx.shadowColor = "#d946ef";
      ctx.shadowBlur = 4;
    } else {
      ctx.fillStyle = "#475569";
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 2);
    ctx.fill();
  }

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();
  ctx.restore();
}

/**
 * Render Interactive Waveform Trimmer with Clean Draggable Handles
 */
export function drawFullAudioTrimmerWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer | null,
  audioStartTime: number,
  mangaDuration: number,
  currentT: number,
  playbackSpeed: number,
  analysis?: AudioHighlightAnalysis | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07060b";
  ctx.fillRect(0, 0, w, h);

  if (!buffer) {
    ctx.fillStyle = "#52525b";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sube una canción para ver la intensidad y recortar", w / 2, h / 2);
    return;
  }

  const totalDur = buffer.duration || 1;
  const speed = Math.max(0.1, playbackSpeed);
  const segmentDur = mangaDuration * speed;
  const startX = Math.max(0, Math.min(w, (audioStartTime / totalDur) * w));
  const endX = Math.max(startX + 8, Math.min(w, ((audioStartTime + segmentDur) / totalDur) * w));
  const segmentWidth = endX - startX;

  const data = buffer.getChannelData(0);
  const totalSamples = data.length;
  const numBars = 160;
  const step = Math.floor(totalSamples / numBars);

  // 1. Auto-Gain Track Peak Scan
  let globalPeak = 0.001;
  const stride = Math.max(1, Math.floor(totalSamples / 4000));
  for (let s = 0; s < totalSamples; s += stride) {
    const val = Math.abs(data[s] || 0);
    if (val > globalPeak) globalPeak = val;
  }

  // 2. Draw Waveform Bars with Dynamic Energy Heatmap
  for (let i = 0; i < numBars; i++) {
    const x = (i / numBars) * w;
    const barWidth = (w / numBars) * 0.76;

    let barPeak = 0;
    let sumSquares = 0;
    const startIdx = i * step;
    let count = 0;
    const subStep = Math.max(1, Math.floor(step / 32));
    for (let j = 0; j < step; j += subStep) {
      const v = data[startIdx + j] || 0;
      const absV = Math.abs(v);
      if (absV > barPeak) barPeak = absV;
      sumSquares += v * v;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;

    // Relative normalized amplitude (0..1)
    const normPeak = Math.min(1.0, barPeak / globalPeak);
    const normRms = Math.min(1.0, (rms * 2.2) / globalPeak);
    const energy = Math.min(1.0, normPeak * 0.55 + normRms * 0.45);

    // Height fills the canvas nicely (min 5px, max 86% of canvas height)
    const barHeight = Math.max(5, (normPeak * 0.7 + normRms * 0.3) * (h * 0.86));
    const y = (h - barHeight) / 2;

    const inTrimRange = x >= startX && x <= endX;

    // Energy-based Heatmap Colors
    if (inTrimRange) {
      if (energy > 0.65) {
        ctx.fillStyle = "#f59e0b"; // Vibrant Gold / Drop
      } else if (energy > 0.35) {
        ctx.fillStyle = "#d946ef"; // Fuchsia Buildup
      } else {
        ctx.fillStyle = "#38bdf8"; // Cyan Melodic
      }
    } else {
      if (energy > 0.65) {
        ctx.fillStyle = "#78350f"; // Dimmed warm
      } else if (energy > 0.35) {
        ctx.fillStyle = "#581c87"; // Dimmed purple
      } else {
        ctx.fillStyle = "#1e293b"; // Dimmed slate
      }
    }

    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 1.5);
    ctx.fill();

    // Hot energy peak glow dot
    if (inTrimRange && energy > 0.72) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(x + barWidth / 2, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Dim Outside Regions
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(0, 0, startX, h);
  ctx.fillRect(endX, 0, w - endX, h);

  // 4. Highlight Selected Region Box
  ctx.fillStyle = "rgba(232, 121, 249, 0.12)";
  ctx.fillRect(startX, 0, segmentWidth, h);

  ctx.strokeStyle = "#e879f9";
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, 0, segmentWidth, h);

  // Left & Right Handle Bars
  ctx.fillStyle = "#f0abfc";
  ctx.fillRect(startX - 3, 0, 6, h);
  ctx.fillRect(endX - 3, 0, 6, h);
  ctx.restore();

  // 5. Draw Climax & Buildup Indicators on Timeline
  if (analysis) {
    ctx.save();
    // Drop Marker
    if (analysis.dropTime > 0 && analysis.dropTime < totalDur) {
      const dropX = (analysis.dropTime / totalDur) * w;
      ctx.strokeStyle = "rgba(249, 115, 22, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(dropX, 0);
      ctx.lineTo(dropX, h);
      ctx.stroke();

      ctx.fillStyle = "#f97316";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("🔥 DROP", Math.min(w - 45, dropX + 3), 11);
    }

    // Buildup Marker
    if (analysis.buildupTime > 0 && analysis.buildupTime < totalDur) {
      const bX = (analysis.buildupTime / totalDur) * w;
      ctx.strokeStyle = "rgba(234, 179, 8, 0.8)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(bX, 0);
      ctx.lineTo(bX, h);
      ctx.stroke();

      ctx.fillStyle = "#eab308";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("⚡ SUBIDA", Math.min(w - 55, bX + 3), h - 4);
    }
    ctx.restore();
  }

  // 6. Draw Active Playhead moving inside the selected region
  const playheadNorm = (currentT % mangaDuration) / mangaDuration;
  const playheadX = startX + playheadNorm * segmentWidth;

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();
  ctx.restore();
}

/**
 * Renderiza UN período de loop (duración = slice − fade) con la costura de
 * crossfade igual-potencia HORNEADA dentro del buffer: los primeros `fade`
 * segundos mezclan la cola saliente (slice[period..dur)) con la cabeza entrante
 * (slice[0..fade)) usando las mismas curvas sqrt del tiling del export.
 *
 * Es la primitiva compartida preview↔export: el preview loopea este buffer de
 * forma nativa (AudioBufferSourceNode.loop) y el export lo repite hasta
 * durationSec — la costura suena IDÉNTICA en ambos porque es el mismo audio.
 */
export async function buildProcessedLoopCycle(
  slice: AudioBuffer,
  volume: number,
  opts?: { maxFadeSec?: number }
): Promise<AudioBuffer> {
  const sr = slice.sampleRate;
  const channels = Math.min(2, Math.max(1, slice.numberOfChannels));
  const vol = Math.max(0, volume);
  // Canción completa → fundido un poco más largo (hasta 4 s) para que la transición
  // fin→inicio del tema entero sea imperceptible; loops cortos mantienen 2.5 s.
  const maxFade = opts?.maxFadeSec ?? 2.5;
  const fade = Math.min(maxFade, Math.max(0.8, slice.duration * 0.06), slice.duration * 0.45);
  const period = Math.max(0.2, slice.duration - fade);
  const outLength = Math.max(1, Math.floor(period * sr));
  const offline = new OfflineAudioContext(channels, outLength, sr);

  const CURVE_POINTS = 128;
  const fadeInCurve = new Float32Array(CURVE_POINTS);
  const fadeOutCurve = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    const x = i / (CURVE_POINTS - 1);
    fadeInCurve[i] = Math.sqrt(x) * vol;
    fadeOutCurve[i] = Math.sqrt(1 - x) * vol;
  }

  // Cola saliente (final del ciclo anterior): slice[period..dur) con fade-out
  const tail = offline.createBufferSource();
  tail.buffer = sliceAudioBuffer(slice, period, slice.duration - period);
  const gTail = offline.createGain();
  gTail.gain.setValueCurveAtTime(fadeOutCurve, 0, fade);
  tail.connect(gTail);
  gTail.connect(offline.destination);
  tail.start(0);

  // Cabeza entrante (inicio del ciclo siguiente): slice[0..period) con fade-in;
  // tras la curva el gain queda clavado en el último valor (√1 · vol = vol)
  const head = offline.createBufferSource();
  head.buffer = sliceAudioBuffer(slice, 0, period);
  const gHead = offline.createGain();
  gHead.gain.setValueCurveAtTime(fadeInCurve, 0, fade);
  head.connect(gHead);
  gHead.connect(offline.destination);
  head.start(0);

  return offline.startRendering();
}

/**
 * Extiende un slice ya procesado hasta targetSec repitiendo el ciclo de loop
 * (buildProcessedLoopCycle). El resultado es periódico con período = ciclo: cada
 * costura suena exactamente igual (incluida la del inicio), igual que en el
 * preview que loopea ese mismo ciclo de forma nativa.
 */
export async function loopAudioWithCrossfade(
  buffer: AudioBuffer,
  targetSec: number,
  musicVolume: number,
  opts?: { maxFadeSec?: number }
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));

  if (buffer.duration >= targetSec - 0.02) {
    const outLength = Math.max(1, Math.ceil(targetSec * sr));
    const offline = new OfflineAudioContext(channels, outLength, sr);
    const src = offline.createBufferSource();
    src.buffer = sliceAudioBuffer(buffer, 0, targetSec);
    const g = offline.createGain();
    g.gain.value = musicVolume;
    src.connect(g);
    g.connect(offline.destination);
    src.start(0);
    return offline.startRendering();
  }

  const cycle = await buildProcessedLoopCycle(buffer, musicVolume, {
    maxFadeSec: opts?.maxFadeSec,
  });
  const outLength = Math.max(1, Math.ceil(targetSec * sr));
  const out = new AudioBuffer({ length: outLength, numberOfChannels: channels, sampleRate: sr });
  const cycleLen = cycle.length;
  for (let c = 0; c < channels; c++) {
    const dst = out.getChannelData(c);
    const src = cycle.getChannelData(Math.min(c, cycle.numberOfChannels - 1));
    for (let pos = 0; pos < outLength; pos += cycleLen) {
      dst.set(src.subarray(0, Math.min(cycleLen, outLength - pos)), pos);
    }
  }
  return out;
}

/**
 * Pipeline del PREVIEW: slice del recorte → slowed+reverb opcional → ciclo de
 * loop con la costura horneada (buildProcessedLoopCycle). El buffer que devuelve
 * es el MISMO período que el export repetirá (buildProcessedMusicSlice), así que
 * lo que oyes en el preview es exactamente lo que se exporta. El volumen NO va
 * horneado (se aplica en vivo con un GainNode): la ganancia lineal conmuta con
 * las curvas sqrt del crossfade, por lo que el resultado es idéntico.
 */
export async function buildProcessedLoopBuffer(
  req: Omit<ProcessedLoopRequest, "durationSec" | "volume">
): Promise<AudioBuffer> {
  // Modo canción completa: ignora el recorte y usa el tema entero con fundido largo
  const isFull = !!req.fullSongLoop;
  const len = isFull
    ? Math.max(0.8, req.sourceBuffer.duration)
    : Math.max(0.8, req.loopEnd - req.loopStart);
  const start = isFull ? 0 : req.loopStart;
  let slice = sliceAudioBuffer(req.sourceBuffer, start, len);
  if (req.enableSlowedReverb) {
    slice = await renderSlowedReverb(slice, req.reverbSettings);
  }
  return buildProcessedLoopCycle(slice, 1, { maxFadeSec: isFull ? 4.0 : 2.5 });
}

/**
 * Pipeline compartido entre el export y el preview: slice del loop → slowed+reverb
 * opcional → tiling con crossfade igual-potencia hasta durationSec.
 */
export interface ProcessedLoopRequest {
  sourceBuffer: AudioBuffer;
  loopStart: number;
  loopEnd: number;
  enableSlowedReverb: boolean;
  reverbSettings: ReverbSettings;
  durationSec: number;
  volume: number;
  /** Si true, ignora loopStart/End y usa la canción entera con fundido imperceptible */
  fullSongLoop?: boolean;
}

export async function buildProcessedMusicSlice(req: ProcessedLoopRequest): Promise<AudioBuffer> {
  const isFull = !!req.fullSongLoop;
  const len = isFull
    ? Math.max(0.8, req.sourceBuffer.duration)
    : Math.max(0.8, req.loopEnd - req.loopStart);
  const start = isFull ? 0 : req.loopStart;
  let slice = sliceAudioBuffer(req.sourceBuffer, start, len);
  if (req.enableSlowedReverb) {
    slice = await renderSlowedReverb(slice, req.reverbSettings);
  }
  return loopAudioWithCrossfade(slice, req.durationSec, Math.max(0, req.volume), {
    maxFadeSec: isFull ? 4.0 : 2.5,
  });
}

export interface ProcessedOneShotRequest {
  sourceBuffer: AudioBuffer;
  /** Posición en la canción original. Se reajusta al final si no cabe la ventana. */
  sourceStart?: number;
  /** Duración exacta de salida. Si se omite, procesa la canción completa una sola vez. */
  targetDurationSec?: number;
  enableSlowedReverb: boolean;
  reverbSettings: ReverbSettings;
  volume?: number;
}

/**
 * Convierte una duración de salida en la cantidad de canción fuente necesaria.
 * Con slowed activo, 25 s de salida a 0.85x consumen 21.25 s del original.
 */
export function sourceWindowForOutput(
  outputDurationSec: number,
  enableSlowedReverb: boolean,
  settings: ReverbSettings
): number {
  const speed = enableSlowedReverb ? Math.max(0.1, settings.speed) : 1;
  return Math.max(0.05, outputDurationSec * speed);
}

/** Mantiene una ventana de duración fija dentro de los límites de la canción. */
export function clampOneShotWindow(
  requestedStart: number,
  sourceWindowSec: number,
  sourceDurationSec: number
): { start: number; end: number; duration: number } {
  const duration = Math.min(Math.max(0.05, sourceWindowSec), Math.max(0.05, sourceDurationSec));
  const start = Math.max(0, Math.min(requestedStart, Math.max(0, sourceDurationSec - duration)));
  return { start, end: Math.min(sourceDurationSec, start + duration), duration };
}

/**
 * Copia un master al tamaño exacto, aplica volumen y reduce únicamente si el pico
 * superaría -0.18 dBFS. Para fragmentos añade 15 ms de protección en los bordes:
 * evita clics de corte sin crear una costura ni repetir audio dentro del Short.
 */
export function copyOneShotMaster(
  buffer: AudioBuffer,
  durationSec: number,
  volume: number = 1,
  edgeFadeSec: number = 0
): AudioBuffer {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const length = Math.max(1, Math.ceil(durationSec * buffer.sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: buffer.sampleRate });
  const copyLength = Math.min(length, buffer.length);
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    for (let i = 0; i < copyLength; i++) peak = Math.max(peak, Math.abs(src[i]));
  }
  const requestedGain = Math.max(0, volume);
  // Normalizar primero siempre al mismo master unity; después aplicar el volumen.
  // Así preview (buffer unity + GainNode) y export (ganancia horneada) coinciden.
  const normalizedGain = peak > SAFE_MASTER_PEAK ? SAFE_MASTER_PEAK / peak : 1;
  const desiredGain = normalizedGain * requestedGain;
  const gain = peak * desiredGain > SAFE_MASTER_PEAK ? SAFE_MASTER_PEAK / peak : desiredGain;
  const fadeSamples = Math.min(
    Math.floor(Math.max(0, edgeFadeSec) * buffer.sampleRate),
    Math.floor(copyLength / 2)
  );

  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    const dst = out.getChannelData(c);
    for (let i = 0; i < copyLength; i++) {
      let edgeGain = 1;
      if (fadeSamples > 0 && i < fadeSamples) edgeGain = i / fadeSamples;
      if (fadeSamples > 0 && i >= copyLength - fadeSamples) {
        edgeGain = Math.min(edgeGain, (copyLength - 1 - i) / fadeSamples);
      }
      dst[i] = src[i] * gain * Math.max(0, edgeGain);
    }
  }
  return out;
}

/**
 * Pipeline sin loops internos:
 * - 16:9: procesa la canción completa una vez y conserva su duración resultante.
 * - Short: procesa exactamente la ventana necesaria y entrega 25/30 s exactos.
 */
export async function buildProcessedOneShotBuffer(req: ProcessedOneShotRequest): Promise<AudioBuffer> {
  const fixedOutput = req.targetDurationSec != null;
  const sourceWindow = fixedOutput
    ? sourceWindowForOutput(req.targetDurationSec!, req.enableSlowedReverb, req.reverbSettings)
    : req.sourceBuffer.duration;
  const window = clampOneShotWindow(
    fixedOutput ? req.sourceStart ?? 0 : 0,
    sourceWindow,
    req.sourceBuffer.duration
  );
  let processed = sliceAudioBuffer(req.sourceBuffer, window.start, window.duration);
  if (req.enableSlowedReverb) {
    processed = await renderSlowedReverb(processed, req.reverbSettings);
  }
  const duration = fixedOutput ? req.targetDurationSec! : processed.duration;
  return copyOneShotMaster(processed, duration, req.volume ?? 1, fixedOutput ? 0.015 : 0);
}

/**
 * Render complete final master audio for WebCodecs MP4 export.
 * Exact target duration: if the song is shorter, loop it with a constant-power-ish overlap fade.
 */
export async function renderMangaMasterAudio(
  musicBuffer: AudioBuffer | null,
  config: MangaAudioConfig,
  targetDurationSeconds: number
): Promise<AudioBuffer | null> {
  if (!musicBuffer) return null;

  const alreadyProcessed = !config.useSlowedReverb;
  const speed = alreadyProcessed ? 1 : Math.max(0.1, config.reverbSettings.speed);
  const sliceDur = Math.max(0.05, targetDurationSeconds * speed);
  const slicedBuffer = sliceAudioBuffer(musicBuffer, config.audioStartTime || 0, sliceDur);

  const processedMusic = config.useSlowedReverb
    ? await renderSlowedReverb(slicedBuffer, config.reverbSettings)
    : slicedBuffer;

  return loopAudioWithCrossfade(
    processedMusic,
    targetDurationSeconds,
    Math.max(0, config.musicVolume)
  );
}

export interface AudioHighlightAnalysis {
  dropTime: number;          // Peak high-energy moment (seconds)
  buildupTime: number;       // Steepest energy climb (seconds)
  melodicTime: number;       // Dynamic atmospheric moment (seconds)
  energyProfile: number[];   // 0..1 normalized energy profile
  totalDuration: number;
}

/**
 * Smart Audio Beat & Drop Analyzer
 * Scans audio buffer to detect song climax, drops, and epic build-ups
 */
export function analyzeAudioHighlights(buffer: AudioBuffer): AudioHighlightAnalysis {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const totalDuration = buffer.duration;

  // Window of 0.5s
  const windowSize = Math.floor(sampleRate * 0.5);
  const numWindows = Math.floor(totalSamples / windowSize);

  if (numWindows <= 1) {
    return {
      dropTime: 0,
      buildupTime: 0,
      melodicTime: 0,
      energyProfile: [1.0],
      totalDuration,
    };
  }

  const rawRms: number[] = new Array(numWindows);
  let maxRms = 0.0001;

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = Math.min(start + windowSize, totalSamples);
    let sumSq = 0;
    for (let i = start; i < end; i += 4) { // 4x downsampling for speed
      const s = channelData[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt((sumSq * 4) / (end - start));
    rawRms[w] = rms;
    if (rms > maxRms) maxRms = rms;
  }

  // Normalized energy profile 0..1
  const energyProfile = rawRms.map((r) => Math.min(1.0, r / maxRms));

  // Find Drop: window with highest sustained energy (smoothed over 3 windows)
  let bestDropIdx = 0;
  let bestDropScore = -1;

  // Find Build-up: highest positive slope (rise)
  let bestRiseIdx = 0;
  let bestRiseScore = -1;

  for (let i = 1; i < numWindows - 1; i++) {
    const smoothed = (energyProfile[i - 1] + energyProfile[i] + energyProfile[i + 1]) / 3;
    if (smoothed > bestDropScore) {
      bestDropScore = smoothed;
      bestDropIdx = i;
    }

    const slope = energyProfile[i + 1] - energyProfile[i - 1];
    if (slope > bestRiseScore) {
      bestRiseScore = slope;
      bestRiseIdx = i;
    }
  }

  // Avoid choosing the very last 5 seconds as drop
  const dropTime = Math.max(0, Math.min(totalDuration - 5, bestDropIdx * 0.5));
  const buildupTime = Math.max(0, Math.min(totalDuration - 5, bestRiseIdx * 0.5));
  const melodicTime = Math.max(0, Math.min(totalDuration - 5, totalDuration * 0.2));

  return {
    dropTime,
    buildupTime,
    melodicTime,
    energyProfile,
    totalDuration,
  };
}

export async function decodeAudioDataAsync(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return buffer;
  } finally {
    void ctx.close();
  }
}

export { MangaLiveAudioPlayer as MangaAudioPlayer };
