/**
 * Seinen Manga SFX Sound Library & Audio Synthesizer Engine
 * Specialized audio effects for dark fantasy, samurai, high-altitude climbing,
 * and viking anime/manga (Berserk, Vagabond, The Climber, Vinland Saga).
 * Includes 100% offline Web Audio synthesizer + local audio samples + custom uploads.
 */

export interface SeinenSfxItem {
  id: string;
  name: string;
  category: "ambience" | "berserk" | "vagabond" | "climber" | "vinland" | "manga" | "custom";
  categoryLabel: string;
  icon: string;
  desc: string;
  defaultGain: number; // 0..2
  assetFile?: string;
  synthesizer?: (ctx: BaseAudioContext, destination: AudioNode, gain: number, startTime?: number) => void;
}

export interface LoopSfxCue {
  id: string;
  sfxId: string;
  time: number;       // Absolute time on the exported video (seconds)
  volume: number;     // 0.0 .. 2.0 (1.0 = default)
  name?: string;
  targetFormat?: "all" | "16x9" | "9x16";
  customBuffer?: AudioBuffer | null;
  customFileName?: string;
  /** If true, fire again every source-clip cycle. Default: once on the export timeline. */
  repeatEachCycle?: boolean;
}

export const SEINEN_SFX_CATEGORIES = [
  { id: "all", label: "🔥 Todos los SFX & Ambientes", icon: "✨" },
  { id: "ambience", label: "🌧️ Ambientes (Lluvia, Fuego, Vinilo)", icon: "🌧️" },
  { id: "berserk", label: "🌑 Berserk (Dark Fantasy & Metal)", icon: "🗡️" },
  { id: "vagabond", label: "🎋 Vagabond (Samurái Zen & Katana)", icon: "⚔️" },
  { id: "climber", label: "🏔️ The Climber (Viento & Nieve)", icon: "❄️" },
  { id: "vinland", label: "🪓 Vinland Saga (Nórdico & Trueno)", icon: "🛡️" },
  { id: "manga", label: "📖 Manga Impact & 'DON'", icon: "💥" },
] as const;

