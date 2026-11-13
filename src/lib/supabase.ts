import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

const STORAGE_KEY = 'aethelgard_supabase_config';
const TOKEN_STORAGE_KEY = 'aethelgard_vault_token_v1';
const DEFAULT_SUPABASE_URL = 'https://wanorbimpezokyzuepoe.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9qwOuG1LDs9YK96OMxjnyQ_-n6v-fdj';

export function getSupabaseConfig(): SupabaseRuntimeConfig {
  let saved: Partial<SupabaseRuntimeConfig> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    // ignore storage errors
  }

  return {
    url: saved.url || import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    anonKey:
      saved.anonKey ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function saveSupabaseConfig(config: SupabaseRuntimeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  cachedClient = null;
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  cachedClient = null;
}

export function getStoredVaultToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveStoredVaultToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  cachedClient = null;
}

export function clearStoredVaultToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return Boolean(
    cfg.url &&
      cfg.anonKey &&
      !cfg.url.includes('your-project-ref') &&
      !cfg.anonKey.includes('your-supabase-anon-key')
  );
}

function createVaultClient(url: string, anonKey: string, vaultToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: vaultToken ? { headers: { 'x-vault-token': vaultToken } } : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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
  const token = getStoredVaultToken();
  const compositeKey = `${cfg.url}::${cfg.anonKey}::${token}`;
  if (!cachedClient || cachedKey !== compositeKey) {
    cachedClient = createVaultClient(cfg.url, cfg.anonKey, token);
    cachedKey = compositeKey;
  }
  return cachedClient;
}

export async function verifyAndUnlockVaultToken(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (!token) throw new Error('Enter your Vault Access Token.');
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Open Settings to check your URL and Key.');
  }

  const cfg = getSupabaseConfig();
  const probeClient = createVaultClient(cfg.url, cfg.anonKey, token);
  const { data, error } = await probeClient.from('vault_probe').select('id').limit(1);
  if (error) {
    throw new Error(error.message || 'Unable to verify token against Supabase.');
  }
  if (!data || data.length === 0) {
    throw new Error('Invalid Access Token.');
  }

  saveStoredVaultToken(token);
}

export async function verifyStoredVaultToken(): Promise<boolean> {
  const token = getStoredVaultToken();
  if (!token || !isSupabaseConfigured()) return false;
  const client = getSupabaseClient();
  if (!client) return false;
  const { data, error } = await client.from('vault_probe').select('id').limit(1);
  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}

export async function getVaultSyncTopic(): Promise<string> {
  const token = getStoredVaultToken();
  const input = new TextEncoder().encode(`aethelgard-vault-sync:${token}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest('SHA-256', input);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `vault-room-${hex.slice(0, 24)}`;
  }
  return 'vault-room-shared';
}

export async function uploadVaultAsset(file: File, folder = 'uploads'): Promise<string> {
  const client = getSupabaseClient();
  const token = getStoredVaultToken();
  if (!client || !token) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const ext = file.name.split('.').pop() || 'png';
  const safeName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await client.storage.from('vault-assets').upload(safeName, file, {
    upsert: true,
    cacheControl: '3600',
  });

  if (error) {
    throw error;
  }

  const { data } = client.storage.from('vault-assets').getPublicUrl(safeName);
  return data.publicUrl;
}
