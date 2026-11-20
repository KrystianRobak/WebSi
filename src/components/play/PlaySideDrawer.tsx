import React from 'react';
import { Compass, Eye, EyeOff, Globe, MapPin, PanelRightClose } from 'lucide-react';
import { createDefaultWorldLayers } from '../../lib/worldLayers';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityIcon } from '../common/EntityIcon';
import { BattlemapInspectorSection } from '../inspector/BattlemapInspectorSection';

export const PlaySideDrawer: React.FC = () => {
  const {
    maps,
    mapPins,
    entities,
    playActiveMapId,
    playSideDrawerOpen,
    setPlaySideDrawerOpen,
    isEffectiveGm,
    mapCameraView,
    triggerCameraReset,
    triggerTopView,
    mapLayers,
    toggleMapLayer,
    toggleWorldLayer,
    selectedPinId,
    setSelectedPinId,
    openPlayCodex,
    user,
    campaignMembers,
    mapFogShares,
    upsertMapFogShare,
    revokeMapFogShare,
  } = useVaultStore();

  if (!playSideDrawerOpen) return null;

  const effectiveGm = isEffectiveGm();
  const activeMap = maps.find((m) => m.id === playActiveMapId) || maps[0];
  if (!activeMap) return null;

  const pinsOnMap = mapPins.filter(
    (p) => p.map_id === activeMap.id && (effectiveGm || !p.is_gm_only)
  );
  const worldLayers =
    activeMap.layers && activeMap.layers.length > 0
      ? activeMap.layers
      : createDefaultWorldLayers();

  return (
    <aside
      aria-label="Live Table Controls"
      className="w-[310px] max-w-[90vw] h-full bg-[#080b11] border-l border-[#18202d] flex flex-col shrink-0 overflow-hidden z-30 max-md:fixed max-md:right-0 max-md:top-12 max-md:bottom-0 max-md:shadow-[-18px_0_44px_rgba(0,0,0,0.82)]"
    >
      <div className="h-10 px-3 border-b border-[#161e2b] bg-[#0a0e16] flex items-center justify-between shrink-0">
        <span className="text-xs font-serif font-semibold text-[#f3ead8] truncate">
          {activeMap.kind === '2d' ? 'Tactical Table Controls' : 'World Exploration Controls'}
        </span>
        <button
          type="button"
          onClick={() => setPlaySideDrawerOpen(false)}
          aria-label="Close Table Controls"
          className="p-1 rounded-md text-[#8b94a5] hover:text-white hover:bg-[#131925]"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {activeMap.kind === '2d' ? (
          <BattlemapInspectorSection activeMap={activeMap} surface="play" />
        ) : (
          <>
            {/* Camera View */}
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[#040507] border border-[#12161f]">
              <button
                onClick={() => triggerCameraReset()}
                className={`py-1.5 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  mapCameraView === 'perspective'
                    ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/45'
                    : 'text-[#7e8796] hover:text-white'
                }`}
              >
                <Compass className="w-3 h-3" />
                <span>3D Camera</span>
              </button>
              <button
                onClick={() => triggerTopView()}
                className={`py-1.5 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  mapCameraView === 'top'
                    ? 'btn-gold-metallic font-semibold'
                    : 'text-[#7e8796] hover:text-white'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>Whole World</span>
              </button>
            </div>

            {/* Read-Only Layer Toggles */}
            <div className="space-y-1.5 pt-2 border-t border-[#141a25]">
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#c9a050]">
                Map Layers
              </div>
              <div className="space-y-1">
                {(
                  [
                    ['locations', 'Locations & Pins'],
                    ['paths', 'Routes & Trails'],
                    ['regions', 'Regions & Borders'],
                    ['labels', 'Map Labels'],
                    ['questBoards', 'Guild Quest Boards'],
                    ['fogOfWar', 'Fog of War'],
                  ] as Array<[keyof typeof mapLayers, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleMapLayer(key)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-[#0b0f17] border border-[#171e2b] text-xs text-[#d5cfc4] hover:border-[#d4a853]/40"
                  >
                    <span>{label}</span>
                    {mapLayers[key] ? (
                      <Eye className="w-3.5 h-3.5 text-[#d4a853]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[#5c6574]" />
                    )}
                  </button>
                ))}
              </div>
              {worldLayers.length > 0 && (
                <div className="space-y-1 pt-1">
                  {worldLayers.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => toggleWorldLayer(activeMap.id, l.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1 rounded bg-[#090c12] border border-[#141a25] text-[11.5px] text-[#b8b3a8]"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="truncate">{l.name}</span>
                      </span>
                      {l.visible ? (
                        <Eye className="w-3 h-3 text-[#d4a853]" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-[#5c6574]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Discovered Locations */}
            <div className="space-y-1.5 pt-2 border-t border-[#141a25]">
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#c9a050]">
                Map Locations ({pinsOnMap.length})
              </div>
              <div className="space-y-1">
                {pinsOnMap.map((pin) => {
                  const ent = entities.find((e) => e.id === pin.entity_id);
                  return (
                    <button
                      key={pin.id}
                      onClick={() => {
                        setSelectedPinId(pin.id);
                        if (ent) openPlayCodex(ent.id);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-colors ${
                        selectedPinId === pin.id
                          ? 'bg-[#141008] border-[#d4a853]/60 text-[#f3ead8]'
                          : 'bg-[#0b0f17] border-[#171e2b] text-[#ded8cc] hover:border-[#d4a853]/40'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <EntityIcon
                          type={ent?.type || pin.icon_type}
                          className="w-3.5 h-3.5 text-[#d4a853] shrink-0"
                        />
                        <span className="truncate">{ent?.title || pin.label}</span>
                      </span>
                      <MapPin className="w-3 h-3 text-[#7c8698] shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Peer Fog of War Sharing */}
            {user && (
              <div className="space-y-2 pt-2 border-t border-[#141a25]">
                <div className="text-[11px] font-semibold text-[#c9a050]">
                  Share My Map Showings
                </div>
                <p className="text-[10.5px] text-[#7c8596] leading-snug">
                  Let fellow party members see regions revealed to you on this map.
                </p>
                <div className="space-y-1.5">
                  {(() => {
                    const myShares = mapFogShares.filter(
                      (sh) => sh.map_id === activeMap.id && sh.owner_user_id === user.id
                    );
                    const shareAllRow = myShares.find((sh) => sh.share_all);
                    const peers = campaignMembers.filter((m) => m.user_id !== user.id);
                    return (
                      <>
                        <label className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#090b0f] border border-[#141821] text-[11px] text-[#e8dfd0] cursor-pointer">
                          <span>All Campaign Members</span>
                          <input
                            type="checkbox"
                            checked={Boolean(shareAllRow)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                upsertMapFogShare(activeMap.id, null, true);
                              } else if (shareAllRow) {
                                revokeMapFogShare(shareAllRow.id);
                              }
                            }}
                            className="accent-[#d4a853]"
                          />
                        </label>
                        {peers.map((peer) => {
                          const peerShare = myShares.find(
                            (sh) => !sh.share_all && sh.shared_with_user_id === peer.user_id
                          );
                          const peerLabel = peer.profile?.display_name || peer.user_id.slice(0, 8);
                          return (
                            <label
                              key={peer.user_id}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#090b0f] border border-[#141821] text-[11px] text-[#c7c2b7] cursor-pointer"
                            >
                              <span className="truncate">{peerLabel}</span>
                              <input
                                type="checkbox"
                                checked={Boolean(peerShare)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    upsertMapFogShare(activeMap.id, peer.user_id, false);
                                  } else if (peerShare) {
                                    revokeMapFogShare(peerShare.id);
                                  }
                                }}
                                className="accent-[#d4a853]"
                              />
                            </label>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
