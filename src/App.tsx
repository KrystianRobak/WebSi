import React, { useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Loader2 } from 'lucide-react';
import { NoteEditorPane } from './components/editor/NoteEditorPane';
import { AssetViewerPane } from './components/assets/AssetViewerPane';
import { TemplateEditorPane } from './components/templates/TemplateEditorPane';
import { AuthScreen } from './components/auth/AuthScreen';
import { ProfileCampaignHub } from './components/profile/ProfileCampaignHub';
import { PlayerJournalsPane } from './components/journals/PlayerJournalsPane';
import { CampaignTimelinePane } from './components/timeline/CampaignTimelinePane';
import { CharacterManagerPane } from './components/sheets/CharacterManagerPane';
import { SheetTemplateStudio } from './components/sheets/SheetTemplateStudio';
import { DiceRollerDrawer } from './components/vtt/DiceRollerDrawer';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { RightInspector } from './components/layout/RightInspector';
import { TopHeader } from './components/layout/TopHeader';
import { MapViewport3D } from './components/map/MapViewport3D';
import { BattlemapViewport2D } from './components/battlemap/BattlemapViewport2D';
import { CommandPalette } from './components/modals/CommandPalette';
import { MapGeneratorModal } from './components/modals/MapGeneratorModal';
import { NewEntryModal } from './components/modals/NewEntryModal';
import { PinCreationModal } from './components/modals/PinCreationModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { useVaultStore } from './store/useVaultStore';
import { EntityType, TabItem } from './types/vault';

function MapTabRouter({ mapId }: { mapId: string }) {
  const map = useVaultStore((s) => s.maps.find((m) => m.id === mapId));
  if (map?.kind === '2d') {
    return <BattlemapViewport2D mapId={mapId} />;
  }
  return <MapViewport3D mapId={mapId} />;
}

function renderTabContent(tab: TabItem | undefined, hasCampaign: boolean) {
  if (!hasCampaign && tab?.kind !== 'profile_hub') {
    return <ProfileCampaignHub />;
  }
  if (!tab) return <ProfileCampaignHub />;
  if (tab.kind === 'profile_hub') {
    return <ProfileCampaignHub />;
  }
  if (tab.kind === 'map') {
    return <MapTabRouter mapId={tab.targetId} />;
  }
  if (tab.kind === 'asset') {
    return <AssetViewerPane assetId={tab.targetId} />;
  }
  if (tab.kind === 'template') {
    return <TemplateEditorPane entityType={tab.targetId as EntityType} />;
  }
  if (tab.kind === 'journal') {
    return <PlayerJournalsPane initialPageId={tab.targetId} />;
  }
  if (tab.kind === 'character') {
    return <CharacterManagerPane initialCharacterId={tab.targetId} />;
  }
  if (tab.kind === 'sheet_studio') {
    return <SheetTemplateStudio initialTemplateId={tab.targetId} />;
  }
  if (tab.kind === 'timeline') {
    return <CampaignTimelinePane />;
  }
  return <NoteEditorPane entityId={tab.targetId} />;
}

export function App() {
  const {
    tabs,
    activeTabId,
    splitPaneTabId,
    initSupabaseSync,
    syncFromSupabase,
    maps,
    campaigns,
    activeCampaignId,
    undo,
    redo,
    worldsmithMode,
    isEffectiveGm,
    dispatchTerrainCommand,
    isAuthenticated,
    authLoading,
    leftNavOpen,
    setLeftNavOpen,
    toggleLeftNav,
    rightInspectorCollapsed,
    toggleRightInspector,
    inspectorWidth,
    setInspectorWidth,
  } = useVaultStore();

  const resizingInspectorRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = resizingInspectorRef.current;
      if (!drag) return;
      const next = Math.max(270, Math.min(520, drag.startW + (drag.startX - e.clientX)));
      setInspectorWidth(next);
    };
    const onMouseUp = () => {
      resizingInspectorRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [setInspectorWidth]);

  useEffect(() => {
    initSupabaseSync();
  }, [initSupabaseSync]);

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

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeMap =
    activeTab?.kind === 'map'
      ? maps.find((m) => m.id === activeTab.targetId)
      : undefined;
  const is3dWorldsmithActive =
    Boolean(worldsmithMode && isEffectiveGm() && activeMap && activeMap.kind !== '2d');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleLeftNav();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleRightInspector();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (is3dWorldsmithActive) dispatchTerrainCommand({ type: 'undo' });
        else undo();
      } else if (
        (e.key.toLowerCase() === 'z' && e.shiftKey) ||
        e.key.toLowerCase() === 'y'
      ) {
        e.preventDefault();
        if (is3dWorldsmithActive) dispatchTerrainCommand({ type: 'redo' });
        else redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, dispatchTerrainCommand, is3dWorldsmithActive, toggleLeftNav, toggleRightInspector]);
  const activeMapId = activeTab?.kind === 'map' ? activeTab.targetId : maps[0]?.id;
  const splitTab = splitPaneTabId
    ? tabs.find((t) => t.id === splitPaneTabId)
    : undefined;
  const hasCampaign = campaigns.length > 0 && Boolean(activeCampaignId);

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

  return (
    <div className="w-screen h-screen bg-[#050608] text-[#ded8cc] flex flex-col overflow-hidden">
      {/* Zone 1: Single 42px Unified Header + Tabs */}
      <TopHeader />

      {/* Zones 2, 3, 4: 44px Left Rail + Full-Bleed Workspace + Floating Drawers */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <LeftSidebar />

        {/* Center Full-Bleed Canvas / Note Split */}
        <main
          className="flex-1 min-w-0 h-full relative overflow-hidden"
          onClick={() => {
            if (leftNavOpen) setLeftNavOpen(false);
          }}
        >
          {splitTab && splitTab.id !== activeTab?.id ? (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={55} minSize={25}>
                {renderTabContent(activeTab, hasCampaign)}
              </Panel>
              <PanelResizeHandle className="w-[2px] bg-[#131720] hover:bg-[#b68d40]/70 transition-colors cursor-col-resize" />
              <Panel defaultSize={45} minSize={25}>
                {renderTabContent(splitTab, hasCampaign)}
              </Panel>
            </PanelGroup>
          ) : (
            renderTabContent(activeTab, hasCampaign)
          )}
        </main>

        {/* Floating Overlay Right Contextual Inspector Drawer */}
        {!rightInspectorCollapsed && (
          <div
            style={{ width: inspectorWidth }}
            className="absolute right-0 inset-y-0 z-30 flex bg-[#06080b]/98 backdrop-blur-md border-l border-[#141821] shadow-[-18px_0_44px_rgba(0,0,0,0.82)] max-w-[92vw]"
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Inspector"
              onMouseDown={(e) => {
                e.preventDefault();
                resizingInspectorRef.current = { startX: e.clientX, startW: inspectorWidth };
              }}
              title="Drag to resize Inspector"
              className="w-[4px] h-full bg-transparent hover:bg-[#b68d40]/75 transition-colors cursor-col-resize shrink-0"
            />
            <div className="flex-1 min-w-0 h-full">
              <RightInspector />
            </div>
          </div>
        )}
      </div>

      {/* Global Modals & VTT Overlays */}
      <DiceRollerDrawer />
      <CommandPalette />
      <PinCreationModal />
      <NewEntryModal />
      <MapGeneratorModal targetMapId={activeMapId} />
      <SettingsModal />
    </div>
  );
}

export default App;


