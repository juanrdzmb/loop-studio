export const MAX_PARTICLE_SUPERCYCLE_COPIES = 3;
export const MAX_PARTICLE_RENDER_SECONDS = 30;

export interface ParticleRenderPlan {
  renderDuration: number;
  particleLoopDuration: number;
  visualCopies: number;
  willTile: boolean;
}

/**
 * Renderiza varias vueltas visuales para que las partículas no repitan en cada
 * unión corta, pero acota el trabajo: el resto se remuxea sin recomprimir.
 */
export function resolveParticleRenderPlan(
  cycleDuration: number,
  targetDuration: number,
  particlesEnabled: boolean,
  maxCopies = MAX_PARTICLE_SUPERCYCLE_COPIES,
  maxRenderSeconds = MAX_PARTICLE_RENDER_SECONDS
): ParticleRenderPlan {
  const cycle = Math.max(1 / 120, Number.isFinite(cycleDuration) ? cycleDuration : 1);
  const target = Math.max(cycle, Number.isFinite(targetDuration) ? targetDuration : cycle);

  if (!particlesEnabled || target <= cycle + 1e-6) {
    return {
      renderDuration: cycle,
      particleLoopDuration: cycle,
      visualCopies: 1,
      willTile: target > cycle + 1e-6,
    };
  }

  const copiesByBudget = Math.max(1, Math.floor(Math.max(cycle, maxRenderSeconds) / cycle));
  const visualCopies = Math.max(
    1,
    Math.min(Math.ceil(target / cycle), Math.max(1, Math.floor(maxCopies)), copiesByBudget)
  );
  const supercycleDuration = cycle * visualCopies;
  const renderDuration = Math.min(target, supercycleDuration);

  return {
    renderDuration,
    particleLoopDuration: renderDuration,
    visualCopies: Math.ceil(renderDuration / cycle),
    willTile: target > renderDuration + 1e-6,
  };
}
