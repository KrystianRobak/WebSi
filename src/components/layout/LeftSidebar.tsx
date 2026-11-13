import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode2,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Plus,
  Settings2,
  Star,
} from 'lucide-react';
import { uploadVaultAsset } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import { Entity, EntityCategory, EntityType } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';

interface TreeItemDef {
  label: string;
  type: EntityType | 'Map';
  category: EntityCategory;
}

const ENCYCLOPEDIA_ITEMS: TreeItemDef[] = [
  { label: 'Characters', type: 'Character', category: 'encyclopedia' },
  { label: 'Locations', type: 'Location', category: 'encyclopedia' },
  { label: 'Factions', type: 'Faction', category: 'encyclopedia' },
  { label: 'Organizations', type: 'Organization', category: 'encyclopedia' },
  { label: 'Items', type: 'Item', category: 'encyclopedia' },
  { label: 'Bestiary', type: 'Bestiary', category: 'encyclopedia' },
  { label: 'Deities', type: 'Deity', category: 'encyclopedia' },
  { label: 'Events', type: 'Event', category: 'encyclopedia' },
  { label: 'Chronicle', type: 'Chronicle', category: 'encyclopedia' },
];

const CAMPAIGN_ITEMS: TreeItemDef[] = [
  { label: 'Sessions', type: 'Session', category: 'campaign' },
  { label: 'Plot Threads', type: 'PlotThread', category: 'campaign' },
  { label: 'Quests', type: 'Quest', category: 'campaign' },
  { label: 'Player Notes', type: 'PlayerNote', category: 'campaign' },
];

const WORLD_ITEMS: TreeItemDef[] = [
  { label: 'Regions', type: 'Region', category: 'world' },
  { label: 'Maps', type: 'Map', category: 'world' },
  { label: 'Cultures', type: 'Culture', category: 'world' },
  { label: 'History', type: 'History', category: 'world' },
  { label: 'Magic', type: 'Magic', category: 'world' },
  { label: 'Languages', type: 'Language', category: 'world' },
];

