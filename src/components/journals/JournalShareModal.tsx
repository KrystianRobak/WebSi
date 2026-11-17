import React, { useEffect, useState } from 'react';
import { Globe, Lock, Users, X } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import type { JournalPage, JournalShareScope } from '../../types/vault';

interface JournalShareModalProps {
  page: JournalPage;
  onClose: () => void;
}

export const JournalShareModal: React.FC<JournalShareModalProps> = ({ page, onClose }) => {
  const { user, campaignMembers, journalPageShares, updateJournalSharing } = useVaultStore();

  const existingShares = journalPageShares.filter((sh) => sh.page_id === page.id);
  const [scope, setScope] = useState<JournalShareScope>(page.share_scope);
  const [selectedMap, setSelectedMap] = useState<Record<string, { checked: boolean; canEdit: boolean }>>(
    () => {
      const m: Record<string, { checked: boolean; canEdit: boolean }> = {};
      for (const sh of existingShares) {
        m[sh.shared_with_user_id] = { checked: true, canEdit: sh.can_edit };
      }
      return m;
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScope(page.share_scope);
  }, [page.id, page.share_scope]);

  const otherMembers = campaignMembers.filter((m) => m.user_id !== user?.id);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const shareList = Object.entries(selectedMap)
      .filter(([, cfg]) => cfg.checked)
      .map(([shared_with_user_id, cfg]) => ({
        shared_with_user_id,
        can_edit: cfg.canEdit,
      }));
    const res = await updateJournalSharing(page.id, scope, shareList);
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl dark-glass border border-[#d4a853]/35 shadow-glass overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#181d27] flex items-center justify-between">
          <div>
            <h3 className="font-serif text-sm font-semibold text-[#f3ead8]">
              Share Journal Page
            </h3>
            <p className="text-[11px] text-[#7c8594] truncate max-w-[300px]">{page.title}</p>
          </div>
          <button onClick={onClose} className="text-[#7c8594] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="rounded-lg bg-red-950/35 border border-red-500/35 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {(
              [
                {
                  id: 'private' as const,
                  title: 'Private (Only Me)',
                  desc: 'Only you can read or edit this note.',
                  icon: Lock,
                },
                {
                  id: 'selected' as const,
                  title: 'Specific Players',
                  desc: 'Grant read or collaborative edit access to chosen party members.',
                  icon: Users,
                },
                {
                  id: 'campaign' as const,
                  title: 'Whole Campaign',
                  desc: 'Every member of this campaign can read this journal page.',
                  icon: Globe,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = scope === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScope(opt.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 ${
                    active
                      ? 'bg-[#b68d40]/12 border-[#b68d40]/60 text-[#f3ead8]'
                      : 'bg-[#080a0e] border-[#181d27] text-[#9b9384] hover:border-[#2a3240]'
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-[#d4a853]' : 'text-[#6c7585]'}`} />
                  <div>
                    <div className="text-xs font-semibold">{opt.title}</div>
                    <div className="text-[10.5px] text-[#7c8594]">{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {scope === 'selected' && (
            <div className="rounded-lg bg-[#050608] border border-[#181d27] p-2.5 space-y-1.5 max-h-48 overflow-y-auto">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#8c95a4]">
                Campaign Members ({otherMembers.length})
              </div>
              {otherMembers.length === 0 ? (
                <p className="text-xs text-[#6c7585] italic py-2">
                  No other members have joined this campaign yet.
                </p>
              ) : (
                otherMembers.map((mem) => {
                  const cfg = selectedMap[mem.user_id] || { checked: false, canEdit: false };
                  const name = mem.profile?.display_name || mem.user_id.slice(0, 8);
                  return (
                    <div
                      key={mem.user_id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-[#0b0e14] border border-[#141821]"
                    >
                      <label className="flex items-center gap-2 text-xs text-[#ded8cc] cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={cfg.checked}
                          onChange={(e) =>
                            setSelectedMap((prev) => ({
                              ...prev,
                              [mem.user_id]: { checked: e.target.checked, canEdit: cfg.canEdit },
                            }))
                          }
                          className="accent-[#d4a853]"
                        />
                        <span className="truncate">{name}</span>
                        <span className="text-[10px] font-mono uppercase text-[#757e8d]">
                          ({mem.role})
                        </span>
                      </label>
                      {cfg.checked && (
                        <label className="flex items-center gap-1 text-[10.5px] text-[#c9a050] cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={cfg.canEdit}
                            onChange={(e) =>
                              setSelectedMap((prev) => ({
                                ...prev,
                                [mem.user_id]: { checked: true, canEdit: e.target.checked },
                              }))
                            }
                            className="accent-[#d4a853]"
                          />
                          <span>Can Edit</span>
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#181d27]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#0c0f15] border border-[#1d222b] text-xs text-[#9b9384]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Sharing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
