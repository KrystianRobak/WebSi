export interface Segment2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point2D {
  x: number;
  y: number;
}

function intersectRaySegment(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  seg: Segment2D
): { x: number; y: number; dist: number } | null {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-8) return null;

  const qpx = seg.x1 - ox;
  const qpy = seg.y1 - oy;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;

  if (t >= 0 && u >= -1e-4 && u <= 1 + 1e-4) {
    return { x: ox + dx * t, y: oy + dy * t, dist: t };
  }
  return null;
}

/**
 * Computes a 2D raycast visibility polygon clipped by walls, closed doors, and map bounds.
 * Lightweight enough to run per-frame for multiple dynamic light sources.
 */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  radiusPx: number,
  blockers: Segment2D[],
  mapWidth: number,
  mapHeight: number
): Point2D[] {
  const r = Math.max(40, radiusPx);
  const minX = Math.max(0, ox - r);
  const maxX = Math.min(mapWidth, ox + r);
  const minY = Math.max(0, oy - r);
  const maxY = Math.min(mapHeight, oy + r);

  // Bounding box segments ensure rays always terminate cleanly
  const segments: Segment2D[] = [
    ...blockers,
    { x1: minX, y1: minY, x2: maxX, y2: minY },
    { x1: maxX, y1: minY, x2: maxX, y2: maxY },
    { x1: maxX, y1: maxY, x2: minX, y2: maxY },
    { x1: minX, y1: maxY, x2: minX, y2: minY },
  ];

  const angles: number[] = [];
  const pushAngle = (x: number, y: number) => {
    const a = Math.atan2(y - oy, x - ox);
    angles.push(a - 0.0003, a, a + 0.0003);
  };

  for (const s of segments) {
    // Skip segments completely outside light AABB
    if (
      Math.max(s.x1, s.x2) < minX ||
      Math.min(s.x1, s.x2) > maxX ||
      Math.max(s.y1, s.y2) < minY ||
      Math.min(s.y1, s.y2) > maxY
    ) {
      continue;
    }
    pushAngle(s.x1, s.y1);
    pushAngle(s.x2, s.y2);
  }

  // Add 16 radial compass angles so circular falloff remains smooth
  for (let i = 0; i < 16; i++) {
    angles.push(-Math.PI + (i / 16) * Math.PI * 2);
  }

  const hits: Array<{ x: number; y: number; angle: number }> = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let closest: { x: number; y: number; dist: number } | null = null;

    for (const seg of segments) {
      const hit = intersectRaySegment(ox, oy, dx, dy, seg);
      if (hit && (!closest || hit.dist < closest.dist)) {
        closest = hit;
      }
    }

    if (closest) {
      hits.push({ x: closest.x, y: closest.y, angle });
    }
  }

  hits.sort((a, b) => a.angle - b.angle);
  return hits.map(({ x, y }) => ({ x, y }));
}
