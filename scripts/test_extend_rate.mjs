#!/usr/bin/env node
// Tests puros del modo Extender híbrido. Importan el módulo real para que la
// prueba no pueda divergir silenciosamente de preview/export.

import {
  DEFAULT_EXTEND_MIN_PLAYBACK_RATE,
  clampExtendMinPlaybackRate,
  resolveExtendPlaybackPlan,
  resolveExtendPlaybackRate,
} from "../src/lib/extendPlayback.ts";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`OK   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sourceTimeForExtend(t, sourceDuration, sourceStart, targetDuration, minRate) {
  const plan = resolveExtendPlaybackPlan(sourceDuration, targetDuration, minRate);
  const sourceClock = t * plan.rate;
  const m = sourceClock % plan.sourceDuration;
  return sourceStart + (m < 0 ? m + plan.sourceDuration : m);
}

// A. Velocidad segura y personalizable.
{
  const defaultPlan = resolveExtendPlaybackPlan(6, 25);
  check(
    "A1: clip 6s sobre target 25s usa el suelo 0.65×",
    Math.abs(defaultPlan.rate - 0.65) < 1e-9,
    `rate=${defaultPlan.rate}`
  );
  check(
    "A2: la velocidad nunca baja del suelo elegido",
    Math.abs(resolveExtendPlaybackRate(10, 25) - DEFAULT_EXTEND_MIN_PLAYBACK_RATE) < 1e-9
  );
  check(
    "A3: una proporción natural mayor que el suelo se conserva",
    Math.abs(resolveExtendPlaybackRate(20, 25) - 0.8) < 1e-9
  );
  check("A4: un clip que cubre el target queda a 1×", resolveExtendPlaybackRate(30, 25) === 1);
  check("A5: target inválido queda a 1×", resolveExtendPlaybackRate(6, 0) === 1);
  check("A6: el control se limita a 0.65×–1×", clampExtendMinPlaybackRate(0.2) === 0.65 && clampExtendMinPlaybackRate(1.5) === 1);
  check("A7: suelo elegido 0.8× se respeta", resolveExtendPlaybackRate(6, 25, 0.8) === 0.8);
}

// B. Plan híbrido: ralentiza de forma moderada y después repite.
{
  const plan = resolveExtendPlaybackPlan(6, 25);
  check("B1: el ciclo dura clip/rate", Math.abs(plan.cycleDuration - 6 / 0.65) < 1e-9);
  check("B2: 6s→25s necesita 3 pasadas", plan.repeatCount === 3, `pasadas=${plan.repeatCount}`);
  check("B3: el plan conserva el target exacto", plan.targetDuration === 25);

  const longPlan = resolveExtendPlaybackPlan(6, 180);
  check("B4: canciones largas no reducen más la velocidad", longPlan.rate === 0.65);
  check("B5: el número de pasadas cubre el target", longPlan.repeatCount === 20, `pasadas=${longPlan.repeatCount}`);

  const fullPlan = resolveExtendPlaybackPlan(30, 25);
  check("B6: clip largo usa un único ciclo completo", fullPlan.rate === 1 && fullPlan.repeatCount === 1);
}

// C. Mapeo temporal forward-only compartido por preview y export.
{
  const clip = 6;
  const target = 25;
  const plan = resolveExtendPlaybackPlan(clip, target);
  const fps = 60;
  const frames = Math.round(plan.cycleDuration * fps) * 2;
  let previous = -1;
  let wraps = 0;
  let smallDescents = false;
  let inRange = true;

  for (let i = 0; i < frames; i += 1) {
    const sourceTime = sourceTimeForExtend(i / fps, clip, 1.25, target, plan.minRate);
    if (sourceTime < previous - 1e-6) {
      if (previous - sourceTime > clip * 0.5) wraps += 1;
      else smallDescents = true;
    }
    if (sourceTime < 1.25 - 1e-6 || sourceTime >= 1.25 + clip + 1e-6) inRange = false;
    previous = sourceTime;
  }

  check("C1: Extender nunca invierte el movimiento", !smallDescents);
  check("C2: source time permanece dentro del recorte", inRange);
  check("C3: dos ciclos contienen un único wrap", wraps === 1, `wraps=${wraps}`);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) fallaron`);
  process.exit(1);
}

console.log("\nTodos los tests del modo Extender híbrido pasaron");
