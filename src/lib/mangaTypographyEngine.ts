/**
 * Manga Typography & Japanese Translation Engine
 * Authentic vertical/horizontal manga speech bubbles, onomatopoeias (SFX),
 * Japanese translation dictionary, and customizable anime subtitle panels.
 */

export type BubbleType =
  | "vertical_sfx"       // Free vertical Japanese katakana/kanji SFX with heavy outline
  | "shonen_spikes"      // Explosive jagged shout/combat bubble
  | "classic_speech"     // Smooth manga dialogue bubble with direction tail
  | "thought_cloud"      // Thought bubble cloud
  | "narration_box"      // Square dark/light seinen narration caption box
  | "anime_subtitle";    // Stylized bottom anime subtitle with Japanese + translation

export type TextDepthPlane =
  | "always_visible"    // Visible all the time
  | "camera_far_apex"   // Appears when camera is in farthest / deepest plane
  | "camera_close_apex" // Appears when camera zooms in close
  | "timed_window";     // Appears during custom time window

export type TextEntranceEffect =
  | "none"
  | "manga_slash_in"    // Dramatic diagonal slash slice into view with anime flash
  | "shonen_impact"     // Explosive zoom from 3.0x -> 1.0x with hitstop
  | "ink_reveal"        // Ink bleeding expand from center
  | "depth_plane_fade"; // Smooth depth plane appearance

export interface MangaTextItem {
  id: string;
  type: BubbleType;
  text: string;               // Main text (Japanese / Kanji / Katakana / Spanish / English)
  subText?: string;          // Translation or Romaji subtext
  x: number;                 // Normalized 0..1 (Canvas X)
  y: number;                 // Normalized 0..1 (Canvas Y)
  scale: number;             // Scale factor (0.5 .. 3.0)
  rotation: number;          // Degrees (-180 .. 180)
  fontSize: number;          // Base font size (18 .. 72)
  textColor: string;         // Font fill color
  strokeColor: string;       // Outline border color
  strokeWidth: number;       // Outline thickness
  bgColor?: string;          // Background fill for speech bubbles
  tailX?: number;            // Normalized tail direction X for speech bubbles
  tailY?: number;            // Normalized tail direction Y for speech bubbles
  pulseType?: "none" | "rumble_shake" | "zoom_heartbeat" | "subtle_float";

  // Depth Plane & Anime Entrance Transitions
  depthPlane?: TextDepthPlane;
  entranceEffect?: TextEntranceEffect;
  appearTime?: number;       // Seconds into video when text bursts in
  durationSec?: number;      // Duration in seconds text stays active
}

// Curated Japanese Manga Onomatopoeia & Sound Effect Dictionary
export interface MangaSfxDictionaryEntry {
  kana: string;
  romaji: string;
  meaningEs: string;
  meaningEn: string;
  category: "combate" | "tension" | "movimiento" | "emocion" | "ambiente" | "impacto";
  defaultColor: string;
  recommendedType: BubbleType;
}

