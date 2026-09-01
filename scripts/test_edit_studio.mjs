import assert from "node:assert/strict";
import {
  applyEditRhythmPreset,
  buildBeatMarkers,
  createDefaultEditProject,
  editClipAtTime,
  editSourceTimeAt,
  editTimelineDuration,
  normalizeEditClip,
  normalizeEditTextCue,
  snapEditTime,
} from "../src/lib/editStudio.ts";

const project = createDefaultEditProject();
assert.equal(project.format, "9:16");
assert.equal(project.fps, 60);

const clips = [0, 1, 2].map((index) => ({
  id: `clip-${index}`,
  assetId: `asset-${index}`,
  label: `Clip ${index}`,
  duration: 1,
  sourceStart: 0,
  sourceDuration: 1,
  transition: "cut",
  transitionDuration: 0,
  motion: "static",
  style: "inherit",
}));

assert.equal(editTimelineDuration(clips), 3);
assert.equal(editClipAtTime(clips, 1.2)?.index, 1);
assert.equal(editClipAtTime(clips, 99)?.index, 2);
assert.equal(snapEditTime(0.62, 120, 2), 0.5);
assert.deepEqual(buildBeatMarkers(1, 120), [0, 0.5, 1]);

const reference = applyEditRhythmPreset(clips, "reference", 120);
assert.deepEqual(reference.map((clip) => clip.duration), [1.5, 1.5, 2]);
assert.equal(reference[0].transition, "cut");

const buildDrop = applyEditRhythmPreset([...clips, ...clips.map((clip, i) => ({ ...clip, id: `b-${i}` }))], "build-drop", 120);
assert.ok(buildDrop.slice(-2).every((clip) => clip.duration <= 1));

const normalized = normalizeEditClip({
  ...clips[0],
  duration: 2,
  sourceDuration: 10,
  playbackRate: 0.5,
  velocityCurve: "linear",
});
assert.equal(normalized.framingX, 0);
assert.equal(normalized.framingY, 0);
assert.equal(normalized.framingScale, 1);
assert.equal(normalized.transitionIntensity, 55, "los proyectos anteriores deben migrar la fuerza de transición");
assert.equal(normalized.transitionDirection, "auto", "los proyectos anteriores deben migrar la dirección");
assert.equal(editSourceTimeAt(normalized, 1), 0.5, "0.5× debe consumir medio segundo de fuente por segundo final");
assert.equal(editSourceTimeAt(normalized, 2), 1, "la velocidad media debe respetar el multiplicador hasta el final de la toma");

const textCue = normalizeEditTextCue({
  id: "text-1",
  text: "LET GO",
  start: 0,
  duration: 1,
  x: 0.5,
  y: 0.5,
  size: 52,
  color: "#ffffff",
  accent: "#ef4444",
});
assert.equal(textCue.style, "impact");
assert.equal(textCue.emphasis, "");

console.log("✓ modelo, rejilla y plantillas de Edit Studio");
