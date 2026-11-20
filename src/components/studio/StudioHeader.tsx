import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Columns2,
  Download,
  ExternalLink,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings,
  Undo2,
  User,
  X,
} from 'lucide-react';
import { getSubSiteUrl } from '../../lib/appRouter';
import { exportCampaignArchive } from '../../lib/campaignArchive';
import { useVaultStore } from '../../store/useVaultStore';
import { AethelgardCrest, EntityIcon } from '../common/EntityIcon';

export const StudioHeader: React.FC = () => {
  const {
    campaigns,
    activeCampaignId,
    switchCampaign,
    isEffectiveGm,
    setAppMode,
    tabs,
    activeTabId,
    splitPaneTabId,
    setActiveTab,
    closeTab,
    toggleSplitPane,
    syncStatus,
    past,
    future,
    undo,
    redo,
    setCommandPaletteOpen,
    setSettingsModalOpen,
    openNewEntryModal,
    openProfileHubTab,
    signOutVault,
    profile,
    world,
    entities,
    entityLinks,
    maps,
    mapPins,
    mapPaths,
    assets,
    templates,
    sheetTemplates,
    characters,
    questBoards,
    guildQuests,
    timelineEvents,
    rightInspectorCollapsed,
    toggleRightInspector,
  } = useVaultStore();

  const [exportOpen, setExportOpen] = useState(false);
  const [campaignMenuOpen, setCampaignMenuOpen] = useState(false);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const campaignMenuRef = useRef<HTMLDivElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const effectiveGm = isEffectiveGm();
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) || null;

  const updateTabScrollState = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    setCanScrollTabsLeft(el.scrollLeft > 4);
    setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateTabScrollState();
    const el = tabStripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateTabScrollState());
    ro.observe(el);
    window.addEventListener('resize', updateTabScrollState);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateTabScrollState);
    };
  }, [tabs.length, updateTabScrollState]);

  useEffect(() => {
    if (!campaignMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (campaignMenuRef.current && !campaignMenuRef.current.contains(e.target as Node)) {
        setCampaignMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [campaignMenuOpen]);

  const handleExportJson = () => {
    const archive = exportCampaignArchive({
      isEffectiveGm: effectiveGm,
      world,
      entities,
      entityLinks,
      maps,
      mapPins,
      mapPaths,
      assets,
      templates,
      sheetTemplates,
      characters,
      mapQuestBoards: questBoards,
      guildQuests,
      timelineEvents,
    });
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(world.name || 'aethelgard').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-studio-v2.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const handleExportMarkdown = () => {
    const lines = entities.map((e) => {
      const secretSection =
        effectiveGm && e.gm_secrets ? `\n\n> **[GM SECRET]**: ${e.gm_secrets}` : '';
      return `# ${e.title} (${e.type})\nTags: ${e.tags.join(', ')}\n\n${e.content}${secretSection}\n\n---\n`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aethelgard-grimoire.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const syncDot = (() => {
    switch (syncStatus) {
      case 'synced':
        return {
          dot: 'bg-emerald-400',
          icon: <Cloud className="w-3 h-3 text-emerald-400" />,
          label: 'Realtime Synced',
        };
      case 'syncing':
      case 'connecting':
        return {
          dot: 'bg-[#b68d40]',
          icon: <RefreshCw className="w-3 h-3 text-[#b68d40] animate-spin" />,
          label: 'Syncing...',
        };
      case 'error':
        return {
          dot: 'bg-red-400',
          icon: <CloudOff className="w-3 h-3 text-red-400" />,
          label: 'Sync Error',
        };
      default:
        return {
          dot: 'bg-[#5c6473]',
          icon: <Cloud className="w-3 h-3 text-[#7a8291]" />,
          label: 'Offline',
        };
    }
  })();

  return (
    <header className="h-12 select-none bg-[#090c12] border-b border-[#181e2b] px-2 sm:px-3 flex items-center justify-between gap-2 shrink-0 z-50">
      {/* Left: Studio Brand + Campaign Switcher + Undo/Redo */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={openProfileHubTab}
          title={`Aethelgard Worldbuilding Studio — ${syncDot.label}`}
          className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-[#131823] transition-colors"
        >
          <AethelgardCrest className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline font-serif text-[13px] font-semibold tracking-wider text-[#f2eadb]">
            Aethelgard
          </span>
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#d4a853]/15 border border-[#d4a853]/35 text-[9.5px] font-mono uppercase tracking-wider text-[#e2b969]">
            Studio
          </span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${syncDot.dot}`} />
        </button>

        {campaigns.length > 0 && (
          <div className="relative flex items-center gap-1.5 border-l border-[#1a2130] pl-1.5 sm:pl-2" ref={campaignMenuRef}>
            <button
              type="button"
              aria-label="Switch Campaign"
              aria-haspopup="listbox"
              aria-expanded={campaignMenuOpen}
              onClick={() => setCampaignMenuOpen((v) => !v)}
              className="h-7 max-w-[116px] sm:max-w-[205px] bg-[#10141d] border border-[#1f2636] hover:border-[#d4a853]/55 rounded-lg px-2 text-[11.5px] text-[#e8e2d5] flex items-center gap-1.5 focus:outline-none focus:border-[#d4a853] transition-colors"
            >
              <span data-testid="active-campaign-name" className="truncate font-medium text-[#f3ead8]">
                {activeCampaign?.name || world.name || 'Campaign'}
              </span>
              {world.id && (
                <span
                  className={`hidden md:inline-block text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide shrink-0 ${
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
                          ? 'bg-[#d4a853]/18 text-[#f5ecda] font-medium'
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

        {effectiveGm && (
          <div className="hidden lg:flex items-center gap-0.5 border-l border-[#1a2130] pl-1.5">
            <button
              onClick={undo}
              disabled={past.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-lg text-[#7d8799] hover:text-[#f0e9db] hover:bg-[#131823] disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded-lg text-[#7d8799] hover:text-[#f0e9db] hover:bg-[#131823] disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Center: Scrollable Studio Tab Strip + New/Split */}
      <div className="flex-1 min-w-0 flex items-center gap-1 h-full py-1.5">
        {canScrollTabsLeft && (
          <button
            type="button"
            aria-label="Scroll tabs left"
            onClick={() => tabStripRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
            className="hidden sm:flex p-1 rounded-md text-[#8b94a5] hover:text-[#f3ead8] hover:bg-[#131823] shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <div
          ref={tabStripRef}
          onScroll={updateTabScrollState}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isSplit = tab.id === splitPaneTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative h-8 px-2.5 flex items-center gap-1.5 rounded-lg cursor-pointer text-[11.5px] shrink-0 min-w-[76px] sm:min-w-[96px] max-w-[176px] border transition-all ${
                  isActive
                    ? 'bg-[#131823] text-[#f3ead8] border-[#263044] shadow-[inset_0_-2px_0_#d4a853]'
                    : isSplit
                    ? 'bg-[#10141d] text-[#d6b16a] border-[#1f2636]'
                    : 'bg-transparent text-[#858f9f] border-transparent hover:bg-[#10141d] hover:text-[#ded8cc]'
                }`}
              >
                <EntityIcon
                  type={tab.iconType}
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    isActive ? 'text-[#deb25e]' : 'text-[#6c7587] group-hover:text-[#b68d40]'
                  }`}
                />
                <span className="truncate font-medium">{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    aria-label={`Close ${tab.title}`}
                    className="ml-auto p-0.5 rounded opacity-35 group-hover:opacity-100 hover:bg-[#1e2534] text-[#8b94a5] hover:text-[#f3ead8] transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {canScrollTabsRight && (
          <button
            type="button"
            aria-label="Scroll tabs right"
            onClick={() => tabStripRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
            className="hidden sm:flex p-1 rounded-md text-[#8b94a5] hover:text-[#f3ead8] hover:bg-[#131823] shrink-0"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {effectiveGm && (
          <button
            onClick={() => openNewEntryModal('Location', 'encyclopedia')}
            title="New Entry"
            aria-label="New Entry"
            className="hidden sm:flex p-1.5 rounded-lg text-[#8b94a5] hover:text-[#deb25e] hover:bg-[#131823] shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={toggleSplitPane}
          title={splitPaneTabId ? 'Close Dual Tab Split' : 'Split Tab View'}
          aria-label={splitPaneTabId ? 'Close Dual Tab Split' : 'Split Tab View'}
          className={`hidden md:flex p-1.5 rounded-lg shrink-0 transition-colors ${
            splitPaneTabId
              ? 'bg-[#d4a853]/18 text-[#deb25e]'
              : 'text-[#8b94a5] hover:text-[#f0e9db] hover:bg-[#131823]'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Search, Export, Inspector, Switch to Play Mode, Profile, Settings, SignOut */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Search Studio (Ctrl+K)"
          aria-label="Search Vault"
          className="h-7 px-2 rounded-lg bg-[#10141d] border border-[#1d2433] hover:border-[#d4a853]/50 flex items-center gap-1.5 text-[11.5px] text-[#8b94a5] hover:text-[#f3ead8] transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden xl:inline font-mono text-[9.5px] px-1 rounded bg-[#07090d] border border-[#1f2636] text-[#7a8394]">
            ⌘K
          </kbd>
        </button>

        {/* Export Dropdown */}
        {world.id && (
          <div className="relative hidden sm:block">
            <button
              onClick={() => setExportOpen((v) => !v)}
              title="Export Campaign"
              aria-label="Export Campaign"
              className="h-7 px-2 rounded-lg bg-[#10141d] border border-[#1d2433] hover:border-[#d4a853]/45 text-[#c8c2b6] flex items-center gap-1 text-[11.5px] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#d4a853]" />
            </button>
            {exportOpen && (
              <div
                onMouseLeave={() => setExportOpen(false)}
                className="absolute right-0 mt-1.5 w-52 rounded-xl dark-glass shadow-glass py-1.5 z-50"
              >
                <button
                  onClick={handleExportJson}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#ded8cc] hover:bg-[#d4a853]/15 flex items-center justify-between"
                >
                  <span>Export Archive v2 JSON</span>
                  <span className="font-mono text-[10px] text-[#7a8291]">.json</span>
                </button>
                <button
                  onClick={handleExportMarkdown}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#ded8cc] hover:bg-[#d4a853]/15 flex items-center justify-between"
                >
                  <span>Export Grimoire MD</span>
                  <span className="font-mono text-[10px] text-[#7a8291]">.md</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inspector Drawer Toggle */}
        <button
          onClick={toggleRightInspector}
          title={rightInspectorCollapsed ? 'Open Inspector Drawer' : 'Close Inspector Drawer'}
          aria-label={rightInspectorCollapsed ? 'Open Inspector Drawer' : 'Close Inspector Drawer'}
          className={`h-7 px-2 rounded-lg border flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${
            !rightInspectorCollapsed
              ? 'bg-[#d4a853]/16 border-[#d4a853]/45 text-[#e2b969]'
              : 'bg-[#10141d] border-[#1d2433] text-[#959eb0] hover:text-[#f3ead8] hover:border-[#2a3346]'
          }`}
        >
          {rightInspectorCollapsed ? (
            <PanelRightOpen className="w-3.5 h-3.5" />
          ) : (
            <PanelRightClose className="w-3.5 h-3.5" />
          )}
          <span className="hidden lg:inline">Inspector</span>
        </button>

        {/* Sub-Site Switch: Enter Playing Mode */}
        <div className="flex items-center rounded-lg overflow-hidden border border-emerald-500/40 bg-emerald-950/35">
          <button
            type="button"
            onClick={() => setAppMode('play')}
            title="Switch to Playing Mode (#/play)"
            aria-label="Play Mode"
            className="h-7 px-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            <Play className="w-3 h-3 fill-emerald-300 text-emerald-300" />
            <span className="hidden md:inline">Play Mode</span>
          </button>
          <a
            href={getSubSiteUrl('play')}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Playing Mode in New Browser Tab"
            aria-label="Open Playing Mode in New Tab"
            className="h-7 px-1.5 flex items-center justify-center border-l border-emerald-500/30 text-emerald-300/80 hover:text-emerald-100 hover:bg-emerald-500/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Profile Hub */}
        <button
          onClick={openProfileHubTab}
          title="Adventurer Account"
          aria-label="Adventurer Account"
          className="hidden sm:flex h-7 px-2 rounded-lg text-[#c4cbd8] hover:text-[#e2b969] hover:bg-[#131823] transition-colors items-center gap-1.5 text-[11.5px]"
        >
          <User className="w-3.5 h-3.5 text-[#d4a853]" />
          {profile?.display_name && (
            <span className="hidden lg:inline max-w-[90px] truncate font-medium text-[#f0e9db]">
              {profile.display_name}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsModalOpen(true)}
          title="Supabase & Terrain Settings"
          aria-label="Settings"
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[#8b94a5] hover:text-[#deb25e] hover:bg-[#131823] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Sign Out */}
        <button
          onClick={signOutVault}
          title="Sign Out"
          aria-label="Sign Out"
          className="h-7 w-7 rounded-lg flex items-center justify-center bg-[#10141d] border border-[#1d2433] text-[#c4beb3] hover:border-red-500/45 hover:text-red-300 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
