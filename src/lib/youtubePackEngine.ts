/**
 * YouTube & Shorts copy for Silent Vigil.
 * Intimate, character-voiced, different structure each regenerate — not a SEO stencil.
 */

export interface CharacterMeta {
  id: string;
  name: string;
  series: string;
  aka: string;
  playlist: string;
  titles: string[];
  notes: string[];
  shortsHooks: string[];
  pinnedComments: string[];
  hashtags: string[];
  tags: string[];
  filenameKeys: string[];
}

function pick<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

function fill(template: string, song: string, meta: CharacterMeta): string {
  return template
    .replaceAll("{song}", song)
    .replaceAll("{name}", meta.name)
    .replaceAll("{series}", meta.series)
    .replaceAll("{aka}", meta.aka);
}

export const CHARACTER_DATABASE: Record<string, CharacterMeta> = {
  guts: {
    id: "guts",
    name: "Guts",
    series: "Berserk",
    aka: "the Black Swordsman",
    playlist: "Silent Vigil · Struggler",
    titles: [
      "{song} — Guts sitting with it. no speech.",
      "Dragonslayer in the dirt. {song}",
      "the fire after the Eclipse | {song}",
      "{song} · for people who understood Griffith and still chose Guts",
      "Casca is asleep. Guts is not. {song}",
      "{song} | Berserk, but the campfire. not the war.",
      "brand of sacrifice, headphones on. {song}",
      "I'll keep struggling — {song}",
      "{song} for the nights the Beast of Darkness talks back",
      "Guts would hate how much this fits. {song}",
    ],
    notes: [
      "Guts doesn't get a quiet ending. This is the closest thing I can give you.\n\n{song}\n\nIf you've been carrying something all week, sit here. I looped it so you don't have to press play again.",
      "Not the Eclipse. The hour after — when the sword is too heavy and nobody's watching.\n\n{song}\n\nFor strugglers. You know if that's you.",
      "Griffith got the castle. Guts got the night.\n\n{song}\n\nI slowed it until it felt like the campfire in the manga. Stay as long as you need.",
      "Casca's breathing. The brand is quiet for once.\n\n{song}\n\nThis isn't a 'mix'. It's a room. Leave when you can.",
      "Kentaro Miura drew men who don't get to rest. I made a rest anyway.\n\n{song}\n\nIf this found you at 2am, you're in the right place.",
    ],
    shortsHooks: [
      "Guts after. not during.",
      "the sword is down.",
      "struggler hours.",
      "Casca's sleeping. stay.",
      "Eclipse leftover.",
    ],
    pinnedComments: [
      "Still here. Still moving. If a song sat in your chest this week, drop it — I listen to every one.",
      "Strugglers only in the replies. What should Guts hear next?",
      "If the brand's been loud lately: you're not dramatic. You're tired. Request a track, I'll slow it.",
      "No lore arguments tonight. Just tell me what you've been looping.",
    ],
    hashtags: ["#Berserk", "#Guts", "#BlackSwordsman", "#KentaroMiura", "#struggler", "#slowedandreverb"],
    tags: [
      "berserk", "guts", "gatsu", "black swordsman", "griffith", "casca", "kentaro miura",
      "berserk 2016", "berserk memorial", "dragonslayer", "slowed reverb guts", "anime sad",
      "late night anime", "campfire berserk",
    ],
    filenameKeys: ["guts", "berserk", "griffith", "casca", "struggler", "espadachin", "blackswordsman"],
  },
  thorfinn: {
    id: "thorfinn",
    name: "Thorfinn",
    series: "Vinland Saga",
    aka: "Thorfinn Karlsefni",
    playlist: "Silent Vigil · Vinland",
    titles: [
      "you have no enemies — {song}",
      "{song} · Thorfinn, after Askeladd",
      "Vinland isn't a place yet. {song}",
      "{song} | farm arc quiet. not the raids.",
      "Thorfinn putting the knife down | {song}",
      "{song} for the walk away from the battlefield",
      "true warrior hours. {song}",
      "a field instead of a fjord | {song}",
      "{song} — Vinland Saga, the part where he learns to breathe",
    ],
    notes: [
      "You have no enemies. Not tonight.\n\n{song}\n\nThorfinn's farm arc, if it were a song. I looped it. Stay in the field.",
      "Askeladd is gone. The anger has nowhere to go, so it sits.\n\n{song}\n\nThis is for after you stop swinging.",
      "Vinland is a promise, not a map.\n\n{song}\n\nIf you've been trying to become someone gentler, this is for that version of you.",
      "The raids are over. The work is wheat and weather.\n\n{song}\n\nI slowed it until it felt like a Nordic dusk. No speech. No lesson.",
      "Yukimura wrote a boy who had to unlearn war. This is the unlearning.\n\n{song}",
    ],
    shortsHooks: [
      "you have no enemies.",
      "knife down.",
      "farm arc.",
      "Vinland, later.",
      "true warrior.",
    ],
    pinnedComments: [
      "You have no enemies in this comment section. What should we walk toward next?",
      "Farm-arc listeners only. Drop a song that feels like putting the knife down.",
      "If you've been trying to be gentler this year, I see you. Request a track.",
      "No raid talk tonight. Tell me a quiet song.",
    ],
    hashtags: ["#VinlandSaga", "#Thorfinn", "#YouHaveNoEnemies", "#Vinland", "#slowedandreverb", "#anime"],
    tags: [
      "vinland saga", "thorfinn", "askeladd", "you have no enemies", "true warrior",
      "vinland saga farm", "makoto yukimura", "slowed reverb vinland", "peaceful anime",
    ],
    filenameKeys: ["thorfinn", "vinland", "askeladd", "karlsefni", "vinlandsaga"],
  },
  musashi: {
    id: "musashi",
    name: "Miyamoto Musashi",
    series: "Vagabond",
    aka: "Takezo",
    playlist: "Silent Vigil · Vagabond",
    titles: [
      "the sword is sheathed | {song}",
      "{song} — Musashi, after the duel",
      "invincible, and still sitting. {song}",
      "{song} · Vagabond, the pages with no blood",
      "Takezo learning the earth is a bed | {song}",
      "{song} for the walk between villages",
      "Inoue's silence, with a song under it. {song}",
      "nothing to prove tonight. {song}",
      "{song} | Musashi looking at the water instead",
    ],
    notes: [
      "Musashi wins, then has to live with the quiet.\n\n{song}\n\nThis is the sitting-down after. I looped it like a long take of grass.",
      "Invincible is a curse if you never put the sword away.\n\n{song}\n\nVagabond fans know which panels this is for.",
      "Takezo on the road. No opponent. Just weather.\n\n{song}\n\nI slowed it until it felt like Inoue's empty space.",
      "The earth is a bed. The sky is a roof.\n\n{song}\n\nIf you've been proving something to nobody, stay here a minute.",
      "Not the Yoshioka. The night after, when his hands finally stop.\n\n{song}",
    ],
    shortsHooks: [
      "sword sheathed.",
      "invincible, sitting.",
      "Vagabond quiet.",
      "no opponent.",
      "earth is a bed.",
    ],
    pinnedComments: [
      "The sword rests. If a song felt like a long Inoue panel, leave it here.",
      "Wanderers in the replies. What should Musashi hear on the road?",
      "No duel talk. Tell me something quiet.",
      "If you've had nothing to prove this week, you're ahead. Request a track anyway.",
    ],
    hashtags: ["#Vagabond", "#Musashi", "#Takezo", "#InoueTakehiko", "#samurai", "#slowedandreverb"],
    tags: [
      "vagabond", "musashi", "miyamoto musashi", "takezo", "inoue takehiko",
      "samurai manga", "vagabond manga", "slowed reverb musashi", "zen anime",
    ],
    filenameKeys: ["musashi", "miyamoto", "vagabond", "takezo", "inoue", "samurai", "katana"],
  },
  buntaro: {
    id: "buntaro",
    name: "Buntarō Mori",
    series: "The Climber",
    aka: "Mori",
    playlist: "Silent Vigil · The Climber",
    titles: [
      "thin air. {song}",
      "{song} — Mori, above the noise",
      "Kokou no Hito, no summit speech | {song}",
      "{song} · one hold, then another",
      "the mountain doesn't care. {song}",
      "{song} for the ledge where you catch your breath",
      "alone on purpose. {song}",
      "Buntarō not looking down | {song}",
      "{song} | The Climber, the quiet between pitches",
    ],
    notes: [
      "The mountain doesn't clap when you don't fall.\n\n{song}\n\nMori's kind of quiet. I looped it so the wind can keep going.",
      "Kokou no Hito isn't about the summit. It's about still being on the wall.\n\n{song}\n\nIf the world is too loud, this is thinner air.",
      "One hold. Then another. That's the whole philosophy.\n\n{song}\n\nStay until your hands warm up.",
      "He climbs because down there everyone wants something.\n\n{song}\n\nThis is the version of night with no one asking.",
      "Nitta's pages with almost no ink. That's the mix.\n\n{song}",
    ],
    shortsHooks: [
      "thin air.",
      "one more hold.",
      "not the summit.",
      "alone on purpose.",
      "don't look down.",
    ],
    pinnedComments: [
      "Above the noise. What should Mori hear on the next pitch?",
      "Climbers and insomniacs. Drop a song that feels like thin air.",
      "No summit photos. Request a quiet one.",
      "If you needed altitude from your room tonight, you're not dramatic. Leave a track.",
    ],
    hashtags: ["#TheClimber", "#KokouNoHito", "#BuntaroMori", "#solitude", "#slowedandreverb", "#manga"],
    tags: [
      "the climber", "kokou no hito", "buntaro mori", "mori buntarou",
      "climbing manga", "solitude aesthetic", "slowed reverb climber", "mountain ambient",
    ],
    filenameKeys: ["buntaro", "buntarou", "mori", "climber", "kokou", "k2", "katou"],
  },
  knight: {
    id: "knight",
    name: "The Medieval Knight",
    series: "Medieval Love",
    aka: "the devoted knight",
    playlist: "Silent Vigil · Medieval Love",
    titles: [
      "still on the wall | {song}",
      "{song} — armor off, almost",
      "the castle is asleep. he's not. {song}",
      "{song} · rain on the battlements",
      "a vigil, not a war. {song}",
      "{song} for whoever stayed behind",
      "chivalry, but tired. {song}",
      "the knight doesn't get the feast. {song}",
    ],
    notes: [
      "He crossed the kingdom for a love he could never name.\n\n{song}\n\nA medieval love edit for the promises that outlive the war.",
      "The armour remembers every road back to her.\n\n{song}\n\nFor impossible love, candlelight, and rain on stone.",
      "The feast is downstairs. He is waiting by the gate for one familiar silhouette.\n\n{song}\n\nStay until the torches go out.",
      "Not a battle edit. A vow.\n\n{song}\n\nSome stories only needed the knight to come home.",
    ],
    shortsHooks: [
      "a vow after the war.",
      "he still came back.",
      "love under armour.",
      "one last ride home.",
      "the kingdom can wait.",
    ],
    pinnedComments: [
      "Which song sounds like a knight crossing a kingdom for one person?",
      "Leave the next medieval-love song here. I listen to every suggestion.",
      "No battle songs tonight. Give me rain, stone, and an impossible promise.",
      "Would your knight return, or let the kingdom keep him?",
    ],
    hashtags: ["#MedievalLove", "#KnightEdit", "#darkfantasy", "#medieval", "#slowedandreverb", "#cinematic"],
    tags: [
      "medieval love", "knight edit", "medieval aesthetic", "dark fantasy romance",
      "castle rain", "chivalrycore", "slowed reverb knight", "cinematic romance",
    ],
    filenameKeys: ["knight", "caballero", "armor", "armadura", "chivalry", "castle", "medieval", "paladin", "crusader", "vigil"],
  },
  golden_brown: {
    id: "golden_brown",
    name: "Golden Brown Slow Edit",
    series: "Slow Cinema",
    aka: "warm nostalgia",
    playlist: "Silent Vigil · Golden Hours",
    titles: [
      "{song} — somewhere between memory and film",
      "{song} · a slow edit in golden light",
      "the afternoon stayed a little longer | {song}",
      "{song} for a memory that never happened",
      "warm grain, slow frames. {song}",
      "{song} | Golden Brown kind of nostalgia",
    ],
    notes: [
      "A slow frame, warm grain, and the feeling that this happened years ago.\n\n{song}\n\nMade for the Golden Brown side of the timeline.",
      "Not a character edit this time. Just light moving through an old memory.\n\n{song}\n\nStay until the colour fades.",
      "The scene is fictional. The nostalgia isn't.\n\n{song}\n\nA slow-cinema edit from Silent Vigil.",
    ],
    shortsHooks: [
      "a memory that never happened.",
      "golden hour stayed.",
      "warm grain. slow time.",
      "somewhere before sunset.",
    ],
    pinnedComments: [
      "Which song gives you nostalgia for a place you've never been?",
      "Leave the next slow-edit song here. I listen to every suggestion.",
      "Warm-light edits only: what should play next?",
    ],
    hashtags: ["#GoldenBrown", "#SlowEdit", "#Nostalgia", "#CinematicEdit", "#slowedandreverb"],
    tags: ["golden brown edit", "slow edit", "nostalgia edit", "cinematic slow edit", "warm aesthetic", "vintage film edit"],
    filenameKeys: ["goldenbrown", "golden", "slowedit", "nostalgia", "vintage", "cinematic", "warm"],
  },
};

