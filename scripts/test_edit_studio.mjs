import assert from "node:assert/strict";
import {
  applyEditRhythmPreset,
  buildBeatMarkers,
  createDefaultEditProject,
  editClipAtTime,
  editTimelineDuration,
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

console.log("✓ modelo, rejilla y plantillas de Edit Studio");
