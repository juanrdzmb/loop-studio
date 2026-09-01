import assert from "node:assert/strict";
import { analyzeEditAudio } from "../src/lib/editAssistAnalysis.ts";
import { assignEditAssistMedia, rankEditAssistPresets, suggestEditAssistSfx } from "../src/lib/editAssistPlanner.ts";

function slot(id, duration, transition = "cut", motionIntensity = 35) {
  return {
    id,
    assetId: "seed",
    label: id,
    duration,
    sourceStart: 0,
    sourceDuration: duration,
    transition,
    transitionDuration: transition === "cut" ? 0 : 0.12,
    motion: "push",
    motionIntensity,
    playbackRate: 1,
    velocityCurve: "linear",
    framingX: 0,
    framingY: 0,
    framingScale: 1,
    style: "inherit",
  };
}

function sample(time, visualEnergy, hash, saliencyX = 0.5) {
  return {
    time,
    quality: 0.84,
    visualEnergy,
    sharpness: 0.8,
    exposure: 0.75,
    contrast: visualEnergy,
    saturation: 0.55,
    motion: visualEnergy,
    saliencyX,
    saliencyY: 0.45,
    saliencyConfidence: 0.8,
    saliencyConcentration: 0.7,
    hash,
  };
}

function asset(id, importIndex, energy, hash, options = {}) {
  const duration = options.duration ?? 8;
  const samples = options.samples ?? [
    sample(0, energy * 0.8, hash, options.saliencyX),
    sample(duration / 2, energy, hash, options.saliencyX),
    sample(duration - 0.05, Math.min(1, energy * 1.1), hash, options.saliencyX),
  ];
  return {
    assetId: id,
    name: `${id}.mp4`,
    kind: options.kind ?? "video",
    duration,
    importIndex,
    cropRetention: 0.9,
    quality: 0.84,
    visualEnergy: energy,
    samples,
    segments: options.segments ?? [{
      id: `${id}-scene-0`,
      start: 0,
      end: duration,
      quality: 0.84,
      visualEnergy: energy,
      saliencyX: options.saliencyX ?? 0.5,
      saliencyY: 0.45,
      saliencyConfidence: 0.8,
    }],
  };
}

const impactClips = [
  slot("impact-0", 1),
  slot("impact-1", 1, "punch", 72),
  slot("impact-2", 1, "flash", 78),
  slot("impact-3", 1, "shake", 82),
];
const portraitClips = [slot("portrait-0", 2), slot("portrait-1", 2, "crossfade", 18)];
const assets = [
  asset("a", 0, 0.78, "0000000000000000", { saliencyX: 0.82 }),
  asset("b", 1, 0.68, "ffffffffffffffff"),
  asset("c", 2, 0.58, "aaaaaaaaaaaaaaaa"),
];
const frames = [];
for (let time = 0; time <= 8; time += 0.025) {
  const boundary = [1, 2, 3, 5, 6, 7].some((beat) => Math.abs(time - beat) < 0.014);
  frames.push({
    time,
    energy: time < 2 ? 0.22 : 0.82,
    onset: boundary ? 1 : 0.03,
  });
}
const audio = { duration: 8, bpm: 120, bpmReliable: true, hopSec: 0.025, frames };
const candidates = [
  {
    id: "impact",
    label: "Impacto",
    dropAt: 0.5,
    profile: { assetRange: [3, 8], visualEnergy: 0.7, energyRise: 0.75, onsetDensity: 0.35 },
    clips: impactClips,
  },
  {
    id: "portrait",
    label: "Retrato",
    dropAt: 0.5,
    profile: { assetRange: [1, 3], visualEnergy: 0.2, energyRise: 0.15, onsetDensity: 0.1 },
    clips: portraitClips,
  },
];