export interface YoutubePackResult {
  characterId: string;
  characterName: string;
  series: string;
  songName: string;
  title: string;
  description: string;
  hashtags: string[];
  tags: string[];
  tagsLine: string;
  playlist: string;
  pinnedComment: string;
  shortsTitle: string;
  shortsDescription: string;
  shortsHashtags: string[];
  shortsTagsLine: string;
  instagramCaption: string;
  instagramHashtags: string[];
  tiktokCaption: string;
  tiktokHashtags: string[];
}

export function cleanSongName(raw: string | null | undefined): string {
  if (!raw) return "this one";
  let name = raw.replace(/\.[a-zA-Z0-9]+$/, "");
  name = name.replace(/^[0-9_\-.\s]+/, "");
  name = name.replace(/[_.\-]+/g, " ").trim();
  name = name.replace(/\s+/g, " ");
  name = name.replace(/\(Official Video\)/gi, "");
  name = name.replace(/\(Official Audio\)/gi, "");
  name = name.replace(/\(Audio\)/gi, "");
  name = name.replace(/\[HD\]/gi, "");
  name = name.replace(/slowed\s*\+*\s*reverb/gi, "").trim();
  name = name.replace(/\s+[–—|-]\s+topic$/i, "").trim();
  return name.length > 0 ? name : "this one";
}