// Curated Catalog of Seinen SFX with high-fidelity procedural Web Audio synthesis
export const SEINEN_SFX_CATALOG: SeinenSfxItem[] = [
  // ==================== AMBIENT TEXTURES & LOOPS ====================
  {
    id: "ambience_rain",
    name: "Lluvia Cinemática en Ventana",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "🌧️",
    desc: "Gotas de lluvia suaves y melancólicas para atmósferas nocturnas.",
    defaultGain: 0.85,
    assetFile: "rain.mp3",
  },
  {
    id: "ambience_campfire",
    name: "Fogata Nocturna & Brasas",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "🔥",
    desc: "Crujido cálido de leña y brasas ardiendo en la soledad.",
    defaultGain: 0.9,
    assetFile: "camp_fire.mp3",
  },
  {
    id: "ambience_night",
    name: "Noche Fría & Grillos",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "🌌",
    desc: "Brisa helada y sonido de grillos en la madrugada solitaria.",
    defaultGain: 0.8,
    assetFile: "Cold_night.mp3",
  },
  {
    id: "ambience_sea",
    name: "Olas de Mar Melancólicas",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "🌊",
    desc: "Marea suave rompiendo en la orilla a lo lejos.",
    defaultGain: 0.85,
    assetFile: "sea.mp3",
  },
  {
    id: "ambience_bamboo",
    name: "Viento en Bambuzal Zen",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "🎋",
    desc: "Susurro de cañas de bambú y aire fresco tradicional japonés.",
    defaultGain: 0.8,
    assetFile: "bamboo.mp3",
  },
  {
    id: "ambience_thunder",
    name: "Tormenta de Trueno Profundo",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "⛈️",
    desc: "Retumbar lejano de truenos con lluvia envolvente.",
    defaultGain: 0.85,
    assetFile: "thunder.mp3",
  },
  {
    id: "ambience_wind",
    name: "Viento Suave en la Cresta",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "💨",
    desc: "Silbido de viento continuo y solitario de alta montaña.",
    defaultGain: 0.8,
    assetFile: "wind.mp3",
  },
  {
    id: "ambience_peaceful",
    name: "Santuario de Paz & Sosiego",
    category: "ambience",
    categoryLabel: "Ambiente",
    icon: "🍃",
    desc: "Atmósfera tranquila de campo y naturaleza para concentración.",
    defaultGain: 0.75,
    assetFile: "paceful.mp3",
  },
  // ==================== BERSERK / DARK FANTASY ====================
  {
    id: "berserk_dragonslayer_clang",
    name: "Dragonslayer Heavy Clang",
    category: "berserk",
    categoryLabel: "Berserk",
    icon: "🗡️",
    desc: "Impacto metálico colosal, pesado y resonante de espada gigante.",
    defaultGain: 0.9,
    assetFile: "dragonslayer_clang.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // Low sub boom
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
      oscGain.gain.setValueAtTime(gain * 0.9, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(oscGain);
      oscGain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.85);

      // High metallic ring harmonics (inharmonic metal spectrum)
      const freqs = [380, 720, 1140, 1920, 3100];
      freqs.forEach((f, idx) => {
        const ringOsc = ctx.createOscillator();
        const ringGain = ctx.createGain();
        ringOsc.type = "sine";
        ringOsc.frequency.setValueAtTime(f, now);
        const decay = 1.2 + idx * 0.3;
        ringGain.gain.setValueAtTime((gain * 0.4) / (idx + 1), now);
        ringGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        ringOsc.connect(ringGain);
        ringGain.connect(dest);
        ringOsc.start(now);
        ringOsc.stop(now + decay + 0.05);
      });

      // White noise transient punch
      createNoiseBurst(ctx, dest, now, 0.08, gain * 0.7, 1800);
    },
  },
  {
    id: "berserk_dark_bell",
    name: "Ominous Dark Bell",
    category: "berserk",
    categoryLabel: "Berserk",
    icon: "🔔",
    desc: "Tañido sombrío de campana de fatalidad y eclipse.",
    defaultGain: 0.8,
    assetFile: "dark_bell.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      const bellFreqs = [180, 362, 548, 890, 1420];
      bellFreqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now);
        const dur = 2.4 - i * 0.3;
        g.gain.setValueAtTime((gain * 0.45) / (i + 1), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + dur + 0.1);
      });
    },
  },
  {
    id: "berserk_heartbeat",
    name: "Tense Heartbeat Pulse",
    category: "berserk",
    categoryLabel: "Berserk",
    icon: "💓",
    desc: "Latido grave y claustrofóbico de tensión extrema.",
    defaultGain: 1.0,
    assetFile: "heartbeat.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // Dub 1
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(80, now);
      osc1.frequency.exponentialRampToValueAtTime(35, now + 0.18);
      g1.gain.setValueAtTime(gain * 0.85, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(g1);
      g1.connect(dest);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Dub 2 (second beat of heart)
      const t2 = now + 0.14;
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(70, t2);
      osc2.frequency.exponentialRampToValueAtTime(30, t2 + 0.22);
      g2.gain.setValueAtTime(gain * 0.65, t2);
      g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.26);
      osc2.connect(g2);
      g2.connect(dest);
      osc2.start(t2);
      osc2.stop(t2 + 0.3);
    },
  },
  {
    id: "berserk_sword_whoosh",
    name: "Heavy Blade Cleave",
    category: "berserk",
    categoryLabel: "Berserk",
    icon: "🌪️",
    desc: "Corte y silbido masivo de aire por espada gigante.",
    defaultGain: 0.85,
    assetFile: "sword_whoosh.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      createWhoosh(ctx, dest, now, 0.45, gain * 0.9, 120, 1800);
    },
  },
  {
    id: "berserk_armor_rattle",
    name: "Iron Armor Clatter",
    category: "berserk",
    categoryLabel: "Berserk",
    icon: "⛓️",
    desc: "Traqueteo de placas de hierro y cota de malla en movimiento.",
    defaultGain: 0.75,
    assetFile: "armor_rattle.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const offset = now + i * 0.05 + Math.random() * 0.02;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1200 + Math.random() * 800, offset);
        g.gain.setValueAtTime(gain * 0.25, offset);
        g.gain.exponentialRampToValueAtTime(0.001, offset + 0.08);
        osc.connect(g);
        g.connect(dest);
        osc.start(offset);
        osc.stop(offset + 0.09);
      }
    },
  },

  // ==================== VAGABOND / SAMURAI ZEN ====================
  {
    id: "vagabond_katana_draw",
    name: "Katana Iaijutsu Unsheathe",
    category: "vagabond",
    categoryLabel: "Vagabond",
    icon: "🎋",
    desc: "Desenvaine ultrarrápido con brillo y fricción metálica.",
    defaultGain: 0.85,
    assetFile: "katana_draw.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // High sliding ring
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(3200, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(2400, now + 0.6);
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(gain * 0.6, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.7);

      createNoiseBurst(ctx, dest, now, 0.12, gain * 0.45, 4500);
    },
  },
  {
    id: "vagabond_sword_parry",
    name: "Steel Blade Clash & Spark",
    category: "vagabond",
    categoryLabel: "Vagabond",
    icon: "⚔️",
    desc: "Bloqueo seco y chispazo de dos filos de acero fino.",
    defaultGain: 0.8,
    assetFile: "sword_parry.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      [2200, 3150, 4800].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now);
        const decay = 0.5 + idx * 0.2;
        g.gain.setValueAtTime((gain * 0.4) / (idx + 1), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + decay + 0.05);
      });
      createNoiseBurst(ctx, dest, now, 0.04, gain * 0.6, 6000);
    },
  },
  {
    id: "vagabond_bamboo_drop",
    name: "Bamboo Water Drop (Shishi-odoshi)",
    category: "vagabond",
    categoryLabel: "Vagabond",
    icon: "🎋",
    desc: "Golpe de bambú tradicional japonés y eco de gota de agua.",
    defaultGain: 0.9,
    assetFile: "bamboo_drop.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // Wood click
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
      g.gain.setValueAtTime(gain * 0.8, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.15);

      // Water droplet pitch curve
      const dropOsc = ctx.createOscillator();
      const dropG = ctx.createGain();
      dropOsc.type = "sine";
      dropOsc.frequency.setValueAtTime(900, now + 0.1);
      dropOsc.frequency.exponentialRampToValueAtTime(1800, now + 0.22);
      dropG.gain.setValueAtTime(gain * 0.45, now + 0.1);
      dropG.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      dropOsc.connect(dropG);
      dropG.connect(dest);
      dropOsc.start(now + 0.1);
      dropOsc.stop(now + 0.38);
    },
  },
  {
    id: "vagabond_zen_breath",
    name: "Deep Samurai Exhale",
    category: "vagabond",
    categoryLabel: "Vagabond",
    icon: "🧘",
    desc: "Exhalación serena de concentración antes del golpe.",
    defaultGain: 0.75,
    assetFile: "zen_breath.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      createWhoosh(ctx, dest, now, 0.9, gain * 0.4, 400, 900);
    },
  },

  // ==================== THE CLIMBER / KOKOU NO HITO ====================
  {
    id: "climber_ice_axe",
    name: "Ice Axe Pick Strike",
    category: "climber",
    categoryLabel: "The Climber",
    icon: "⛏️",
    desc: "Impacto seco y crujiente de piolet clavándose en hielo duro.",
    defaultGain: 0.9,
    assetFile: "ice_axe.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // High crystalline crunch
      createNoiseBurst(ctx, dest, now, 0.09, gain * 0.8, 5500);
      // Metal thud
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
      g.gain.setValueAtTime(gain * 0.65, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.16);
    },
  },
  {
    id: "climber_blizzard",
    name: "High Altitude Blizzard Gale",
    category: "climber",
    categoryLabel: "The Climber",
    icon: "❄️",
    desc: "Aullido helado de viento blanco en la cresta de la montaña.",
    defaultGain: 0.8,
    assetFile: "blizzard.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      createWhoosh(ctx, dest, now, 1.6, gain * 0.65, 300, 1600);
    },
  },
  {
    id: "climber_heavy_breath",
    name: "Thin Air Exhausted Breath",
    category: "climber",
    categoryLabel: "The Climber",
    icon: "💨",
    desc: "Respiración jadeante y congelada en zona de la muerte.",
    defaultGain: 0.85,
    assetFile: "heavy_breath.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      createWhoosh(ctx, dest, now, 0.6, gain * 0.45, 350, 850);
      createWhoosh(ctx, dest, now + 0.7, 0.8, gain * 0.55, 250, 700);
    },
  },
  {
    id: "climber_rock_crumble",
    name: "Rock Debris Crumble",
    category: "climber",
    categoryLabel: "The Climber",
    icon: "🪨",
    desc: "Desprendimiento de grava y piedras cayendo por el abismo.",
    defaultGain: 0.75,
    assetFile: "rock_crumble.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const offset = now + i * 0.08 + Math.random() * 0.04;
        createNoiseBurst(ctx, dest, offset, 0.06, gain * (0.4 - i * 0.04), 1400 + Math.random() * 800);
      }
    },
  },

  // ==================== VINLAND SAGA / NORDIC EPIC ====================
  {
    id: "vinland_war_horn",
    name: "Viking Lur War Horn",
    category: "vinland",
    categoryLabel: "Vinland Saga",
    icon: "📯",
    desc: "Llamada profunda y épica de cuerno de guerra nórdico.",
    defaultGain: 0.9,
    assetFile: "war_horn.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      const baseFreq = 165; // E3
      [1, 2, 3, 4].forEach((harmonic) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = harmonic % 2 === 1 ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(baseFreq * harmonic, now);
        osc.frequency.linearRampToValueAtTime(baseFreq * harmonic * 1.02, now + 0.8);
        osc.frequency.linearRampToValueAtTime(baseFreq * harmonic, now + 1.8);
        g.gain.setValueAtTime(0.01, now);
        g.gain.linearRampToValueAtTime((gain * 0.35) / harmonic, now + 0.3);
        g.gain.setValueAtTime((gain * 0.3) / harmonic, now + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 2.1);
      });
    },
  },
  {
    id: "vinland_shield_bash",
    name: "Wooden Shield Heavy Impact",
    category: "vinland",
    categoryLabel: "Vinland Saga",
    icon: "🛡️",
    desc: "Golpe contundente de hacha contra escudo de madera de roble.",
    defaultGain: 0.95,
    assetFile: "shield_bash.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // Heavy wood crack & thud
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
      g.gain.setValueAtTime(gain * 0.8, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.3);

      createNoiseBurst(ctx, dest, now, 0.1, gain * 0.7, 1200);
    },
  },
  {
    id: "vinland_thunder_rain",
    name: "Rolling Distant Thunder",
    category: "vinland",
    categoryLabel: "Vinland Saga",
    icon: "⛈️",
    desc: "Trueno retumbante y tormenta sobre fiordos nórdicos.",
    defaultGain: 0.85,
    assetFile: "thunder.mp3",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      createThunder(ctx, dest, now, gain);
    },
  },

  // ==================== MANGA IMPACT / CINEMATIC ====================
  {
    id: "manga_don_impact",
    name: "Dramatic Manga 'DON' Boom",
    category: "manga",
    categoryLabel: "Manga FX",
    icon: "💥",
    desc: "Impacto colosal de página doble 'DON' que sacude la viñeta.",
    defaultGain: 1.0,
    assetFile: "manga_don.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      // Sub boom
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);
      g.gain.setValueAtTime(gain * 1.0, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.7);

      createNoiseBurst(ctx, dest, now, 0.15, gain * 0.8, 800);
    },
  },
  {
    id: "manga_page_turn",
    name: "Crisp Manga Page Swipe",
    category: "manga",
    categoryLabel: "Manga FX",
    icon: "📖",
    desc: "Paso de página limpio, rápido y crujiente de tomo impreso.",
    defaultGain: 0.7,
    assetFile: "manga_page.wav",
    synthesizer: (ctx, dest, gain, startTime) => {
      const now = startTime ?? ctx.currentTime;
      createWhoosh(ctx, dest, now, 0.25, gain * 0.5, 900, 3500);
    },
  },
];

