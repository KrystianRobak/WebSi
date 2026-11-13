import React, { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PanelRightOpen } from 'lucide-react';
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
    maps,
    undo,
    redo,
    isAuthenticated,
    rightInspectorCollapsed,
    setRightInspectorCollapsed,
  } = useVaultStore();

  const [inspectorWidth, setInspectorWidth] = useState(320);
  const resizingInspectorRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = resizingInspectorRef.current;
      if (!drag) return;
      const next = Math.max(260, Math.min(500, drag.startW + (drag.startX - e.clientX)));
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
    const onKeyDown = (e: KeyboardEvent) => {
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
  }, [undo, redo]);

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
      {/* Zone 1: Top Header & Multi-Tab Strip */}
      <TopHeader />

      {/* Zones 2, 3, 4: Resizable 3-Column Workspace */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="aethelgard-layout-v1">
          {/* Zone 2: Left Vault Navigation Sidebar (240px default) */}
          <Panel defaultSize={17} minSize={13} maxSize={28} className="min-w-[200px]">
            <LeftSidebar />
          </Panel>

          <PanelResizeHandle className="w-[1px] bg-[#1d222b] hover:bg-[#d4a853]/70 transition-colors cursor-col-resize" />

          {/* Zone 3 + Zone 4: Center Interactive Viewport / Note Editor + Retractable Inspector Drawer */}
          <Panel defaultSize={83} minSize={45}>
            <div className="relative h-full w-full flex overflow-hidden">
              <div className="flex-1 min-w-0 h-full transition-all duration-300 ease-out">
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

              {/* Floating Reopen Rail when Right Inspector is retracted */}
              {rightInspectorCollapsed && (
                <button
                  onClick={() => setRightInspectorCollapsed(false)}
                  title="Expand Inspector Panel"
                  aria-label="Expand Inspector Panel"
                  className="shrink-0 w-7 h-full bg-[#0c0f14] hover:bg-[#141922] border-l border-[#1d222b] hover:border-[#d4a853]/45 flex flex-col items-center justify-center gap-2 text-[#858d9b] hover:text-[#f0cf85] transition-colors z-20"
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-mono uppercase tracking-[0.2em]">
                    Inspector
                  </span>
                </button>
              )}

              {/* Drag Handle for Right Inspector */}
              {!rightInspectorCollapsed && (
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    resizingInspectorRef.current = { startX: e.clientX, startW: inspectorWidth };
                  }}
                  title="Drag to resize Inspector"
                  className="w-[3px] h-full bg-[#1d222b] hover:bg-[#d4a853]/75 transition-colors cursor-col-resize shrink-0"
                />
              )}

              {/* Zone 4: Retractable Right Contextual Inspector Drawer */}
              <div
                style={{ width: rightInspectorCollapsed ? 0 : inspectorWidth }}
                aria-hidden={rightInspectorCollapsed}
                className={`h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out ${
                  rightInspectorCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                <div style={{ width: inspectorWidth }} className="h-full">
                  <RightInspector />
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
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