const firstRanking = rankEditAssistPresets(candidates, assets, audio, 0);
const secondRanking = rankEditAssistPresets(candidates, assets, audio, 0);
assert.equal(firstRanking.selected.presetId, "impact", "debe elegir la estructura que encaja con golpes y energía");
assert.deepEqual(firstRanking, secondRanking, "la recomendación debe ser determinista");
assert.ok(firstRanking.selected.musicStart >= 0 && firstRanking.selected.musicStart <= 4);

const suggestedSfx = suggestEditAssistSfx({ clips: impactClips }, audio, "climberPulse", []);
assert.ok(suggestedSfx.length >= 1 && suggestedSfx.length <= 3, "el borrador debe sugerir una mezcla contenida");
assert.equal(suggestedSfx[0].sfxId, "ambience_wind", "Pulso ascendente debe proponer viento de forma discreta");
assert.deepEqual(
  suggestedSfx,
  suggestEditAssistSfx({ clips: impactClips }, audio, "climberPulse", []),
  "las sugerencias de SFX deben ser deterministas"
);

const assignment = assignEditAssistMedia(
  [...impactClips, slot("impact-4", 1, "punch"), slot("impact-5", 1, "blur")],
  assets,
  0.5
);
assert.equal(new Set(assignment.clips.slice(0, assets.length).map((clip) => clip.assetId)).size, assets.length, "debe usar todos los medios antes de repetir");
for (let index = 1; index < assignment.clips.length; index++) {
  assert.notEqual(assignment.clips[index].assetId, assignment.clips[index - 1].assetId, "no debe repetir un medio en planos consecutivos");
}
for (const clip of assignment.clips) {
  const source = assets.find((entry) => entry.assetId === clip.assetId);
  assert.ok(source);
  assert.ok(clip.sourceStart >= 0);
  assert.ok(clip.sourceStart + clip.sourceDuration <= source.duration + 1e-6, "los rangos deben quedar dentro del vídeo");
}
const reframed = assignment.clips.find((clip) => clip.assetId === "a");
assert.ok(reframed && reframed.framingX > 0, "el punto de interés debe orientar el encuadre vertical");

const singleAsset = assignEditAssistMedia(impactClips, [assets[0]], 0.5);
assert.ok(singleAsset.warnings.some((warning) => warning.includes("Solo hay un medio")));

const sceneBoundaries = [
  { id: "long-scene-0", start: 0, end: 1.2, quality: 0.7, visualEnergy: 0.2, saliencyX: 0.5, saliencyY: 0.5, saliencyConfidence: 0.6 },
  { id: "long-scene-1", start: 4, end: 5.2, quality: 0.7, visualEnergy: 0.2, saliencyX: 0.5, saliencyY: 0.5, saliencyConfidence: 0.6 },
];
const longAsset = asset("long", 0, 0.2, "1111111111111111", {
  duration: 6,
  segments: sceneBoundaries,
  samples: [
    sample(0.6, 0.2, "1111111111111111"),
    { ...sample(3, 1, "eeeeeeeeeeeeeeee"), quality: 1 },
    sample(4.6, 0.2, "2222222222222222"),
  ],
});
const segmented = assignEditAssistMedia([slot("scene-slot", 1, "punch", 100)], [longAsset], 0);
assert.ok(
  sceneBoundaries.some((scene) => segmented.clips[0].sourceStart >= scene.start - 1e-6
    && segmented.clips[0].sourceStart + segmented.clips[0].sourceDuration <= scene.end + 1e-6),
  "una toma automática no debe atravesar un corte interno detectado"
);

const controller = new AbortController();
controller.abort();
const silent = new Float32Array(256);
const fakeBuffer = {
  sampleRate: 48_000,
  length: silent.length,
  duration: silent.length / 48_000,
  numberOfChannels: 1,
  getChannelData: () => silent,
};
await assert.rejects(
  analyzeEditAudio(fakeBuffer, { bpm: 128, bpmReliable: false, signal: controller.signal }),
  (error) => error?.name === "AbortError",
  "el análisis debe poder cancelarse"
);

console.log("✓ recomendación, asignación, encuadre y cancelación del montaje asistido");
