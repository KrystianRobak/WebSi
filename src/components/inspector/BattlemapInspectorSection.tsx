import React from 'react';
import {
  AlertTriangle,
  Bookmark,
  Copy,
  DoorClosed,
  DoorOpen,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Grid3x3,
  Lock,
  Minus,
  Package,
  Plus,
  RotateCw,
  Settings2,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { BattlemapPropKind, VaultMap } from '../../types/vault';

export const BattlemapInspectorSection: React.FC<{ activeMap: VaultMap }> = ({ activeMap }) => {
  const {
    entities,
    characters,
    campaignMembers,
    isEffectiveGm,
    canEditToken,
    selectedTokenId,
    selectedDoorId,
    selectedLightId,
    selectedPropId2D,
    setSelectedTokenId,
    setSelectedDoorId,
    setSelectedLightId,
    setSelectedPropId2D,
    updateBattlemap,
    toggleBattlemapDoor,
    toggleBattlemapDoorLock,
    toggleBattlemapLight,
    addBattlemapToken,
    updateBattlemapToken,
    deleteBattlemapToken,
    deleteBattlemapDoor,
    deleteBattlemapLight,
    addBattlemapProp,
    updateBattlemapProp,
    deleteBattlemapProp,
    setMapGeneratorModalOpen,
    openEntityTab,
    openCharacterTab,
  } = useVaultStore();

  const canGmEdit = isEffectiveGm();
  const bm = activeMap.battlemap;
  if (!bm) return null;

  const visibleDoors = bm.doors.filter((d) => canGmEdit || !d.isSecret);
  const visibleTokens = bm.tokens.filter((t) => canGmEdit || !t.isHidden);
  const visibleProps = (bm.props || []).filter((p) => canGmEdit || !p.isSecret);
  const selectedToken = visibleTokens.find((t) => t.id === selectedTokenId) || null;
  const canEditSelectedToken = selectedToken ? canEditToken(selectedToken) : false;
  const selectedProp = canGmEdit
    ? (bm.props || []).find((p) => p.id === selectedPropId2D) || null
    : null;

  const spawnQuickProp = (kind: BattlemapPropKind) => {
    if (!canGmEdit) return;
    const cx = Math.round((bm.width * 0.5) / bm.gridSizePx) * bm.gridSizePx + bm.gridSizePx * 0.5;
    const cy = Math.round((bm.height * 0.5) / bm.gridSizePx) * bm.gridSizePx + bm.gridSizePx * 0.5;
    addBattlemapProp(activeMap.id, {
      kind,
      label:
        kind === 'trap'
          ? 'Hidden Trap'
          : kind === 'marker'
          ? 'GM Note Pin'
          : kind === 'chest'
          ? 'Treasure Chest'
          : 'Supply Crates',
      x: cx,
      y: cy,
      widthPx: kind === 'marker' ? 34 : 52,
      heightPx: kind === 'marker' ? 34 : 46,
      rotationDeg: 0,
      color: kind === 'trap' ? '#ef4444' : kind === 'marker' ? '#eab308' : '#d4a853',
      isSecret: kind === 'trap' || kind === 'marker',
      blocksLight: kind === 'crate' || kind === 'pillar',
    });
  };

  const spawnQuickToken = (disposition: 'enemy' | 'party') => {
    if (!canGmEdit) return;
    const cx = Math.round(bm.width * 0.5 / bm.gridSizePx) * bm.gridSizePx + bm.gridSizePx * 0.5;
    const cy = Math.round(bm.height * 0.5 / bm.gridSizePx) * bm.gridSizePx + bm.gridSizePx * 0.5;
    addBattlemapToken(activeMap.id, {
      name: disposition === 'enemy' ? 'Cult Enforcer' : 'Vanguard Ally',
      disposition,
      x: cx + (bm.tokens.length % 4) * 28 - 40,
      y: cy,
      sizeCells: 1,
      hp: disposition === 'enemy' ? 28 : 42,
      maxHp: disposition === 'enemy' ? 28 : 42,
      ac: disposition === 'enemy' ? 14 : 17,
      visionRangeFt: 60,
      lightRadiusFt: disposition === 'party' ? 25 : 0,
      lightColor: '#f59e0b',
      isHidden: false,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-[14.5px] font-semibold text-[#f3ead8] truncate">
            {activeMap.name}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            {canGmEdit && (
              <button
                onClick={() => setMapGeneratorModalOpen(true, '2d', activeMap.id)}
                title="Edit Map Setup, Theme & Backdrop"
                className="p-1 rounded bg-[#181d26] hover:bg-[#232a36] border border-[#2a3140] text-[#d4a853]"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono uppercase bg-sky-500/15 text-sky-300 border border-sky-500/30">
              2D VTT
            </span>
          </div>
        </div>

        {/* Lighting & Grid Controls */}
        {canGmEdit && (
          <div className="rounded-md bg-[#12161e] border border-[#1d222b] p-2.5 space-y-2.5 text-[11.5px]">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[#b8b3a8]">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-[#d4a853]" />
                  Ambient Light
                </span>
                <span className="font-mono text-[#e5be58]">
                  {Math.round(bm.ambientLight * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={bm.ambientLight}
                onChange={(e) =>
                  updateBattlemap(activeMap.id, (prev) => ({
                    ...prev,
                    ambientLight: Number(e.target.value),
                  }))
                }
                className="w-full accent-[#d4a853]"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() =>
                  updateBattlemap(activeMap.id, (prev) => ({
                    ...prev,
                    dynamicLighting: !prev.dynamicLighting,
                  }))
                }
                className={`px-2 py-1.5 rounded border text-[11px] flex items-center justify-center gap-1 transition-colors ${
                  bm.dynamicLighting
                    ? 'bg-[#d4a853]/15 border-[#d4a853]/50 text-[#f3d185]'
                    : 'bg-[#171b23] border-[#242a35] text-[#858d9b]'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Shadows</span>
              </button>
              <button
                onClick={() =>
                  updateBattlemap(activeMap.id, (prev) => ({
                    ...prev,
                    showGrid: !prev.showGrid,
                  }))
                }
                className={`px-2 py-1.5 rounded border text-[11px] flex items-center justify-center gap-1 transition-colors ${
                  bm.showGrid
                    ? 'bg-[#d4a853]/15 border-[#d4a853]/50 text-[#f3d185]'
                    : 'bg-[#171b23] border-[#242a35] text-[#858d9b]'
                }`}
              >
                <Grid3x3 className="w-3 h-3" />
                <span>5ft Grid</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selected Token Inspector */}
      {selectedToken && (
        <div className="space-y-2 pt-2 border-t border-[#181d25]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853]">
              Selected Token
            </span>
            <div className="flex items-center gap-1">
              {selectedToken.character_id && (
                <button
                  onClick={() => openCharacterTab(selectedToken.character_id!)}
                  title="Open Linked Character Sheet"
                  className="px-1.5 py-0.5 rounded bg-[#181d26] hover:bg-[#232a36] text-[#e6c687] text-[10px] flex items-center gap-1"
                >
                  <ExternalLink className="w-2.5 h-2.5" /> Sheet
                </button>
              )}
              {canGmEdit && (
                <>
                  <button
                    onClick={() => {
                      const { id: _ignore, ...rest } = selectedToken;
                      addBattlemapToken(activeMap.id, {
                        ...rest,
                        name: `${selectedToken.name} II`,
                        x: selectedToken.x + 28,
                        y: selectedToken.y + 18,
                      });
                    }}
                    title="Duplicate Token"
                    className="p-1 rounded bg-[#161a22] hover:bg-[#232934] text-[#b8b3a8]"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteBattlemapToken(activeMap.id, selectedToken.id)}
                    title="Delete Token"
                    className="p-1 rounded bg-[#161a22] hover:bg-red-950/50 text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-md bg-[#12161e] border border-[#d4a853]/35 p-2.5 space-y-2.5 text-[11.5px]">
            <input
              type="text"
              value={selectedToken.name}
              disabled={!canEditSelectedToken}
              onChange={(e) =>
                updateBattlemapToken(activeMap.id, selectedToken.id, { name: e.target.value })
              }
              className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-2 py-1 text-xs font-medium text-[#f3ead8] focus:outline-none focus:border-[#d4a853] disabled:opacity-70"
            />

            {/* HP Stepper & AC */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[#858d9b]">HP:</span>
                {canEditSelectedToken && (
                  <button
                    onClick={() =>
                      updateBattlemapToken(activeMap.id, selectedToken.id, {
                        hp: Math.max(0, selectedToken.hp - 5),
                      })
                    }
                    className="p-1 rounded bg-[#1b2029] hover:bg-[#252c38] text-[#e7e2d8]"
                  >
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                )}
                <span className="font-mono text-[#e7e2d8] min-w-[44px] text-center">
                  {selectedToken.hp}/{selectedToken.maxHp}
                </span>
                {canEditSelectedToken && (
                  <button
                    onClick={() =>
                      updateBattlemapToken(activeMap.id, selectedToken.id, {
                        hp: Math.min(selectedToken.maxHp, selectedToken.hp + 5),
                      })
                    }
                    className="p-1 rounded bg-[#1b2029] hover:bg-[#252c38] text-[#e7e2d8]"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 text-[#b8b3a8]">
                <Shield className="w-3 h-3 text-[#d4a853]" />
                <span className="font-mono">AC {selectedToken.ac}</span>
              </div>
            </div>

            {/* Token Light Aura */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[#9aa3b2]">
                <span>Carried Light</span>
                <span className="font-mono text-[#e5be58]">{selectedToken.lightRadiusFt} ft</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                disabled={!canEditSelectedToken}
                value={selectedToken.lightRadiusFt}
                onChange={(e) =>
                  updateBattlemapToken(activeMap.id, selectedToken.id, {
                    lightRadiusFt: Number(e.target.value),
                  })
                }
                className="w-full accent-[#d4a853]"
              />
            </div>

            {canGmEdit && (
              <>
                <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
                  <label className="space-y-0.5 text-[#9aa3b2]">
                    <span>Linked Character</span>
                    <select
                      value={selectedToken.character_id || ''}
                      onChange={(e) => {
                        const cid = e.target.value || null;
                        const matched = cid ? characters.find((c) => c.id === cid) : null;
                        updateBattlemapToken(activeMap.id, selectedToken.id, {
                          character_id: cid,
                          owner_user_id: matched ? matched.user_id : selectedToken.owner_user_id ?? null,
                          name: matched ? matched.name : selectedToken.name,
                        });
                      }}
                      className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-1 text-[10.5px] text-[#e7e2d8]"
                    >
                      <option value="">None</option>
                      {characters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-0.5 text-[#9aa3b2]">
                    <span>Player Owner</span>
                    <select
                      value={selectedToken.owner_user_id || ''}
                      onChange={(e) =>
                        updateBattlemapToken(activeMap.id, selectedToken.id, {
                          owner_user_id: e.target.value || null,
                        })
                      }
                      className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-1 text-[10.5px] text-[#e7e2d8]"
                    >
                      <option value="">GM Only</option>
                      {campaignMembers.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.profile?.display_name || m.role}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  onClick={() =>
                    updateBattlemapToken(activeMap.id, selectedToken.id, {
                      isHidden: !selectedToken.isHidden,
                    })
                  }
                  className={`w-full px-2 py-1.5 rounded border text-[11px] flex items-center justify-center gap-1.5 ${
                    selectedToken.isHidden
                      ? 'bg-red-950/40 border-red-500/45 text-red-200'
                      : 'bg-[#171b23] border-[#262d3a] text-[#b8b3a8]'
                  }`}
                >
                  {selectedToken.isHidden ? (
                    <>
                      <EyeOff className="w-3 h-3" /> Hidden From Players (GM Only)
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" /> Visible to Players
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Selected Scene Prop / Trap / Marker */}
      {selectedProp && (
        <div className="space-y-2 pt-2 border-t border-[#181d25]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853]">
              Selected {selectedProp.kind}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const { id: _ignore, ...rest } = selectedProp;
                  addBattlemapProp(activeMap.id, {
                    ...rest,
                    label: `${selectedProp.label} Copy`,
                    x: selectedProp.x + 28,
                    y: selectedProp.y + 24,
                  });
                }}
                title="Duplicate Element"
                className="p-1 rounded bg-[#161a22] hover:bg-[#232934] text-[#b8b3a8]"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={() => deleteBattlemapProp(activeMap.id, selectedProp.id)}
                title="Delete Element"
                className="p-1 rounded bg-[#161a22] hover:bg-red-950/50 text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="rounded-md bg-[#12161e] border border-[#d4a853]/35 p-2.5 space-y-2.5 text-[11.5px]">
            <input
              type="text"
              value={selectedProp.label}
              onChange={(e) =>
                updateBattlemapProp(activeMap.id, selectedProp.id, { label: e.target.value })
              }
              className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-2 py-1 text-xs font-medium text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
            />

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[#9aa3b2]">
                <span className="flex items-center gap-1">
                  <RotateCw className="w-3 h-3" /> Rotation
                </span>
                <span className="font-mono text-[#e5be58]">{selectedProp.rotationDeg}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={345}
                step={15}
                value={selectedProp.rotationDeg}
                onChange={(e) =>
                  updateBattlemapProp(activeMap.id, selectedProp.id, {
                    rotationDeg: Number(e.target.value),
                  })
                }
                className="w-full accent-[#d4a853]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="space-y-0.5 text-[#9aa3b2]">
                <span>Width (px)</span>
                <input
                  type="number"
                  min={24}
                  max={220}
                  step={6}
                  value={selectedProp.widthPx}
                  onChange={(e) =>
                    updateBattlemapProp(activeMap.id, selectedProp.id, {
                      widthPx: Number(e.target.value) || 40,
                    })
                  }
                  className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-2 py-0.5 font-mono text-[#e7e2d8]"
                />
              </label>
              <label className="space-y-0.5 text-[#9aa3b2]">
                <span>Height (px)</span>
                <input
                  type="number"
                  min={24}
                  max={220}
                  step={6}
                  value={selectedProp.heightPx}
                  onChange={(e) =>
                    updateBattlemapProp(activeMap.id, selectedProp.id, {
                      heightPx: Number(e.target.value) || 40,
                    })
                  }
                  className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-2 py-0.5 font-mono text-[#e7e2d8]"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 text-[#c7c2b7] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(selectedProp.blocksLight)}
                  onChange={(e) =>
                    updateBattlemapProp(activeMap.id, selectedProp.id, {
                      blocksLight: e.target.checked,
                    })
                  }
                  className="accent-[#d4a853]"
                />
                <span>Blocks Light</span>
              </label>

              {canGmEdit && (
                <label className="flex items-center gap-1.5 text-red-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProp.isSecret}
                    onChange={(e) =>
                      updateBattlemapProp(activeMap.id, selectedProp.id, {
                        isSecret: e.target.checked,
                      })
                    }
                    className="accent-red-500"
                  />
                  <span>GM Secret</span>
                </label>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[10.5px] text-[#858d9b]">GM Scene Notes / DC Checks</span>
              <textarea
                rows={2}
                value={selectedProp.notes || ''}
                onChange={(e) =>
                  updateBattlemapProp(activeMap.id, selectedProp.id, { notes: e.target.value })
                }
                placeholder="Perception DC, loot, trigger rule..."
                className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-2 py-1 text-[11px] text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10.5px] text-[#858d9b]">Linked Grimoire Note</span>
              <div className="flex items-center gap-1">
                <select
                  value={selectedProp.entityId || ''}
                  onChange={(e) =>
                    updateBattlemapProp(activeMap.id, selectedProp.id, {
                      entityId: e.target.value || null,
                    })
                  }
                  className="flex-1 min-w-0 bg-[#0b0d10] border border-[#242a36] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
                >
                  <option value="">None</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.title} ({ent.type})
                    </option>
                  ))}
                </select>
                {selectedProp.entityId && (
                  <button
                    onClick={() => openEntityTab(selectedProp.entityId!)}
                    className="p-1.5 rounded bg-[#181d26] hover:bg-[#232a36] text-[#d4a853]"
                    title="Open Linked Note"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doors Steering List */}
      <div className="space-y-2 pt-2 border-t border-[#181d25]">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
            Doors ({visibleDoors.length})
          </span>
          <span className="text-[10px] text-[#6e7787]">Click on map or steer here</span>
        </div>
        <div className="space-y-1.5">
          {visibleDoors.map((door) => {
            const isSel = selectedDoorId === door.id;
            return (
              <div
                key={door.id}
                onClick={() => setSelectedDoorId(door.id)}
                className={`p-2 rounded-md border transition-colors cursor-pointer ${
                  isSel
                    ? 'bg-[#1a1f28] border-[#d4a853]/55'
                    : 'bg-[#12161e] border-[#1d222b] hover:border-[#2a313e]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {door.isOpen ? (
                      <DoorOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <DoorClosed className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                    )}
                    <span className="text-[11.5px] text-[#e7e2d8] truncate">
                      {door.label}
                    </span>
                    {door.isSecret && (
                      <span className="px-1 rounded text-[9px] font-mono bg-red-950/60 text-red-300 border border-red-500/35">
                        SECRET
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBattlemapDoor(activeMap.id, door.id);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        door.isOpen
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#1a1f28] border-[#2d3544] text-[#d4cfc4] hover:border-[#d4a853]'
                      }`}
                    >
                      {door.isOpen ? 'Open' : 'Closed'}
                    </button>
                    {canGmEdit && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBattlemapDoorLock(activeMap.id, door.id);
                          }}
                          title={door.isLocked ? 'Unlock Door' : 'Lock Door'}
                          className={`p-1 rounded border ${
                            door.isLocked
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                              : 'bg-[#1a1f28] border-[#2a313f] text-[#7c8493]'
                          }`}
                        >
                          {door.isLocked ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBattlemapDoor(activeMap.id, door.id);
                          }}
                          title="Delete Door"
                          className="p-1 rounded bg-[#1a1f28] hover:text-red-400 text-[#6e7787]"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isSel && canGmEdit && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-[#232935] text-[10.5px]"
                  >
                    <input
                      type="text"
                      value={door.label}
                      onChange={(e) =>
                        updateBattlemap(activeMap.id, (prev) => ({
                          ...prev,
                          doors: prev.doors.map((d) =>
                            d.id === door.id ? { ...d, label: e.target.value } : d
                          ),
                        }))
                      }
                      className="flex-1 min-w-0 bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-0.5 text-[#e7e2d8]"
                    />
                    <label className="flex items-center gap-1 text-red-300 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={door.isSecret}
                        onChange={(e) =>
                          updateBattlemap(activeMap.id, (prev) => ({
                            ...prev,
                            doors: prev.doors.map((d) =>
                              d.id === door.id ? { ...d, isSecret: e.target.checked } : d
                            ),
                          }))
                        }
                        className="accent-red-500"
                      />
                      <span>Secret</span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
          {visibleDoors.length === 0 && (
            <div className="text-[11px] text-[#666f7f] italic">
              Use the Door tool on the canvas to place interactive doors.
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Lights Steering List */}
      <div className="space-y-2 pt-2 border-t border-[#181d25]">
        <div className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
          Light Sources ({bm.lights.length})
        </div>
        <div className="space-y-1.5">
          {bm.lights.map((light) => {
            const isSel = selectedLightId === light.id;
            return (
              <div
                key={light.id}
                onClick={() => setSelectedLightId(light.id)}
                className={`p-2 rounded-md border space-y-1.5 transition-colors cursor-pointer ${
                  isSel
                    ? 'bg-[#1a1f28] border-[#d4a853]/55'
                    : 'bg-[#12161e] border-[#1d222b] hover:border-[#2a313e]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Flame
                      className={`w-3.5 h-3.5 shrink-0 ${
                        light.isOn ? 'text-amber-400' : 'text-[#5b6372]'
                      }`}
                    />
                    <span className="text-[11.5px] text-[#e7e2d8] truncate">
                      {light.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="color"
                      value={light.color}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateBattlemap(activeMap.id, (prev) => ({
                          ...prev,
                          lights: prev.lights.map((l) =>
                            l.id === light.id ? { ...l, color: e.target.value } : l
                          ),
                        }))
                      }
                      className="w-4 h-4 rounded bg-transparent border-0 cursor-pointer"
                      title="Light Color"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBattlemapLight(activeMap.id, light.id);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        light.isOn
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                          : 'bg-[#1a1f28] border-[#2d3544] text-[#7c8493]'
                      }`}
                    >
                      {light.isOn ? 'Lit' : 'Off'}
                    </button>
                    {canGmEdit && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBattlemapLight(activeMap.id, light.id);
                        }}
                        className="p-1 rounded bg-[#1a1f28] hover:text-red-400 text-[#6e7787]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {isSel && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="space-y-1.5 pt-1 text-[10.5px] text-[#9aa3b2]"
                  >
                    <input
                      type="text"
                      value={light.label}
                      onChange={(e) =>
                        updateBattlemap(activeMap.id, (prev) => ({
                          ...prev,
                          lights: prev.lights.map((l) =>
                            l.id === light.id ? { ...l, label: e.target.value } : l
                          ),
                        }))
                      }
                      className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-0.5 text-[#e7e2d8]"
                    />
                    <div className="flex items-center gap-2">
                      <span>Radius</span>
                      <input
                        type="range"
                        min={10}
                        max={80}
                        step={5}
                        value={light.radiusFt}
                        onChange={(e) =>
                          updateBattlemap(activeMap.id, (prev) => ({
                            ...prev,
                            lights: prev.lights.map((l) =>
                              l.id === light.id
                                ? { ...l, radiusFt: Number(e.target.value) }
                                : l
                            ),
                          }))
                        }
                        className="flex-1 accent-[#d4a853]"
                      />
                      <span className="font-mono text-[#e5be58] w-9 text-right">
                        {light.radiusFt}ft
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 flex-1">
                        <span>Intensity</span>
                        <input
                          type="range"
                          min={0.25}
                          max={1}
                          step={0.05}
                          value={light.intensity}
                          onChange={(e) =>
                            updateBattlemap(activeMap.id, (prev) => ({
                              ...prev,
                              lights: prev.lights.map((l) =>
                                l.id === light.id
                                  ? { ...l, intensity: Number(e.target.value) }
                                  : l
                              ),
                            }))
                          }
                          className="flex-1 accent-[#d4a853]"
                        />
                      </span>
                      <label className="flex items-center gap-1 text-amber-200 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={light.flicker}
                          onChange={(e) =>
                            updateBattlemap(activeMap.id, (prev) => ({
                              ...prev,
                              lights: prev.lights.map((l) =>
                                l.id === light.id ? { ...l, flicker: e.target.checked } : l
                              ),
                            }))
                          }
                          className="accent-[#d4a853]"
                        />
                        <span>Flicker</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tokens Roster & Quick Spawners */}
      <div className="space-y-2 pt-2 border-t border-[#181d25]">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
            Combatants ({visibleTokens.length})
          </span>
        </div>

        {canGmEdit && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => spawnQuickToken('party')}
              className="px-2 py-1.5 rounded bg-[#161c26] hover:bg-[#1e2634] border border-sky-500/30 text-[11px] text-sky-200 flex items-center justify-center gap-1"
            >
              <Users className="w-3 h-3" /> + Party
            </button>
            <button
              onClick={() => spawnQuickToken('enemy')}
              className="px-2 py-1.5 rounded bg-[#1b1518] hover:bg-[#271b20] border border-red-500/35 text-[11px] text-red-200 flex items-center justify-center gap-1"
            >
              <Skull className="w-3 h-3" /> + Enemy
            </button>
          </div>
        )}

        <div className="space-y-1">
          {visibleTokens.map((tok) => (
            <button
              key={tok.id}
              onClick={() => setSelectedTokenId(tok.id)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left text-[11.5px] border transition-colors ${
                selectedTokenId === tok.id
                  ? 'bg-[#1a1f28] border-[#d4a853]/55 text-[#f3ead8]'
                  : 'bg-[#12161e] border-[#1b2029] text-[#c7c2b7] hover:border-[#2a313e]'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    tok.disposition === 'enemy'
                      ? 'bg-red-500'
                      : tok.disposition === 'party'
                      ? 'bg-sky-400'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="truncate">{tok.name}</span>
                {tok.isHidden && (
                  <EyeOff className="w-3 h-3 text-red-300 shrink-0" />
                )}
              </span>
              <span className="font-mono text-[10.5px] text-[#9aa3b2] shrink-0">
                {tok.hp}/{tok.maxHp}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Scene Elements, Traps & GM Room Notes */}
      <div className="space-y-2 pt-2 border-t border-[#181d25]">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
            Scene Elements ({visibleProps.length})
          </span>
        </div>

        {canGmEdit && (
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => spawnQuickProp('crate')}
              className="px-1.5 py-1 rounded bg-[#161a22] hover:bg-[#212734] border border-[#2a3240] text-[10.5px] text-[#e5be58] flex items-center justify-center gap-1"
            >
              <Package className="w-3 h-3" /> + Prop
            </button>
            <button
              onClick={() => spawnQuickProp('trap')}
              className="px-1.5 py-1 rounded bg-[#1b1416] hover:bg-[#2a1b1f] border border-red-500/35 text-[10.5px] text-red-200 flex items-center justify-center gap-1"
            >
              <AlertTriangle className="w-3 h-3" /> + Trap
            </button>
            <button
              onClick={() => spawnQuickProp('marker')}
              className="px-1.5 py-1 rounded bg-[#1a1811] hover:bg-[#282315] border border-amber-500/35 text-[10.5px] text-amber-200 flex items-center justify-center gap-1"
            >
              <Bookmark className="w-3 h-3" /> + Note
            </button>
          </div>
        )}

        <div className="space-y-1">
          {visibleProps.map((prop) => (
            <div
              key={prop.id}
              onClick={() => setSelectedPropId2D(prop.id)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[11.5px] border cursor-pointer transition-colors ${
                selectedPropId2D === prop.id
                  ? 'bg-[#1a1f28] border-[#d4a853]/55 text-[#f3ead8]'
                  : 'bg-[#12161e] border-[#1b2029] text-[#c7c2b7] hover:border-[#2a313e]'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {prop.kind === 'trap' ? (
                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                ) : prop.kind === 'marker' ? (
                  <Bookmark className="w-3 h-3 text-amber-400 shrink-0" />
                ) : (
                  <Package className="w-3 h-3 text-[#d4a853] shrink-0" />
                )}
                <span className="truncate">{prop.label}</span>
                {prop.isSecret && (
                  <span className="px-1 rounded text-[9px] font-mono bg-red-950/60 text-red-300 border border-red-500/35">
                    GM
                  </span>
                )}
              </span>
              {canGmEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBattlemapProp(activeMap.id, prop.id);
                  }}
                  className="text-[#6e7787] hover:text-red-400 shrink-0"
                  title="Delete Element"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sight-Blocking Walls Architecture */}
      {canGmEdit && (
        <div className="space-y-2 pt-2 border-t border-[#181d25]">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#858d9b]" />
              Walls ({bm.walls.length})
            </span>
            {bm.walls.length > 0 && (
              <button
                onClick={() =>
                  updateBattlemap(activeMap.id, (prev) => ({
                    ...prev,
                    walls: prev.walls.slice(0, -1),
                  }))
                }
                className="text-[10.5px] text-[#d4a853] hover:underline"
              >
                Undo Last Wall
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
