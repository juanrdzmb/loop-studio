/**
 * Plan temporal del modo Extender híbrido.
 *
 * El clip se ralentiza solo hasta un suelo seguro y, si todavía no cubre la
 * duración objetivo, se repite hacia delante usando la unión visual existente.
 * Este módulo no depende del DOM para que preview, export y tests compartan la
 * misma fuente de verdad.
 */

export const DEFAULT_EXTEND_MIN_PLAYBACK_RATE = 0.65;
export const MAX_EXTEND_MIN_PLAYBACK_RATE = 1;

/** Alias conservado para consumidores que mostraban el antiguo suelo global. */
export const MIN_EXTEND_PLAYBACK_RATE = DEFAULT_EXTEND_MIN_PLAYBACK_RATE;

export type ExtendPlaybackPlan = {
  sourceDuration: number;
  targetDuration: number;
  minRate: number;
  rate: number;
  cycleDuration: number;
  repeatCount: number;
};

export function clampExtendMinPlaybackRate(rate?: number): number {
  const value = Number.isFinite(rate) ? Number(rate) : DEFAULT_EXTEND_MIN_PLAYBACK_RATE;
  return Math.min(MAX_EXTEND_MIN_PLAYBACK_RATE, Math.max(DEFAULT_EXTEND_MIN_PLAYBACK_RATE, value));
}

export function resolveExtendPlaybackPlan(
  sourceDuration: number,
  targetDuration: number,
  minRate?: number
): ExtendPlaybackPlan {
  const source = Math.max(0.25, Number.isFinite(sourceDuration) ? sourceDuration : 0.25);
  const requestedTarget = Number.isFinite(targetDuration) && targetDuration > 0
    ? targetDuration
    : source;
  const target = Math.max(source, requestedTarget);
  const safeMinRate = clampExtendMinPlaybackRate(minRate);
  const rate = target <= source
    ? 1
    : Math.min(1, Math.max(safeMinRate, source / target));
  const cycleDuration = source / rate;
  const repeatCount = Math.max(1, Math.ceil(target / cycleDuration - 1e-9));

  return {
    sourceDuration: source,
    targetDuration: requestedTarget > 0 ? requestedTarget : source,
    minRate: safeMinRate,
    rate,
    cycleDuration,
    repeatCount,
  };
}

export function resolveExtendPlaybackRate(
  sourceDuration: number,
  targetDuration: number,
  minRate?: number
): number {
  return resolveExtendPlaybackPlan(sourceDuration, targetDuration, minRate).rate;
}
