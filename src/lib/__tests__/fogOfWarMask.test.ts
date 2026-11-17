import { describe, expect, it } from 'vitest';
import {
  FOG_MASK_SIZE,
  createFogMask,
  maskNormToWorldXZ,
  paintFogCircle,
  unionFogMasks,
  worldXZToMaskNorm,
} from '../fogOfWarMask';

describe('fogOfWarMask', () => {
  it('allocates a 256x256 mask initialized cleanly', () => {
    const empty = createFogMask(0);
    expect(empty.length).toBe(FOG_MASK_SIZE * FOG_MASK_SIZE);
    expect(empty[0]).toBe(0);

    const revealed = createFogMask(255);
    expect(revealed[0]).toBe(255);
    expect(revealed[revealed.length - 1]).toBe(255);
  });

  it('paints a circular reveal region and hides pixels when toggled off', () => {
    const mask = createFogMask(0);
    const changedReveal = paintFogCircle(mask, 0.5, 0.5, 0.1, true);
    expect(changedReveal).toBe(true);

    const centerIdx = Math.floor(FOG_MASK_SIZE / 2) * FOG_MASK_SIZE + Math.floor(FOG_MASK_SIZE / 2);
    expect(mask[centerIdx]).toBe(255);
    expect(mask[0]).toBe(0);

    const changedHide = paintFogCircle(mask, 0.5, 0.5, 0.1, false);
    expect(changedHide).toBe(true);
    expect(mask[centerIdx]).toBe(0);
  });

  it('unions multiple player and shared masks with pixel-wise max', () => {
    const m1 = createFogMask(0);
    const m2 = createFogMask(0);
    paintFogCircle(m1, 0.25, 0.25, 0.08, true);
    paintFogCircle(m2, 0.75, 0.75, 0.08, true);

    const combined = unionFogMasks([m1, m2]);
    const idx1 = Math.floor(FOG_MASK_SIZE * 0.25) * FOG_MASK_SIZE + Math.floor(FOG_MASK_SIZE * 0.25);
    const idx2 = Math.floor(FOG_MASK_SIZE * 0.75) * FOG_MASK_SIZE + Math.floor(FOG_MASK_SIZE * 0.75);
    expect(combined[idx1]).toBe(255);
    expect(combined[idx2]).toBe(255);
    expect(combined[0]).toBe(0);
  });

  it('converts round-trip between world XZ coordinates and normalized mask UV', () => {
    const uv = worldXZToMaskNorm(25, -50, 100);
    expect(uv.u).toBeCloseTo(0.75, 5);
    expect(uv.v).toBeCloseTo(0, 5);

    const world = maskNormToWorldXZ(uv.u, uv.v, 100);
    expect(world.x).toBeCloseTo(25, 5);
    expect(world.z).toBeCloseTo(-50, 5);
  });
});
