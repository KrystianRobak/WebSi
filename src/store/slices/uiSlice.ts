import { DEFAULT_TEMPLATES } from '../../data/templates';
import type { TabItem } from '../../types/vault';
import type { VaultSlice, VaultState } from './types';

export type UiSlice = Pick<
  VaultState,
  | 'tabs'
  | 'activeTabId'
  | 'splitPaneTabId'
  | 'editorMode'
  | 'inspectorSubTab'
  | 'inspectorWidth'
  | 'leftNavOpen'
  | 'leftNavSection'
  | 'rightInspectorCollapsed'
  | 'gmMode'
  | 'leftFilterQuery'
  | 'selectedSidebarFilter'
  | 'commandPaletteOpen'
  | 'settingsModalOpen'
  | 'newEntryModalOpen'
  | 'newEntryDefaultType'
  | 'newEntryDefaultCategory'
  | 'setGmMode'
  | 'setEditorMode'
  | 'setInspectorSubTab'
  | 'setInspectorWidth'
  | 'setLeftNavOpen'
  | 'toggleLeftNav'
  | 'setLeftNavSection'
  | 'setRightInspectorCollapsed'
  | 'toggleRightInspector'
  | 'setCommandPaletteOpen'
  | 'setSettingsModalOpen'
  | 'openNewEntryModal'
  | 'closeNewEntryModal'
  | 'setSelectedSidebarFilter'
  | 'setLeftFilterQuery'
  | 'setActiveTab'
  | 'openEntityTab'
  | 'openEntityByTitle'
  | 'openMapTab'
  | 'openAssetTab'
  | 'openTemplateTab'
  | 'openJournalTab'
  | 'openCharacterTab'
  | 'openSheetStudioTab'
  | 'openTimelineTab'
  | 'openProfileHubTab'
  | 'closeTab'
  | 'toggleSplitPane'
>;

