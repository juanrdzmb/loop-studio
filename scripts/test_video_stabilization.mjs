import assert from "node:assert/strict";

import {
  buildStabilizationFromPath,
  sourceTransformAt,
} from "../src/lib/videoStabilization.ts";

const samples = Array.from({ length: 120 }, (_, i) => ({
  time: i / 24,
  // Paneo intencional lento + vibración alterna de ~1.5 px en 1080p.
  x: i * 0.00008 + (i % 2 === 0 ? 0.0008 : -0.0008),
  y: i * 0.00003 + (i % 3 === 0 ? 0.00045 : -0.000225),
  confidence: 0.9,
}));

const stabilization = buildStabilizationFromPath(samples, 1920, 1080);
assert.equal(stabilization.autoEnabled, true, stabilization.reason);
assert.ok(stabilization.confidence >= 0.75);
assert.ok(stabilization.cropScale > 1 && stabilization.cropScale <= 1.02);
assert.ok(stabilization.jitterRmsPx >= 0.25);

const even = sourceTransformAt(stabilization, 20 / 24);
const odd = sourceTransformAt(stabilization, 21 / 24);
assert.ok(even.dx < odd.dx, "la corrección debe oponerse a la vibración alterna");
assert.equal(even.scale, stabilization.cropScale);

const smoothPan = Array.from({ length: 120 }, (_, i) => ({
  time: i / 24,
  x: i * 0.00008,
  y: i * 0.00003,
  confidence: 0.95,
}));
const untouched = buildStabilizationFromPath(smoothPan, 1920, 1080);
assert.equal(untouched.autoEnabled, false, "un paneo suave no debe estabilizarse");

const uncertain = buildStabilizationFromPath(
  samples.map((sample) => ({ ...sample, confidence: 0.4 })),
  1920,
  1080
);
assert.equal(uncertain.autoEnabled, false, "no se corrige una estimación sin confianza");

const advanced = {
  version: 2,
  source: "companion-opencv",
  autoEnabled: true,
  confidence: 0.9,
  cropScale: 1.01,
  jitterRmsPx: 1.2,
  reason: "fixture v2",
  keyframes: [
    { time: 0, dx: -0.002, dy: 0.001, rotation: -0.4, scale: 0.998, confidence: 0.9 },
    { time: 1, dx: 0.002, dy: -0.001, rotation: 0.4, scale: 1.002, confidence: 0.9 },
  ],
};
const advancedHalf = sourceTransformAt(advanced, 0.25, true, 0.5);
assert.ok(advancedHalf.dx < 0 && advancedHalf.dy > 0, "v2 interpola traslación");
assert.ok(advancedHalf.rotation < 0 && advancedHalf.rotation > -0.21, "la intensidad escala la rotación");
assert.ok(advancedHalf.scale > 1 && advancedHalf.scale < advanced.cropScale, "crop y escala local se combinan gradualmente");
assert.deepEqual(
  sourceTransformAt(advanced, 0.25, true, 0),
  { dx: 0, dy: 0, scale: 1, rotation: 0 },
  "intensidad 0 conserva identidad"
);

console.log("✓ estabilización: elimina microjitter, interpola v2 y respeta intensidad/paneos");
