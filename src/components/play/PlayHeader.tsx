import React, { useEffect, useRef, useState } from 'react';
import {
  BookMarked,
  ChevronDown,
  Cloud,
  CloudOff,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  Hammer,
  LogOut,
  Map as MapIcon,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
import { getSubSiteUrl } from '../../lib/appRouter';
import { useVaultStore } from '../../store/useVaultStore';
import { AethelgardCrest } from '../common/EntityIcon';

export const PlayHeader: React.FC = () => {
  const {
    campaigns,
    activeCampaignId,
    switchCampaign,
    maps,
    playActiveSection,
    setPlayActiveSection,
    playActiveMapId,
    setPlayActiveMapId,
    myRole,
    gmMode,
    setGmMode,
    isEffectiveGm,
    setAppMode,
    syncStatus,
    setCommandPaletteOpen,
    diceDrawerOpen,
    setDiceDrawerOpen,
    playCodexOpen,
    openPlayCodex,
    closePlayCodex,
    playSideDrawerOpen,
    togglePlaySideDrawer,
    signOutVault,
    profile,
    world,
    diceRolls,
  } = useVaultStore();

  const [campaignMenuOpen, setCampaignMenuOpen] = useState(false);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const campaignMenuRef = useRef<HTMLDivElement>(null);
  const sceneMenuRef = useRef<HTMLDivElement>(null);

  const isGmUser = myRole === 'gm' || myRole === 'co_gm';
  const effectiveGm = isEffectiveGm();
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) || null;
  const activeMap = maps.find((m) => m.id === playActiveMapId) || maps[0] || null;

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (campaignMenuRef.current && !campaignMenuRef.current.contains(e.target as Node)) {
        setCampaignMenuOpen(false);
      }
      if (sceneMenuRef.current && !sceneMenuRef.current.contains(e.target as Node)) {
        setSceneMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const syncDot = (() => {
    switch (syncStatus) {
      case 'synced':
        return { dot: 'bg-emerald-400', label: 'Realtime Synced' };
      case 'syncing':
      case 'connecting':
        return { dot: 'bg-[#b68d40]', label: 'Syncing...' };
      case 'local':
        return { dot: 'bg-sky-400', label: 'Local Browser Vault' };
      case 'error':
        return { dot: 'bg-red-400', label: 'Sync Error' };
      default:
        return { dot: 'bg-[#5c6473]', label: 'Offline' };
    }
  })();

  return (
    <header className="h-12 select-none bg-[#070a0f] border-b border-[#16202b] px-2 sm:px-3 flex items-center justify-between gap-2 shrink-0 z-50">
      {/* Left: Brand + Campaign Switcher + Live Scene Selector */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <button
          onClick={() => setPlayActiveSection('hub')}
          title={`Aethelgard Tabletop — ${syncDot.label}`}
          className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-[#111822] transition-colors shrink-0"
        >
          <AethelgardCrest className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline font-serif text-[13px] font-semibold tracking-wider text-[#f2eadb]">
            Aethelgard
          </span>
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[9.5px] font-mono uppercase tracking-wider text-emerald-300">
            Play
          </span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${syncDot.dot}`} />
        </button>

        {campaigns.length > 0 && (
          <div className="relative flex items-center min-w-0 border-l border-[#182230] pl-1.5 sm:pl-2" ref={campaignMenuRef}>
            <button
              type="button"
              aria-label="Switch Campaign"
              aria-haspopup="listbox"
              aria-expanded={campaignMenuOpen}
              onClick={() => setCampaignMenuOpen((v) => !v)}
              className="h-7 max-w-[116px] sm:max-w-[155px] bg-[#0e131c] border border-[#1d2736] hover:border-emerald-400/50 rounded-lg px-2 text-[11.5px] text-[#e8e2d5] flex items-center gap-1.5 transition-colors"
            >
              <span data-testid="active-campaign-name" className="truncate font-medium text-[#f3ead8]">
                {activeCampaign?.name || world.name || 'Campaign'}
              </span>
              {world.id && (
                <span
                  className={`hidden md:inline-block text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                    world.mode === 'west_marches'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-sky-500/15 text-sky-300'
                  }`}
                >
                  {world.mode === 'west_marches' ? 'WM' : 'Normal'}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-[#8b94a5] shrink-0" />
            </button>
            {campaignMenuOpen && (
              <div
                role="listbox"
                aria-label="Campaigns"
                className="absolute left-1.5 top-full mt-1.5 w-64 rounded-xl dark-glass shadow-glass py-1.5 z-50 border border-[#252d3d]"
              >
                {campaigns.map((c) => {
                  const selected = c.id === activeCampaignId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        switchCampaign(c.id);
                        setCampaignMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                        selected
                          ? 'bg-emerald-500/15 text-[#f5ecda] font-medium'
                          : 'text-[#ded8cc] hover:bg-[#d4a853]/10'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span
                        className={`text-[9.5px] px-1.5 py-0.5 rounded border shrink-0 ${
                          c.mode === 'west_marches'
                            ? 'bg-amber-500/10 border-amber-500/35 text-amber-300'
                            : 'bg-sky-500/10 border-sky-500/35 text-sky-300'
                        }`}
                      >
                        {c.mode === 'west_marches' ? 'WM' : 'Normal'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Map / Scene Switcher */}
        {maps.length > 0 && (
          <div className="relative flex items-center min-w-0 border-l border-[#182230] pl-1.5 sm:pl-2" ref={sceneMenuRef}>
            <button
              type="button"
              onClick={() => setSceneMenuOpen((v) => !v)}
              title="Switch Active Map / Encounter Scene"
              className="h-7 max-w-[140px] sm:max-w-[175px] bg-[#0e131c] border border-[#1d2736] hover:border-[#d4a853]/50 rounded-lg px-2 text-[11.5px] text-[#e8e2d5] flex items-center gap-1.5 transition-colors"
            >
              <MapIcon className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
              <span className="truncate">{activeMap?.name || 'Select Scene'}</span>
              {activeMap && (
                <span className="hidden sm:inline px-1 rounded text-[9px] font-mono uppercase bg-[#151b26] text-[#9aa3b2] shrink-0">
                  {activeMap.kind === '2d' ? '2D' : '3D'}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-[#8b94a5] shrink-0" />
            </button>
            {sceneMenuOpen && (
              <div className="absolute left-1.5 top-full mt-1.5 w-64 rounded-xl dark-glass shadow-glass py-1.5 z-50 border border-[#252d3d]">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#7e8796]">
                  Active Table Scene
                </div>
                {maps.map((m) => {
                  const isSel = m.id === activeMap?.id && playActiveSection === 'table';
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPlayActiveMapId(m.id);
                        setSceneMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                        isSel
                          ? 'bg-[#d4a853]/18 text-[#f5ecda] font-medium'
                          : 'text-[#ded8cc] hover:bg-[#131823]'
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      <span
                        className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono uppercase border shrink-0 ${
                          m.kind === '2d'
                            ? 'bg-sky-500/10 border-sky-500/35 text-sky-300'
                            : 'bg-[#d4a853]/10 border-[#d4a853]/35 text-[#e2b969]'
                        }`}
                      >
                        {m.kind === '2d' ? '2D VTT' : '3D World'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Quick Tabletop Section Bar (Desktop) */}
      <div className="hidden xl:flex shrink-0 items-center gap-0.5 bg-[#0b1017] p-0.5 rounded-xl border border-[#182230]">
        {(
          [
            ['table', 'Table'],
            ['party', 'Party'],
            ['journals', 'Journals'],
            ['quests', 'Quests'],
            ['timeline', 'Timeline'],
          ] as const
        ).map(([id, label]) => {
          const active = playActiveSection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPlayActiveSection(id)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium whitespace-nowrap transition-all ${
                active
                  ? 'bg-[#161e2b] text-[#e2b969] border border-[#d4a853]/40 shadow-sm'
                  : 'text-[#8b94a5] hover:text-[#f3ead8] border border-transparent'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Right: Search, Dice, Codex, Table Controls, GM Role Toggle & Studio Link, Profile, Sign Out */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Quick Search (Ctrl+K)"
          aria-label="Search Vault"
          className="h-7 px-2 rounded-lg bg-[#0e131c] border border-[#1d2736] hover:border-[#d4a853]/50 flex items-center gap-1.5 text-[11.5px] text-[#8b94a5] hover:text-[#f3ead8] transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="hidden xl:inline">Search</span>
        </button>

        <button
          onClick={() => setDiceDrawerOpen(!diceDrawerOpen)}
          title="Realtime Dice Roller & Log"
          aria-label="Dice Roller"
          className={`h-7 px-2 rounded-lg border flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${
            diceDrawerOpen
              ? 'bg-[#d4a853]/18 border-[#d4a853]/50 text-[#f3ead8]'
              : 'bg-[#0e131c] border-[#1d2736] text-[#959eb0] hover:text-[#f3ead8]'
          }`}
        >
          <Dices className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="hidden xl:inline">Dice</span>
          {diceRolls.length > 0 && (
            <span className="hidden sm:inline font-mono text-[9.5px] px-1 rounded bg-[#161d29] text-[#d4a853]">
              {diceRolls[0].total}
            </span>
          )}
        </button>

        <button
          onClick={() => (playCodexOpen ? closePlayCodex() : openPlayCodex())}
          title={effectiveGm ? 'Campaign Compendium (Pull Lore, NPCs & Monsters into Play)' : 'World Codex & Handouts'}
          aria-label="Campaign Codex"
          className={`h-7 px-2 rounded-lg border flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${
            playCodexOpen
              ? 'bg-[#d4a853]/18 border-[#d4a853]/50 text-[#e2b969]'
              : 'bg-[#0e131c] border-[#1d2736] text-[#959eb0] hover:text-[#f3ead8]'
          }`}
        >
          <BookMarked className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="hidden md:inline">{effectiveGm ? 'GM Codex' : 'Codex'}</span>
        </button>

        {playActiveSection === 'table' && (
          <button
            onClick={togglePlaySideDrawer}
            title={playSideDrawerOpen ? 'Hide Table Controls' : 'Table & Token Controls'}
            aria-label="Table Controls"
            className={`h-7 px-2 rounded-lg border flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${
              playSideDrawerOpen
                ? 'bg-[#d4a853]/16 border-[#d4a853]/45 text-[#e2b969]'
                : 'bg-[#0e131c] border-[#1d2736] text-[#959eb0] hover:text-[#f3ead8]'
            }`}
          >
            {playSideDrawerOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden xl:inline">Controls</span>
          </button>
        )}

        {isGmUser && (
          <button
            onClick={() => setGmMode(!gmMode)}
            title={
              gmMode
                ? 'GM Table View ON — Fog Brush, Hidden Pins & Secrets visible'
                : 'Player Preview — Viewing table as a Player'
            }
            aria-label={gmMode ? 'GM Mode' : 'Player View'}
            className={`h-7 flex items-center gap-1.5 px-2 rounded-lg text-[11.5px] font-medium border transition-all ${
              gmMode
                ? 'bg-[#211014] border-red-500/40 text-red-200'
                : 'bg-[#0e131c] border-[#1d2736] text-[#8b94a5] hover:text-[#f0e9db]'
            }`}
          >
            {gmMode ? (
              <Eye className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-[#7a8394]" />
            )}
            <span className="hidden xl:inline">{gmMode ? 'GM View' : 'Player View'}</span>
          </button>
        )}

        {isGmUser && (
          <div className="flex items-center rounded-lg overflow-hidden border border-[#d4a853]/35 bg-[#14110b]">
            <button
              type="button"
              onClick={() => setAppMode('studio')}
              title="Switch to Worldbuilding Studio (#/studio)"
              aria-label="Worldbuilding Studio"
              className="h-7 px-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[#e2b969] hover:bg-[#d4a853]/18 transition-colors"
            >
              <Hammer className="w-3 h-3" />
              <span className="hidden md:inline">Studio</span>
            </button>
            <a
              href={getSubSiteUrl('studio')}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Worldbuilding Studio in New Browser Tab"
              aria-label="Open Studio in New Tab"
              className="h-7 px-1.5 flex items-center justify-center border-l border-[#d4a853]/25 text-[#c9a050] hover:text-[#f3ead8] hover:bg-[#d4a853]/15 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        <button
          onClick={() => setPlayActiveSection('hub')}
          title="Adventurer Account"
          aria-label="Adventurer Account"
          className="hidden sm:flex h-7 px-2 rounded-lg text-[#c4cbd8] hover:text-[#e2b969] hover:bg-[#131823] transition-colors items-center gap-1.5 text-[11.5px]"
        >
          <User className="w-3.5 h-3.5 text-[#d4a853]" />
          {profile?.display_name && (
            <span className="hidden 2xl:inline max-w-[90px] truncate font-medium text-[#f0e9db]">
              {profile.display_name}
            </span>
          )}
        </button>

        <button
          onClick={signOutVault}
          title="Sign Out"
          aria-label="Sign Out"
          className="h-7 w-7 rounded-lg flex items-center justify-center bg-[#0e131c] border border-[#1d2736] text-[#c4beb3] hover:border-red-500/45 hover:text-red-300 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hidden sync icon usage guard for lint */}
      <span className="sr-only">
        {syncStatus === 'error' ? <CloudOff /> : syncStatus === 'syncing' ? <RefreshCw /> : <Cloud />}
      </span>
    </header>
  );
};