export const createUiSlice: VaultSlice<UiSlice> = (set, get) => ({
  tabs: [],
  activeTabId: '',
  splitPaneTabId: null,
  editorMode: 'preview',
  inspectorSubTab: 'details',
  inspectorWidth: 330,
  leftNavOpen: false,
  leftNavSection: 'vault',
  rightInspectorCollapsed: true,
  gmMode: true,
  leftFilterQuery: '',
  selectedSidebarFilter: null,

  commandPaletteOpen: false,
  settingsModalOpen: false,
  newEntryModalOpen: false,
  newEntryDefaultType: 'Location',
  newEntryDefaultCategory: 'encyclopedia',

  setGmMode: (val) =>
    set((s) => {
      // Only GM or Co-GM can enable GM mode; players stay in Player view.
      const allowed = s.myRole === 'gm' || s.myRole === 'co_gm';
      const nextVal = allowed ? val : false;
      return {
        gmMode: nextVal,
        worldsmithMode: nextVal ? s.worldsmithMode : false,
        battlemapMode: nextVal ? s.battlemapMode : 'play',
        selectedPinId:
          !nextVal && s.selectedPinId && s.mapPins.find((p) => p.id === s.selectedPinId)?.is_gm_only
            ? null
            : s.selectedPinId,
      };
    }),

  setEditorMode: (mode) => set({ editorMode: mode }),
  setInspectorSubTab: (tab) => set({ inspectorSubTab: tab }),
  setInspectorWidth: (width) =>
    set({ inspectorWidth: Math.max(270, Math.min(520, Math.round(width))) }),
  setLeftNavOpen: (open) => set({ leftNavOpen: open }),
  toggleLeftNav: () => set((s) => ({ leftNavOpen: !s.leftNavOpen })),
  setLeftNavSection: (section) => set({ leftNavSection: section, leftNavOpen: true }),
  setRightInspectorCollapsed: (collapsed) => set({ rightInspectorCollapsed: collapsed }),
  toggleRightInspector: () =>
    set((s) => ({ rightInspectorCollapsed: !s.rightInspectorCollapsed })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
  openNewEntryModal: (defaultType = 'Location', defaultCategory = 'encyclopedia') =>
    set((s) => {
      if (!s.isEffectiveGm()) return s;
      return {
        newEntryModalOpen: true,
        newEntryDefaultType: defaultType,
        newEntryDefaultCategory: defaultCategory,
      };
    }),
  closeNewEntryModal: () => set({ newEntryModalOpen: false }),
  setSelectedSidebarFilter: (filter) => set({ selectedSidebarFilter: filter }),
  setLeftFilterQuery: (q) => set({ leftFilterQuery: q }),

  setActiveTab: (tabId) => set({ activeTabId: tabId, selectedPinId: null }),

  openEntityTab: (entityId, inSplit = false) => {
    const state = get();
    const entity = state.entities.find((e) => e.id === entityId);
    if (!entity) return;

    const existing = state.tabs.find((t) => t.kind === 'entity' && t.targetId === entityId);
    if (existing) {
      if (inSplit) set({ splitPaneTabId: existing.id });
      else set({ activeTabId: existing.id, selectedPinId: null });
      return;
    }

    const newTab: TabItem = {
      id: `tab-${entity.id}`,
      kind: 'entity',
      targetId: entity.id,
      title: entity.title,
      iconType: entity.type,
    };

    if (inSplit) {
      set({ tabs: [...state.tabs, newTab], splitPaneTabId: newTab.id });
    } else {
      set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id, selectedPinId: null });
    }
  },

  openEntityByTitle: (titleOrSlug) => {
    const state = get();
    const norm = titleOrSlug.trim().toLowerCase();
    const found = state.entities.find(
      (e) => e.title.toLowerCase() === norm || e.slug.toLowerCase() === norm
    );
    if (found) state.openEntityTab(found.id);
  },

  openMapTab: (mapId) => {
    const state = get();
    const map = state.maps.find((m) => m.id === mapId);
    if (!map) return;
    const existing = state.tabs.find((t) => t.kind === 'map' && t.targetId === mapId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-map-${map.id}`,
      kind: 'map',
      targetId: map.id,
      title: map.name,
      iconType: 'Map',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openAssetTab: (assetId) => {
    const state = get();
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const existing = state.tabs.find((t) => t.kind === 'asset' && t.targetId === assetId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-asset-${asset.id}`,
      kind: 'asset',
      targetId: asset.id,
      title: asset.name,
      iconType: 'Asset',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openTemplateTab: (type) => {
    const state = get();
    const existing = state.tabs.find((t) => t.kind === 'template' && t.targetId === type);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tpl = state.templates[type] || DEFAULT_TEMPLATES[type];
    const newTab: TabItem = {
      id: `tab-tpl-${type}`,
      kind: 'template',
      targetId: type,
      title: `Template: ${tpl.label}`,
      iconType: type,
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openJournalTab: (pageId = 'journals') => {
    const state = get();
    const page = pageId !== 'journals' ? state.journalPages.find((p) => p.id === pageId) : undefined;
    const targetId = page ? page.id : 'journals';
    const existing = state.tabs.find((t) => t.kind === 'journal' && t.targetId === targetId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-journal-${targetId}`,
      kind: 'journal',
      targetId,
      title: page ? page.title : 'Player Journals',
      iconType: 'PlayerNote',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openCharacterTab: (characterId = 'characters') => {
    const state = get();
    const charRec =
      characterId !== 'characters'
        ? state.characters.find((c) => c.id === characterId)
        : undefined;
    const targetId = charRec ? charRec.id : 'characters';
    const existing = state.tabs.find((t) => t.kind === 'character' && t.targetId === targetId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-char-${targetId}`,
      kind: 'character',
      targetId,
      title: charRec ? charRec.name : 'Characters & Sheets',
      iconType: 'Character',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openSheetStudioTab: (templateId = 'sheet_studio') => {
    const state = get();
    const tpl =
      templateId !== 'sheet_studio'
        ? state.sheetTemplates.find((t) => t.id === templateId)
        : undefined;
    const targetId = tpl ? tpl.id : 'sheet_studio';
    const existing = state.tabs.find((t) => t.kind === 'sheet_studio' && t.targetId === targetId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-sheet-studio-${targetId}`,
      kind: 'sheet_studio',
      targetId,
      title: tpl ? `Sheet: ${tpl.name}` : 'Sheet Template Studio',
      iconType: 'Magic',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openTimelineTab: () => {
    const state = get();
    const existing = state.tabs.find((t) => t.kind === 'timeline');
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: 'tab-timeline',
      kind: 'timeline',
      targetId: 'timeline',
      title: 'Campaign Timeline',
      iconType: 'Chronicle',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openProfileHubTab: () => {
    const state = get();
    const existing = state.tabs.find((t) => t.kind === 'profile_hub');
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: 'tab-profile-hub',
      kind: 'profile_hub',
      targetId: 'profile_hub',
      title: 'Profile & Campaigns',
      iconType: 'Campaign',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  closeTab: (tabId) =>
    set((s) => {
      if (s.tabs.length <= 1) return s;
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      const nextTabs = s.tabs.filter((t) => t.id !== tabId);
      let nextActive = s.activeTabId;
      if (s.activeTabId === tabId) {
        const fallback = nextTabs[Math.max(0, idx - 1)] || nextTabs[0];
        nextActive = fallback.id;
      }
      const nextSplit = s.splitPaneTabId === tabId ? null : s.splitPaneTabId;
      return { tabs: nextTabs, activeTabId: nextActive, splitPaneTabId: nextSplit };
    }),

  toggleSplitPane: () =>
    set((s) => {
      if (s.splitPaneTabId) return { splitPaneTabId: null };
      const other = s.tabs.find((t) => t.id !== s.activeTabId) || s.tabs[0];
      return { splitPaneTabId: other ? other.id : null };
    }),
});