export const MANGA_SFX_DICTIONARY: MangaSfxDictionaryEntry[] = [
  // Combate / Katana
  { kana: "斬ッ", romaji: "ZATT", meaningEs: "Corte de katana limpio", meaningEn: "Clean sword slash", category: "combate", defaultColor: "#ffffff", recommendedType: "vertical_sfx" },
  { kana: "キィン", romaji: "KIIN", meaningEs: "Choque de espadas metalico", meaningEn: "Metal blade clash", category: "combate", defaultColor: "#38bdf8", recommendedType: "shonen_spikes" },
  { kana: "シュッ", romaji: "SHUTT", meaningEs: "Tajo rapido en el aire", meaningEn: "Swift blade swing", category: "combate", defaultColor: "#facc15", recommendedType: "vertical_sfx" },
  { kana: "スパッ", romaji: "SUPATT", meaningEs: "Corte perfecto y veloz", meaningEn: "Sharp clean slice", category: "combate", defaultColor: "#ffffff", recommendedType: "vertical_sfx" },
  
  // Tension / Amenaza
  { kana: "ゴゴゴ", romaji: "GOGOGO", meaningEs: "Presencia imponente / Tension", meaningEn: "Menacing aura / Rumble", category: "tension", defaultColor: "#ffffff", recommendedType: "vertical_sfx" },
  { kana: "ドドド", romaji: "DODODO", meaningEs: "Latido intenso / Amenaza pesada", meaningEn: "Heavy footsteps / Dread", category: "tension", defaultColor: "#f43f5e", recommendedType: "vertical_sfx" },
  { kana: "ズズズ", romaji: "ZUZUZU", meaningEs: "Presion aplastante de poder", meaningEn: "Crushing energy pressure", category: "tension", defaultColor: "#c084fc", recommendedType: "vertical_sfx" },
  { kana: "ギラッ", romaji: "GIRATT", meaningEs: "Mirada afilada y penetrante", meaningEn: "Sharp lethal glare", category: "tension", defaultColor: "#ef4444", recommendedType: "vertical_sfx" },

  // Movimiento / Velocidad
  { kana: "ザッ", romaji: "ZAZZ", meaningEs: "Paso firme / Aterrizaje ninja", meaningEn: "Swift footstep / Dash", category: "movimiento", defaultColor: "#ffffff", recommendedType: "vertical_sfx" },
  { kana: "バッ", romaji: "BAHH", meaningEs: "Aparicion repentina / Salto", meaningEn: "Sudden emergence / Leap", category: "movimiento", defaultColor: "#38bdf8", recommendedType: "shonen_spikes" },
  { kana: "シュバッ", romaji: "SHUBAHH", meaningEs: "Desplazamiento a super velocidad", meaningEn: "Instant speed blitz", category: "movimiento", defaultColor: "#facc15", recommendedType: "vertical_sfx" },
  { kana: "ダッ", romaji: "DATT", meaningEs: "Arranque en carrera explosiva", meaningEn: "Sudden sprint", category: "movimiento", defaultColor: "#ffffff", recommendedType: "shonen_spikes" },

  // Impacto / Explosion
  { kana: "ドンッ", romaji: "DONN", meaningEs: "Impacto seco monumental", meaningEn: "Massive dry impact", category: "impacto", defaultColor: "#ffffff", recommendedType: "shonen_spikes" },
  { kana: "ドォン", romaji: "DOOON", meaningEs: "Explosion masiva resonante", meaningEn: "Huge explosion roar", category: "impacto", defaultColor: "#f97316", recommendedType: "shonen_spikes" },
  { kana: "バキッ", romaji: "BAKITT", meaningEs: "Fractura / Golpe demoledor", meaningEn: "Bone crack / Heavy smash", category: "impacto", defaultColor: "#ef4444", recommendedType: "shonen_spikes" },
  { kana: "ガッ", romaji: "GATT", meaningEs: "Bloqueo contundente de golpe", meaningEn: "Heavy shield / Block", category: "impacto", defaultColor: "#ffffff", recommendedType: "shonen_spikes" },

  // Emocion / Respiracion
  { kana: "ハッ", romaji: "HATT", meaningEs: "Inspiracion subita / Asombro", meaningEn: "Sudden breath / Realization", category: "emocion", defaultColor: "#ffffff", recommendedType: "classic_speech" },
  { kana: "フッ", romaji: "FUH", meaningEs: "Sonrisa confiada / Resoplido", meaningEn: "Smug exhale / Chuckle", category: "emocion", defaultColor: "#a1a1aa", recommendedType: "classic_speech" },
  { kana: "クッ", romaji: "KUH", meaningEs: "Resistencia al dolor / Rabia", meaningEn: "Grit teeth / Pain struggle", category: "emocion", defaultColor: "#f87171", recommendedType: "shonen_spikes" },

  // Ambiente / Naturaleza
  { kana: "サァァ", romaji: "SAAAA", meaningEs: "Viento entre hojas de bambu", meaningEn: "Wind rustling bamboo", category: "ambiente", defaultColor: "#e4e4e7", recommendedType: "narration_box" },
  { kana: "ポタッ", romaji: "POTATT", meaningEs: "Gota de sangre o lluvia cayendo", meaningEn: "Blood or rain droplet", category: "ambiente", defaultColor: "#f43f5e", recommendedType: "narration_box" },
  { kana: "シィン", romaji: "SHIIN", meaningEs: "Silencio sepulcral / Tension mortal", meaningEn: "Absolute deathly silence", category: "ambiente", defaultColor: "#71717a", recommendedType: "narration_box" },
];

