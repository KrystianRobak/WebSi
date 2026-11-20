import React, { useEffect, useState } from 'react';
import { FileCode2, Plus, X } from 'lucide-react';
import { DEFAULT_TEMPLATES } from '../../data/templates';
import { generateEntityArtwork } from '../../lib/terrainGenerator';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityCategory, EntityType } from '../../types/vault';

const ALL_TYPES: Array<{ type: EntityType; category: EntityCategory }> = [
  { type: 'Character', category: 'encyclopedia' },
  { type: 'Location', category: 'encyclopedia' },
  { type: 'Faction', category: 'encyclopedia' },
  { type: 'Organization', category: 'encyclopedia' },
  { type: 'Item', category: 'encyclopedia' },
  { type: 'Bestiary', category: 'encyclopedia' },
  { type: 'Deity', category: 'encyclopedia' },
  { type: 'Event', category: 'encyclopedia' },
  { type: 'Chronicle', category: 'encyclopedia' },
  { type: 'Session', category: 'campaign' },
  { type: 'PlotThread', category: 'campaign' },
  { type: 'Quest', category: 'campaign' },
  { type: 'PlayerNote', category: 'campaign' },
  { type: 'Region', category: 'world' },
  { type: 'Culture', category: 'world' },
  { type: 'History', category: 'world' },
  { type: 'Magic', category: 'world' },
  { type: 'Language', category: 'world' },
];

export const NewEntryModal: React.FC = () => {
  const {
    newEntryModalOpen,
    newEntryDefaultType,
    newEntryDefaultTitle,
    templates,
    closeNewEntryModal,
    createEntity,
    openEntityTab,
    openTemplateTab,
  } = useVaultStore();

  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<EntityType>(newEntryDefaultType);
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [useTemplate, setUseTemplate] = useState(true);
  const [creating, setCreating] = useState(false);

  const activeTemplate = templates[selectedType] || DEFAULT_TEMPLATES[selectedType];

  useEffect(() => {
    if (newEntryModalOpen) {
      setSelectedType(newEntryDefaultType);
      setTitle(newEntryDefaultTitle || '');
      setSummary('');
      setTags('');
      setUseTemplate(true);
    }
  }, [newEntryModalOpen, newEntryDefaultType, newEntryDefaultTitle]);

  if (!newEntryModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const def = ALL_TYPES.find((t) => t.type === selectedType);
      const motif =
        selectedType === 'Character'
          ? 'character'
          : selectedType === 'Faction'
          ? 'guild'
          : selectedType === 'Location'
          ? 'harbor'
          : 'scroll';

      const created = await createEntity({
        title: title.trim(),
        type: selectedType,
        category: def?.category || 'encyclopedia',
        summary: summary.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        cover_image_url: generateEntityArtwork('#d4a853', motif),
        useTemplate,
      });
      closeNewEntryModal();
      openEntityTab(created.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      onClick={closeNewEntryModal}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl dark-glass shadow-glass border border-[#d4a853]/40 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#1d222b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#eab308]" />
            <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
              Create Grimoire Entry
            </h3>
          </div>
          <button onClick={closeNewEntryModal} className="text-[#858d9b] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div>
            <label className="block text-[11px] text-[#9aa3b2] mb-1">Entry Title</label>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Seraphina of the Ash-Watch"
              className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#9aa3b2] mb-1">Category &amp; Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as EntityType)}
              className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-2.5 py-2 text-xs text-[#e7e2d8]"
            >
              {ALL_TYPES.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.type} ({item.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#9aa3b2] mb-1">Short Summary</label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief 1-2 sentence overview for hover tooltips and search..."
              className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-1.5 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#9aa3b2] mb-1">
              Tags (comma separated)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="npc, oakhaven, arc-2"
              className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-1.5 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
            />
          </div>

          {/* Record Template Selector & Preview */}
          <div className="rounded-md bg-[#0b0d10]/85 border border-[#1f2530] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-[#f3ead8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={useTemplate}
                  onChange={(e) => setUseTemplate(e.target.checked)}
                  className="accent-[#d4a853]"
                />
                <FileCode2 className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Use &ldquo;{activeTemplate.label}&rdquo; Template</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  closeNewEntryModal();
                  openTemplateTab(selectedType);
                }}
                className="text-[11px] text-[#d4a853] hover:underline"
              >
                Customize
              </button>
            </div>
            {useTemplate && (
              <div className="text-[10.5px] text-[#8b93a1] leading-snug">
                Pre-fills {Object.keys(activeTemplate.metadata).length} fields (
                {Object.keys(activeTemplate.metadata).slice(0, 4).join(', ')}
                {Object.keys(activeTemplate.metadata).length > 4 ? ', ...' : ''})
                {activeTemplate.customCss ? ' + custom CSS styling' : ''}.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1d222b]">
            <button
              type="button"
              onClick={closeNewEntryModal}
              className="px-3 py-1.5 rounded-md bg-[#171b22] text-xs text-[#9aa3b2] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 rounded-md btn-gold-metallic text-xs font-semibold"
            >
              {creating ? 'Creating...' : 'Create Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