/** Biblioteca corta mostrada en Dual Studio. El catálogo completo se conserva para
 * proyectos legacy y para poder reproducir cues ya guardados. */
export const CURATED_SFX_IDS = [
  "berserk_sword_whoosh",
  "berserk_dragonslayer_clang",
  "vagabond_katana_draw",
  "vagabond_sword_parry",
  "manga_don_impact",
  "vinland_war_horn",
  "ambience_rain",
  "ambience_thunder",
  "ambience_wind",
  "ambience_campfire",
] as const;

const curatedSfxIdSet = new Set<string>(CURATED_SFX_IDS);
export const CURATED_SFX_CATALOG = SEINEN_SFX_CATALOG.filter((item) =>
  curatedSfxIdSet.has(item.id)
);

export const CURATED_SFX_CATEGORIES = [
  { id: "all", label: "Todos", icon: "✨" },
  { id: "ambience", label: "Ambientes", icon: "🌧️" },
  { id: "berserk", label: "Espada pesada", icon: "🗡️" },
  { id: "vagabond", label: "Katana", icon: "⚔️" },
  { id: "vinland", label: "Nórdico", icon: "🛡️" },
  { id: "manga", label: "Impacto", icon: "💥" },
] as const;

// Helper: Synthesize noise burst
function createNoiseBurst(
  ctx: BaseAudioContext,
  dest: AudioNode,
  startTime: number,
  duration: number,
  gainVal: number,
  filterFreq: number
) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFreq, startTime);
  filter.Q.setValueAtTime(1.5, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainVal, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  noise.start(startTime);
  noise.stop(startTime + duration + 0.01);
}

