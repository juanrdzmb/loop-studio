/**
 * Motor Slowed + Reverb basado en Web Audio API.
 * Cadena: source(playbackRate) → lowpass → [dry | convolver] → master
 *
 * Todos los parámetros se pueden cambiar EN VIVO sin reiniciar la fuente:
 * - speed: playbackRate con rampa suave (re-ancla el reloj de posición)
 * - reverbMix/volume/lowpassHz: gains y filtro con setTargetAtTime
 * - decay: swap del buffer del convolver (cacheado por valor)
 */

export interface ReverbSettings {
  /** Velocidad de reproducción (baja el pitch = sonido "slowed" auténtico) */
  speed: number;
  /** Mezcla húmeda del reverb 0..1 */
  reverbMix: number;
  /** Duración de la cola de reverb en segundos */
  decay: number;
  /** Frecuencia de corte del low-pass en Hz */
  lowpassHz: number;
  /** Volumen maestro */
  volume: number;
  /** Refuerzo de graves en dB (lowshelf ~150 Hz). Default 0 */
  bassDb?: number;
  /** Brillo/agudos en dB (highshelf ~6 kHz). Default 0 */
  trebleDb?: number;
  /** Velocidad de rotación 8D en Hz (0 = desactivado). Default 0 */
  panRate?: number;
  /** Profundidad de la rotación 8D 0..1. Default 0 */
  panDepth?: number;
  /** Crackle de vinilo (hiss + pops) 0..1. Default 0 */
  crackle?: number;
  /** Ancho estéreo 0..2 (1 = normal, >1 más envolvente). Default 1 */
  width?: number;
}

export const REVERB_PRESETS: Record<string, { label: string; settings: ReverbSettings }> = {
  clasico: {
    label: "Clásico slowed",
    settings: { speed: 0.8, reverbMix: 0.35, decay: 2.4, lowpassHz: 11000, volume: 1 },
  },
  deep: {
    label: "Deep / nocturno",
    settings: { speed: 0.65, reverbMix: 0.45, decay: 3.5, lowpassHz: 7000, volume: 1 },
  },
  nightcore: {
    label: "Nightcore",
    settings: { speed: 1.25, reverbMix: 0.08, decay: 0.7, lowpassHz: 16000, volume: 1 },
  },
  vaporwave: {
    label: "Vaporwave",
    settings: {
      speed: 0.7, reverbMix: 0.5, decay: 3.2, lowpassHz: 8500, volume: 1,
      width: 1.4, bassDb: 2,
    },
  },
  lofi: {
    label: "Lo-Fi cálido",
    settings: {
      speed: 0.85, reverbMix: 0.28, decay: 1.6, lowpassHz: 6000, volume: 1,
      width: 0.9, bassDb: 3,
    },
  },
};

export const DEFAULT_SETTINGS: ReverbSettings = REVERB_PRESETS.clasico.settings;

/**
 * Motor de reverb: placa Dattorro (khoin/DattorroReverbNode, dominio público)
 * vía AudioWorklet — red de delay/feedback modulada, mucho más rica que una
 * convolución con impulso sintético. Se carga UNA vez por contexto.
 */
const WORKLET_URL = "/dattorro.worklet.js";
const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

export function ensureReverbWorklet(ctx: BaseAudioContext): Promise<void> {
  let p = workletLoaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(WORKLET_URL);
    workletLoaded.set(ctx, p);
  }
  return p;
}

/** Segundos de cola → parámetro `decay` del tanque Dattorro (0..0.9) */
function dattorroDecay(decaySec: number): number {
  return Math.min(0.9, 0.15 + 0.75 * Math.sqrt(Math.min(1, Math.max(0, decaySec) / 6)));
}

export interface Graph {
  source: AudioBufferSourceNode;
  lowpass: BiquadFilterNode;
  /** Placa Dattorro: salida ya mezclada dry+wet */
  reverb: AudioWorkletNode;
  master: GainNode;
  bass: BiquadFilterNode;
  treble: BiquadFilterNode;
  panner: StereoPannerNode;
  /** Matriz mid/side para el ancho estéreo (L'L' L'R' R'L' R'R') */
  widthGains: { ll: GainNode; lr: GainNode; rl: GainNode; rr: GainNode };
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  crackleSource: AudioBufferSourceNode;
  crackleGain: GainNode;
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
  panRate: number;
  panDepth: number;
}

