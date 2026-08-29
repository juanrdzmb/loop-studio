#!/usr/bin/env node
// Tests del modo "Extender" (forward-only ralentizado).
// Replican la matemática de src/lib/mangaMotionExport.ts:
//   - resolveExtendPlaybackRate / clampExtendPlaybackRate
//   - computeVisualCycleDuration (seam "extend")
//   - sourceTimeForExport (seam "extend", con y sin target)
//   - computeVisualCrossfadeDuration (seam "extend")
// Si la fórmula del motor cambia, este archivo debe actualizarse en bloque.

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`OK   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const MIN_EXTEND_PLAYBACK_RATE = 0.15;
function clampExtendPlaybackRate(rate) {
  const value = Number.isFinite(rate) ? rate : 1;
  return Math.min(1, Math.max(MIN_EXTEND_PLAYBACK_RATE, value));
}
function resolveExtendPlaybackRate(sourceDuration, targetDuration) {
  const clip = Math.max(0.25, sourceDuration);
  const target = Math.max(
    clip,
    Number.isFinite(targetDuration) && targetDuration > 0 ? targetDuration : clip
  );
  return clampExtendPlaybackRate(clip / target);
}
function computeVisualCycleDurationExtend(clip, targetDuration) {
  return clip / resolveExtendPlaybackRate(clip, targetDuration);
}
function sourceTimeForExportExtend(t, sourceDuration, sourceStart = 0, targetDuration) {
  if (sourceDuration <= 0.05) return sourceStart;
  const rate = resolveExtendPlaybackRate(sourceDuration, targetDuration ?? sourceDuration);
  const m = (t * rate) % sourceDuration;
  return sourceStart + (m < 0 ? m + sourceDuration : m);
}
function computeVisualCrossfadeDurationExtend(loopCrossfadeDuration, cycleDuration) {
  const base = loopCrossfadeDuration || 0.4;
  return Math.min(1.0, Math.max(0.25, Math.min(base, cycleDuration * 0.15)));
}

// ── A. Velocidad derivada ────────────────────────────────────────────────
{
  const r = resolveExtendPlaybackRate(6, 25);
  check("A1: clip 6s sobre target 25s → rate 0.24", Math.abs(r - 0.24) < 1e-9, `rate=${r}`);
// ── B. Duración del ciclo ────────────────────────────────────────────────
{
  const cycle = computeVisualCycleDurationExtend(6, 25);
  check("B1: ciclo = target cuando rate sin clamp (6s→25s)", Math.abs(cycle - 25) < 1e-6, `cycle=${cycle}`);
  const cycleFloor = computeVisualCycleDurationExtend(6, 180);
  check("B2: con piso 0.15, ciclo = clip/rate (40s)", Math.abs(cycleFloor - 40) < 1e-6, `cycle=${cycleFloor}`);
  const cycleFull = computeVisualCycleDurationExtend(30, 25);
  check("B3: clip largo → ciclo = clip (sin acelerar)", Math.abs(cycleFull - 30) < 1e-6, `cycle=${cycleFull}`);
}

// ── C. Mapeo temporal forward-only ───────────────────────────────────────
{
  const clip = 6, target = 25, start = 0;
  const rate = resolveExtendPlaybackRate(clip, target);
  const cycle = clip / rate;
  const fps = 30;
  // Dos ciclos completos: el wrap del source ocurre exactamente en la frontera.
  const n = Math.round(cycle * fps) * 2;
  let inRange = true;
  let wraps = 0;
  let smallDescents = false;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const s = sourceTimeForExportExtend(t, clip, start, target);
    if (s < prev - 1e-6) {
      // Solo se permite el salto grande del wrap (≈ clip entero hacia atrás);
      // una deriva descendente pequeña indicaría movimiento inverso.
      if (prev - s > clip * 0.5) wraps++;
      else smallDescents = true;
    }
    if (s < start - 1e-6 || s > start + clip - 0.001 + 1e-6) inRange = false;
    prev = s;
  }
  check("C1: sin movimiento inverso (solo el salto del wrap de frontera)", !smallDescents);
  check("C2: source time dentro del rango del clip", inRange);
  check("C3: exactamente un wrap en dos ciclos", wraps === 1, `wraps=${wraps}`);
  check("C4: ciclo × rate devuelve el clip completo", Math.abs(cycle * rate - clip) < 1e-6);
  const s1 = sourceTimeForExportExtend(2.5, clip, 0, undefined);
  check("C5: sin target, t mapea 1:1 como smooth", Math.abs(s1 - 2.5) < 1e-9, `s=${s1}`);
  const s2 = sourceTimeForExportExtend(0, clip, 1.25, target);
  check("C6: sourceStart de LoopyCut respetado en t=0", Math.abs(s2 - 1.25) < 1e-9, `s=${s2}`);
  const cycleFloor = computeVisualCycleDurationExtend(6, 180);
  const copies = Math.max(1, Math.ceil(180 / cycleFloor - 1e-6));
  check("C7: clip 6s + canción 180s → 5 copias con fundidos ocultos", copies === 5, `copies=${copies}`);
}

// ── D. Crossfade del modo Extender ───────────────────────────────────────
{
  const fade = computeVisualCrossfadeDurationExtend(0.4, 25);
  check("D1: ciclo largo → fade = base 0.4s", Math.abs(fade - 0.4) < 1e-9, `fade=${fade}`);
  const fade2 = computeVisualCrossfadeDurationExtend(0.4, 1);
  check("D2: ciclo corto → fade mínimo 0.25s", Math.abs(fade2 - 0.25) < 1e-9, `fade=${fade2}`);
  const fade3 = computeVisualCrossfadeDurationExtend(2.5, 20);
  check("D3: fade techo 1.0s (sin ghosting largo)", Math.abs(fade3 - 1.0) < 1e-9, `fade=${fade3}`);
}

// ── E. Caso del usuario: clip 6s, canción completa ───────────────────────
{
  const clip = 6;
  for (const target of [25, 30, 60]) {
    const rate = resolveExtendPlaybackRate(clip, target);
    const cycle = clip / rate;
    const lastIn = sourceTimeForExportExtend(target - 0.05, clip, 0, target);
    check(`E: target ${target}s → rate ${rate.toFixed(2)}×, ciclo ${cycle.toFixed(1)}s, último frame dentro del clip`,
      lastIn <= clip + 1e-6 && rate >= MIN_EXTEND_PLAYBACK_RATE - 1e-9,
      `last=${lastIn.toFixed(2)}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) fallaron`);
  process.exit(1);
}
console.log("\nTodos los tests del modo Extender pasaron");

  const r2 = resolveExtendPlaybackRate(10, 25);
  check("A2: clip 10s sobre target 25s → rate 0.4", Math.abs(r2 - 0.4) < 1e-9, `rate=${r2}`);
  const r3 = resolveExtendPlaybackRate(6, 180);
  check("A3: clip 6s sobre 180s → piso 0.15 (sin congelar)", Math.abs(r3 - MIN_EXTEND_PLAYBACK_RATE) < 1e-9, `rate=${r3}`);
  const r4 = resolveExtendPlaybackRate(30, 25);
  check("A4: clip cubre el target → rate 1× (comportamiento smooth)", r4 === 1, `rate=${r4}`);
  const r5 = resolveExtendPlaybackRate(6, 0);
  check("A5: target inválido → rate 1×", r5 === 1, `rate=${r5}`);
}