// Helper: Synthesize whoosh
function createWhoosh(
  ctx: BaseAudioContext,
  dest: AudioNode,
  startTime: number,
  duration: number,
  gainVal: number,
  startFreq: number,
  peakFreq: number
) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.setValueAtTime(2.0, startTime);
  filter.frequency.setValueAtTime(startFreq, startTime);
  filter.frequency.exponentialRampToValueAtTime(peakFreq, startTime + duration * 0.4);
  filter.frequency.exponentialRampToValueAtTime(startFreq * 0.8, startTime + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(gainVal, startTime + duration * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  noise.start(startTime);
  noise.stop(startTime + duration + 0.01);
}

// Helper: Synthesize rolling thunder
function createThunder(ctx: BaseAudioContext, dest: AudioNode, startTime: number, gainVal: number) {
  const sampleRate = ctx.sampleRate;
  const duration = 2.4;
  const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (last + 0.02 * white) / 1.02; // Brown noise
    last = data[i];
    data[i] *= 3.5;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(250, startTime);
  filter.frequency.exponentialRampToValueAtTime(80, startTime + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.01, startTime);
  gain.gain.linearRampToValueAtTime(gainVal * 0.8, startTime + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

// In-memory audio buffer cache for zero-latency audio playback
const sfxBufferCache = new Map<string, AudioBuffer>();

/**
 * Load and decode an audio sample from /sfx/ with persistent in-memory caching
 */
export async function loadSfxBuffer(
  ctx: BaseAudioContext,
  assetFile: string
): Promise<AudioBuffer | null> {
  if (sfxBufferCache.has(assetFile)) {
    return sfxBufferCache.get(assetFile)!;
  }
  try {
    const res = await fetch(`/sfx/${encodeURIComponent(assetFile)}?v=real3`);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    sfxBufferCache.set(assetFile, audioBuf);
    return audioBuf;
  } catch (err) {
    console.warn(`Could not load /sfx/${assetFile}:`, err);
    return null;
  }
}

/**
 * Preload all catalog audio files for instant playback
 */
export async function preloadAllSfx(ctx: BaseAudioContext): Promise<void> {
  const promises = SEINEN_SFX_CATALOG.filter((s) => s.assetFile).map((s) =>
    loadSfxBuffer(ctx, s.assetFile!)
  );
  await Promise.allSettled(promises);
}

/** Precarga ligera usada por Dual Studio; deja el catálogo legacy bajo demanda. */
export async function preloadCuratedSfx(ctx: BaseAudioContext): Promise<void> {
  const promises = CURATED_SFX_CATALOG.filter((item) => item.assetFile).map((item) =>
    loadSfxBuffer(ctx, item.assetFile!)
  );
  await Promise.allSettled(promises);
}

// Active preview source tracker to cancel overlapping sounds
let activePreviewSourceNode: AudioBufferSourceNode | null = null;

/**
 * Stop any active test preview sound immediately
 */
export function stopActiveSfxPreview(): void {
  if (activePreviewSourceNode) {
    try {
      activePreviewSourceNode.stop();
      activePreviewSourceNode.disconnect();
    } catch {
      // already stopped
    }
    activePreviewSourceNode = null;
  }
}

/**
 * Play a specific SFX cue instantly in live AudioContext (using authentic audio files or synth)
 */
export async function playSeinenSfxCue(
  ctx: AudioContext,
  cue: LoopSfxCue,
  masterGainNode?: AudioNode,
  isExclusivePreview: boolean = false
): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }

  if (isExclusivePreview) {
    stopActiveSfxPreview();
  }

  const targetDest = masterGainNode || ctx.destination;

  // 1. If cue has custom uploaded AudioBuffer
  if (cue.customBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = cue.customBuffer;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, cue.volume);
    src.connect(g);
    g.connect(targetDest);
    if (isExclusivePreview) activePreviewSourceNode = src;
    src.start();
    return;
  }

  const sfxItem = SEINEN_SFX_CATALOG.find((s) => s.id === cue.sfxId);
  if (!sfxItem) return;

  const gain = Math.max(0, cue.volume * sfxItem.defaultGain);

  // 2. Play authentic audio sample if available
  if (sfxItem.assetFile) {
    const buf = await loadSfxBuffer(ctx, sfxItem.assetFile);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(targetDest);
      if (isExclusivePreview) activePreviewSourceNode = src;
      src.start();
      return;
    }
  }

  // 3. Fallback to procedural synthesizer
  if (sfxItem.synthesizer) {
    sfxItem.synthesizer(ctx, targetDest, gain);
  }
}

