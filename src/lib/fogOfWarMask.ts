import * as THREE from 'three';

export const FOG_MASK_SIZE = 256;

/**
 * Allocates a 256x256 single-channel fog mask.
 * 0 = shrouded (hidden), 255 = explored (revealed).
 */
export function createFogMask(fillValue = 0): Uint8Array {
  const mask = new Uint8Array(FOG_MASK_SIZE * FOG_MASK_SIZE);
  mask.fill(Math.max(0, Math.min(255, Math.round(fillValue))));
  return mask;
}

/**
 * Paints a soft-edged circular brush onto a 256x256 fog mask.
 * Coordinates normX and normZ are normalized to [0..1].
 */
export function paintFogCircle(
  mask: Uint8Array,
  normX: number,
  normZ: number,
  radiusNorm: number,
  reveal: boolean
): boolean {
  if (mask.length !== FOG_MASK_SIZE * FOG_MASK_SIZE) return false;
  const cx = normX * FOG_MASK_SIZE;
  const cz = normZ * FOG_MASK_SIZE;
  const rPx = Math.max(1, radiusNorm * FOG_MASK_SIZE);
  const rSq = rPx * rPx;

  const x0 = Math.max(0, Math.floor(cx - rPx));
  const x1 = Math.min(FOG_MASK_SIZE - 1, Math.ceil(cx + rPx));
  const z0 = Math.max(0, Math.floor(cz - rPx));
  const z1 = Math.min(FOG_MASK_SIZE - 1, Math.ceil(cz + rPx));

  let changed = false;
  for (let z = z0; z <= z1; z++) {
    const dz = z + 0.5 - cz;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const distSq = dx * dx + dz * dz;
      if (distSq > rSq) continue;
      const idx = z * FOG_MASK_SIZE + x;
      const t = Math.sqrt(distSq) / rPx;
      // Soft feather over outer 25% of radius
      const weight = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
      const prev = mask[idx];
      if (reveal) {
        const nextVal = Math.max(prev, Math.round(weight * 255));
        if (nextVal !== prev) {
          mask[idx] = nextVal;
          changed = true;
        }
      } else {
        const targetCap = Math.round((1 - weight) * 255);
        const nextVal = Math.min(prev, targetCap);
        if (nextVal !== prev) {
          mask[idx] = nextVal;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Computes pixel-wise max() union across player + shared peer fog masks.
 */
export function unionFogMasks(masks: Uint8Array[]): Uint8Array {
  const out = createFogMask(0);
  for (const m of masks) {
    if (!m || m.length !== out.length) continue;
    for (let i = 0; i < out.length; i++) {
      if (m[i] > out[i]) out[i] = m[i];
    }
  }
  return out;
}

/**
 * Encodes a 256x256 fog mask as a PNG Blob (grayscale RGB + full alpha).
 */
export async function maskToCanvasBlob(mask: Uint8Array): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = FOG_MASK_SIZE;
  canvas.height = FOG_MASK_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Blob([], { type: 'image/png' });
  }
  const imgData = ctx.createImageData(FOG_MASK_SIZE, FOG_MASK_SIZE);
  for (let i = 0; i < FOG_MASK_SIZE * FOG_MASK_SIZE; i++) {
    const v = mask[i] ?? 0;
    const o = i * 4;
    imgData.data[o] = v;
    imgData.data[o + 1] = v;
    imgData.data[o + 2] = v;
    imgData.data[o + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || new Blob([], { type: 'image/png' }));
    }, 'image/png');
  });
}

/**
 * Loads an image URL into a 256x256 Uint8Array by sampling the R channel.
 */
export async function loadMaskFromUrl(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = FOG_MASK_SIZE;
        canvas.height = FOG_MASK_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, FOG_MASK_SIZE, FOG_MASK_SIZE);
        const data = ctx.getImageData(0, 0, FOG_MASK_SIZE, FOG_MASK_SIZE).data;
        const out = createFogMask(0);
        for (let i = 0; i < FOG_MASK_SIZE * FOG_MASK_SIZE; i++) {
          out[i] = data[i * 4];
        }
        resolve(out);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Builds a Three.js DataTexture (RGBAFormat for WebGL2 compatibility) from a 256x256 mask.
 */
export function buildFogDataTexture(
  mask: Uint8Array,
  existing?: THREE.DataTexture | null
): THREE.DataTexture {
  const rgba = new Uint8Array(FOG_MASK_SIZE * FOG_MASK_SIZE * 4);
  for (let i = 0; i < FOG_MASK_SIZE * FOG_MASK_SIZE; i++) {
    const v = mask[i] ?? 0;
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }

  if (
    existing &&
    existing.image &&
    existing.image.width === FOG_MASK_SIZE &&
    existing.image.height === FOG_MASK_SIZE
  ) {
    const dest = existing.image.data as Uint8Array;
    if (dest && dest.length === rgba.length) {
      dest.set(rgba);
      existing.needsUpdate = true;
      return existing;
    }
  }

  const tex = new THREE.DataTexture(rgba, FOG_MASK_SIZE, FOG_MASK_SIZE, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function worldXZToMaskNorm(x: number, z: number, worldSize: number): { u: number; v: number } {
  const size = Math.max(1, worldSize);
  return {
    u: Math.max(0, Math.min(1, x / size + 0.5)),
    v: Math.max(0, Math.min(1, z / size + 0.5)),
  };
}

export function maskNormToWorldXZ(u: number, v: number, worldSize: number): { x: number; z: number } {
  return {
    x: (u - 0.5) * worldSize,
    z: (v - 0.5) * worldSize,
  };
}
