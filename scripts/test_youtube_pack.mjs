import assert from "node:assert/strict";

import {
  cleanSongName,
  generateOrganicYoutubePack,
} from "../src/lib/youtubePackEngine.ts";

assert.equal(
  cleanSongName("Hozier - Too Sweet (Official Audio).mp3"),
  "Hozier — Too Sweet",
  "debe conservar artista y canción"
);

const pack = generateOrganicYoutubePack({
  songFileName: "Hozier - Too Sweet (Official Audio).mp3",
  characterId: "guts",
  isSlowedReverb: true,
  targetDurationMinutes: 3,
  seedOffset: 1,
});

assert.ok(pack.title.length <= 100);
assert.ok(pack.title.toLowerCase().includes("hozier"));
assert.ok(pack.title.toLowerCase().includes("guts") || pack.title.toLowerCase().includes("berserk"));
assert.ok(pack.description.includes("Hozier — Too Sweet"));
assert.ok(!/full version on the channel/i.test(pack.description));
assert.ok(!/full version on the channel/i.test(pack.shortsDescription));
assert.ok(pack.hashtags.length >= 3 && pack.hashtags.length <= 5);
assert.ok(pack.tags.length <= 8);
assert.ok(pack.shortsHashtags.length >= 3 && pack.shortsHashtags.length <= 5);

const alternate = generateOrganicYoutubePack({
  songFileName: "Hozier - Too Sweet (Official Audio).mp3",
  characterId: "guts",
  isSlowedReverb: true,
  targetDurationMinutes: 3,
  seedOffset: 2,
});
assert.notEqual(pack.title, alternate.title, "regenerar debe cambiar el ángulo sin perder términos reales");
assert.notEqual(pack.instagramCaption, pack.tiktokCaption, "cada plataforma necesita copy propio");

console.log("✓ publicación: copy natural, concreto y sin afirmaciones falsas");