async function startCueAt(
  offlineCtx: OfflineAudioContext,
  destination: AudioNode,
  cue: LoopSfxCue,
  triggerTime: number
) {
  if (cue.customBuffer) {
    const src = offlineCtx.createBufferSource();
    src.buffer = cue.customBuffer;
    const g = offlineCtx.createGain();
    g.gain.value = Math.max(0, cue.volume);
    src.connect(g);
    g.connect(destination);
    src.start(triggerTime);
    return;
  }

  const item = SEINEN_SFX_CATALOG.find((s) => s.id === cue.sfxId);
  if (!item) return;

  let handled = false;
  if (item.assetFile) {
    const buf = await loadSfxBuffer(offlineCtx, item.assetFile);
    if (buf) {
      const src = offlineCtx.createBufferSource();
      src.buffer = buf;
      const g = offlineCtx.createGain();
      g.gain.value = cue.volume * item.defaultGain;
      src.connect(g);
      g.connect(destination);
      src.start(triggerTime);
      handled = true;
    }
  }
  if (!handled && item.synthesizer) {
    const scheduledGain = offlineCtx.createGain();
    scheduledGain.gain.value = 1;
    scheduledGain.connect(destination);
    item.synthesizer(offlineCtx, scheduledGain, cue.volume * item.defaultGain, triggerTime);
  }
}

