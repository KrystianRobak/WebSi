import React, { useEffect, useState } from 'react';
import { Cloud, Database, Image as ImageIcon, Mountain, RefreshCw, X } from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  uploadVaultAsset,
} from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';

export const SettingsModal: React.FC = () => {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    maps,
    updateMapAssets,
    initSupabaseSync,
    syncStatus,
    lastSyncError,
    isAuthenticated,
    userEmail,
    isEffectiveGm,
  } = useVaultStore();

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [uploadingAlbedo, setUploadingAlbedo] = useState(false);
  const [uploadingHeight, setUploadingHeight] = useState(false);

  const primaryMap = maps[0];

  useEffect(() => {
    if (settingsModalOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
    }
  }, [settingsModalOpen]);

  if (!settingsModalOpen) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
    });
    await initSupabaseSync();
  };

  const handleMapUpload = async (kind: 'albedo' | 'heightmap', file?: File) => {
    if (!file || !primaryMap) return;
    if (kind === 'albedo') setUploadingAlbedo(true);
    else setUploadingHeight(true);
    try {
      const uploadedUrl = await uploadVaultAsset(file, 'maps');
      await updateMapAssets(
        primaryMap.id,
        kind === 'albedo' ? { albedo_url: uploadedUrl } : { heightmap_url: uploadedUrl }
      );
    } finally {
      setUploadingAlbedo(false);
      setUploadingHeight(false);
    }
  };

  return (
    <div
      onClick={() => setSettingsModalOpen(false)}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Supabase Backend & 3D Terrain Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl dark-glass shadow-glass border border-[#d4a853]/40 overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-[#1d222b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#eab308]" />
            <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
              Supabase Backend &amp; 3D Terrain Settings
            </h3>
          </div>
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="text-[#858d9b] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Supabase Connection */}
          <form onSubmit={handleSaveConfig} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                <span>Supabase Realtime Backend</span>
              </h4>
              <span className="font-mono text-[10.5px] text-[#8b93a1]">
                Status: {syncStatus}{' '}
                {isAuthenticated ? `(${userEmail || 'Signed in'})` : '(Signed Out)'}
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-[#9aa3b2] mb-1">
                Supabase Project URL (<code className="font-mono">VITE_SUPABASE_URL</code>)
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 font-mono text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#9aa3b2] mb-1">
                Supabase Anon Key (<code className="font-mono">VITE_SUPABASE_ANON_KEY</code>)
              </label>
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOi..."
                className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 font-mono text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            {lastSyncError && (
              <div className="p-2 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                {lastSyncError}
              </div>
            )}

            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-md btn-gold-metallic text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Save &amp; Reconnect</span>
            </button>
          </form>

          {/* 3D Map Textures & Displacement (GM Only) */}
          {primaryMap && isEffectiveGm() && (
            <div className="pt-4 border-t border-[#1d222b] space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
                <Mountain className="w-3.5 h-3.5" />
                <span>3D Terrain Textures ({primaryMap.name})</span>
              </h4>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-[#141820] border border-[#242a35] hover:border-[#d4a853]/50 text-xs text-[#e7e2d8]">
                  <ImageIcon className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>{uploadingAlbedo ? 'Uploading...' : 'Upload Albedo Map'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMapUpload('albedo', e.target.files?.[0])}
                  />
                </label>

                <label className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-[#141820] border border-[#242a35] hover:border-[#d4a853]/50 text-xs text-[#e7e2d8]">
                  <Mountain className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>{uploadingHeight ? 'Uploading...' : 'Upload Heightmap'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMapUpload('heightmap', e.target.files?.[0])}
                  />
                </label>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-[#9aa3b2] mb-1">
                  <span>Elevation Displacement Scale</span>
                  <span className="font-mono text-[#d4a853]">
                    {primaryMap.displacement_scale}
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={28}
                  step={0.5}
                  value={primaryMap.displacement_scale}
                  onChange={(e) =>
                    updateMapAssets(primaryMap.id, {
                      displacement_scale: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
