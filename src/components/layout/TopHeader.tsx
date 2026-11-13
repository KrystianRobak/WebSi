import React, { useState } from 'react';
import {
  Cloud,
  CloudOff,
  Code2,
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
  Sparkles,
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
    editorMode,
    setEditorMode,
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

  const syncBadge = (() => {
    switch (syncStatus) {
      case 'synced':
        return { icon: <Cloud className="w-3.5 h-3.5 text-emerald-400" />, label: 'Realtime Synced' };
      case 'syncing':
      case 'connecting':
        return {
          icon: <RefreshCw className="w-3.5 h-3.5 text-[#d4a853] animate-spin" />,
          label: 'Syncing...',
        };
      case 'error':
        return { icon: <CloudOff className="w-3.5 h-3.5 text-red-400" />, label: 'Sync Error' };
      default:
        return { icon: <Cloud className="w-3.5 h-3.5 text-[#8b93a1]" />, label: 'Local Demo Vault' };
    }
  })();

  return (
    <header className="select-none bg-[#090b0f] border-b border-[#1c212b] flex flex-col shrink-0 z-30">
      {/* Row 1: 44px Top Header */}
      <div className="h-[44px] px-3.5 flex items-center justify-between gap-3 border-b border-[#141820]">
        {/* Left Branding + Sync + History */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <AethelgardCrest className="w-6 h-6" />
            <span className="font-serif text-[14.5px] font-semibold tracking-wider text-[#f3ead8]">
              Aethelgard Vault
            </span>
          </div>
          <span className="hidden lg:inline text-[#29303d] text-xs">/</span>
          <span className="hidden lg:inline text-[11px] font-medium tracking-wide text-[#7c8494] truncate">
            Grimoire &amp; Campaign Architect
          </span>

          <button
            onClick={() => setSettingsModalOpen(true)}
            title={syncBadge.label}
            className="ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#101319] border border-[#1d232e] hover:border-[#d4a853]/40 text-[10.5px] font-medium text-[#9aa3b2] transition-colors"
          >
            {syncBadge.icon}
            <span className="hidden xl:inline">{syncBadge.label}</span>
          </button>

          <div className="flex items-center gap-0.5 ml-0.5 border-l border-[#191e27] pl-2">
            <button
              onClick={undo}
              disabled={past.length === 0}
              title="Undo"
              className="p-1.5 rounded-md text-[#7e8796] hover:text-[#f0e9db] hover:bg-[#151922] disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              title="Redo"
              className="p-1.5 rounded-md text-[#7e8796] hover:text-[#f0e9db] hover:bg-[#151922] disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center Command Palette Trigger */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex-1 max-w-[400px] h-[28px] px-3 rounded-lg bg-[#0f1218] border border-[#1d232e] hover:border-[#d4a853]/45 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] flex items-center justify-between text-xs text-[#737c8c] transition-all group"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-[#737c8c] group-hover:text-[#d4a853] transition-colors" />
            <span className="truncate">Search characters, locations, notes...</span>
          </span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#090b0e] border border-[#222834] text-[#838b99] shrink-0">
            Ctrl + K
          </kbd>
        </button>

        {/* Right Controls: Mode Switcher, GM Mode Toggle, Export, Settings, Auth */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Code / Preview Mode Switcher */}
          <div className="hidden sm:flex items-center bg-[#0f1218] p-0.5 rounded-lg border border-[#1d232e]">
            <button
              onClick={() => setEditorMode('code')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                editorMode === 'code'
                  ? 'bg-[#1c212b] text-[#f3ead8] shadow-sm border border-[#d4a853]/35'
                  : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Code</span>
            </button>
            <button
              onClick={() => setEditorMode('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                editorMode === 'preview'
                  ? 'bg-gradient-to-b from-[#2b2417] to-[#1d1810] text-[#f3d488] border border-[#d4a853]/50 shadow-[0_0_12px_rgba(212,168,83,0.14)]'
                  : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0f1218] border border-[#1d232e] hover:border-[#d4a853]/40 text-[11.5px] text-[#c7c2b8] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#d4a853]" />
              <span className="hidden md:inline">Export</span>
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

          {/* GM Mode Eye Toggle */}
          <button
            onClick={() => setGmMode(!gmMode)}
            title={
              gmMode
                ? 'GM Mode ON — Secrets and hidden map pins visible'
                : 'GM Mode OFF — Screen-share safe (secrets & hidden pins stripped)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-all ${
              gmMode
                ? 'bg-[#2a1216] border-red-500/45 text-red-200 shadow-[0_0_12px_rgba(220,38,38,0.18)]'
                : 'bg-[#12151a] border-[#1d222b] text-[#8b93a1] hover:text-[#e7e2d8]'
            }`}
          >
            {gmMode ? (
              <Eye className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-[#6b7280]" />
            )}
            <span className="hidden xl:inline">{gmMode ? 'GM Mode' : 'Player Safe'}</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            title="Vault & Supabase Settings"
            className="p-1.5 rounded-md text-[#8b93a1] hover:text-[#d4a853] hover:bg-[#171b22] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Token Auth / Lock */}
          {isAuthenticated ? (
            <button
              onClick={signOutVault}
              title="Lock Vault (Sign out)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-[#12151a] border border-[#1d222b] text-[#c7c2b8] hover:border-red-500/40 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              title="Unlock Campaign Token (Supabase Login)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-[#171b22] border border-[#d4a853]/35 text-[#e5be58] hover:bg-[#d4a853]/15 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Unlock</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: 36px Browser-Style Multi-Tab Strip */}
      <div className="h-[36px] bg-[#07090c] flex items-center justify-between px-2 gap-1">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 h-full">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isSplit = tab.id === splitPaneTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative h-[31px] mt-[5px] px-3 flex items-center gap-2 rounded-t-lg cursor-pointer text-[11.5px] shrink-0 min-w-[104px] max-w-[195px] border-t border-x transition-all ${
                  isActive
                    ? 'bg-[#12161f] text-[#f4ece0] border-[#242b38] shadow-[inset_0_-2px_0_#d4a853,0_-2px_10px_rgba(212,168,83,0.06)]'
                    : isSplit
                    ? 'bg-[#10141c]/80 text-[#d4a853] border-[#1c222e]'
                    : 'bg-[#0b0e13]/70 text-[#7d8594] border-transparent hover:bg-[#11151d] hover:text-[#d5d0c5]'
                }`}
              >
                <EntityIcon
                  type={tab.iconType}
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
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
                    className="ml-auto p-0.5 rounded opacity-45 group-hover:opacity-100 hover:bg-[#242a36] text-[#8b93a1] hover:text-[#f3ead8] transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0 pl-2 border-l border-[#1d222b]">
          <button
            onClick={() => openNewEntryModal('Location', 'encyclopedia')}
            title="New Entry"
            className="p-1.5 rounded text-[#8b93a1] hover:text-[#d4a853] hover:bg-[#171b22] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleSplitPane}
            title={splitPaneTabId ? 'Close Split Pane' : 'Toggle Split Pane'}
            className={`p-1.5 rounded transition-colors ${
              splitPaneTabId
                ? 'bg-[#d4a853]/20 text-[#d4a853]'
                : 'text-[#8b93a1] hover:text-[#e7e2d8] hover:bg-[#171b22]'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleRightInspector}
            title={rightInspectorCollapsed ? 'Show Inspector Drawer' : 'Hide Inspector Drawer'}
            aria-label={rightInspectorCollapsed ? 'Show Inspector Drawer' : 'Hide Inspector Drawer'}
            className={`p-1.5 rounded transition-colors ${
              !rightInspectorCollapsed
                ? 'bg-[#d4a853]/20 text-[#d4a853]'
                : 'text-[#8b93a1] hover:text-[#e7e2d8] hover:bg-[#171b22]'
            }`}
          >
            {rightInspectorCollapsed ? (
              <PanelRightOpen className="w-3.5 h-3.5" />
            ) : (
              <PanelRightClose className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
