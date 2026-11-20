import React, { useEffect, useState } from 'react';
import { Cloud, Database, Image as ImageIcon, Mountain, RefreshCw, RotateCcw, X } from 'lucide-react';
import {
  clearSupabaseConfig,
  getSupabaseConfig,
  isSupabaseConfigured,
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
    resetLocalVault,
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
  const [activeTab, setActiveTab] = useState<'backend' | 'terrain'>('backend');

  const primaryMap = maps[0];
  const canEditTerrain = Boolean(primaryMap && isEffectiveGm());

  useEffect(() => {
    if (settingsModalOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      if (!canEditTerrain) setActiveTab('backend');
    }
  }, [settingsModalOpen, canEditTerrain]);

  if (!settingsModalOpen) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
    });
    await initSupabaseSync();
  };

  const handleUseLocalVault = async () => {
    clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
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
        aria-label="Workspace & Backend Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl dark-glass shadow-glass border border-[#d4a853]/35 overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-[#1d2432] flex items-center justify-between bg-[#0a0d14]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#d4a853]" />
            <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
              Workspace &amp; Backend Settings
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close Settings"
            onClick={() => setSettingsModalOpen(false)}
            className="p-1 rounded-md text-[#8b94a5] hover:text-white hover:bg-[#161c28] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {canEditTerrain && (
          <div className="px-5 pt-3 bg-[#0a0d14] border-b border-[#181e2b] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('backend')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'backend'
                  ? 'border-[#d4a853] text-[#f3ead8]'
                  : 'border-transparent text-[#8b94a5] hover:text-[#e8e2d5]'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-[#d4a853]" />
              <span>Backend &amp; Sync</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('terrain')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'terrain'
                  ? 'border-[#d4a853] text-[#f3ead8]'
                  : 'border-transparent text-[#8b94a5] hover:text-[#e8e2d5]'
              }`}
            >
              <Mountain className="w-3.5 h-3.5 text-[#d4a853]" />
              <span>3D Map Terrain</span>
            </button>
          </div>
        )}

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Storage Mode & Optional Supabase Connection */}
          {activeTab === 'backend' && (
            <form onSubmit={handleSaveConfig} className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                <span>{isSupabaseConfigured() ? 'Supabase Realtime Backend' : 'Default Local Browser Vault'}</span>
              </h4>
              <span className="font-mono text-[10.5px] text-[#8b93a1]">
                Status: {syncStatus === 'local' ? 'Local Vault' : syncStatus}{' '}
                {isAuthenticated ? `(${userEmail || 'Active'})` : '(Signed Out)'}
              </span>
            </div>

            {!isSupabaseConfigured() && (
              <div className="p-3 rounded-lg bg-[#0d111a] border border-[#1d2536] text-[11.5px] text-[#b4becd] flex items-center justify-between gap-3">
                <span>
                  Running in <strong className="text-[#f3ead8]">Default Local Vault</strong> mode. Changes save automatically in your browser.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetLocalVault();
                    setSettingsModalOpen(false);
                  }}
                  className="shrink-0 px-2.5 py-1.5 rounded-md bg-[#161c28] hover:bg-[#1e2636] border border-[#2a3346] text-[11px] text-[#e2b969] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Starter</span>
                </button>
              </div>
            )}

            <div>
              <label className="block text-[11px] text-[#9aa3b2] mb-1">
                Optional Supabase Project URL (<code className="font-mono">VITE_SUPABASE_URL</code>)
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
                Optional Supabase Anon Key (<code className="font-mono">VITE_SUPABASE_ANON_KEY</code>)
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg btn-gold-metallic text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{url.trim() && anonKey.trim() ? 'Save & Connect Supabase' : 'Use Default Local Vault'}</span>
              </button>
              {isSupabaseConfigured() && (
                <button
                  type="button"
                  onClick={handleUseLocalVault}
                  className="px-3 py-2 rounded-lg bg-[#141923] hover:bg-[#1b2230] border border-[#273042] text-xs text-[#c7c2b8]"
                >
                  Switch to Local Vault
                </button>
              )}
            </div>
          </form>
          )}

          {/* 3D Map Textures & Displacement (GM Only) */}
          {canEditTerrain && activeTab === 'terrain' && primaryMap && (
            <div className="space-y-3.5">
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