// Anime Quotes & Phrases Dictionary
export interface AnimePhraseEntry {
  japanese: string;
  romaji: string;
  spanish: string;
  english: string;
  source?: string;
}

export const ANIME_PHRASES: AnimePhraseEntry[] = [
  { japanese: "武士道とは死ぬことと見つけたり", romaji: "Bushidō to wa shinu koto to mitsuketari", spanish: "El camino del samurai se halla en la muerte", english: "The way of the samurai is found in death", source: "Hagakure / Vagabond" },
  { japanese: "我が刃に断てぬものなし", romaji: "Waga yaiba ni tatenu mono nashi", spanish: "No hay nada que mi espada no pueda cortar", english: "There is nothing my blade cannot sever", source: "Samurai Vibe" },
  { japanese: "月牙天衝", romaji: "Getsuga Tenshō", spanish: "Colmillo Lunar que Perfora los Cielos", english: "Moon Fang Heaven-Piercer", source: "Bleach" },
  { japanese: "卍解", romaji: "Bankai", spanish: "Liberacion Final", english: "Final Release", source: "Bleach" },
  { japanese: "領域展開", romaji: "Ryōiki Tenkai", spanish: "Expansion de Dominio", english: "Domain Expansion", source: "Jujutsu Kaisen" },
  { japanese: "決して諦めない、それが私の忍道だ", romaji: "Kesshite akiramenai, sore ga watashi no nindō da", spanish: "¡Nunca me rendire, ese es mi camino!", english: "I will never give up, that is my way!", source: "Shonen Spirit" },
  { japanese: "戦え、戦わなければ勝てない", romaji: "Tatakae, tatakawanakereba katenai", spanish: "Lucha. Si no luchas, no puedes ganar", english: "Fight. If you don't fight, you can't win", source: "Attack on Titan" },
  { japanese: "全てを捨ててでも、前へ進め", romaji: "Subete o sutete demo, mae e susume", spanish: "Incluso si debes dejarlo todo atras, avanza", english: "Even if you lose everything, move forward", source: "Berserk Vibe" },
  { japanese: "お前はもう死んでいる", romaji: "Omae wa mō shinde iru", spanish: "Tu ya estas muerto", english: "You are already dead", source: "Fist of the North Star" },
  { japanese: "己の限界を超えろ", romaji: "Onore no genkai o koero", spanish: "Supera tus propios limites", english: "Surpass your limits right here", source: "Black Clover" },
  { japanese: "全集中・水の呼吸", romaji: "Zen Shūchū: Mizu no Kokyū", spanish: "Concentracion Total: Respiracion del Agua", english: "Total Concentration: Water Breathing", source: "Demon Slayer" },
  { japanese: "心の火を燃やせ", romaji: "Kokoro no hi o moyase", spanish: "¡Enciende el fuego en tu corazon!", english: "Set your heart ablaze!", source: "Demon Slayer" },
];

/**
 * Intelligent Phrase & Term Matcher / Translator
 * Translates keywords or common Spanish/English words into Japanese Kanji/Kana with Romaji.
 */
