import React, { useState } from 'react';
import { KeyRound, Lock, Settings, X } from 'lucide-react';
import { isSupabaseConfigured, verifyAndUnlockVaultToken } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, setSettingsModalOpen, initSupabaseSync } =
    useVaultStore();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!authModalOpen) return null;

  const configured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await verifyAndUnlockVaultToken(token.trim());
      await initSupabaseSync();
      setToken('');
      setAuthModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid Vault Access Token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={() => setAuthModalOpen(false)}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl dark-glass shadow-glass border border-[#d4a853]/40 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#1d222b] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-md bg-[#d4a853]/15 text-[#eab308]">
              <Lock className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
                Unlock &amp; Sync Vault
              </h3>
              <p className="text-[11px] text-[#858d9b]">
                Enter shared Access Token to sync across devices
              </p>
            </div>
          </div>
          <button onClick={() => setAuthModalOpen(false)} className="text-[#858d9b] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!configured && (
            <div className="p-3 rounded-md bg-[#181c24] border border-[#d4a853]/30 text-xs text-[#d5d0c5] space-y-2">
              <p>Supabase credentials are not configured yet.</p>
              <button
                type="button"
                onClick={() => {
                  setAuthModalOpen(false);
                  setSettingsModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 text-[#d4a853] hover:underline font-medium"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configure Supabase Credentials</span>
              </button>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-[#9aa3b2] mb-1.5">Access Token</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#d4a853] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your passphrase token..."
                className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md pl-9 pr-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="px-3 py-2 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[#1d222b]">
            <button
              type="button"
              onClick={() => setAuthModalOpen(false)}
              className="text-xs text-[#858d9b] hover:text-[#e7e2d8]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!configured || loading || !token.trim()}
              className="px-4 py-2 rounded-md btn-gold-metallic text-xs font-semibold disabled:opacity-45"
            >
              {loading ? 'Unlocking...' : 'Unlock & Sync'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
