import React, { useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityType, TabItem } from '../../types/vault';
import { AssetViewerPane } from '../assets/AssetViewerPane';
import { BattlemapViewport2D } from '../battlemap/BattlemapViewport2D';
import { NoteEditorPane } from '../editor/NoteEditorPane';
import { RightInspector } from '../layout/RightInspector';
import { MapViewport3D } from '../map/MapViewport3D';
import { CommandPalette } from '../modals/CommandPalette';
import { MapGeneratorModal } from '../modals/MapGeneratorModal';
import { NewEntryModal } from '../modals/NewEntryModal';
import { PinCreationModal } from '../modals/PinCreationModal';
import { SettingsModal } from '../modals/SettingsModal';
import { ProfileCampaignHub } from '../profile/ProfileCampaignHub';
import { SheetTemplateStudio } from '../sheets/SheetTemplateStudio';
import { TemplateEditorPane } from '../templates/TemplateEditorPane';
import { CampaignTimelinePane } from '../timeline/CampaignTimelinePane';
import { StudioHeader } from './StudioHeader';
import { StudioSidebar } from './StudioSidebar';

function StudioMapRouter({ mapId }: { mapId: string }) {
  const map = useVaultStore((s) => s.maps.find((m) => m.id === mapId));
  if (map?.kind === '2d') {
    return <BattlemapViewport2D mapId={mapId} surface="studio" />;
  }
  return <MapViewport3D mapId={mapId} surface="studio" />;
}

function renderStudioTabContent(tab: TabItem | undefined, hasCampaign: boolean) {
  if (!hasCampaign && tab?.kind !== 'profile_hub') {
    return <ProfileCampaignHub />;
  }
  if (!tab) return <ProfileCampaignHub />;
  if (tab.kind === 'profile_hub') {
    return <ProfileCampaignHub />;
  }
  if (tab.kind === 'map') {
    return <StudioMapRouter mapId={tab.targetId} />;
  }
  if (tab.kind === 'asset') {
    return <AssetViewerPane assetId={tab.targetId} />;
  }
  if (tab.kind === 'template') {
    return <TemplateEditorPane entityType={tab.targetId as EntityType} />;
  }
  if (tab.kind === 'sheet_studio') {
    return <SheetTemplateStudio initialTemplateId={tab.targetId} />;
  }
  if (tab.kind === 'timeline') {
    return <CampaignTimelinePane surface="studio" />;
  }
  return <NoteEditorPane entityId={tab.targetId} />;
}

export const StudioShell: React.FC = () => {
  const {
    tabs,
    activeTabId,
    splitPaneTabId,
    maps,
    campaigns,
    activeCampaignId,
    undo,
    redo,
    worldsmithMode,
    isEffectiveGm,
    dispatchTerrainCommand,
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

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeMap =
    activeTab?.kind === 'map'
      ? maps.find((m) => m.id === activeTab.targetId)
      : undefined;
  const is3dWorldsmithActive = Boolean(
    worldsmithMode && isEffectiveGm() && activeMap && activeMap.kind !== '2d'
  );

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

  return (
    <div className="w-screen h-screen bg-[#06080c] text-[#e8e2d5] flex flex-col overflow-hidden">
      <StudioHeader />

      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <StudioSidebar />

        <main className="flex-1 min-w-0 h-full relative overflow-hidden">
          {splitTab && splitTab.id !== activeTab?.id ? (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={55} minSize={25}>
                {renderStudioTabContent(activeTab, hasCampaign)}
              </Panel>
              <PanelResizeHandle className="w-[2px] bg-[#181e2b] hover:bg-[#d4a853]/75 transition-colors cursor-col-resize" />
              <Panel defaultSize={45} minSize={25}>
                {renderStudioTabContent(splitTab, hasCampaign)}
              </Panel>
            </PanelGroup>
          ) : (
            renderStudioTabContent(activeTab, hasCampaign)
          )}
        </main>

        {!rightInspectorCollapsed && (
          <div
            onClick={toggleRightInspector}
            className="md:hidden fixed inset-0 top-12 z-20 bg-black/60 backdrop-blur-[2px]"
          />
        )}

        {!rightInspectorCollapsed && (
          <div
            style={{ width: inspectorWidth }}
            className="max-md:fixed max-md:right-0 max-md:top-12 max-md:bottom-0 max-md:z-30 md:relative md:shrink-0 h-full flex bg-[#0a0d14] border-l border-[#1a202d] max-md:shadow-[-18px_0_44px_rgba(0,0,0,0.82)] max-w-[92vw]"
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
              className="w-[4px] h-full bg-transparent hover:bg-[#d4a853]/75 transition-colors cursor-col-resize shrink-0"
            />
            <div className="flex-1 min-w-0 h-full">
              <RightInspector />
            </div>
          </div>
        )}
      </div>

      {/* Authoring-Only Modals */}
      <CommandPalette mode="studio" />
      <PinCreationModal />
      <NewEntryModal />
      <MapGeneratorModal targetMapId={activeMapId} />
      <SettingsModal />
    </div>
  );
};