/** Detiene y desconecta limpiamente todos los nodos de la cadena para evitar fugas y acumulación de estática */
export function teardownGraph(graph: Graph | null): void {
  if (!graph) return;
  try {
    graph.source.onended = null;
    graph.source.stop();
  } catch {}
  try {
    graph.source.disconnect();
  } catch {}

  if (graph.crackleSource) {
    try {
      graph.crackleSource.stop();
    } catch {}
    try {
      graph.crackleSource.disconnect();
    } catch {}
  }
  if (graph.crackleGain) {
    try {
      graph.crackleGain.disconnect();
    } catch {}
  }

  if (graph.lfo) {
    try {
      graph.lfo.stop();
    } catch {}
    try {
      graph.lfo.disconnect();
    } catch {}
  }
  if (graph.lfoGain) {
    try {
      graph.lfoGain.disconnect();
    } catch {}
  }

  try { graph.lowpass.disconnect(); } catch {}
  try { graph.reverb.disconnect(); } catch {}
  try { graph.bass.disconnect(); } catch {}
  try { graph.treble.disconnect(); } catch {}
  try { graph.splitter.disconnect(); } catch {}
  try { graph.widthGains.ll.disconnect(); } catch {}
  try { graph.widthGains.lr.disconnect(); } catch {}
  try { graph.widthGains.rl.disconnect(); } catch {}
  try { graph.widthGains.rr.disconnect(); } catch {}
  try { graph.merger.disconnect(); } catch {}
  try { graph.master.disconnect(); } catch {}
  try { graph.panner.disconnect(); } catch {}
}

/** Buffer de 3 s con textura sutil de vinilo (sin ruido blanco áspero) */
const crackleCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function getCrackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const hit = crackleCache.get(ctx);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const len = sr * 3;
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = 0.0;
    for (let i = 0; i < len; i++) {
      // Filtro pasa-bajos muy suave para evitar estática/hiss agudo
      s = s * 0.96 + (Math.random() * 2 - 1) * 0.0012;
      d[i] = s;
    }
    // Pops de vinilo sutiles y cálidos
    for (let p = 0; p < 18; p++) {
      const pos = Math.floor(Math.random() * (len - 120));
      const amp = (0.05 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : -1);
      for (let j = 0; j < 60; j++) {
        d[pos + j] += amp * Math.sin((j / 60) * Math.PI) * Math.exp(-j / 20);
      }
    }
  }
  crackleCache.set(ctx, buf);
  return buf;
}
export function buildGraph(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  s: ReverbSettings,
  dest: AudioNode
): Graph {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = s.speed;
  source.loop = false;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = s.lowpassHz;
  lowpass.Q.value = 0.0001;

  // Placa Dattorro: mezcla dry/wet dentro del propio nodo
  const reverb = new AudioWorkletNode(ctx, "DattorroReverb", {
    outputChannelCount: [2],
    processorOptions: {},
  });
  const rp = reverb.parameters;
  (rp.get("wet") as AudioParam).value = s.reverbMix;
  (rp.get("dry") as AudioParam).value = 1 - s.reverbMix * 0.6;
  (rp.get("decay") as AudioParam).value = dattorroDecay(s.decay);
  (rp.get("preDelay") as AudioParam).value = Math.round(ctx.sampleRate * 0.02);
  (rp.get("damping") as AudioParam).value = 0.08;

  // EQ en el camino maestro (post reverb)
  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 150;
  bass.gain.value = s.bassDb ?? 0;

  const treble = ctx.createBiquadFilter();
  treble.type = "highshelf";
  treble.frequency.value = 6000;
  treble.gain.value = s.trebleDb ?? 0;

  // Ancho estéreo: matriz mid/side con 4 ganancias
  const width = Math.max(0, Math.min(2, s.width ?? 1));
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const gLL = ctx.createGain();
  const gLR = ctx.createGain();
  const gRL = ctx.createGain();
  const gRR = ctx.createGain();
  gLL.gain.value = 0.5 + 0.5 * width;
  gLR.gain.value = 0.5 - 0.5 * width;
  gRL.gain.value = 0.5 - 0.5 * width;
  gRR.gain.value = 0.5 + 0.5 * width;
  splitter.connect(gLL, 0);
  splitter.connect(gRL, 0);
  splitter.connect(gLR, 1);
  splitter.connect(gRR, 1);
  gLL.connect(merger, 0, 0);
  gLR.connect(merger, 0, 0);
  gRL.connect(merger, 0, 1);
  gRR.connect(merger, 0, 1);

  const master = ctx.createGain();
  master.gain.value = s.volume;

  // Rotación 8D: LFO → panner.pan
  const panner = ctx.createStereoPanner();
  const panRate = s.panRate ?? 0;
  const panDepth = s.panDepth ?? 0;
  let lfo: OscillatorNode | undefined;
  let lfoGain: GainNode | undefined;
  if (panRate > 0 && panDepth > 0) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = panRate;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = panDepth;
    lfo.connect(lfoGain).connect(panner.pan);
    lfo.start();
  }

  // Crackle de vinilo (hiss + pops) mezclado antes del EQ
  const crackleSource = ctx.createBufferSource();
  crackleSource.buffer = getCrackleBuffer(ctx);
  crackleSource.loop = true;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = (s.crackle ?? 0) * 0.5;
  crackleSource.connect(crackleGain).connect(bass);
  crackleSource.start(0);

  source.connect(lowpass);
  lowpass.connect(reverb);
  reverb.connect(bass);
  bass.connect(treble);
  treble.connect(splitter);
  merger.connect(master).connect(panner).connect(dest);

  return {
    source, lowpass, reverb, master, bass, treble, panner,
    widthGains: { ll: gLL, lr: gLR, rl: gRL, rr: gRR },
    splitter, merger,
    crackleSource, crackleGain,
    lfo, lfoGain, panRate, panDepth,
  };
}

