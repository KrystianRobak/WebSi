import { describe, expect, it } from 'vitest';
import { computeVisibilityPolygon } from '../battlemapLighting';

describe('battlemapLighting', () => {
  it('computes a closed visibility polygon bounded by the map rectangle when unobstructed', () => {
    const poly = computeVisibilityPolygon(500, 500, 200, [], 1000, 1000);
    expect(poly.length).toBeGreaterThanOrEqual(16);
    for (const pt of poly) {
      expect(pt.x).toBeGreaterThanOrEqual(299);
      expect(pt.x).toBeLessThanOrEqual(701);
      expect(pt.y).toBeGreaterThanOrEqual(299);
      expect(pt.y).toBeLessThanOrEqual(701);
    }
  });

  it('clips light rays behind an occluding wall segment', () => {
    const wall = { x1: 550, y1: 400, x2: 550, y2: 600 };
    const poly = computeVisibilityPolygon(500, 500, 300, [wall], 1000, 1000);
    const eastPoints = poly.filter((pt) => pt.x > 555 && pt.y >= 460 && pt.y <= 540);
    expect(eastPoints.length).toBe(0);
  });
});
