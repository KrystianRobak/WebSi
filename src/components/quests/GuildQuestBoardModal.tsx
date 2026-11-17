import React, { useMemo, useState } from 'react';
import { Check, Plus, ScrollText, ShieldAlert, Skull, Trash2, Users, X } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import type { GuildQuestStatus } from '../../types/vault';

const STATUS_BADGE: Record<GuildQuestStatus, string> = {
  open: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  full: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  in_progress: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  completed: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  archived: 'bg-zinc-500/15 text-zinc-400 border-zinc-600/40',
};

export const GuildQuestBoardModal: React.FC = () => {
  const {
    user,
    questBoards,
    guildQuests,
    guildQuestSignups,
    characters,
    campaignMembers,
    activeQuestBoardModalId,
    setActiveQuestBoardModalId,
    createGuildQuest,
    updateGuildQuest,
    deleteGuildQuest,
    deleteQuestBoard,
    signupForQuest,
    withdrawFromQuest,
    isEffectiveGm,
  } = useVaultStore();

  const board = questBoards.find((b) => b.id === activeQuestBoardModalId);
  const canManage = isEffectiveGm();

  const myCharacters = useMemo(
    () => characters.filter((c) => c.user_id === user?.id),
    [characters, user?.id]
  );
  const defaultCharId =
    myCharacters.find((c) => c.is_active)?.id || myCharacters[0]?.id || '';

  const [selectedCharByQuest, setSelectedCharByQuest] = useState<Record<string, string>>({});
  const [noteByQuest, setNoteByQuest] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyQuestId, setBusyQuestId] = useState<string | null>(null);

  // GM new quest draft
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [dangerTier, setDangerTier] = useState('Tier 1 (Lv 1-4)');
  const [reward, setReward] = useState('250 gp + Guild Renown');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [scheduledAt, setScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);

  if (!board) return null;

  const boardQuests = guildQuests.filter((q) => q.board_id === board.id);

  const handleCreateQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      await createGuildQuest({
        board_id: board.id,
        title: title.trim(),
        summary: summary.trim(),
        danger_tier: dangerTier.trim() || 'Tier 1',
        reward: reward.trim() || 'Gold & Glory',
        max_players: Math.max(1, Number(maxPlayers) || 4),
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      setTitle('');
      setSummary('');
      setScheduledAt('');
      setShowCreateForm(false);
    } finally {
      setCreating(false);
    }
  };

  const handleSignup = async (questId: string) => {
    const charId = selectedCharByQuest[questId] || defaultCharId;
    if (!charId) {
      setActionError('Create a character in this campaign before accepting a guild task.');
      return;
    }
    setBusyQuestId(questId);
    setActionError(null);
    const res = await signupForQuest(questId, charId, noteByQuest[questId] || '');
    if (res.error) setActionError(res.error);
    setBusyQuestId(null);
  };

  const handleWithdraw = async (questId: string) => {
    setBusyQuestId(questId);
    setActionError(null);
    const res = await withdrawFromQuest(questId);
    if (res.error) setActionError(res.error);
    setBusyQuestId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => setActiveQuestBoardModalId(null)}
    >
      <div
        role="dialog"
        aria-label={board.title}
        data-testid="quest-board-modal"
        className="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-xl bg-[#090c12] border border-[#d4a853]/45 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#181e29] bg-[#0c1018] flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[#f3ead8] flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-[#d4a853]" />
              <span>{board.title}</span>
            </h2>
            {board.description && (
              <p className="text-xs text-[#8e96a6] mt-1">{board.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCreateForm((v) => !v)}
                  className="px-3 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Quest</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuestBoard(board.id)}
                  title="Delete Quest Board"
                  className="p-1.5 rounded-lg bg-[#141923] border border-[#242c3b] text-[#9aa3b2] hover:text-red-300 hover:border-red-500/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setActiveQuestBoardModalId(null)}
              aria-label="Close Quest Board"
              className="p-1.5 rounded-lg bg-[#141923] text-[#9aa3b2] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {actionError && (
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200">
              {actionError}
            </div>
          )}

          {/* GM New Quest Form */}
          {canManage && showCreateForm && (
            <form
              onSubmit={handleCreateQuest}
              className="rounded-xl bg-[#0e131c] border border-[#d4a853]/35 p-4 space-y-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#d4a853]">
                New Guild Posting
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="quest-title" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Title
                  </label>
                  <input
                    id="quest-title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Clear the Sunken Vaults"
                    className="w-full bg-[#06080c] border border-[#222938] rounded-lg px-3 py-1.5 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
                <div>
                  <label htmlFor="quest-max-players" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Max Players
                  </label>
                  <input
                    id="quest-max-players"
                    type="number"
                    min={1}
                    max={20}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Math.max(1, Number(e.target.value) || 4))}
                    className="w-full bg-[#06080c] border border-[#222938] rounded-lg px-3 py-1.5 text-xs text-[#f3ead8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="quest-danger" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Danger Tier
                  </label>
                  <input
                    id="quest-danger"
                    value={dangerTier}
                    onChange={(e) => setDangerTier(e.target.value)}
                    className="w-full bg-[#06080c] border border-[#222938] rounded-lg px-3 py-1.5 text-xs text-[#f3ead8]"
                  />
                </div>
                <div>
                  <label htmlFor="quest-reward" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Reward
                  </label>
                  <input
                    id="quest-reward"
                    value={reward}
                    onChange={(e) => setReward(e.target.value)}
                    className="w-full bg-[#06080c] border border-[#222938] rounded-lg px-3 py-1.5 text-xs text-[#f3ead8]"
                  />
                </div>
                <div>
                  <label htmlFor="quest-schedule" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Session Time (Optional)
                  </label>
                  <input
                    id="quest-schedule"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-[#06080c] border border-[#222938] rounded-lg px-2 py-1.5 text-xs text-[#f3ead8]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="quest-summary" className="block text-[11px] text-[#9aa3b2] mb-1">
                  Description &amp; Briefing
                </label>
                <textarea
                  id="quest-summary"
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Objectives, departure rumors, and supply notes..."
                  className="w-full bg-[#06080c] border border-[#222938] rounded-lg px-3 py-1.5 text-xs text-[#ded8cc]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#141923] text-xs text-[#9aa3b2] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !title.trim()}
                  className="px-4 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold disabled:opacity-50"
                >
                  {creating ? 'Posting...' : 'Create'}
                </button>
              </div>
            </form>
          )}

          {/* Quest List */}
          {boardQuests.length === 0 ? (
            <div className="py-10 text-center rounded-xl border border-dashed border-[#1e2636] text-xs text-[#7d8696]">
              No quests posted on this board yet.
              {canManage ? ' Click "Post Quest" to commission an expedition.' : ''}
            </div>
          ) : (
            <div className="space-y-3">
              {boardQuests.map((quest) => {
                const signups = guildQuestSignups.filter((sg) => sg.quest_id === quest.id);
                const mySignup = signups.find((sg) => sg.user_id === user?.id);
                const isFull =
                  quest.status === 'full' || signups.length >= quest.max_players;
                const canSignup =
                  !mySignup &&
                  !isFull &&
                  quest.status !== 'completed' &&
                  quest.status !== 'archived';
                const chosenCharId = selectedCharByQuest[quest.id] || defaultCharId;

                return (
                  <div
                    key={quest.id}
                    className="rounded-xl bg-[#0d1119] border border-[#1d2433] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
                            {quest.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${
                              STATUS_BADGE[isFull && quest.status === 'open' ? 'full' : quest.status]
                            }`}
                          >
                            {isFull && quest.status === 'open'
                              ? 'Full'
                              : quest.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-[#9aa3b2]">
                          <span className="inline-flex items-center gap-1 text-amber-300/90">
                            <ShieldAlert className="w-3 h-3" />
                            {quest.danger_tier}
                          </span>
                          <span>Reward: {quest.reward}</span>
                          <span className="inline-flex items-center gap-1 font-mono text-[#d4a853]">
                            <Users className="w-3 h-3" />
                            {signups.length} / {quest.max_players}
                          </span>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`Status for ${quest.title}`}
                            value={quest.status}
                            onChange={(e) =>
                              updateGuildQuest(quest.id, {
                                status: e.target.value as GuildQuestStatus,
                              })
                            }
                            className="bg-[#07090e] border border-[#222938] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
                          >
                            <option value="open">Open</option>
                            <option value="full">Full</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="archived">Archived</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteGuildQuest(quest.id)}
                            title="Delete Quest"
                            className="p-1.5 rounded bg-[#141923] text-[#8d96a6] hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {quest.summary && (
                      <p className="text-xs text-[#c7c2b6] whitespace-pre-wrap">{quest.summary}</p>
                    )}

                    {/* Party Roster */}
                    <div className="pt-2 border-t border-[#181e2a] space-y-2">
                      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-[#8e96a6]">
                        Signed Party Roster ({signups.length} / {quest.max_players})
                      </div>
                      {signups.length === 0 ? (
                        <p className="text-[11px] text-[#6d7686] italic">
                          No adventurers signed up yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {signups.map((sg) => {
                            const ch = characters.find((c) => c.id === sg.character_id);
                            const member = campaignMembers.find((m) => m.user_id === sg.user_id);
                            const label =
                              ch?.name ||
                              member?.profile?.display_name ||
                              'Adventurer';
                            return (
                              <span
                                key={sg.id}
                                className="px-2 py-0.5 rounded-md bg-[#141a26] border border-[#252f42] text-[11px] text-[#f3ead8] inline-flex items-center gap-1"
                              >
                                <Skull className="w-3 h-3 text-[#d4a853]" />
                                <span>{label}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Player Signup Controls */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                      {mySignup ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Enlisted
                          </span>
                          <button
                            type="button"
                            disabled={busyQuestId === quest.id}
                            onClick={() => handleWithdraw(quest.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#1c1619] border border-red-500/35 hover:bg-red-500/20 text-xs text-red-200 disabled:opacity-50"
                          >
                            Withdraw
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 w-full justify-between">
                          {myCharacters.length > 0 && canSignup && (
                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                              <select
                                aria-label={`Character for ${quest.title}`}
                                value={chosenCharId}
                                onChange={(e) =>
                                  setSelectedCharByQuest((prev) => ({
                                    ...prev,
                                    [quest.id]: e.target.value,
                                  }))
                                }
                                className="bg-[#07090e] border border-[#222938] rounded-lg px-2 py-1.5 text-xs text-[#f3ead8]"
                              >
                                {myCharacters.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={noteByQuest[quest.id] || ''}
                                onChange={(e) =>
                                  setNoteByQuest((prev) => ({
                                    ...prev,
                                    [quest.id]: e.target.value,
                                  }))
                                }
                                placeholder="Optional role/note..."
                                className="flex-1 bg-[#07090e] border border-[#222938] rounded-lg px-2.5 py-1.5 text-xs text-[#ded8cc]"
                              />
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={!canSignup || busyQuestId === quest.id}
                            onClick={() => handleSignup(quest.id)}
                            className="px-3.5 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                          >
                            {isFull ? 'Party Full' : 'Accept Task'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
