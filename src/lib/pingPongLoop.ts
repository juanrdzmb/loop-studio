export type PingPongMotionLevel = "low" | "medium" | "high";

export type PingPongFrameState = {
  /** Tiempo absoluto dentro del archivo fuente. */
  primaryTime: number;
  /** Frame estable del extremo usado para suavizar el cambio de dirección. */
  endpointTime: number;
  endpoint: "start" | "end" | null;
  /** Mezcla 0..0.55 del extremo sobre el frame en movimiento. */
  endpointMix: number;
  inTransition: boolean;
  direction: "forward" | "backward";
  phase: number;
};

/**
 * Transición breve y adaptativa. Un clip con movimiento alto usa menos mezcla
 * para evitar dobles contornos; uno casi estático admite un giro más largo.
 */
export function resolvePingPongTransitionDuration(
  sourceDuration: number,
  motion: PingPongMotionLevel = "medium"
): number {
  const base = motion === "low" ? 0.32 : motion === "high" ? 0.18 : 0.24;
  return Math.max(0.02, Math.min(base, Math.max(0.02, sourceDuration) * 0.25));
}

/**
 * Boomerang a velocidad constante: la fuente nunca acelera para compensar una
 * pausa. Cerca de cada extremo se mezcla de forma cosenoidal el propio frame de
 * giro, lo que amortigua el cambio de vector sin duplicar tiempos de fuente.
 */
export function getSmoothPingPongFrameState(
  t: number,
  sourceDuration: number,
  sourceStart: number = 0,
  motion: PingPongMotionLevel = "medium"
): PingPongFrameState {
  const duration = Math.max(0.02, sourceDuration);
  const cycle = duration * 2;
  const phase = ((t % cycle) + cycle) % cycle;
  const forward = phase <= duration;
  const localTime = forward ? phase : cycle - phase;
  const primaryTime = sourceStart + localTime;
  const transition = resolvePingPongTransitionDuration(duration, motion);

  const distanceToStart = Math.min(phase, cycle - phase);
  const distanceToEnd = Math.abs(phase - duration);
  const atStart = distanceToStart <= distanceToEnd;
  const distance = atStart ? distanceToStart : distanceToEnd;
  const inTransition = distance <= transition;

  if (!inTransition) {
    return {
      primaryTime,
      endpointTime: primaryTime,
      endpoint: null,
      endpointMix: 0,
      inTransition: false,
      direction: forward ? "forward" : "backward",
      phase,
    };
  }

  const proximity = 1 - Math.min(1, distance / transition);
  const cosine = 0.5 - 0.5 * Math.cos(Math.PI * proximity);
  const strength = motion === "high" ? 0.42 : 0.55;
  const endpoint = atStart ? "start" : "end";

  return {
    primaryTime,
    endpointTime: sourceStart + (atStart ? 0 : duration),
    endpoint,
    endpointMix: cosine * strength,
    inTransition: true,
    direction: forward ? "forward" : "backward",
    phase,
  };
}
