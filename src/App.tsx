import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthScreen } from './components/auth/AuthScreen';
import { SettingsModal } from './components/modals/SettingsModal';
import { PlayShell } from './components/play/PlayShell';
import { StudioShell } from './components/studio/StudioShell';
import {
  parseAppModeFromHash,
  resolveEffectiveAppMode,
  setUrlAppMode,
} from './lib/appRouter';
import { useVaultStore } from './store/useVaultStore';

export function App() {
  const {
    appMode,
    myRole,
    setAppMode,
    initSupabaseSync,
    syncFromSupabase,
    activeCampaignId,
    isAuthenticated,
    authLoading,
  } = useVaultStore();

  useEffect(() => {
    initSupabaseSync();
  }, [initSupabaseSync]);

  // Sync URL hash <-> appMode and enforce role guard
  useEffect(() => {
    const applyHashMode = () => {
      const parsed = parseAppModeFromHash();
      if (parsed) {
        setAppMode(parsed, { syncUrl: false });
      }
    };
    window.addEventListener('hashchange', applyHashMode);
    return () => window.removeEventListener('hashchange', applyHashMode);
  }, [setAppMode]);

  const effectiveMode = resolveEffectiveAppMode(appMode, myRole);

  useEffect(() => {
    if (!isAuthenticated) return;
    setUrlAppMode(effectiveMode, true);
    document.title =
      effectiveMode === 'play'
        ? 'Aethelgard Table | Live Tabletop & Player Portal'
        : 'Aethelgard Studio | Worldbuilding & Campaign Architect';
  }, [isAuthenticated, effectiveMode]);

  useEffect(() => {
    if (!isAuthenticated || !activeCampaignId) return;
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        syncFromSupabase();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [isAuthenticated, activeCampaignId, syncFromSupabase]);

  if (authLoading) {
    return (
      <div className="w-screen h-screen bg-[#050608] text-[#ded8cc] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 text-[#d4a853] animate-spin" />
        <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#9b9384]">
          Connecting to Aethelgard Vault...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthScreen />
        <SettingsModal />
      </>
    );
  }

  return effectiveMode === 'play' ? <PlayShell /> : <StudioShell />;
}

export default App;