function cueTriggerTimes(cue: LoopSfxCue, loopDuration: number, totalExportDuration: number): number[] {
  if (cue.repeatEachCycle && loopDuration > 0.1) {
    const times: number[] = [];
    const n = Math.max(1, Math.ceil(totalExportDuration / loopDuration));
    for (let cycle = 0; cycle < n; cycle++) {
      const t = cycle * loopDuration + cue.time;
      if (t >= 0 && t < totalExportDuration) times.push(t);
    }
    return times;
  }
  if (cue.time >= 0 && cue.time < totalExportDuration) return [cue.time];
  return [];
}

/**
 * Mix SFX into an OfflineAudioContext for MP4 export.
 * Default: one-shot at absolute export time. Optional repeatEachCycle tiles with the source clip.
 */
export async function renderSfxCuesToOffline(
  offlineCtx: OfflineAudioContext,
  destination: AudioNode,
  cues: LoopSfxCue[],
  loopDuration: number,
  totalExportDuration: number,
  targetFormatFilter?: "16x9" | "9x16"
) {
  const filteredCues = targetFormatFilter
    ? cues.filter((c) => !c.targetFormat || c.targetFormat === "all" || c.targetFormat === targetFormatFilter)
    : cues;

  if (!filteredCues.length || totalExportDuration <= 0.1) {
    return;
  }

  for (const cue of filteredCues) {
    const times = cueTriggerTimes(cue, loopDuration, totalExportDuration);
    for (const triggerTime of times) {
      await startCueAt(offlineCtx, destination, cue, triggerTime);
    }
  }
}