/**
 * Aplica nuevos ajustes a una cadena EN EJECUCIÓN sin reiniciarla.
 * Ramps suaves (~40 ms) para evitar clics audibles.
 */
export function liveUpdateGraph(ctx: BaseAudioContext, graph: Graph, s: ReverbSettings): void {
  const t = ctx.currentTime;
  graph.source.playbackRate.setTargetAtTime(s.speed, t, 0.04);
  graph.lowpass.frequency.setTargetAtTime(s.lowpassHz, t, 0.04);
  graph.bass.gain.setTargetAtTime(s.bassDb ?? 0, t, 0.04);
  graph.treble.gain.setTargetAtTime(s.trebleDb ?? 0, t, 0.04);

  const rp = graph.reverb.parameters;
  (rp.get("dry") as AudioParam).setTargetAtTime(1 - s.reverbMix * 0.6, t, 0.04);
  (rp.get("wet") as AudioParam).setTargetAtTime(s.reverbMix, t, 0.04);
  (rp.get("decay") as AudioParam).setTargetAtTime(dattorroDecay(s.decay), t, 0.08);

  graph.master.gain.setTargetAtTime(s.volume, t, 0.04);

  // Ancho estéreo en vivo
  const width = Math.max(0, Math.min(2, s.width ?? 1));
  graph.widthGains.ll.gain.setTargetAtTime(0.5 + 0.5 * width, t, 0.04);
  graph.widthGains.lr.gain.setTargetAtTime(0.5 - 0.5 * width, t, 0.04);
  graph.widthGains.rl.gain.setTargetAtTime(0.5 - 0.5 * width, t, 0.04);
  graph.widthGains.rr.gain.setTargetAtTime(0.5 + 0.5 * width, t, 0.04);

  // Crackle en vivo
  graph.crackleGain.gain.setTargetAtTime((s.crackle ?? 0) * 0.5, t, 0.04);

  // Rotación 8D en vivo
  const rate = s.panRate ?? 0;
  const depth = s.panDepth ?? 0;
  if (rate > 0 && depth > 0) {
    if (graph.lfo && graph.lfoGain) {
      graph.lfo.frequency.setTargetAtTime(rate, t, 0.05);
      graph.lfoGain.gain.setTargetAtTime(depth, t, 0.05);
    } else {
      // Crear LFO sobre la marcha
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain).connect(graph.panner.pan);
      lfo.start();
      graph.lfo = lfo;
      graph.lfoGain = lfoGain;
    }
    graph.panRate = rate;
    graph.panDepth = depth;
  } else if (graph.lfo && graph.lfoGain) {
    graph.lfoGain.gain.setTargetAtTime(0, t, 0.05);
    graph.panDepth = 0;
  }
}

