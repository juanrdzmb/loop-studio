import assert from "node:assert/strict";
import {
  MAX_PARTICLE_RENDER_SECONDS,
  resolveParticleRenderPlan,
} from "../src/lib/particleLoop.ts";

const noParticles = resolveParticleRenderPlan(4, 600, false);
assert.equal(noParticles.renderDuration, 4);
assert.equal(noParticles.visualCopies, 1);
assert.equal(noParticles.willTile, true);

const longWithParticles = resolveParticleRenderPlan(4, 600, true);
assert.equal(longWithParticles.renderDuration, 12);
assert.equal(longWithParticles.visualCopies, 3);
assert.equal(longWithParticles.particleLoopDuration, 12);
assert.equal(longWithParticles.willTile, true);

const shortWithParticles = resolveParticleRenderPlan(4, 10, true);
assert.equal(shortWithParticles.renderDuration, 10);
assert.equal(shortWithParticles.visualCopies, 3);
assert.equal(shortWithParticles.willTile, false);

const longCycle = resolveParticleRenderPlan(42, 600, true);
assert.equal(longCycle.renderDuration, 42);
assert.ok(longCycle.renderDuration >= MAX_PARTICLE_RENDER_SECONDS);
assert.equal(longCycle.visualCopies, 1);

console.log("✓ superciclo de partículas acotado y determinista");
