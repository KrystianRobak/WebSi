import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode2,
  Folder,
  FolderOpen,
  FolderTree,
  Globe,
  Image as ImageIcon,
  Layers,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Settings2,
  Star,
  X,
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
    leftNavOpen,
    leftNavSection,
    setLeftNavOpen,
    setLeftNavSection,
    openEntityTab,
    openMapTab,
    openAssetTab,
    openTemplateTab,
    addAsset,
    openNewEntryModal,
    setMapGeneratorModalOpen,
    setCommandPaletteOpen,
    setSettingsModalOpen,
  } = useVaultStore();

  const handleUploadAssetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadVaultAsset(file, 'assets');
    const cleanName = file.name.replace(/\.[^.]+$/, '');
    const created = addAsset({ name: cleanName, url, kind: 'scene' });
    setLeftNavSection('assets');
    openAssetTab(created.id);
    e.target.value = '';
  };

  const [filterQuery, setFilterQuery] = useState('');
  const [vaultScope, setVaultScope] = useState<'all' | 'encyclopedia' | 'campaign' | 'world'>('all');
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

  const filteredQuickResults = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return null;
    return {
      entities: entities.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      ),
      maps: maps.filter((m) => m.name.toLowerCase().includes(q)),
      assets: assets.filter((a) => a.name.toLowerCase().includes(q)),
    };
  }, [filterQuery, entities, maps, assets]);

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleGroup = (key: string) =>
    setExpandedGroup((prev) => (prev === key ? null : key));

  const handleRailSectionClick = (section: 'vault' | 'assets' | 'templates') => {
    if (leftNavOpen && leftNavSection === section) {
      setLeftNavOpen(false);
    } else {
      setLeftNavSection(section);
    }
  };

  const renderEntityList = (list: Entity[]) => (
    <div className="pl-4 pr-1 py-0.5 space-y-0.5">
      {list.length === 0 ? (
        <div className="text-[11px] text-[#5e6675] italic px-2 py-0.5">No entries yet</div>
      ) : (
        list.map((ent) => {
          const isCurrent = activeTab?.kind === 'entity' && activeTab.targetId === ent.id;
          return (
            <button
              key={ent.id}
              onClick={() => openEntityTab(ent.id)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11.5px] transition-colors ${
                isCurrent
                  ? 'bg-[#b68d40]/14 text-[#d6b16a]'
                  : 'text-[#8e97a6] hover:text-[#ded8cc] hover:bg-[#0d1016]'
              }`}
            >
              <EntityIcon type={ent.type} className="w-3 h-3 shrink-0 text-[#b68d40]/85" />
              <span className="truncate flex-1">{ent.title}</span>
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div className="relative h-full flex shrink-0 select-none z-30">
      {/* 44px Obsidian Studio Icon Rail (Always visible, ultra-clean) */}
      <nav
        aria-label="Workspace Rail"
        className="w-11 h-full bg-[#050608] border-r border-[#11151d] flex flex-col items-center py-2.5 gap-1.5 shrink-0 z-30"
      >
        <button
          onClick={() => handleRailSectionClick('vault')}
          title="Vault Explorer (Ctrl+\)"
          aria-label="Vault Explorer"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            leftNavOpen && leftNavSection === 'vault'
              ? 'bg-[#0e1219] text-[#d6b16a] border border-[#b68d40]/45 shadow-gold-sm'
              : 'text-[#757e8d] hover:text-[#e8dfd0] hover:bg-[#0d1016]'
          }`}
        >
          <FolderTree className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleRailSectionClick('assets')}
          title={`Vault Assets (${assets.length})`}
          aria-label="Vault Assets"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            leftNavOpen && leftNavSection === 'assets'
              ? 'bg-[#0e1219] text-[#d6b16a] border border-[#b68d40]/45 shadow-gold-sm'
              : 'text-[#757e8d] hover:text-[#e8dfd0] hover:bg-[#0d1016]'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleRailSectionClick('templates')}
          title="Record Templates"
          aria-label="Record Templates"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            leftNavOpen && leftNavSection === 'templates'
              ? 'bg-[#0e1219] text-[#d6b16a] border border-[#b68d40]/45 shadow-gold-sm'
              : 'text-[#757e8d] hover:text-[#e8dfd0] hover:bg-[#0d1016]'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
        </button>

        <div className="w-5 h-px bg-[#12161f] my-1" />

        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Quick Search (Ctrl+K)"
          aria-label="Quick Search"
          className="w-8 h-8 rounded-lg text-[#757e8d] hover:text-[#e8dfd0] hover:bg-[#0d1016] flex items-center justify-center transition-colors"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          onClick={() => openNewEntryModal('Location', 'encyclopedia')}
          title="Create New Entry"
          aria-label="Create New Entry"
          className="w-8 h-8 rounded-lg text-[#b68d40] hover:bg-[#b68d40]/15 flex items-center justify-center transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          onClick={() => setMapGeneratorModalOpen(true, '3d')}
          title="Generate 3D World / 2D Battlemap"
          aria-label="Generate Map"
          className="w-8 h-8 rounded-lg text-[#757e8d] hover:text-[#c9a050] hover:bg-[#0d1016] flex items-center justify-center transition-colors"
        >
          <Globe className="w-4 h-4" />
        </button>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          <button
            onClick={() => setSettingsModalOpen(true)}
            title="Vault & Sync Settings"
            aria-label="Settings"
            className="w-8 h-8 rounded-lg text-[#6d7686] hover:text-[#e8dfd0] hover:bg-[#0d1016] flex items-center justify-center transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Collapsible 268px Slide-Over Vault Drawer (Zero Reflow!) */}
      {leftNavOpen && (
        <aside className="absolute left-11 inset-y-0 w-[268px] bg-[#06080b]/98 backdrop-blur-md border-r border-[#141821] shadow-[18px_0_44px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden z-40">
          {/* Drawer Header + Tabs */}
          <div className="p-2.5 border-b border-[#12161f] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-[#040507] p-0.5 rounded-md border border-[#131720] flex-1 text-[10.5px] font-medium">
                <button
                  onClick={() => setLeftNavSection('vault')}
                  className={`flex-1 py-1 rounded transition-colors ${
                    leftNavSection === 'vault'
                      ? 'bg-[#10141c] text-[#d6b16a]'
                      : 'text-[#757e8d] hover:text-[#ded8cc]'
                  }`}
                >
                  Vault
                </button>
                <button
                  onClick={() => setLeftNavSection('assets')}
                  className={`flex-1 py-1 rounded transition-colors ${
                    leftNavSection === 'assets'
                      ? 'bg-[#10141c] text-[#d6b16a]'
                      : 'text-[#757e8d] hover:text-[#ded8cc]'
                  }`}
                >
                  Assets
                </button>
                <button
                  onClick={() => setLeftNavSection('templates')}
                  className={`flex-1 py-1 rounded transition-colors ${
                    leftNavSection === 'templates'
                      ? 'bg-[#10141c] text-[#d6b16a]'
                      : 'text-[#757e8d] hover:text-[#ded8cc]'
                  }`}
                >
                  Templates
                </button>
              </div>
              <button
                onClick={() => setLeftNavOpen(false)}
                title="Collapse Drawer"
                className="p-1 rounded text-[#6d7686] hover:text-white hover:bg-[#0e1218]"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>

            {leftNavSection === 'vault' && (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 flex items-center gap-1.5 bg-[#040507] border border-[#141821] focus-within:border-[#b68d40]/50 rounded-md px-2 h-[28px]">
                    <Search className="w-3 h-3 text-[#636c7a] shrink-0" />
                    <input
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="Filter entries..."
                      className="w-full min-w-0 bg-transparent text-[11.5px] text-[#ded8cc] placeholder:text-[#525a68] focus:outline-none"
                    />
                    {filterQuery && (
                      <button
                        onClick={() => setFilterQuery('')}
                        className="text-[#636c7a] hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => openNewEntryModal('Location', 'encyclopedia')}
                    title="New Entry"
                    className="h-[28px] px-2.5 rounded-md btn-gold-metallic flex items-center justify-center gap-1 text-[11px] font-semibold shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>New</span>
                  </button>
                </div>

                {/* Scope Filter Pills */}
                <div className="flex items-center gap-1 text-[10px]">
                  {(
                    [
                      ['all', 'All'],
                      ['encyclopedia', 'Lore'],
                      ['campaign', 'Campaign'],
                      ['world', 'World'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setVaultScope(key)}
                      className={`px-2 py-0.5 rounded-full transition-colors ${
                        vaultScope === key
                          ? 'bg-[#b68d40]/16 text-[#d6b16a] border border-[#b68d40]/35'
                          : 'text-[#757e8d] hover:text-[#ded8cc] border border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2.5">
            {leftNavSection === 'assets' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#7c8594]">
                    Media Assets ({assets.length})
                  </span>
                  <label className="cursor-pointer px-2 py-1 rounded bg-[#0c0f15] border border-[#1a202c] hover:border-[#b68d40] text-[10.5px] text-[#c9a050] flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadAssetFile}
                    />
                  </label>
                </div>
                <div className="space-y-1">
                  {assets.map((asset) => {
                    const isCurrent = activeTab?.kind === 'asset' && activeTab.targetId === asset.id;
                    return (
                      <button
                        key={asset.id}
                        onClick={() => openAssetTab(asset.id)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[11.5px] transition-colors ${
                          isCurrent
                            ? 'bg-[#b68d40]/14 text-[#d6b16a] border border-[#b68d40]/30'
                            : 'text-[#aba59b] hover:text-[#e8dfd0] hover:bg-[#0d1016]'
                        }`}
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-7 h-7 rounded object-cover border border-[#1a202c] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{asset.name}</div>
                          <div className="font-mono text-[9.5px] text-[#616978] truncate">
                            ![[{asset.slug}]]
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : leftNavSection === 'templates' ? (
              <div className="space-y-1">
                <div className="px-1 pb-1 text-[10.5px] font-mono uppercase tracking-wider text-[#7c8594]">
                  Entry Templates ({Object.keys(templates).length})
                </div>
                {Object.values(templates).map((tpl) => {
                  const isCurrent =
                    activeTab?.kind === 'template' && activeTab.targetId === tpl.type;
                  return (
                    <button
                      key={tpl.type}
                      onClick={() => openTemplateTab(tpl.type)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12px] transition-colors ${
                        isCurrent
                          ? 'bg-[#b68d40]/14 text-[#d6b16a]'
                          : 'text-[#8e97a6] hover:text-[#ded8cc] hover:bg-[#0d1016]'
                      }`}
                    >
                      <EntityIcon
                        type={tpl.type}
                        className="w-3.5 h-3.5 shrink-0 text-[#b68d40]/85"
                      />
                      <span className="truncate flex-1">{tpl.type}</span>
                    </button>
                  );
                })}
              </div>
            ) : filteredQuickResults ? (
              <div className="space-y-2">
                <div className="px-1.5 text-[10px] font-mono uppercase tracking-wider text-[#717a89]">
                  Matches ({filteredQuickResults.entities.length + filteredQuickResults.maps.length + filteredQuickResults.assets.length})
                </div>
                {filteredQuickResults.maps.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openMapTab(m.id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[11.5px] text-[#c9a050] hover:bg-[#0d1016]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <EntityIcon type="Map" className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{m.name}</span>
                    </span>
                    <span className="font-mono text-[9.5px] uppercase opacity-75">{m.kind || '3d'}</span>
                  </button>
                ))}
                {filteredQuickResults.entities.map((ent) => (
                  <button
                    key={ent.id}
                    onClick={() => openEntityTab(ent.id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[11.5px] text-[#ccc6ba] hover:bg-[#0d1016]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <EntityIcon type={ent.type} className="w-3.5 h-3.5 text-[#b68d40] shrink-0" />
                      <span className="truncate">{ent.title}</span>
                    </span>
                    <span className="font-mono text-[9.5px] text-[#636c7a]">{ent.type}</span>
                  </button>
                ))}
                {filteredQuickResults.assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => openAssetTab(a.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11.5px] text-[#8e97a6] hover:bg-[#0d1016]"
                  >
                    <img src={a.url} alt={a.name} className="w-4 h-4 rounded object-cover" />
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
                {filteredQuickResults.entities.length === 0 &&
                  filteredQuickResults.maps.length === 0 &&
                  filteredQuickResults.assets.length === 0 && (
                    <div className="text-[11px] text-[#555d6c] italic px-2 py-2">
                      No matches found.
                    </div>
                  )}
              </div>
            ) : (
              <>
                {vaultScope === 'all' && (
                  <div>
                    <button
                      onClick={() => toggleSection('vault')}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#717a89] hover:text-[#c9a050] transition-colors"
                    >
                      {openSections.vault ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <span>Quick Access</span>
                    </button>
                    {openSections.vault && (
                      <div className="mt-1 space-y-0.5">
                        <div>
                          <button
                            onClick={() => toggleGroup('vault-all')}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#beb9af] hover:bg-[#0d1016] hover:text-[#e8dfd0] transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 text-[#b68d40]" />
                              <span>All Entries</span>
                            </span>
                            <span className="font-mono text-[11px] text-[#687180]">{entities.length}</span>
                          </button>
                          {expandedGroup === 'vault-all' && renderEntityList(entities)}
                        </div>
                        <div>
                          <button
                            onClick={() => toggleGroup('vault-fav')}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#beb9af] hover:bg-[#0d1016] hover:text-[#e8dfd0] transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Star className="w-3.5 h-3.5 text-[#b68d40]" />
                              <span>Favorites</span>
                            </span>
                            <span className="font-mono text-[11px] text-[#687180]">{favorites.length}</span>
                          </button>
                          {expandedGroup === 'vault-fav' && renderEntityList(favorites)}
                        </div>
                        <div>
                          <button
                            onClick={() => toggleGroup('vault-recent')}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#beb9af] hover:bg-[#0d1016] hover:text-[#e8dfd0] transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-[#7f8796]" />
                              <span>Recent</span>
                            </span>
                            <span className="font-mono text-[11px] text-[#687180]">{recent.length}</span>
                          </button>
                          {expandedGroup === 'vault-recent' && renderEntityList(recent)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(vaultScope === 'all' || vaultScope === 'encyclopedia') && (
                  <div>
                    <button
                      onClick={() => toggleSection('encyclopedia')}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#717a89] hover:text-[#c9a050] transition-colors"
                    >
                      {openSections.encyclopedia ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
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
                              <div className="group flex items-center justify-between px-2 py-1.5 rounded text-[12px] text-[#b8b3a8] hover:bg-[#0d1016] hover:text-[#e8dfd0] transition-colors">
                                <button
                                  onClick={() => toggleGroup(key)}
                                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                                >
                                  <EntityIcon type={item.type} className="w-3.5 h-3.5 text-[#a8823c] shrink-0" />
                                  <span className="truncate">{item.label}</span>
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => openNewEntryModal(item.type as EntityType, item.category)}
                                    title={`New ${item.type}`}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#171c25] text-[#c9a050] transition-opacity"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <span className="font-mono text-[11px] text-[#687180] min-w-[16px] text-right">
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

                {(vaultScope === 'all' || vaultScope === 'campaign') && (
                  <div>
                    <button
                      onClick={() => toggleSection('campaign')}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#717a89] hover:text-[#c9a050] transition-colors"
                    >
                      {openSections.campaign ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <span>Campaign</span>
                    </button>
                    {openSections.campaign && (
                      <div className="mt-0.5 space-y-0.5">
                        <button
                          onClick={() => toggleSection('campaignFolder')}
                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[12px] text-[#cbc6bb] hover:bg-[#0d1016] text-left"
                        >
                          {openSections.campaignFolder ? (
                            <FolderOpen className="w-3.5 h-3.5 text-[#b68d40] shrink-0" />
                          ) : (
                            <Folder className="w-3.5 h-3.5 text-[#b68d40] shrink-0" />
                          )}
                          <span className="truncate font-medium">Shattered Reach</span>
                        </button>
                        {openSections.campaignFolder && (
                          <div className="pl-3 space-y-0.5 pt-0.5">
                            {CAMPAIGN_ITEMS.map((item) => {
                              const matching = entities.filter((e) => e.type === item.type);
                              const key = `camp-${item.type}`;
                              const isOpen = expandedGroup === key;
                              return (
                                <div key={key}>
                                  <div className="group flex items-center justify-between px-2 py-1 rounded text-[12px] text-[#aca79c] hover:bg-[#0d1016] hover:text-[#e8dfd0]">
                                    <button
                                      onClick={() => toggleGroup(key)}
                                      className="flex items-center gap-2 flex-1 text-left min-w-0"
                                    >
                                      <Folder className="w-3.5 h-3.5 text-[#9a732d] shrink-0" />
                                      <span className="truncate">{item.label}</span>
                                    </button>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        onClick={() => openNewEntryModal(item.type as EntityType, item.category)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#171c25] text-[#c9a050]"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                      <span className="font-mono text-[10.5px] text-[#636c7a]">{matching.length}</span>
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
                )}

                {(vaultScope === 'all' || vaultScope === 'world') && (
                  <div>
                    <button
                      onClick={() => toggleSection('world')}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#717a89] hover:text-[#c9a050] transition-colors"
                    >
                      {openSections.world ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <span>World</span>
                    </button>
                    {openSections.world && (
                      <div className="mt-0.5 space-y-0.5">
                        <button
                          onClick={() => toggleSection('worldFolder')}
                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[12px] text-[#cbc6bb] hover:bg-[#0d1016]"
                        >
                          {openSections.worldFolder ? (
                            <FolderOpen className="w-3.5 h-3.5 text-[#b68d40] shrink-0" />
                          ) : (
                            <Folder className="w-3.5 h-3.5 text-[#b68d40] shrink-0" />
                          )}
                          <span className="truncate font-medium">{world.name}</span>
                        </button>

                        {openSections.worldFolder && (
                          <div className="pl-3 space-y-0.5">
                            {WORLD_ITEMS.map((item) => {
                              const isMapGroup = item.type === 'Map';
                              const matching = isMapGroup ? [] : entities.filter((e) => e.type === item.type);
                              const count = isMapGroup ? maps.length : matching.length;
                              const key = `world-${item.type}`;
                              const isOpen = expandedGroup === key;

                              return (
                                <div key={key}>
                                  <div className="group flex items-center justify-between px-2 py-1 rounded text-[12px] text-[#aca79c] hover:bg-[#0d1016] hover:text-[#e8dfd0]">
                                    <button
                                      onClick={() => toggleGroup(key)}
                                      className="flex items-center gap-2 flex-1 text-left min-w-0"
                                    >
                                      <Folder className="w-3.5 h-3.5 text-[#9a732d] shrink-0" />
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
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#171c25] text-[#c9a050]"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                      <span className="font-mono text-[10.5px] text-[#636c7a]">{count}</span>
                                    </div>
                                  </div>

                                  {isOpen &&
                                    (isMapGroup ? (
                                      <div className="pl-4 pr-1 py-0.5 space-y-0.5">
                                        {maps.map((m) => {
                                          const isActiveMap = activeTab?.kind === 'map' && activeTab.targetId === m.id;
                                          return (
                                            <div key={m.id} className="group/map flex items-center gap-1">
                                              <button
                                                onClick={() => openMapTab(m.id)}
                                                className={`flex-1 min-w-0 flex items-center justify-between gap-1.5 px-2 py-1 rounded text-left text-[11.5px] transition-colors ${
                                                  isActiveMap
                                                    ? 'text-[#d6b16a] bg-[#b68d40]/15 border border-[#b68d40]/32'
                                                    : 'text-[#c4bfb5] hover:bg-[#0d1016] hover:text-[#c9a050]'
                                                }`}
                                              >
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                  <EntityIcon type="Map" className="w-3 h-3 shrink-0 text-[#b68d40]" />
                                                  <span className="truncate">{m.name}</span>
                                                </span>
                                                <span
                                                  className={`shrink-0 px-1 rounded text-[9px] font-mono uppercase border ${
                                                    m.kind === '2d'
                                                      ? 'text-sky-300/90 border-sky-500/25 bg-sky-500/10'
                                                      : 'text-[#c9a050] border-[#b68d40]/28 bg-[#b68d40]/10'
                                                  }`}
                                                >
                                                  {m.kind === '2d' ? '2D' : '3D'}
                                                </span>
                                              </button>
                                              <button
                                                onClick={() => setMapGeneratorModalOpen(true, m.kind || '3d', m.id)}
                                                title={`Edit ${m.name}`}
                                                aria-label={`Edit ${m.name}`}
                                                className="opacity-0 group-hover/map:opacity-100 p-1 rounded hover:bg-[#171c25] text-[#8e97a6] hover:text-[#c9a050] transition-opacity shrink-0"
                                              >
                                                <Settings2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          );
                                        })}
                                        <div className="grid grid-cols-2 gap-1 pt-1">
                                          <button
                                            onClick={() => setMapGeneratorModalOpen(true, '3d')}
                                            className="px-1.5 py-1 rounded text-[10px] font-medium text-[#c9a050] bg-[#0b0e14] hover:bg-[#121720] border border-[#1a202c] flex items-center justify-center gap-1"
                                          >
                                            <Plus className="w-2.5 h-2.5" /> 3D World
                                          </button>
                                          <button
                                            onClick={() => setMapGeneratorModalOpen(true, '2d')}
                                            className="px-1.5 py-1 rounded text-[10px] font-medium text-sky-300/90 bg-[#0b0e14] hover:bg-[#121720] border border-[#1a202c] flex items-center justify-center gap-1"
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
                )}
              </>
            )}
          </div>

          {/* Compact Footer */}
          <div className="shrink-0 h-8 px-3 border-t border-[#12161f] bg-[#040507] flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rotate-45 bg-[#b68d40]/80 shrink-0" />
              <span className="font-serif tracking-wide text-[#a89f91] truncate">{world.name}</span>
            </div>
            <span className="font-mono text-[#5c6574] shrink-0">
              {entities.length} · {assets.length} art
            </span>
          </div>
        </aside>
      )}
    </div>
  );
};

