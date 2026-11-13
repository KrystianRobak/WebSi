import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Mail, RefreshCw, Settings, UserPlus } from 'lucide-react';
import {
  getSupabaseConfig,
  isSupabaseConfigured,
  signInWithCampaignToken,
  signUpWithCampaignToken,
} from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import { AethelgardCrest } from '../common/EntityIcon';

export const VaultLockScreen: React.FC = () => {
  const { syncStatus, initSupabaseSync, setSettingsModalOpen } = useVaultStore();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [configuredEmail, setConfiguredEmail] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const checkingSession = syncStatus === 'connecting';
  const showEmailField = setupOpen || !configuredEmail;

  useEffect(() => {
    const gm = getSupabaseConfig().gmEmail;
    setConfiguredEmail(gm);
    setEmail(gm);
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = (email || configuredEmail).trim();
    if (!token.trim()) return;
    if (!targetEmail) {
      setErrorMsg('Enter your GM email address once so this device knows which vault to unlock.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const { error } = await signInWithCampaignToken(token.trim(), targetEmail);
      if (error) throw error;
      setConfiguredEmail(targetEmail);
      await initSupabaseSync();
      setToken('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid access token.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !email.trim()) {
      setErrorMsg('Enter your real email address and choose an access token (min 6 characters).');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const { data, error } = await signUpWithCampaignToken(token.trim(), email.trim());
      if (error) throw error;
      setConfiguredEmail(email.trim());
      if (!data.session) {
        setInfoMsg(
          'GM account created! Click the confirmation link in your email (or disable "Confirm email" in Supabase Auth), then enter your token to unlock.'
        );
        setSetupOpen(false);
        return;
      }
      await initSupabaseSync();
      setToken('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not register GM account.');
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
            Private Campaign Grimoire — enter your Access Token to continue.
          </p>
        </div>

        {checkingSession ? (
          <div className="px-6 py-10 flex flex-col items-center gap-3 text-xs text-[#9aa3b2]">
            <RefreshCw className="w-5 h-5 text-[#d4a853] animate-spin" />
            <span>Verifying vault session...</span>
          </div>
        ) : (
          <form onSubmit={setupOpen ? handleRegister : handleUnlock} className="p-6 space-y-4">
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

            {showEmailField && (
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#9aa3b2] mb-1.5">
                  GM Account Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#d4a853] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full bg-[#07090d] border border-[#242a35] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#9aa3b2] mb-1.5">
                {setupOpen ? 'Choose Your Access Token (min 6 chars)' : 'Access Token'}
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

            {infoMsg && (
              <div className="px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
                {infoMsg}
              </div>
            )}

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
              {setupOpen ? <UserPlus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>
                {loading
                  ? setupOpen
                    ? 'Creating GM Account...'
                    : 'Unlocking Vault...'
                  : setupOpen
                  ? 'Register & Unlock'
                  : 'Unlock Vault'}
              </span>
            </button>

            <div className="pt-3 border-t border-[#161b23] flex items-center justify-between text-[11px] text-[#7c8596]">
              <button
                type="button"
                onClick={() => {
                  setSetupOpen((v) => !v);
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className="hover:text-[#d4a853] transition-colors"
              >
                {setupOpen
                  ? 'Back to sign-in'
                  : configuredEmail
                  ? 'Switch / Register GM email'
                  : 'First time? Register GM email'}
              </button>
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
