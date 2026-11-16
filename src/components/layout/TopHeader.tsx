import React, { useState } from 'react';
import {
  Cloud,
  CloudOff,
  Columns2,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { AethelgardCrest, EntityIcon } from '../common/EntityIcon';

export const TopHeader: React.FC = () => {
  const {
    tabs,
    activeTabId,
    splitPaneTabId,
    setActiveTab,
    closeTab,
    toggleSplitPane,
    gmMode,
    setGmMode,
    syncStatus,
    isAuthenticated,
    past,
    future,
    undo,
    redo,
    setCommandPaletteOpen,
    setAuthModalOpen,
    setSettingsModalOpen,
    openNewEntryModal,
    signOutVault,
    world,
    entities,
    maps,
    mapPins,
    mapPaths,
    rightInspectorCollapsed,
    toggleRightInspector,
  } = useVaultStore();

  const [exportOpen, setExportOpen] = useState(false);

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      world,
      entities: gmMode ? entities : entities.map((e) => ({ ...e, gm_secrets: '' })),
      maps,
      mapPins: gmMode ? mapPins : mapPins.filter((p) => !p.is_gm_only),
      mapPaths: gmMode ? mapPaths : mapPaths.filter((p) => !p.is_gm_only),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aethelgard-vault-${gmMode ? 'gm' : 'player'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const handleExportMarkdown = () => {
    const lines = entities.map((e) => {
      const secretSection = gmMode && e.gm_secrets ? `\n\n> **[GM SECRET]**: ${e.gm_secrets}` : '';
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
        return { dot: 'bg-emerald-400', icon: <Cloud className="w-3 h-3 text-emerald-400" />, label: 'Realtime Synced' };
      case 'syncing':
      case 'connecting':
        return {
          dot: 'bg-[#d4a853]',
          icon: <RefreshCw className="w-3 h-3 text-[#d4a853] animate-spin" />,
          label: 'Syncing...',
        };
      case 'error':
        return { dot: 'bg-red-400', icon: <CloudOff className="w-3 h-3 text-red-400" />, label: 'Sync Error' };
      default:
        return { dot: 'bg-[#6c7584]', icon: <Cloud className="w-3 h-3 text-[#8b93a1]" />, label: 'Local Demo Vault' };
    }
  })();

  return (
    <header className="h-[42px] select-none bg-[#080a0e] border-b border-[#181e28] px-2.5 flex items-center justify-between gap-2 shrink-0 z-30">
      {/* Left: Brand + Sync Dot + Undo/Redo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setSettingsModalOpen(true)}
          title={`Aethelgard Vault — ${syncDot.label}`}
          className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[#131720] transition-colors"
        >
          <AethelgardCrest className="w-4 h-4" />
          <span className="hidden lg:inline font-serif text-[12.5px] font-semibold tracking-wider text-[#f3ead8]">
            Aethelgard
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${syncDot.dot}`} />
        </button>

        <div className="hidden sm:flex items-center gap-0.5 border-l border-[#181d27] pl-1.5">
          <button
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Ctrl+Z)"
            className="p-1 rounded text-[#7e8796] hover:text-[#f0e9db] hover:bg-[#151922] disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Y)"
            className="p-1 rounded text-[#7e8796] hover:text-[#f0e9db] hover:bg-[#151922] disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Inline Browser-Style Tab Strip + New/Split */}
      <div className="flex-1 min-w-0 flex items-center gap-1 h-full py-1">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isSplit = tab.id === splitPaneTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative h-[28px] px-2.5 flex items-center gap-1.5 rounded-md cursor-pointer text-[11px] shrink-0 min-w-[84px] max-w-[168px] border transition-all ${
                  isActive
                    ? 'bg-[#12161f] text-[#f5efe4] border-[#293140] shadow-[inset_0_-2px_0_#d4a853]'
                    : isSplit
                    ? 'bg-[#10141c]/80 text-[#d4a853] border-[#262d3b]'
                    : 'bg-transparent text-[#7d8594] border-transparent hover:bg-[#10141c] hover:text-[#d5d0c5]'
                }`}
              >
                <EntityIcon
                  type={tab.iconType}
                  className={`w-3 h-3 shrink-0 transition-colors ${
                    isActive ? 'text-[#e5be58]' : 'text-[#6c7584] group-hover:text-[#b79652]'
                  }`}
                />
                <span className="truncate font-medium">{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="ml-auto p-0.5 rounded opacity-25 group-hover:opacity-100 hover:bg-[#242a36] text-[#8b93a1] hover:text-[#f3ead8] transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => openNewEntryModal('Location', 'encyclopedia')}
          title="New Entry"
          className="p-1 rounded-md text-[#8b93a1] hover:text-[#d4a853] hover:bg-[#151922] shrink-0 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggleSplitPane}
          title={splitPaneTabId ? 'Close Dual Tab Split' : 'Split Tab View'}
          className={`p-1 rounded-md shrink-0 transition-colors ${
            splitPaneTabId
              ? 'bg-[#d4a853]/20 text-[#d4a853]'
              : 'text-[#8b93a1] hover:text-[#e7e2d8] hover:bg-[#151922]'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Compact Search, GM, Export, Inspector Toggle, Settings, Auth */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Search Vault (Ctrl+K)"
          className="h-[26px] px-2 rounded-md bg-[#0f131a] border border-[#1c222e] hover:border-[#d4a853]/45 flex items-center gap-1.5 text-[11px] text-[#8b93a1] hover:text-[#f3ead8] transition-colors"
        >
          <Search className="w-3 h-3 text-[#d4a853]" />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden sm:inline font-mono text-[9.5px] px-1 rounded bg-[#080a0e] border border-[#222834] text-[#7d8696]">
            ⌘K
          </kbd>
        </button>

        {/* GM Mode Toggle */}
        <button
          onClick={() => setGmMode(!gmMode)}
          title={
            gmMode
              ? 'GM Mode ON — Secrets and hidden map pins visible'
              : 'GM Mode OFF — Screen-share safe (secrets & hidden pins stripped)'
          }
          className={`h-[26px] flex items-center gap-1 px-2 rounded-md text-[11px] font-medium border transition-all ${
            gmMode
              ? 'bg-[#2a1216] border-red-500/45 text-red-200'
              : 'bg-[#11151b] border-[#1c222d] text-[#8b93a1] hover:text-[#e7e2d8]'
          }`}
        >
          {gmMode ? (
            <Eye className="w-3 h-3 text-red-400" />
          ) : (
            <EyeOff className="w-3 h-3 text-[#6b7280]" />
          )}
          <span className="hidden xl:inline">{gmMode ? 'GM' : 'Player'}</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            title="Export Vault"
            className="h-[26px] px-1.5 rounded-md bg-[#0f131a] border border-[#1c222e] hover:border-[#d4a853]/40 text-[#c7c2b8] flex items-center gap-1 text-[11px] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#d4a853]" />
          </button>
          {exportOpen && (
            <div
              onMouseLeave={() => setExportOpen(false)}
              className="absolute right-0 mt-1.5 w-48 rounded-md dark-glass shadow-glass py-1 z-50"
            >
              <button
                onClick={handleExportJson}
                className="w-full text-left px-3 py-1.5 text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15 flex items-center justify-between"
              >
                <span>Export Vault JSON</span>
                <span className="font-mono text-[10px] text-[#8b93a1]">.json</span>
              </button>
              <button
                onClick={handleExportMarkdown}
                className="w-full text-left px-3 py-1.5 text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15 flex items-center justify-between"
              >
                <span>Export Grimoire MD</span>
                <span className="font-mono text-[10px] text-[#8b93a1]">.md</span>
              </button>
            </div>
          )}
        </div>

        {/* Inspector Drawer Toggle */}
        <button
          onClick={toggleRightInspector}
          title={rightInspectorCollapsed ? 'Open Inspector Drawer' : 'Close Inspector Drawer'}
          aria-label={rightInspectorCollapsed ? 'Open Inspector Drawer' : 'Close Inspector Drawer'}
          className={`h-[26px] px-2 rounded-md border flex items-center gap-1 text-[11px] font-medium transition-colors ${
            !rightInspectorCollapsed
              ? 'bg-[#d4a853]/20 border-[#d4a853]/50 text-[#f3d488]'
              : 'bg-[#0f131a] border-[#1c222e] text-[#9aa3b2] hover:text-[#e7e2d8] hover:border-[#2a3242]'
          }`}
        >
          {rightInspectorCollapsed ? (
            <PanelRightOpen className="w-3.5 h-3.5" />
          ) : (
            <PanelRightClose className="w-3.5 h-3.5" />
          )}
          <span className="hidden lg:inline">Inspector</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsModalOpen(true)}
          title="Vault & Supabase Settings"
          className="p-1.5 rounded-md text-[#8b93a1] hover:text-[#d4a853] hover:bg-[#171b22] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Token Auth / Lock */}
        {isAuthenticated ? (
          <button
            onClick={signOutVault}
            title="Lock Vault (Sign out)"
            className="p-1.5 rounded-md bg-[#12151a] border border-[#1d222b] text-[#c7c2b8] hover:border-red-500/40 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => setAuthModalOpen(true)}
            title="Unlock Campaign Token (Supabase Login)"
            className="h-[26px] flex items-center gap-1 px-2 rounded-md text-[11px] bg-[#161a22] border border-[#d4a853]/35 text-[#e5be58] hover:bg-[#d4a853]/15 transition-colors"
          >
            <Lock className="w-3 h-3" />
          </button>
        )}
      </div>
    </header>
  );
};

