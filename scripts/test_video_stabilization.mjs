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

console.log("✓ estabilización: elimina microjitter sin cancelar paneos ni forzar análisis dudosos");