export const LeftSidebar: React.FC = () => {
  const {
    world,
    entities,
    maps,
    assets,
    templates,
    tabs,
    activeTabId,
    openEntityTab,
    openMapTab,
    openAssetTab,
    openTemplateTab,
    addAsset,
    openNewEntryModal,
    setMapGeneratorModalOpen,
  } = useVaultStore();

  const handleUploadAssetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadVaultAsset(file, 'assets');
    const cleanName = file.name.replace(/\.[^.]+$/, '');
    const created = addAsset({ name: cleanName, url, kind: 'scene' });
    setExpandedGroup('vault-assets');
    openAssetTab(created.id);
    e.target.value = '';
  };

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    vault: true,
    encyclopedia: true,
    campaign: true,
    world: true,
    campaignFolder: true,
    worldFolder: true,
  });

  const [expandedGroup, setExpandedGroup] = useState<string | null>('world-Map');

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const favorites = useMemo(() => entities.filter((e) => e.is_favorite), [entities]);
  const recent = useMemo(
    () =>
      [...entities]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 12),
    [entities]
  );

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleGroup = (key: string) =>
    setExpandedGroup((prev) => (prev === key ? null : key));

  const renderEntityList = (list: Entity[]) => (
    <div className="pl-5 pr-1 py-0.5 space-y-0.5">
      {list.length === 0 ? (
        <div className="text-[11px] text-[#5e6675] italic px-2 py-1">No entries yet</div>
      ) : (
        list.map((ent) => {
          const isCurrent = activeTab?.kind === 'entity' && activeTab.targetId === ent.id;
          return (
            <button
              key={ent.id}
              onClick={() => openEntityTab(ent.id)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11.5px] transition-colors ${
                isCurrent
                  ? 'bg-[#d4a853]/15 text-[#f3d68a]'
                  : 'text-[#9aa3b2] hover:text-[#e7e2d8] hover:bg-[#171b22]'
              }`}
            >
              <EntityIcon type={ent.type} className="w-3 h-3 shrink-0 text-[#d4a853]/80" />
              <span className="truncate flex-1">{ent.title}</span>
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <aside className="relative h-full bg-[#0e1116] border-r border-[#1d222b] flex flex-col select-none overflow-hidden">
      {/* Primary CTA: + New Entry */}
      <div className="p-2.5 border-b border-[#181c24] shrink-0">
        <button
          onClick={() => openNewEntryModal('Location', 'encyclopedia')}
          className="w-full h-[34px] rounded-md btn-gold-metallic flex items-center justify-center gap-1.5 text-[12.5px] font-semibold tracking-wide"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Entry</span>
        </button>
      </div>

      {/* Scrollable Navigation Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-3 z-10">
        {/* VAULT */}
        <div>
          <button
            onClick={() => toggleSection('vault')}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#7c8594] hover:text-[#d4a853] transition-colors"
          >
            {openSections.vault ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>Vault</span>
          </button>

          {openSections.vault && (
            <div className="mt-1 space-y-0.5">
              <div>
                <button
                  onClick={() => toggleGroup('vault-all')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#c9c4ba] hover:bg-[#161a21] hover:text-[#f3ead8] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#d4a853]" />
                    <span>All Entries</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#737c8c]">{entities.length}</span>
                </button>
                {expandedGroup === 'vault-all' && renderEntityList(entities)}
              </div>

              <div>
                <button
                  onClick={() => toggleGroup('vault-fav')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#c9c4ba] hover:bg-[#161a21] hover:text-[#f3ead8] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-[#d4a853]" />
                    <span>Favorites</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#737c8c]">{favorites.length}</span>
                </button>
                {expandedGroup === 'vault-fav' && renderEntityList(favorites)}
              </div>

              <div>
                <button
                  onClick={() => toggleGroup('vault-recent')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#c9c4ba] hover:bg-[#161a21] hover:text-[#f3ead8] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#9ca3af]" />
                    <span>Recent</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#737c8c]">{recent.length}</span>
                </button>
                {expandedGroup === 'vault-recent' && renderEntityList(recent)}
              </div>

              {/* Vault Media Assets */}
              <div>
                <div className="group flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#c9c4ba] hover:bg-[#161a21] hover:text-[#f3ead8] transition-colors">
                  <button
                    onClick={() => toggleGroup('vault-assets')}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                    <span className="truncate">Assets</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label
                      title="Upload Asset Image"
                      className="cursor-pointer opacity-70 group-hover:opacity-100 p-0.5 rounded hover:bg-[#232934] text-[#d4a853]"
                    >
                      <Plus className="w-3 h-3" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadAssetFile}
                      />
                    </label>
                    <span className="font-mono text-[11px] text-[#737c8c]">{assets.length}</span>
                  </div>
                </div>
                {expandedGroup === 'vault-assets' && (
                  <div className="pl-4 pr-1 py-1 space-y-1">
                    {assets.map((asset) => {
                      const isCurrent =
                        activeTab?.kind === 'asset' && activeTab.targetId === asset.id;
                      return (
                        <button
                          key={asset.id}
                          onClick={() => openAssetTab(asset.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11.5px] transition-colors ${
                            isCurrent
                              ? 'bg-[#d4a853]/15 text-[#f3d68a]'
                              : 'text-[#9aa3b2] hover:text-[#e7e2d8] hover:bg-[#171b22]'
                          }`}
                        >
                          <img
                            src={asset.url}
                            alt={asset.name}
                            className="w-5 h-5 rounded object-cover border border-[#2a3140] shrink-0"
                          />
                          <span className="truncate flex-1">{asset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Record Templates */}
              <div>
                <button
                  onClick={() => toggleGroup('vault-templates')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#c9c4ba] hover:bg-[#161a21] hover:text-[#f3ead8] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileCode2 className="w-3.5 h-3.5 text-[#c79e4f]" />
                    <span>Templates</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#737c8c]">
                    {Object.keys(templates).length}
                  </span>
                </button>
                {expandedGroup === 'vault-templates' && (
                  <div className="pl-5 pr-1 py-0.5 space-y-0.5">
                    {Object.values(templates).map((tpl) => {
                      const isCurrent =
                        activeTab?.kind === 'template' && activeTab.targetId === tpl.type;
                      return (
                        <button
                          key={tpl.type}
                          onClick={() => openTemplateTab(tpl.type)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11.5px] transition-colors ${
                            isCurrent
                              ? 'bg-[#d4a853]/15 text-[#f3d68a]'
                              : 'text-[#9aa3b2] hover:text-[#e7e2d8] hover:bg-[#171b22]'
                          }`}
                        >
                          <EntityIcon
                            type={tpl.type}
                            className="w-3 h-3 shrink-0 text-[#d4a853]/80"
                          />
                          <span className="truncate flex-1">{tpl.type}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ENCYCLOPEDIA */}
        <div>
          <button
            onClick={() => toggleSection('encyclopedia')}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#7c8594] hover:text-[#d4a853] transition-colors"
          >
            {openSections.encyclopedia ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>Encyclopedia</span>
          </button>

          {openSections.encyclopedia && (
            <div className="mt-1 space-y-0.5">
              {ENCYCLOPEDIA_ITEMS.map((item) => {
                const matching = entities.filter((e) => e.type === item.type);
                const key = `enc-${item.type}`;
                const isOpen = expandedGroup === key;
                return (
                  <div key={key}>
                    <div className="group flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#c2bdb3] hover:bg-[#161a21] hover:text-[#f3ead8] transition-colors">
                      <button
                        onClick={() => toggleGroup(key)}
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        <EntityIcon
                          type={item.type}
                          className="w-3.5 h-3.5 text-[#c79e4f] shrink-0"
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            openNewEntryModal(item.type as EntityType, item.category)
                          }
                          title={`New ${item.type}`}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#232934] text-[#d4a853] transition-opacity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <span className="font-mono text-[11px] text-[#737c8c] min-w-[16px] text-right">
                          {matching.length}
                        </span>
                      </div>
                    </div>
                    {isOpen && renderEntityList(matching)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CAMPAIGN */}
        <div>
          <button
            onClick={() => toggleSection('campaign')}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#7c8594] hover:text-[#d4a853] transition-colors"
          >
            {openSections.campaign ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>Campaign</span>
          </button>

          {openSections.campaign && (
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#161a22] border border-[#242a35] text-[12px] text-[#e7e2d8] font-medium">
                <button
                  onClick={() => toggleSection('campaignFolder')}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                >
                  {openSections.campaignFolder ? (
                    <FolderOpen className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                  )}
                  <span className="truncate">Shattered Reach — West Marches</span>
                </button>
              </div>

              {openSections.campaignFolder && (
                <div className="pl-3 space-y-0.5 pt-0.5">
                  {CAMPAIGN_ITEMS.map((item) => {
                    const matching = entities.filter((e) => e.type === item.type);
                    const key = `camp-${item.type}`;
                    const isOpen = expandedGroup === key;
                    return (
                      <div key={key}>
                        <div className="group flex items-center justify-between px-2 py-1 rounded text-[12px] text-[#b8b3a8] hover:bg-[#161a21] hover:text-[#f3ead8]">
                          <button
                            onClick={() => toggleGroup(key)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <Folder className="w-3.5 h-3.5 text-[#b38732] shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                openNewEntryModal(item.type as EntityType, item.category)
                              }
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#232934] text-[#d4a853]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-[10.5px] text-[#6d7685]">
                              {matching.length}
                            </span>
                          </div>
                        </div>
                        {isOpen && renderEntityList(matching)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* WORLD */}
        <div>
          <button
            onClick={() => toggleSection('world')}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#7c8594] hover:text-[#d4a853] transition-colors"
          >
            {openSections.world ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>World</span>
          </button>

          {openSections.world && (
            <div className="mt-1 space-y-0.5">
              <button
                onClick={() => toggleSection('worldFolder')}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[12px] text-[#d8d3c8] hover:bg-[#161a21]"
              >
                {openSections.worldFolder ? (
                  <FolderOpen className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                )}
                <span className="truncate font-medium">{world.name}</span>
              </button>

              {openSections.worldFolder && (
                <div className="pl-3 space-y-0.5">
                  {WORLD_ITEMS.map((item) => {
                    const isMapGroup = item.type === 'Map';
                    const matching = isMapGroup
                      ? []
                      : entities.filter((e) => e.type === item.type);
                    const count = isMapGroup ? maps.length : matching.length;
                    const key = `world-${item.type}`;
                    const isOpen = expandedGroup === key;

                    return (
                      <div key={key}>
                        <div className="group flex items-center justify-between px-2 py-1 rounded text-[12px] text-[#b8b3a8] hover:bg-[#161a21] hover:text-[#f3ead8]">
                          <button
                            onClick={() => toggleGroup(key)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <Folder className="w-3.5 h-3.5 text-[#b38732] shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                isMapGroup
                                  ? setMapGeneratorModalOpen(true, '3d')
                                  : openNewEntryModal(item.type as EntityType, item.category)
                              }
                              title={isMapGroup ? 'Create Custom Map' : `New ${item.label}`}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#232934] text-[#d4a853]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-[10.5px] text-[#6d7685]">
                              {count}
                            </span>
                          </div>
                        </div>

                        {isOpen &&
                          (isMapGroup ? (
                            <div className="pl-5 pr-1 py-0.5 space-y-0.5">
                              {maps.map((m) => {
                                const isActiveMap = activeTab?.kind === 'map' && activeTab.targetId === m.id;
                                return (
                                  <div key={m.id} className="group/map flex items-center gap-1">
                                    <button
                                      onClick={() => openMapTab(m.id)}
                                      className={`flex-1 min-w-0 flex items-center justify-between gap-1.5 px-2 py-1 rounded text-left text-[11.5px] transition-colors ${
                                        isActiveMap
                                          ? 'text-[#f3d185] bg-[#d4a853]/20 border border-[#d4a853]/35'
                                          : 'text-[#d4cfc4] bg-[#171b22]/60 hover:bg-[#d4a853]/15 hover:text-[#e5be58]'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        <EntityIcon type="Map" className="w-3 h-3 shrink-0 text-[#d4a853]" />
                                        <span className="truncate">{m.name}</span>
                                      </span>
                                      <span
                                        className={`shrink-0 px-1 py-0.2 rounded text-[9px] font-mono uppercase border ${
                                          m.kind === '2d'
                                            ? 'text-sky-300 border-sky-500/30 bg-sky-500/10'
                                            : 'text-[#e5be58] border-[#d4a853]/30 bg-[#d4a853]/10'
                                        }`}
                                      >
                                        {m.kind === '2d' ? '2D' : '3D'}
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => setMapGeneratorModalOpen(true, m.kind || '3d', m.id)}
                                      title={`Edit ${m.name}`}
                                      aria-label={`Edit ${m.name}`}
                                      className="opacity-0 group-hover/map:opacity-100 p-1 rounded hover:bg-[#232934] text-[#9aa3b2] hover:text-[#e5be58] transition-opacity shrink-0"
                                    >
                                      <Settings2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}
                              <div className="grid grid-cols-2 gap-1 pt-1">
                                <button
                                  onClick={() => setMapGeneratorModalOpen(true, '3d')}
                                  className="px-1.5 py-1 rounded text-[10px] font-medium text-[#e5be58] bg-[#1a1f28] hover:bg-[#232934] border border-[#2a313d] flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-2.5 h-2.5" /> 3D World
                                </button>
                                <button
                                  onClick={() => setMapGeneratorModalOpen(true, '2d')}
                                  className="px-1.5 py-1 rounded text-[10px] font-medium text-sky-300 bg-[#1a1f28] hover:bg-[#232934] border border-[#2a313d] flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-2.5 h-2.5" /> 2D Combat
                                </button>
                              </div>
                            </div>
                          ) : (
                            renderEntityList(matching)
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subtle Architectural Seal Footer */}
      <div className="shrink-0 h-11 px-3 border-t border-[#181d26] bg-[#0a0c10] flex items-center justify-between text-[10.5px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded-full bg-[#151922] border border-[#d4a853]/35 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rotate-45 bg-[#d4a853]/80" />
          </span>
          <span className="font-serif tracking-wide text-[#c8bea8] truncate">
            {world.name}
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#6d7685] shrink-0">
          {entities.length} notes · {assets.length} art
        </span>
      </div>
    </aside>
  );
};
