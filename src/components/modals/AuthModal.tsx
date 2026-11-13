import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, Mail, Settings, UserPlus, X } from 'lucide-react';
import {
  getSupabaseConfig,
  isSupabaseConfigured,
  signInWithCampaignToken,
  signUpWithCampaignToken,
} from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, setSettingsModalOpen, initSupabaseSync } =
    useVaultStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authModalOpen) {
      setEmail(getSupabaseConfig().gmEmail);
      setErrorMsg(null);
      setInfoMsg(null);
    }
  }, [authModalOpen]);

  if (!authModalOpen) return null;

  const configured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !email.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      if (mode === 'signup') {
        const { data, error } = await signUpWithCampaignToken(token.trim(), email.trim());
        if (error) throw error;
        if (!data.session) {
          setInfoMsg(
            'Account created! Check your email to confirm your address (or disable "Confirm email" in Supabase Auth), then unlock.'
          );
          setMode('signin');
          return;
        }
      } else {
        const { error } = await signInWithCampaignToken(token.trim(), email.trim());
        if (error) throw error;
      }
      await initSupabaseSync();
      setToken('');
      setAuthModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
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
              {mode === 'signup' ? <UserPlus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </span>
            <div>
              <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
                {mode === 'signup' ? 'Create GM Cloud Account' : 'Unlock & Sync Vault'}
              </h3>
              <p className="text-[11px] text-[#858d9b]">
                {mode === 'signup'
                  ? 'Register once to sync across all your devices'
                  : 'Sign in with the same GM credentials on any device'}
              </p>
            </div>
          </div>
          <button onClick={() => setAuthModalOpen(false)} className="text-[#858d9b] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 rounded-md bg-[#0b0d10] p-1 border border-[#1d222b]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              className={`py-1.5 text-xs rounded font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-[#d4a853]/20 text-[#f3ead8] border border-[#d4a853]/40'
                  : 'text-[#858d9b] hover:text-[#d5d0c5]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`py-1.5 text-xs rounded font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-[#d4a853]/20 text-[#f3ead8] border border-[#d4a853]/40'
                  : 'text-[#858d9b] hover:text-[#d5d0c5]'
              }`}
            >
              First-Time Register
            </button>
          </div>

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
            <label className="block text-[11px] text-[#9aa3b2] mb-1.5">GM Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#d4a853] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md pl-9 pr-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#9aa3b2] mb-1.5">
              Password / Campaign Secret (min 6 chars)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#d4a853] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter vault password..."
                className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md pl-9 pr-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>
          </div>

          {infoMsg && (
            <div className="px-3 py-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
              {infoMsg}
            </div>
          )}

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
              disabled={!configured || loading}
              className="px-4 py-2 rounded-md btn-gold-metallic text-xs font-semibold disabled:opacity-45"
            >
              {loading
                ? mode === 'signup'
                  ? 'Creating...'
                  : 'Unlocking...'
                : mode === 'signup'
                ? 'Create & Sync'
                : 'Unlock & Sync'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
