import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sourceToLocalDataUrl } from './localVault';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

const STORAGE_KEY = 'aethelgard_supabase_config';

export function getSupabaseConfig(): SupabaseRuntimeConfig {
  let saved: Partial<SupabaseRuntimeConfig> = {};
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
  }

  return {
    url: (saved.url || import.meta.env.VITE_SUPABASE_URL || '').trim(),
    anonKey: (saved.anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
  };
}

export function saveSupabaseConfig(config: SupabaseRuntimeConfig): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
  cachedClient = null;
  cachedKey = '';
}

export function clearSupabaseConfig(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  cachedClient = null;
  cachedKey = '';
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return Boolean(
    cfg.url &&
      cfg.anonKey &&
      /^https?:\/\//i.test(cfg.url) &&
      !cfg.url.includes('your-project-ref') &&
      !cfg.anonKey.includes('your-supabase-anon-key')
  );
}

function createVaultClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const cfg = getSupabaseConfig();
  const compositeKey = `${cfg.url}::${cfg.anonKey}`;
  if (!cachedClient || cachedKey !== compositeKey) {
    cachedClient = createVaultClient(cfg.url, cfg.anonKey);
    cachedKey = compositeKey;
  }
  return cachedClient;
}

async function dataUrlToBlob(dataUrl: string): Promise<{ blob: Blob; ext: string }> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = blob.type.split('/')[1]?.split('+')[0] || 'png';
    return { blob, ext };
  }
  const mime = match[1] || 'image/png';
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const ext = mime.split('/')[1]?.split('+')[0] || 'png';
  return { blob: new Blob([bytes], { type: mime }), ext };
}

/**
 * Uploads a File, Blob, or data: URL directly to the authenticated Supabase Storage
 * `vault-assets` bucket. Web-only: fails cleanly when unconfigured or unauthenticated.
 */
export async function uploadAssetDataUrlOrBlob(
  source: File | Blob | string,
  folder = 'uploads',
  filename?: string
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) {
    return sourceToLocalDataUrl(source);
  }

  const { data: sessionRes } = await client.auth.getSession();
  if (!sessionRes.session) {
    throw new Error('Authentication required to upload assets to Supabase Storage.');
  }

  let uploadBody: File | Blob;
  let ext = 'png';
  let contentType: string | undefined;

  if (typeof source === 'string') {
    if (/^https?:\/\//i.test(source)) {
      return source;
    }
    const parsed = await dataUrlToBlob(source);
    uploadBody = parsed.blob;
    ext = parsed.ext;
    contentType = parsed.blob.type;
  } else {
    uploadBody = source;
    const rawName = filename || (source instanceof File ? source.name : '');
    const nameExt = rawName.includes('.') ? rawName.split('.').pop() : '';
    ext = nameExt || source.type.split('/')[1]?.split('+')[0] || 'png';
    contentType = source.type || undefined;
  }

  const cleanFolder = folder.replace(/^\/+|\/+$/g, '') || 'uploads';
  const cleanName = filename
    ? filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${cleanFolder}/${cleanName}`;

  const { error } = await client.storage.from('vault-assets').upload(path, uploadBody, {
    upsert: true,
    cacheControl: '3600',
    contentType,
  });

  if (error) {
    throw error;
  }

  const { data } = client.storage.from('vault-assets').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadVaultAsset(file: File, folder = 'uploads'): Promise<string> {
  return uploadAssetDataUrlOrBlob(file, folder, `${Date.now()}-${file.name}`);
}
