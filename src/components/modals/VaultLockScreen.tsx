import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, RefreshCw, Settings } from 'lucide-react';
import { isSupabaseConfigured, verifyAndUnlockVaultToken } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import { AethelgardCrest } from '../common/EntityIcon';

export const VaultLockScreen: React.FC = () => {
  const { syncStatus, initSupabaseSync, setSettingsModalOpen } = useVaultStore();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const checkingSession = syncStatus === 'connecting';

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await verifyAndUnlockVaultToken(token.trim());
      await initSupabaseSync();
      setToken('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid access token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-[#07090d] text-[#e7e2d8] flex items-center justify-center p-4 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 50% 35%, rgba(212, 168, 83, 0.08), transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0b0e14]/95 border border-[#222834] shadow-[0_24px_70px_rgba(0,0,0,0.75)] overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-transparent via-[#d4a853]/70 to-transparent" />

        <div className="px-6 pt-7 pb-5 text-center border-b border-[#181d26]">
          <div className="mx-auto w-12 h-12 rounded-xl bg-[#121620] border border-[#d4a853]/35 flex items-center justify-center mb-3.5">
            <AethelgardCrest className="w-7 h-7" />
          </div>
          <h1 className="font-serif text-xl font-semibold tracking-wider text-[#f5efe4]">
            AETHELGARD VAULT
          </h1>
          <p className="text-xs text-[#8892a3] mt-1">
            Enter your Vault Token to unlock &amp; sync your campaign.
          </p>
        </div>

        {checkingSession ? (
          <div className="px-6 py-10 flex flex-col items-center gap-3 text-xs text-[#9aa3b2]">
            <RefreshCw className="w-5 h-5 text-[#d4a853] animate-spin" />
            <span>Verifying vault token...</span>
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="p-6 space-y-4">
            {!configured && (
              <div className="p-3 rounded-lg bg-[#141821] border border-[#d4a853]/30 text-xs text-[#d5d0c5] flex items-center justify-between gap-2">
                <span>Supabase connection is missing.</span>
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(true)}
                  className="text-[#eab308] hover:underline font-medium shrink-0"
                >
                  Configure
                </button>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#9aa3b2] mb-1.5">
                Access Token
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#d4a853] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showToken ? 'text' : 'password'}
                  autoFocus
                  autoComplete="current-password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter your passphrase token..."
                  className="w-full bg-[#07090d] border border-[#242a35] rounded-lg pl-10 pr-10 py-2.5 text-sm font-mono text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e7787] hover:text-[#d5d0c5]"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="px-3 py-2 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!configured || loading || !token.trim()}
              className="w-full py-2.5 rounded-lg btn-gold-metallic text-xs font-semibold tracking-wide flex items-center justify-center gap-2 disabled:opacity-45"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Unlocking...' : 'Unlock Vault'}</span>
            </button>

            <div className="pt-3 border-t border-[#161b23] flex items-center justify-between text-[11px] text-[#7c8596]">
              <span>Shared token syncs all devices</span>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                title="Supabase Connection Settings"
                className="inline-flex items-center gap-1 hover:text-[#d5d0c5] transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
