/**
 * Smart Forward Loop — matemática compartida Preview = Export.
 *
 * Centraliza source time, fade progress, alignment, alpha y seam
 * para modo AUTO/SMOOTH forward-only. Pingpong sigue ruta separada.
 */

export interface VisualAlignment {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  confidence: number;
}

export interface ForwardLoopState {
  /** Tiempo de source para OUT (frame actual del ciclo). Monótono dentro del ciclo. */
  primaryTime: number;
  /** Tiempo de source para IN (cabeza exacta sourceStart) cuando hay crossfade. */
  secondaryTime?: number;
  /** Alpha del IN (0 = solo OUT, 1 = solo IN/head). Curva cosine. */
  mix: number;
  /** Progreso dentro del fundido 0..1 */
  progress: number;
  /** true si t está dentro de los últimos fadeSec del ciclo. */
  inTransition: boolean;
  /** Alineación interpolada para el frame IN (progresivamente a identidad). */
  alignment?: VisualAlignment;
  /** Tiempo de efecto monótono (para partículas/overlays, nunca invertido). */
  effectTime: number;
}

function smoothstep(p: number): number {
  const c = Math.max(0, Math.min(1, p));
  return c * c * (3 - 2 * c);
}

function cosineAlpha(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return 0.5 - 0.5 * Math.cos(Math.PI * p);
}

/**
 * Clamp suave para validez de alineación. Si la estimación es mala,
 * el caller no debe usarla.
 */
export function isAlignmentUsable(a?: VisualAlignment | null): boolean {
  if (!a) return false;
  if (!Number.isFinite(a.dx) || !Number.isFinite(a.dy)) return false;
  if (!Number.isFinite(a.scale) || !Number.isFinite(a.rotation)) return false;
  if (!Number.isFinite(a.confidence)) return false;
  if (a.confidence < 0.30) return false;
  return true;
}

/**
 * Estado del frame para un tiempo global t (segundos desde inicio del preview/export).
 * Garantiza forward-only: primaryTime jamás desciende dentro de un ciclo excepto el wrap
 * lógico al nuevo ciclo (gestionado por el caller via t % cycleDuration).
 *
 * @param t - tiempo global monótono (effectTime)
 * @param cycleDuration - duración del ciclo visual (para smooth == sourceDuration, para calm == sourceDuration/calmRate)
 * @param sourceDuration - duración recortada sourceEnd-sourceStart
 * @param sourceStart - inicio del tramo elegido
 * @param fadeSec - duración del crossfade (0 = sin transición)
 * @param alignment - transformación global estimada IN->OUT (opcional)
 * @param calmRate - si modo calm, factor de slowed (default 1)
 */
export function getForwardLoopFrameState(
  t: number,
  cycleDuration: number,
  sourceDuration: number,
  sourceStart: number,
  fadeSec: number,
  alignment?: VisualAlignment | null,
  calmRate: number = 1
): ForwardLoopState {
  const dur = Math.max(0.05, cycleDuration);
  const srcDur = Math.max(0.05, sourceDuration);
  const fade = Math.max(0, Math.min(fadeSec, dur * 0.4));
  const cyclePos = ((t % dur) + dur) % dur;
  const clampedRate = Number.isFinite(calmRate) && calmRate > 0 ? calmRate : 1;

  // Source time forward-only: calm ralentiza el avance
  const sourceClock = cyclePos * clampedRate;
  // Para calm, el source avanza más lento; mapeo directo:
  // Si dur = srcDur / calmRate, entonces sourceClock = cyclePos * calmRate = wrapped source offset
  // Para smooth (calmRate=1), sourceClock = cyclePos
  let offset = sourceClock % srcDur;
  if (offset < 0) offset += srcDur;
  const primaryTime = sourceStart + Math.min(srcDur - 0.001, Math.max(0, offset));

  const inTransition = fade > 0.001 && cyclePos >= dur - fade;
  let mix = 0;
  let progress = 0;
  let secondaryTime: number | undefined;
  let interpAlignment: VisualAlignment | undefined;

  if (inTransition) {
    progress = (cyclePos - (dur - fade)) / fade;
    progress = Math.max(0, Math.min(1, progress));
    mix = cosineAlpha(progress);
    secondaryTime = sourceStart;
    if (isAlignmentUsable(alignment)) {
      const amount = 1 - smoothstep(progress);
      const a = alignment!;
      interpAlignment = {
        dx: a.dx * amount,
        dy: a.dy * amount,
        scale: 1 + (a.scale - 1) * amount,
        rotation: a.rotation * amount,
        confidence: a.confidence,
      };
    }
  }

  return {
    primaryTime,
    secondaryTime,
    mix,
    progress,
    inTransition,
    alignment: interpAlignment,
    effectTime: t,
  };
}

/**
 * Helpers puros para verificación en tests.
 * Todos los primaryTime de un ciclo AUTO deben ser monótonos crecientes
 * excepto el wrap lógico al nuevo ciclo.
 */
export function isMonotonicForward(
  times: number[],
  wrapThreshold: number = 0
): boolean {
  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1]!;
    const cur = times[i]!;
    // Permitir un único salto negativo grande (wrap) por ciclo; detectamos
    // tramos descendentes largos como pingpong (más de 3 frames seguidos bajando)
    if (cur < prev - wrapThreshold) {
      // Contar cuántos frames seguidos descienden
      let descend = 1;
      for (let j = i + 1; j < times.length && times[j]! < times[j - 1]! - 1e-6; j++) descend++;
      if (descend > 3) return false;
      // wrap único es ok si después vuelve a subir
    }
  }
  return true;
}

export function forwardLoopMixCurve(p: number): number {
  return cosineAlpha(p);
}

export function forwardLoopAlignmentAmount(progress: number): number {
  return 1 - smoothstep(Math.max(0, Math.min(1, progress)));
}
