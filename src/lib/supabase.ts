import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
  gmEmail: string;
}

const STORAGE_KEY = 'aethelgard_supabase_config';
const DEFAULT_SUPABASE_URL = 'https://wanorbimpezokyzuepoe.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9qwOuG1LDs9YK96OMxjnyQ_-n6v-fdj';
const DEFAULT_GM_EMAIL = '';

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
    gmEmail: saved.gmEmail || import.meta.env.VITE_GM_EMAIL || DEFAULT_GM_EMAIL,
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

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const cfg = getSupabaseConfig();
  const compositeKey = `${cfg.url}::${cfg.anonKey}`;
  if (!cachedClient || cachedKey !== compositeKey) {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    cachedKey = compositeKey;
  }
  return cachedClient;
}

export async function signInWithCampaignToken(token: string, emailOverride?: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Open Settings to add your Supabase URL and Key.');
  }
  const cfg = getSupabaseConfig();
  const email = (emailOverride || cfg.gmEmail).trim();
  if (emailOverride && email !== cfg.gmEmail) {
    saveSupabaseConfig({ ...cfg, gmEmail: email });
  }
  return client.auth.signInWithPassword({
    email,
    password: token,
  });
}

export async function signUpWithCampaignToken(token: string, emailOverride?: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Open Settings to add your Supabase URL and Key.');
  }
  const cfg = getSupabaseConfig();
  const email = (emailOverride || cfg.gmEmail).trim();
  if (email !== cfg.gmEmail) {
    saveSupabaseConfig({ ...cfg, gmEmail: email });
  }
  return client.auth.signUp({
    email,
    password: token,
  });
}

export async function uploadVaultAsset(file: File, folder = 'uploads'): Promise<string> {
  const client = getSupabaseClient();
  if (!client) {
    // Offline/demo fallback: return a Data URL so local preview works immediately
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    // Local demo session without authenticated cloud user falls back cleanly to Data URL
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