/** Reproductor en tiempo real con controles en vivo */
export class SlowedReverbPlayer {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private buffer: AudioBuffer | null = null;
  /** Últimos ajustes aplicados a la cadena (para reconstruir tras un seek) */
  private settings: ReverbSettings | null = null;
  /** Posición de lectura en el ARCHIVO (segundos fuente) al anclar el reloj */
  private anchorOffset = 0;
  /** ctx.currentTime en el momento del ancla */
  private anchorTime = 0;
  private rate = 1;
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  async load(file: File): Promise<number> {
    await this.stop();
    if (!this.ctx) this.ctx = new AudioContext();
    await ensureReverbWorklet(this.ctx);
    const arr = await file.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arr);
    this.anchorOffset = 0;
    return this.buffer.duration;
  }

  get duration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }


  /** Buffer decodificado (para reusar en el render offline sin re-decodificar) */
  get decodedBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  play(s: ReverbSettings) {
    if (!this.ctx || !this.buffer || this.playing) return;
    void this.ctx.resume();
    if (this.graph) {
      teardownGraph(this.graph);
      this.graph = null;
    }
    this.graph = buildGraph(this.ctx, this.buffer, s, this.ctx.destination);
    this.rate = s.speed;
    const from = Math.min(Math.max(0, this.anchorOffset), Math.max(0, this.buffer.duration - 0.01));
    // Rampa corta para evitar clics al arrancar o tras un seek
    const t0 = this.ctx.currentTime;
    this.graph.master.gain.setValueAtTime(0.0001, t0);
    this.graph.master.gain.exponentialRampToValueAtTime(Math.max(0.0002, s.volume), t0 + 0.04);
    this.graph.source.start(0, from);
    this.anchorOffset = from;
    this.anchorTime = t0;
    this.playing = true;
    this.settings = { ...s };
    this.graph.source.onended = () => {
      if (this.playing) {
        this.playing = false;
        teardownGraph(this.graph);
        this.graph = null;
        this.anchorOffset = 0;
      }
    };
  }

  /**
   * Cambia ajustes EN VIVO durante la reproducción, sin reiniciar.
   * Si aún no suena, no hace falta hacer nada.
   */
  setSettings(s: ReverbSettings) {
    if (!this.ctx || !this.graph || !this.playing) return;
    if (s.speed !== this.rate) {
      // Re-anclar el reloj antes de cambiar la tasa
      this.anchorOffset = this.getOffset();
      this.anchorTime = this.ctx.currentTime;
      this.rate = s.speed;
    }
    liveUpdateGraph(this.ctx, this.graph, s);
    this.settings = { ...s };
  }

  pause() {
    if (!this.ctx || !this.graph || !this.playing) return;
    this.anchorOffset = this.getOffset();
    teardownGraph(this.graph);
    this.graph = null;
    this.playing = false;
  }

  async stop(): Promise<void> {
    this.anchorOffset = 0;
    this.rate = 1;
    if (this.graph) {
      teardownGraph(this.graph);
      this.graph = null;
    }
    this.playing = false;
    if (this.ctx?.state === "running") await this.ctx.suspend().catch(() => {});
  }

  /**
   * Salta a una posición del ARCHIVO (segundos fuente). Si está sonando,
   * reconstruye la cadena en la nueva posición sin clic audible.
   */
  seek(seconds: number) {
    if (!this.buffer) return;
    const target = Math.max(0, Math.min(seconds, this.buffer.duration - 0.01));
    const resume = this.playing && !!this.settings;
    const s = this.settings ? { ...this.settings } : null;
    if (resume) this.pause();
    this.anchorOffset = target;
    if (s && resume) this.play(s);
  }

  /** Posición de lectura actual en segundos FUENTE (0..duration) */
  getOffset(): number {
    if (!this.ctx) return this.anchorOffset;
    return this.playing
      ? this.anchorOffset + (this.ctx.currentTime - this.anchorTime) * this.rate
      : this.anchorOffset;
  }

  dispose() {
    this.pause();
    void this.ctx?.close();
    this.ctx = null;
  }

}

/** Renderiza offline con los ajustes y devuelve un AudioBuffer final */
export async function renderSlowedReverb(
  buffer: AudioBuffer,
  s: ReverbSettings
): Promise<AudioBuffer> {
  const tail = s.reverbMix > 0 ? s.decay + 0.3 : 0.2;
  const outDuration = buffer.duration / s.speed + tail;
  const sr = buffer.sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil(outDuration * sr), sr);
  await ensureReverbWorklet(offline);
  const graph = buildGraph(offline, buffer, s, offline.destination);
  graph.source.start(0);
  return offline.startRendering();
}

/** Codifica un AudioBuffer a WAV PCM 16-bit */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  let maxPeak = 0;
  for (let c = 0; c < numCh; c++) {
    const data = buffer.getChannelData(c);
    channels.push(data);
    for (let i = 0; i < len; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  const gain = maxPeak > 0 && maxPeak < 0.95 ? 0.95 / maxPeak : 1;

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = channels[c][i] * gain;
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
