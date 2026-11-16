import React, { useState } from 'react';
import { MapPin, ShieldAlert, X } from 'lucide-react';
import { generateEntityArtwork } from '../../lib/terrainGenerator';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityType, PinIconType } from '../../types/vault';

export const PinCreationModal: React.FC = () => {
  const {
    pendingPinCoord,
    setPendingPinCoord,
    entities,
    tabs,
    activeTabId,
    maps,
    createEntity,
    createMapPin,
  } = useVaultStore();

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [selectedEntityId, setSelectedEntityId] = useState<string>(entities[0]?.id || '');
  const [title, setTitle] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('Location');
  const [iconType, setIconType] = useState<PinIconType>('settlement');
  const [summary, setSummary] = useState('');
  const [gmSecret, setGmSecret] = useState('');
  const [isGmOnly, setIsGmOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!pendingPinCoord) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeMapId =
    activeTab?.kind === 'map' ? activeTab.targetId : maps[0]?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMapId) return;
    setSaving(true);
    try {
      let targetEntityId: string | null = null;
      let label = title.trim();

      if (mode === 'existing') {
        const existing = entities.find((ent) => ent.id === selectedEntityId);
        targetEntityId = existing?.id || null;
        label = existing?.title || 'Pinned Location';
      } else {
        const newTitle = title.trim() || 'Unnamed Landmark';
        const created = await createEntity({
          title: newTitle,
          type: entityType,
          category: 'encyclopedia',
          summary: summary.trim() || `${entityType} located in The Shattered Reach.`,
          gm_secrets: gmSecret.trim(),
          cover_image_url: generateEntityArtwork(
            isGmOnly ? '#ef4444' : '#d4a853',
            iconType === 'citadel' ? 'spire' : iconType === 'ruin' ? 'reliquary' : 'harbor'
          ),
          metadata: {
            Coordinates: `${pendingPinCoord.x.toFixed(1)}, ${pendingPinCoord.z.toFixed(1)}`,
          },
        });
        targetEntityId = created.id;
        label = created.title;
      }

      await createMapPin({
        map_id: activeMapId,
        entity_id: targetEntityId,
        label,
        x: pendingPinCoord.x,
        y: pendingPinCoord.y,
        z: pendingPinCoord.z,
        icon_type: iconType,
        is_gm_only: isGmOnly,
      });

      setTitle('');
      setSummary('');
      setGmSecret('');
      setIsGmOnly(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={() => setPendingPinCoord(null)}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl dark-glass shadow-glass border border-[#d4a853]/40 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#1d222b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#eab308]" />
            <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
              Place Location Pin
            </h3>
          </div>
          <button
            onClick={() => setPendingPinCoord(null)}
            className="text-[#858d9b] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div className="px-2.5 py-1.5 rounded bg-[#0b0d10] border border-[#1d222b] font-mono text-[11px] text-[#8b93a1] flex justify-between">
            <span>Terrain Raycast</span>
            <span className="text-[#d4a853]">
              X:{pendingPinCoord.x.toFixed(1)} Y:{pendingPinCoord.y.toFixed(1)} Z:
              {pendingPinCoord.z.toFixed(1)}
            </span>
          </div>

          {/* Mode Toggle: Create New Note vs Link Existing Note */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[#0b0d10] border border-[#1d222b]">
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`py-1.5 rounded text-xs font-medium transition-colors ${
                mode === 'new' ? 'btn-gold-metallic font-semibold' : 'text-[#8b93a1] hover:text-white'
              }`}
            >
              Create New Note
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`py-1.5 rounded text-xs font-medium transition-colors ${
                mode === 'existing'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8b93a1] hover:text-white'
              }`}
            >
              Bind Existing Note
            </button>
          </div>

          {mode === 'new' ? (
            <>
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">Location / Entry Name</label>
                <input
                  autoFocus
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Frostwatch Bastion"
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">Entity Type</label>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value as EntityType)}
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-2.5 py-2 text-xs text-[#e7e2d8]"
                  >
                    <option value="Location">Location</option>
                    <option value="Region">Region</option>
                    <option value="Faction">Faction</option>
                    <option value="Quest">Quest</option>
                    <option value="Character">Character</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">Pin Icon</label>
                  <select
                    value={iconType}
                    onChange={(e) => setIconType(e.target.value as PinIconType)}
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-2.5 py-2 text-xs text-[#e7e2d8]"
                  >
                    <option value="settlement">Settlement</option>
                    <option value="capital">Capital City</option>
                    <option value="port">Harbor / Port</option>
                    <option value="citadel">Citadel / Spire</option>
                    <option value="fortress">Fortress / Bastion</option>
                    <option value="temple">Temple / Shrine</option>
                    <option value="ruin">Sunken Ruin</option>
                    <option value="landmark">Landmark</option>
                    <option value="camp">Camp / Outpost</option>
                    <option value="danger">Danger / Lair</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">2-Sentence Tooltip Summary</label>
                <textarea
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Shown on hover tooltip over the 3D map pin..."
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-1.5 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-red-300/90 mb-1">
                  GM Secret (Optional)
                </label>
                <input
                  value={gmSecret}
                  onChange={(e) => setGmSecret(e.target.value)}
                  placeholder="Hidden trap, secret faction tunnel, NPC motive..."
                  className="w-full bg-[#1a0c0f] border border-red-500/35 rounded-md px-3 py-1.5 text-xs text-red-100 placeholder:text-red-300/40 focus:outline-none focus:border-red-400"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">Select Vault Entry</label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-2 text-xs text-[#e7e2d8]"
                >
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      [{ent.type}] {ent.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">Pin Icon</label>
                <select
                  value={iconType}
                  onChange={(e) => setIconType(e.target.value as PinIconType)}
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-2.5 py-2 text-xs text-[#e7e2d8]"
                >
                  <option value="settlement">Settlement</option>
                  <option value="capital">Capital City</option>
                  <option value="port">Harbor / Port</option>
                  <option value="citadel">Citadel / Spire</option>
                  <option value="fortress">Fortress / Bastion</option>
                  <option value="temple">Temple / Shrine</option>
                  <option value="ruin">Sunken Ruin</option>
                  <option value="landmark">Landmark</option>
                  <option value="camp">Camp / Outpost</option>
                  <option value="danger">Danger / Lair</option>
                </select>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-xs text-red-200 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isGmOnly}
              onChange={(e) => setIsGmOnly(e.target.checked)}
              className="accent-red-500"
            />
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Hide pin when GM Mode is OFF (Screen-share safe)</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1d222b]">
            <button
              type="button"
              onClick={() => setPendingPinCoord(null)}
              className="px-3 py-1.5 rounded-md bg-[#171b22] text-xs text-[#9aa3b2] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-md btn-gold-metallic text-xs font-semibold"
            >
              {saving ? 'Saving...' : 'Drop Pin on 3D Map'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
