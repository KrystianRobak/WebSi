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
    <header className="select-none bg-[#090b0f] border-b border-[#191f29] flex flex-col shrink-0 z-30">
      {/* Row 1: 38px Sleek Top Bar */}
      <div className="h-[38px] px-3 flex items-center justify-between gap-2.5 border-b border-[#131720]">
        {/* Left Branding + Compact Sync + History */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <AethelgardCrest className="w-5 h-5" />
            <span className="font-serif text-[13.5px] font-semibold tracking-wider text-[#f3ead8]">
              Aethelgard
            </span>
          </div>

          <button
            onClick={() => setSettingsModalOpen(true)}
            title={syncDot.label}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0f131a] border border-[#1c222e] hover:border-[#d4a853]/40 text-[10px] text-[#9aa3b2] transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${syncDot.dot}`} />
            {syncStatus === 'syncing' || syncStatus === 'connecting' || syncStatus === 'error' ? (
              <span className="hidden sm:inline">{syncDot.label}</span>
            ) : null}
          </button>

          <div className="flex items-center gap-0.5 border-l border-[#181d27] pl-1.5">
            <button
              onClick={undo}
              disabled={past.length === 0}
              title="Undo"
              className="p-1 rounded text-[#7e8796] hover:text-[#f0e9db] hover:bg-[#151922] disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              title="Redo"
              className="p-1 rounded text-[#7e8796] hover:text-[#f0e9db] hover:bg-[#151922] disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center Command Palette Trigger */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex-1 max-w-[380px] h-[26px] px-2.5 rounded-md bg-[#0f1218] border border-[#1b212c] hover:border-[#d4a853]/45 flex items-center justify-between text-[11.5px] text-[#737c8c] transition-all group"
        >
          <span className="flex items-center gap-1.5 truncate">
            <Search className="w-3 h-3 text-[#737c8c] group-hover:text-[#d4a853] transition-colors" />
            <span className="truncate">Search vault...</span>
          </span>
          <kbd className="font-mono text-[9.5px] px-1.5 py-0.2 rounded bg-[#090b0e] border border-[#222834] text-[#7d8696] shrink-0">
            Ctrl K
          </kbd>
        </button>

        {/* Right Controls: Edit/Read Switcher, GM Mode Toggle, Export, Settings, Auth */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Edit / Read Mode Switcher */}
          <div className="hidden sm:flex items-center bg-[#0f1218] p-0.5 rounded-md border border-[#1c222d]">
            <button
              onClick={() => setEditorMode('code')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                editorMode === 'code'
                  ? 'bg-[#1c212b] text-[#f3ead8] border border-[#d4a853]/35'
                  : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => setEditorMode('preview')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                editorMode === 'preview'
                  ? 'bg-gradient-to-b from-[#2b2417] to-[#1d1810] text-[#f3d488] border border-[#d4a853]/50'
                  : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Read</span>
            </button>
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              title="Export Vault"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#0f1218] border border-[#1c222d] hover:border-[#d4a853]/40 text-[11px] text-[#c7c2b8] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#d4a853]" />
              <span className="hidden lg:inline">Export</span>
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
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
              gmMode
                ? 'bg-[#2a1216] border-red-500/45 text-red-200'
                : 'bg-[#11151b] border-[#1c222d] text-[#8b93a1] hover:text-[#e7e2d8]'
            }`}
          >
            {gmMode ? (
              <Eye className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-[#6b7280]" />
            )}
            <span className="hidden xl:inline">{gmMode ? 'GM' : 'Player'}</span>
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
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-[#161a22] border border-[#d4a853]/35 text-[#e5be58] hover:bg-[#d4a853]/15 transition-colors"
            >
              <Lock className="w-3 h-3" />
              <span className="hidden xl:inline">Unlock</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: 32px Sleek Browser-Style Multi-Tab Strip */}
      <div className="h-[32px] bg-[#07090c] flex items-center justify-between px-2 gap-1">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 h-full">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isSplit = tab.id === splitPaneTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative h-[28px] mt-[4px] px-2.5 flex items-center gap-1.5 rounded-t-md cursor-pointer text-[11px] shrink-0 min-w-[96px] max-w-[185px] border-t border-x transition-all ${
                  isActive
                    ? 'bg-[#0e1116] text-[#f4ece0] border-[#212835] shadow-[inset_0_-2px_0_#d4a853]'
                    : isSplit
                    ? 'bg-[#10141c]/80 text-[#d4a853] border-[#1c222e]'
                    : 'bg-transparent text-[#7a8291] border-transparent hover:bg-[#11151d] hover:text-[#d5d0c5]'
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
                    className="ml-auto p-0.5 rounded opacity-35 group-hover:opacity-100 hover:bg-[#242a36] text-[#8b93a1] hover:text-[#f3ead8] transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 pl-1.5 border-l border-[#1a202b]">
          <button
            onClick={() => openNewEntryModal('Location', 'encyclopedia')}
            title="New Entry"
            className="p-1 rounded text-[#8b93a1] hover:text-[#d4a853] hover:bg-[#171b22] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleSplitPane}
            title={splitPaneTabId ? 'Close Dual Tab Split' : 'Split Tab View'}
            className={`p-1 rounded transition-colors ${
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
            className={`p-1 rounded transition-colors ${
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
