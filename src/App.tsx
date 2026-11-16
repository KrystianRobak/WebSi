import React, { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { NoteEditorPane } from './components/editor/NoteEditorPane';
import { AssetViewerPane } from './components/assets/AssetViewerPane';
import { TemplateEditorPane } from './components/templates/TemplateEditorPane';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { RightInspector } from './components/layout/RightInspector';
import { TopHeader } from './components/layout/TopHeader';
import { MapViewport3D } from './components/map/MapViewport3D';
import { BattlemapViewport2D } from './components/battlemap/BattlemapViewport2D';
import { AuthModal } from './components/modals/AuthModal';
import { CommandPalette } from './components/modals/CommandPalette';
import { MapGeneratorModal } from './components/modals/MapGeneratorModal';
import { NewEntryModal } from './components/modals/NewEntryModal';
import { PinCreationModal } from './components/modals/PinCreationModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { VaultLockScreen } from './components/modals/VaultLockScreen';
import { useVaultStore } from './store/useVaultStore';
import { EntityType, TabItem } from './types/vault';

function MapTabRouter({ mapId }: { mapId: string }) {
  const map = useVaultStore((s) => s.maps.find((m) => m.id === mapId));
  if (map?.kind === '2d') {
    return <BattlemapViewport2D mapId={mapId} />;
  }
  return <MapViewport3D mapId={mapId} />;
}

function renderTabContent(tab: TabItem | undefined) {
  if (!tab) return null;
  if (tab.kind === 'map') {
    return <MapTabRouter mapId={tab.targetId} />;
  }
  if (tab.kind === 'asset') {
    return <AssetViewerPane assetId={tab.targetId} />;
  }
  if (tab.kind === 'template') {
    return <TemplateEditorPane entityType={tab.targetId as EntityType} />;
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
    undo,
    redo,
    isAuthenticated,
    leftNavOpen,
    setLeftNavOpen,
    toggleLeftNav,
    rightInspectorCollapsed,
    toggleRightInspector,
  } = useVaultStore();

  const [inspectorWidth, setInspectorWidth] = useState(330);
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
  }, []);

  useEffect(() => {
    initSupabaseSync();
  }, [initSupabaseSync]);

  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated, syncFromSupabase]);

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
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key.toLowerCase() === 'z' && e.shiftKey) ||
        e.key.toLowerCase() === 'y'
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, toggleLeftNav, toggleRightInspector]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeMapId = activeTab?.kind === 'map' ? activeTab.targetId : maps[0]?.id;
  const splitTab = splitPaneTabId
    ? tabs.find((t) => t.id === splitPaneTabId)
    : undefined;

  if (!isAuthenticated) {
    return (
      <>
        <VaultLockScreen />
        <SettingsModal />
      </>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#0b0d10] text-[#e7e2d8] flex flex-col overflow-hidden">
      {/* Zone 1: Single 42px Unified Header + Tabs */}
      <TopHeader />

      {/* Zones 2, 3, 4: 44px Left Rail + Full-Bleed Workspace + Floating Drawers */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <LeftSidebar />

        {/* Center Full-Bleed Canvas / Note Split */}
        <div
          className="flex-1 min-w-0 h-full relative overflow-hidden"
          onClick={() => {
            if (leftNavOpen) setLeftNavOpen(false);
          }}
        >
          {splitTab && splitTab.id !== activeTab?.id ? (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={55} minSize={25}>
                {renderTabContent(activeTab)}
              </Panel>
              <PanelResizeHandle className="w-[2px] bg-[#1d222b] hover:bg-[#d4a853]/70 transition-colors cursor-col-resize" />
              <Panel defaultSize={45} minSize={25}>
                {renderTabContent(splitTab)}
              </Panel>
            </PanelGroup>
          ) : (
            renderTabContent(activeTab)
          )}
        </div>

        {/* Floating Overlay Right Contextual Inspector Drawer */}
        {!rightInspectorCollapsed && (
          <div
            style={{ width: inspectorWidth }}
            className="absolute right-0 inset-y-0 z-30 flex bg-[#0b0e14]/96 backdrop-blur-md border-l border-[#212836] shadow-[-16px_0_40px_rgba(0,0,0,0.65)] max-w-[92vw]"
          >
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                resizingInspectorRef.current = { startX: e.clientX, startW: inspectorWidth };
              }}
              title="Drag to resize Inspector"
              className="w-[4px] h-full bg-transparent hover:bg-[#d4a853]/75 transition-colors cursor-col-resize shrink-0"
            />
            <div className="flex-1 min-w-0 h-full">
              <RightInspector />
            </div>
          </div>
        )}
      </div>

      {/* Global Modals */}
      <CommandPalette />
      <PinCreationModal />
      <NewEntryModal />
      <MapGeneratorModal targetMapId={activeMapId} />
      <AuthModal />
      <SettingsModal />
    </div>
  );
}

export default App;

