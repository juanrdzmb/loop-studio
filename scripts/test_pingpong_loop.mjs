import assert from "node:assert/strict";

import {
  getSmoothPingPongFrameState,
  resolvePingPongTransitionDuration,
} from "../src/lib/pingPongLoop.ts";

const closeTo = (actual, expected, tolerance, message) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: esperado ${expected}, recibido ${actual}`
  );
};

assert.equal(resolvePingPongTransitionDuration(10, "low"), 0.32);
assert.equal(resolvePingPongTransitionDuration(10, "medium"), 0.24);
assert.equal(resolvePingPongTransitionDuration(10, "high"), 0.18);
assert.ok(resolvePingPongTransitionDuration(0.5, "low") <= 0.125);

for (const fps of [23.976, 24, 29.97, 30, 59.94]) {
  const duration = 10;
  const frameDuration = 1 / fps;
  const totalFrames = Math.round(duration * 2 * fps);
  let previous = getSmoothPingPongFrameState(0, duration, 2, "medium");

  assert.equal(previous.direction, "forward");
  closeTo(previous.primaryTime, 2, 1e-9, `${fps} fps empieza en el recorte`);

  for (let i = 1; i < totalFrames; i++) {
    const state = getSmoothPingPongFrameState(i * frameDuration, duration, 2, "medium");
    const delta = Math.abs(state.primaryTime - previous.primaryTime);

    // Cadencia 1x estable fuera del giro; el frame que cruza un extremo puede ser
    // más corto si la duración no cae exactamente en la rejilla de ese FPS.
    assert.ok(delta > 1e-6, `${fps} fps no repite frames en ${i}`);
    assert.ok(delta <= frameDuration + 2e-4, `${fps} fps no salta frames en ${i}`);
    if (!state.inTransition && !previous.inTransition) {
      closeTo(delta, frameDuration, 2e-4, `${fps} fps conserva avance uniforme en frame ${i}`);
    }
    assert.ok(state.endpointMix >= 0 && state.endpointMix <= 0.55);
    if (!state.inTransition) assert.equal(state.endpointMix, 0);
    if (state.endpoint === "start") closeTo(state.endpointTime, 2, 1e-9, "endpoint inicial");
    if (state.endpoint === "end") closeTo(state.endpointTime, 12, 1e-9, "endpoint final");
    previous = state;
  }

  const atTurn = getSmoothPingPongFrameState(duration, duration, 2, "medium");
  assert.equal(atTurn.endpoint, "end");
  closeTo(atTurn.primaryTime, 12, 1e-9, `${fps} fps alcanza el extremo una sola vez`);
  closeTo(atTurn.endpointMix, 0.55, 1e-9, `${fps} fps suaviza el extremo`);

  const wrapped = getSmoothPingPongFrameState(duration * 2, duration, 2, "medium");
  closeTo(wrapped.primaryTime, 2, 1e-9, `${fps} fps cierra exactamente`);
  assert.equal(wrapped.endpoint, "start");
}

console.log("✓ boomerang: cadencia uniforme, transición acotada y ciclo exacto");