export function translateToJapaneseManga(input: string): { japanese: string; romaji: string; translation: string } {
  const trimmed = input.trim().toLowerCase();

  // Exact phrase search
  for (const p of ANIME_PHRASES) {
    if (
      p.spanish.toLowerCase().includes(trimmed) ||
      p.english.toLowerCase().includes(trimmed) ||
      p.romaji.toLowerCase().includes(trimmed) ||
      p.japanese.includes(trimmed)
    ) {
      return { japanese: p.japanese, romaji: p.romaji, translation: p.spanish };
    }
  }

  // SFX search
  for (const sfx of MANGA_SFX_DICTIONARY) {
    if (
      sfx.meaningEs.toLowerCase().includes(trimmed) ||
      sfx.meaningEn.toLowerCase().includes(trimmed) ||
      sfx.romaji.toLowerCase() === trimmed ||
      sfx.kana === trimmed
    ) {
      return { japanese: sfx.kana, romaji: sfx.romaji, translation: sfx.meaningEs };
    }
  }

  // Keyword lookup table
  const keywordMap: Record<string, { ja: string; ro: string; es: string }> = {
    "camino del samurai": { ja: "武士道", ro: "Bushidō", es: "El camino del samurái" },
    "camino": { ja: "道", ro: "Michi", es: "Camino / Senda" },
    "samurai": { ja: "侍", ro: "Samurai", es: "Samurái / Guerrero" },
    "guerrero": { ja: "戦士", ro: "Senshi", es: "Guerrero" },
    "respiracion de fuego": { ja: "炎の呼吸", ro: "Honō no Kokyū", es: "Respiración de Fuego" },
    "respiracion de agua": { ja: "水の呼吸", ro: "Mizu no Kokyū", es: "Respiración de Agua" },
    "respiracion de trueno": { ja: "雷の呼吸", ro: "Kaminari no Kokyū", es: "Respiración del Trueno" },
    "libera tu poder": { ja: "力を解放せよ", ro: "Chikara o kaihō seyo", es: "¡Libera tu poder!" },
    "despertar": { ja: "覚醒", ro: "Kakusei", es: "Despertar" },
    "destello": { ja: "閃光", ro: "Senkō", es: "Destello de luz" },
    "oscuridad eterna": { ja: "永遠の闇", ro: "Eien no Yami", es: "Oscuridad Eterna" },
    "silencio absoluto": { ja: "絶対静寂", ro: "Zettai Seijaku", es: "Silencio Absoluto" },
    corte: { ja: "斬", ro: "Zan", es: "Corte" },
    espada: { ja: "刀", ro: "Katana", es: "Espada / Katana" },
    katana: { ja: "日本刀", ro: "Nihontō", es: "Katana Japonesa" },
    furia: { ja: "怒り", ro: "Ikari", es: "Furia" },
    fuego: { ja: "焔", ro: "Homura", es: "Llamas ardientes" },
    llama: { ja: "炎", ro: "Honō", es: "Fuego" },
    sombra: { ja: "影", ro: "Kage", es: "Sombra" },
    muerte: { ja: "死", ro: "Shi", es: "Muerte" },
    sangre: { ja: "血", ro: "Chi", es: "Sangre" },
    alma: { ja: "魂", ro: "Tamashii", es: "Alma" },
    fuerza: { ja: "力", ro: "Chikara", es: "Fuerza / Poder" },
    viento: { ja: "風", ro: "Kaze", es: "Viento" },
    rayo: { ja: "雷", ro: "Kaminari", es: "Rayo" },
    luz: { ja: "光", ro: "Hikari", es: "Luz" },
    oscuridad: { ja: "闇", ro: "Yami", es: "Oscuridad" },
    demonio: { ja: "鬼", ro: "Oni", es: "Demonio" },
    dios: { ja: "神", ro: "Kami", es: "Dios" },
    venganza: { ja: "復讐", ro: "Fukushū", es: "Venganza" },
    honor: { ja: "誇り", ro: "Hokori", es: "Honor / Orgullo" },
    destino: { ja: "運命", ro: "Unmei", es: "Destino" },
    guerra: { ja: "戦", ro: "Ikusa", es: "Guerra / Batalla" },
    vacio: { ja: "虚無", ro: "Kyomu", es: "Vacio" },
    dragon: { ja: "竜", ro: "Ryū", es: "Dragon" },
    silencio: { ja: "静寂", ro: "Seijaku", es: "Silencio" },
    respiracion: { ja: "呼吸", ro: "Kokyū", es: "Respiracion" },
    liberacion: { ja: "解放", ro: "Kaihō", es: "Liberacion" },
  };

  for (const [k, v] of Object.entries(keywordMap)) {
    if (trimmed.includes(k)) {
      return { japanese: v.ja, romaji: v.ro, translation: v.es };
    }
  }

  // Fallback: If input is already Japanese, keep it as is; otherwise return formatted string
  const isJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(input);
  if (isJapanese) {
    return { japanese: input, romaji: "", translation: "" };
  }

  return { japanese: input, romaji: "", translation: input };
}