export function detectCharacter(filename?: string): string {
  if (!filename) return "guts";
  const slug = filename.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [id, meta] of Object.entries(CHARACTER_DATABASE)) {
    if (meta.filenameKeys.some((k) => slug.includes(k.replace(/[^a-z0-9]/g, "")))) {
      return id;
    }
  }
  return "guts";
}

function capTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.55 ? cut.slice(0, sp) : cut).trim();
}

export function generateOrganicYoutubePack(opts: {
  songFileName?: string;
  characterId?: string;
  isSlowedReverb?: boolean;
  targetDurationMinutes?: number;
  seedOffset?: number;
}): YoutubePackResult {
  const cid = opts.characterId && CHARACTER_DATABASE[opts.characterId] ? opts.characterId : "guts";
  const meta = CHARACTER_DATABASE[cid];
  const songName = cleanSongName(opts.songFileName);
  const isSlowed = opts.isSlowedReverb !== false;
  const minutes = Math.max(0.5, opts.targetDurationMinutes || 1);
  const seed = (opts.seedOffset || 0) * 17 + songName.length * 13 + cid.length * 5;

  // La canción y el universo se mantienen reconocibles; lo que rota es el ángulo
  // emocional. Así cada subida conserva relevancia de búsqueda sin sonar a plantilla.
  const title = capTitle(
    `${fill(pick(meta.titles, seed), songName, meta)}${isSlowed ? " | Slowed + Reverb" : ""}`,
    96
  );
  const note = fill(pick(meta.notes, seed + 3), songName, meta)
    .split("\n")
    .find((line) => line.trim().length > 0) ?? "A quiet edit for the long night.";
  const pinned = pick(meta.pinnedComments, seed + 11);
  const shortHook = pick(meta.shortsHooks, seed + 7);

  const keywordLine = `${songName}${isSlowed ? " slowed + reverb" : ""} · ${meta.series} ${meta.name} edit.`;
  const slowedLine = isSlowed ? "Slowed + reverb, built for a quiet replay." : "Original tempo, built for a quiet replay.";
  const durationLine = minutes >= 1 ? "Full version — let the scene breathe." : "Short version — full edit on the channel.";
  const description = `${keywordLine}
${note}
${slowedLine} ${durationLine}

${meta.hashtags.slice(0, 4).join(" ")}`;

  const shortsTitle = capTitle(`${songName} | ${meta.name} Edit #Shorts`, 96);

  const shortsHashtags = ["#Shorts", ...meta.hashtags.slice(0, 4)];
  const shortsDescription = `${songName} · ${meta.series} ${meta.name} edit.
${shortHook}
Full version on the channel.

${shortsHashtags.join(" ")}`;

  const tags = [...new Set([
    songName.toLowerCase(),
    meta.name.toLowerCase(),
    meta.series.toLowerCase(),
    ...(isSlowed ? [`${songName.toLowerCase()} slowed`, "slowed and reverb"] : [`${songName.toLowerCase()} loop`]),
    ...meta.tags,
  ])].slice(0, 12);
  const instagramHashtags = [...meta.hashtags.slice(0, 5), "#Reels"];
  const tiktokHashtags = [...meta.hashtags.slice(0, 4), "#AnimeEdit", "#TikTokEdits"];
  const instagramCaption = `${shortHook}\n\n${songName} · ${meta.series}\n\n${instagramHashtags.join(" ")}`;
  const tiktokCaption = `${shortHook} ${songName} · ${meta.name}\n\n${tiktokHashtags.join(" ")}`;

  return {
    characterId: cid,
    characterName: meta.name,
    series: meta.series,
    songName,
    title,
    description,
    hashtags: meta.hashtags,
    tags,
    tagsLine: tags.join(", "),
    playlist: meta.playlist,
    pinnedComment: pinned,
    shortsTitle,
    shortsDescription,
    shortsHashtags,
    shortsTagsLine: ["shorts", "youtube shorts", songName.toLowerCase(), meta.name.toLowerCase(), meta.series.toLowerCase()].join(", "),
    instagramCaption,
    instagramHashtags,
    tiktokCaption,
    tiktokHashtags,
  };
}
