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
 * Render complete final master audio for WebCodecs MP4 export with clean segment extraction
 */
export async function renderMangaMasterAudio(
  musicBuffer: AudioBuffer | null,
  config: MangaAudioConfig,
  targetDurationSeconds: number
): Promise<AudioBuffer | null> {
  if (!musicBuffer) return null;

  const sr = 44100;
  const outLength = Math.ceil(targetDurationSeconds * sr);
  const offline = new OfflineAudioContext(2, outLength, sr);

  const speed = Math.max(0.1, config.reverbSettings.speed);
  const sliceDur = targetDurationSeconds * speed;
  const slicedBuffer = sliceAudioBuffer(musicBuffer, config.audioStartTime || 0, sliceDur);

  let processedMusic: AudioBuffer | null = null;
  if (config.useSlowedReverb) {
    processedMusic = await renderSlowedReverb(slicedBuffer, config.reverbSettings);
  } else {
    processedMusic = slicedBuffer;
  }

  await ensureReverbWorklet(offline);

  if (processedMusic) {
    const musicSource = offline.createBufferSource();
    musicSource.buffer = processedMusic;
    musicSource.loop = true;

    const musicGain = offline.createGain();
    musicGain.gain.value = config.musicVolume;

    musicSource.connect(musicGain);
    musicGain.connect(offline.destination);
    musicSource.start(0);
  }

  const finalRenderedBuffer = await offline.startRendering();
  return finalRenderedBuffer;
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

  // Find Melodic: moderate energy with high dynamic variation
  let bestMelodicIdx = 0;

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