/**
 * Draw authentic Manga Speech Bubbles, Narration Boxes & SFX Typography on HTML5 Canvas
 */
export function drawMangaTextBubble(
  ctx: CanvasRenderingContext2D,
  item: MangaTextItem,
  targetW: number,
  targetH: number,
  t: number,
  isSelected: boolean = false,
  mangaDuration: number = 10
) {
  const totalDur = Math.max(1, mangaDuration);
  const cycleProg = (t % totalDur) / totalDur; // 0..1
  const depthMode = item.depthPlane || "always_visible";
  const entrance = item.entranceEffect || "none";

  // 1. Depth Plane Visibility & Timing Logic
  let isVisible = true;
  let entranceProgress = 1.0; // 0 (start of entrance) -> 1 (fully landed)

  if (depthMode === "camera_far_apex") {
    // Appears during farthest apex (around 30% to 75% of loop cycle)
    if (cycleProg < 0.28 || cycleProg > 0.78) {
      isVisible = isSelected; // Keep visible if user is actively editing it
    }
    if (cycleProg >= 0.28 && cycleProg <= 0.78) {
      entranceProgress = Math.min(1.0, (cycleProg - 0.28) / 0.12);
    }
  } else if (depthMode === "camera_close_apex") {
    // Appears during close-up apex (beginning & ending of loop cycle)
    if (cycleProg > 0.32 && cycleProg < 0.72) {
      isVisible = isSelected;
    }
    if (cycleProg <= 0.32) {
      entranceProgress = Math.min(1.0, cycleProg / 0.12);
    }
  } else if (depthMode === "timed_window") {
    const startSec = item.appearTime || 0;
    const durSec = item.durationSec || totalDur;
    const curSec = t % totalDur;
    if (curSec < startSec || curSec > startSec + durSec) {
      isVisible = isSelected;
    }
    if (curSec >= startSec && curSec <= startSec + durSec) {
      entranceProgress = Math.min(1.0, (curSec - startSec) / 0.45);
    }
  } else {
    // Always visible with loop entry transition
    entranceProgress = Math.min(1.0, (t % totalDur) / 0.4);
  }

  if (!isVisible) return;

  const posX = item.x * targetW;
  const posY = item.y * targetH;
  const scale = item.scale || 1.0;
  const rotRad = ((item.rotation || 0) * Math.PI) / 180;
  const baseSize = item.fontSize || 34;

  // Pulse & Idle animations
  let pulseScale = 1.0;
  let shakeX = 0;
  let shakeY = 0;
  let entranceAlpha = 1.0;
  let entranceOffsetX = 0;
  let entranceOffsetY = 0;
  let entranceRotationOffset = 0;
  let drawSlashLine = false;

  // 2. Anime & Manga Entrance Transitions
  if (entrance === "manga_slash_in" && entranceProgress < 1.0) {
    const p = entranceProgress;
    entranceAlpha = Math.min(1.0, p * 2.5);
    entranceOffsetX = (1 - p) * 70;
    entranceOffsetY = (1 - p) * -35;
    entranceRotationOffset = (1 - p) * -15;
    pulseScale = 0.6 + p * 0.4;
    drawSlashLine = p > 0.05 && p < 0.85;
  } else if (entrance === "shonen_impact" && entranceProgress < 1.0) {
    const p = entranceProgress;
    entranceAlpha = Math.min(1.0, p * 3.0);
    // Explosive zoom punch in with overshoot spring
    const impactZoom = 1.0 + Math.pow(1 - p, 2) * 2.2;
    pulseScale *= impactZoom;
    shakeX = (1 - p) * (Math.sin(t * 50) * 8);
    shakeY = (1 - p) * (Math.cos(t * 50) * 8);
  } else if (entrance === "depth_plane_fade" && entranceProgress < 1.0) {
    const p = entranceProgress;
    entranceAlpha = 0.5 - 0.5 * Math.cos(p * Math.PI);
    pulseScale = 0.75 + p * 0.25;
    entranceOffsetY = (1 - p) * 25;
  } else if (entrance === "ink_reveal" && entranceProgress < 1.0) {
    const p = entranceProgress;
    entranceAlpha = Math.min(1.0, p * 2.0);
    pulseScale = 0.4 + p * 0.6;
  }

  // Idle pulse shakes
  if (item.pulseType === "rumble_shake") {
    shakeX += (Math.sin(t * 32.0 + item.x * 10) + Math.cos(t * 48.0)) * 2.2;
    shakeY += (Math.cos(t * 30.0 + item.y * 10) + Math.sin(t * 52.0)) * 2.2;
  } else if (item.pulseType === "zoom_heartbeat") {
    pulseScale *= 1.0 + Math.pow(Math.sin(t * 4.0), 4) * 0.08;
  } else if (item.pulseType === "subtle_float") {
    shakeY += Math.sin(t * 2.5 + item.x * 5) * 4.0;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1.0, entranceAlpha));
  ctx.translate(posX + shakeX + entranceOffsetX, posY + shakeY + entranceOffsetY);
  ctx.rotate(rotRad + (entranceRotationOffset * Math.PI) / 180);
  ctx.scale(scale * pulseScale, scale * pulseScale);

  if (item.type === "vertical_sfx") {
    renderVerticalMangaSfx(ctx, item, baseSize);
  } else if (item.type === "shonen_spikes") {
    renderShonenSpikesBubble(ctx, item, baseSize);
  } else if (item.type === "classic_speech") {
    renderClassicSpeechBubble(ctx, item, baseSize);
  } else if (item.type === "thought_cloud") {
    renderThoughtCloudBubble(ctx, item, baseSize);
  } else if (item.type === "narration_box") {
    renderNarrationBox(ctx, item, baseSize);
  } else if (item.type === "anime_subtitle") {
    renderAnimeSubtitle(ctx, item, baseSize);
  }

  // Interactive Selection Bounding Box with Rotate & Scale Handles
  if (isSelected) {
    ctx.save();
    const boundW = Math.max(90, (item.type === "vertical_sfx" ? baseSize * 1.6 : item.text.length * baseSize * 0.7 + 50));
    const boundH = Math.max(60, (item.type === "vertical_sfx" ? item.text.length * baseSize * 1.1 + 30 : baseSize * 2.2 + 20));
    const halfW = boundW / 2;
    const halfH = boundH / 2;

    // Selection border
    ctx.strokeStyle = "#ec4899";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-halfW, -halfH, boundW, boundH);
    ctx.setLineDash([]);

    // 1. Top Rotation Handle (Cyan Dot connected with line)
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, -halfH - 24);
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#06b6d4";
    ctx.shadowColor = "#06b6d4";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, -halfH - 24, 6, 0, Math.PI * 2);
    ctx.fill();

    // 2. Bottom-Right Scale/Resize Handle (Pink Dot)
    ctx.fillStyle = "#f43f5e";
    ctx.shadowColor = "#f43f5e";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(halfW, halfH, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

/**
 * 1. Vertical Japanese SFX Typography (Katakana / Kanji) with Heavy Ink Stroke & Shadow
 */
function renderVerticalMangaSfx(ctx: CanvasRenderingContext2D, item: MangaTextItem, fontSize: number) {
  const chars = Array.from(item.text);
  const strokeW = item.strokeWidth || 7;
  const fillColor = item.textColor || "#ffffff";
  const strokeColor = item.strokeColor || "#000000";

  ctx.font = `900 ${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "MS PGothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const charHeight = fontSize * 1.05;
  const totalH = chars.length * charHeight;
  const startY = -totalH / 2 + charHeight / 2;

  chars.forEach((char, idx) => {
    const cy = startY + idx * charHeight;

    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillText(char, 3, cy + 4);

    // Thick stroke outline
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = "miter";
    ctx.miterLimit = 2;
    ctx.strokeText(char, 0, cy);

    // Inner text fill
    ctx.fillStyle = fillColor;
    ctx.fillText(char, 0, cy);
  });

  // Optional Romaji Subtext
  if (item.subText) {
    ctx.font = `800 ${Math.round(fontSize * 0.35)}px "Impact", "Arial Black", sans-serif`;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.strokeText(item.subText, 0, totalH / 2 + 14);
    ctx.fillStyle = fillColor;
    ctx.fillText(item.subText, 0, totalH / 2 + 14);
  }
}

/**
 * 2. Shonen Explosive Combat Spikes Bubble
 */
function renderShonenSpikesBubble(ctx: CanvasRenderingContext2D, item: MangaTextItem, fontSize: number) {
  const lines = item.text.split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  const padX = fontSize * 0.9;
  const padY = fontSize * 0.8;
  const boxW = Math.max(130, maxLineLen * fontSize * 0.75 + padX * 2);
  const boxH = Math.max(80, lines.length * (fontSize * 1.25) + padY * 2);

  const radiusX = boxW / 2;
  const radiusY = boxH / 2;
  const numSpikes = 16;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < numSpikes; i++) {
    const angleInner = (i / numSpikes) * Math.PI * 2;
    const angleOuter = ((i + 0.5) / numSpikes) * Math.PI * 2;

    const rInX = radiusX * 0.85;
    const rInY = radiusY * 0.85;
    const rOutX = radiusX * (1.1 + (i % 2 === 0 ? 0.15 : -0.05));
    const rOutY = radiusY * (1.1 + (i % 2 === 0 ? 0.15 : -0.05));

    const inX = Math.cos(angleInner) * rInX;
    const inY = Math.sin(angleInner) * rInY;
    const outX = Math.cos(angleOuter) * rOutX;
    const outY = Math.sin(angleOuter) * rOutY;

    if (i === 0) ctx.moveTo(inX, inY);
    else ctx.lineTo(inX, inY);
    ctx.lineTo(outX, outY);
  }
  ctx.closePath();

  // Shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = item.bgColor || "#ffffff";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = item.strokeColor || "#000000";
  ctx.lineWidth = item.strokeWidth || 4;
  ctx.stroke();
  ctx.restore();

  // Draw Text inside
  renderBubbleTextLines(ctx, lines, item, fontSize);
}

/**
 * 3. Classic Manga Speech Bubble (Oval with tail)
 */
function renderClassicSpeechBubble(ctx: CanvasRenderingContext2D, item: MangaTextItem, fontSize: number) {
  const lines = item.text.split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  const boxW = Math.max(120, maxLineLen * fontSize * 0.72 + 40);
  const boxH = Math.max(70, lines.length * (fontSize * 1.22) + 30);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, boxW / 2, boxH / 2, 0, 0, Math.PI * 2);

  // Tail
  const tailX = item.tailX !== undefined ? item.tailX : -boxW * 0.25;
  const tailY = item.tailY !== undefined ? item.tailY : boxH * 0.65;
  ctx.moveTo(-boxW * 0.15, boxH * 0.35);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(boxW * 0.05, boxH * 0.38);

  ctx.fillStyle = item.bgColor || "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = item.strokeColor || "#000000";
  ctx.lineWidth = item.strokeWidth || 3.5;
  ctx.stroke();
  ctx.restore();

  renderBubbleTextLines(ctx, lines, item, fontSize);
}

/**
 * 4. Thought Cloud Bubble
 */
function renderThoughtCloudBubble(ctx: CanvasRenderingContext2D, item: MangaTextItem, fontSize: number) {
  const lines = item.text.split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  const boxW = Math.max(130, maxLineLen * fontSize * 0.75 + 44);
  const boxH = Math.max(75, lines.length * (fontSize * 1.25) + 34);

  const numClouds = 8;
  const rx = boxW / 2;
  const ry = boxH / 2;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < numClouds; i++) {
    const angle = (i / numClouds) * Math.PI * 2;
    const cx = Math.cos(angle) * rx * 0.85;
    const cy = Math.sin(angle) * ry * 0.85;
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  }
  ctx.fillStyle = item.bgColor || "#ffffff";
  ctx.fill();
  ctx.strokeStyle = item.strokeColor || "#000000";
  ctx.lineWidth = item.strokeWidth || 3;
  ctx.stroke();

  // Little floating thought circles
  ctx.beginPath();
  ctx.arc(-rx * 0.4, ry + 12, 7, 0, Math.PI * 2);
  ctx.arc(-rx * 0.6, ry + 24, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  renderBubbleTextLines(ctx, lines, item, fontSize);
}

/**
 * 5. Seinen Narration Caption Box (Black or Dark Frame with White Text)
 */
function renderNarrationBox(ctx: CanvasRenderingContext2D, item: MangaTextItem, fontSize: number) {
  const lines = item.text.split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  const boxW = Math.max(140, maxLineLen * fontSize * 0.7 + 36);
  const boxH = Math.max(60, lines.length * (fontSize * 1.25) + 24);

  ctx.save();
  // Frame
  ctx.fillStyle = item.bgColor || "#09090b";
  ctx.strokeStyle = item.strokeColor || "#ffffff";
  ctx.lineWidth = item.strokeWidth || 2;
  ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
  ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

  // Inner inset border for classic Seinen look
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-boxW / 2 + 4, -boxH / 2 + 4, boxW - 8, boxH - 8);
  ctx.restore();

  renderBubbleTextLines(ctx, lines, item, fontSize);
}

/**
 * 6. Anime Subtitle (Japanese on Top + Translation below)
 */
function renderAnimeSubtitle(ctx: CanvasRenderingContext2D, item: MangaTextItem, fontSize: number) {
  ctx.font = `800 ${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Arial", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const strokeW = item.strokeWidth || 5;
  const strokeCol = item.strokeColor || "#000000";
  const textCol = item.textColor || "#facc15";

  // Main Japanese / Quote
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 6;
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = strokeW;
  ctx.strokeText(item.text, 0, item.subText ? -12 : 0);
  ctx.fillStyle = textCol;
  ctx.fillText(item.text, 0, item.subText ? -12 : 0);

  // Subtext translation
  if (item.subText) {
    const subSize = Math.round(fontSize * 0.58);
    ctx.font = `700 ${subSize}px "Arial", sans-serif`;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 3.5;
    ctx.strokeText(item.subText, 0, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(item.subText, 0, 16);
  }
}

/**
 * Render multi-line text inside standard speech bubbles
 */
function renderBubbleTextLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  item: MangaTextItem,
  fontSize: number
) {
  ctx.font = `bold ${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "MS Gothic", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineH = fontSize * 1.25;
  const totalH = lines.length * lineH;
  const startY = -totalH / 2 + lineH / 2;

  lines.forEach((line, idx) => {
    const ly = startY + idx * lineH;
    ctx.fillStyle = item.textColor || "#000000";
    ctx.fillText(line, 0, ly);
  });
}
