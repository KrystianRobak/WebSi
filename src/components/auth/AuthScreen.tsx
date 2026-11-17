import React, { useState } from 'react';
import { KeyRound, Mail, Settings, Sparkles, Ticket, User } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import { AethelgardCrest } from '../common/EntityIcon';

type AuthTabMode = 'signin' | 'signup' | 'reset';

export const AuthScreen: React.FC = () => {
  const {
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    pendingInviteCode,
    setPendingInviteCode,
    setSettingsModalOpen,
  } = useVaultStore();

  const [mode, setMode] = useState<AuthTabMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!configured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or configure in Settings.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const res = await signInWithPassword(email, password);
        if (res.error) setError(res.error);
      } else if (mode === 'signup') {
        const res = await signUpWithPassword(email, password, displayName);
        if (res.error) {
          setError(res.error);
        } else if (res.needsConfirmation) {
          setInfoMessage(
            'Account created! Check your email inbox for the confirmation link before signing in.'
          );
        }
      } else {
        const res = await requestPasswordReset(email);
        if (res.error) setError(res.error);
        else setInfoMessage('Password reset instructions sent if an account exists for that email.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-[#ded8cc] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle atmospheric radial glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 25%, rgba(182, 141, 64, 0.16), transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl dark-glass border border-[#d4a853]/35 shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[#181d27] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AethelgardCrest className="w-8 h-8" />
            <div>
              <h1 className="font-serif text-xl font-semibold text-[#f3ead8] tracking-wide">
                Aethelgard Vault
              </h1>
              <p className="text-[11px] text-[#8d96a6]">
                Multi-Campaign VTT, West Marches &amp; Lore Grimoire
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            title="Configure Supabase Connection"
            className="p-2 rounded-lg bg-[#0d1016] border border-[#1d2330] text-[#9aa3b2] hover:text-[#d4a853] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!configured && (
            <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200 space-y-1.5">
              <p className="font-semibold">Supabase Environment Required</p>
              <p className="text-[11px] text-amber-200/80">
                Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in{' '}
                <code className="font-mono">.env</code> or open Settings to connect.
              </p>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#f3ead8] underline"
              >
                <Settings className="w-3 h-3" /> Open Connection Settings
              </button>
            </div>
          )}

          {pendingInviteCode && (
            <div className="p-3 rounded-lg bg-[#b68d40]/12 border border-[#b68d40]/45 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#f3ead8]">
                <Ticket className="w-4 h-4 text-[#d4a853] shrink-0" />
                <span>
                  Campaign Invite Ready:{' '}
                  <strong className="font-mono text-[#d4a853]">{pendingInviteCode}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingInviteCode(null)}
                className="text-[10.5px] text-[#8d96a6] hover:text-white"
              >
                Clear
              </button>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#090b10] border border-[#181d27]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-[#171c26] text-[#f3ead8] border border-[#d4a853]/35'
                  : 'text-[#7e8796] hover:text-[#ded8cc]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-[#171c26] text-[#f3ead8] border border-[#d4a853]/35'
                  : 'text-[#7e8796] hover:text-[#ded8cc]'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-display-name"
                  className="block text-[11px] text-[#9aa3b2] mb-1"
                >
                  Display Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-[#7a8291] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-display-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Lyra Silverwind"
                    className="w-full bg-[#090b10] border border-[#222936] rounded-lg pl-9 pr-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-[11px] text-[#9aa3b2] mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-[#7a8291] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adventurer@realm.com"
                  className="w-full bg-[#090b10] border border-[#222936] rounded-lg pl-9 pr-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label htmlFor="auth-password" className="block text-[11px] text-[#9aa3b2] mb-1">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-[#7a8291] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-[#090b10] border border-[#222936] rounded-lg pl-9 pr-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200"
              >
                {error}
              </div>
            )}

            {infoMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
                {infoMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg btn-gold-metallic text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {busy
                  ? 'Connecting...'
                  : mode === 'signin'
                  ? 'Sign In'
                  : mode === 'signup'
                  ? 'Create Account'
                  : 'Send Reset Email'}
              </span>
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-[#7e8796] pt-1">
            {mode !== 'reset' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="hover:text-[#d4a853] transition-colors"
              >
                Forgot password?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="hover:text-[#d4a853] transition-colors"
              >
                Back to Sign In
              </button>
            )}
            <span className="font-mono text-[10px] text-[#5c6473]">Supabase Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
};
