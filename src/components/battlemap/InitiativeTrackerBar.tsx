import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Swords,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import type { BattlemapCombatState, CombatTurnEntry } from '../../types/vault';

const CONDITIONS = ['Poisoned', 'Prone', 'Stunned', 'Blinded', 'Concentrating', 'Invisible'];

export const InitiativeTrackerBar: React.FC<{ mapId: string }> = ({ mapId }) => {
  const {
    maps,
    characters,
    setBattlemapCombatState,
    nextCombatTurn,
    prevCombatTurn,
    openCharacterTab,
    isEffectiveGm,
  } = useVaultStore();

  const map = maps.find((m) => m.id === mapId);
  const combat: BattlemapCombatState = map?.combat_state || {
    active: false,
    round: 1,
    activeTurnIndex: 0,
    entries: [],
  };

  const canManage = isEffectiveGm();
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState('15');
  const [linkedCharId, setLinkedCharId] = useState('');
  const [expanded, setExpanded] = useState(true);

  if (!map) return null;

  const visibleEntries = combat.entries.filter((e) => canManage || !e.isHidden);

  const commitCombat = (next: BattlemapCombatState) => {
    setBattlemapCombatState(mapId, next);
  };

  const handleStartCombat = () => {
    const tokens = map.battlemap?.tokens || [];
    const seededEntries: CombatTurnEntry[] =
      combat.entries.length > 0
        ? combat.entries
        : tokens
            .filter((t) => canManage || !t.isHidden)
            .map((t, idx) => ({
              id: t.id,
              name: t.name,
              initiative: 18 - idx * 2,
              tokenId: t.id,
              characterId: t.character_id ?? null,
              ownerUserId: t.owner_user_id ?? null,
              hp: t.hp,
              maxHp: t.maxHp,
              ac: t.ac,
              conditions: t.conditions || [],
              isHidden: t.isHidden,
            }))
            .sort((a, b) => b.initiative - a.initiative);

    commitCombat({
      active: true,
      round: Math.max(1, combat.round || 1),
      activeTurnIndex: 0,
      entries: seededEntries,
    });
    setExpanded(true);
  };

  const handleAddCombatant = (e: React.FormEvent) => {
    e.preventDefault();
    const char = characters.find((c) => c.id === linkedCharId);
    const label = name.trim() || char?.name;
    if (!label) return;
    const initVal = Number(initiative) || 10;
    const nextEntry: CombatTurnEntry = {
      id: crypto.randomUUID(),
      name: label,
      initiative: initVal,
      characterId: char?.id ?? null,
      ownerUserId: char?.user_id ?? null,
      conditions: [],
      isHidden: false,
    };
    const merged = [...combat.entries, nextEntry].sort(
      (a, b) => b.initiative - a.initiative
    );
    commitCombat({
      ...combat,
      active: true,
      round: Math.max(1, combat.round || 1),
      entries: merged,
    });
    setName('');
    setInitiative('15');
    setLinkedCharId('');
  };

  const toggleCondition = (entryId: string, cond: string) => {
    const nextEntries = combat.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      const has = entry.conditions.includes(cond);
      return {
        ...entry,
        conditions: has
          ? entry.conditions.filter((c) => c !== cond)
          : [...entry.conditions, cond],
      };
    });
    commitCombat({ ...combat, entries: nextEntries });
  };

  const removeEntry = (entryId: string) => {
    const nextEntries = combat.entries.filter((e) => e.id !== entryId);
    const nextIdx =
      nextEntries.length === 0
        ? 0
        : Math.min(combat.activeTurnIndex, nextEntries.length - 1);
    commitCombat({
      ...combat,
      entries: nextEntries,
      activeTurnIndex: nextIdx,
    });
  };

  if (!combat.active && combat.entries.length === 0) {
    return (
      <div
        data-testid="initiative-tracker"
        className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl dark-glass border border-[#1d2433] shadow-lg"
      >
        <Swords className="w-3.5 h-3.5 text-[#d4a853]" />
        <span className="text-xs font-medium text-[#ded8cc]">Initiative</span>
        {canManage && (
          <button
            type="button"
            onClick={handleStartCombat}
            className="px-2.5 py-1 rounded-md btn-gold-metallic text-[11px] font-semibold"
          >
            Start Combat
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="initiative-tracker"
      className="pointer-events-auto w-[330px] max-w-[92vw] rounded-xl dark-glass border border-[#d4a853]/35 shadow-2xl overflow-hidden"
    >
      {/* Top Bar */}
      <div className="px-3 py-2 bg-[#0b0e15]/90 border-b border-[#19202e] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-[#f3ead8]"
        >
          <Swords className="w-3.5 h-3.5 text-[#d4a853]" />
          <span>Initiative</span>
          <span className="px-1.5 py-0.5 rounded bg-[#d4a853]/15 text-[#d4a853] font-mono text-[10px]">
            Round {combat.round}
          </span>
        </button>
        {canManage && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => prevCombatTurn(mapId)}
              title="Prev Turn"
              aria-label="Prev Turn"
              className="p-1 rounded bg-[#141923] text-[#c7c2b6] hover:text-white"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => nextCombatTurn(mapId)}
              title="Next Turn"
              aria-label="Next Turn"
              className="px-2 py-1 rounded btn-gold-metallic text-[11px] font-semibold inline-flex items-center gap-0.5"
            >
              <span>Next Turn</span>
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() =>
                commitCombat({ active: false, round: 1, activeTurnIndex: 0, entries: [] })
              }
              title="End Combat"
              className="p-1 rounded bg-[#141923] text-[#8e96a6] hover:text-red-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="p-2.5 space-y-2 max-h-72 overflow-y-auto">
          {visibleEntries.length === 0 ? (
            <p className="text-[11px] text-[#7c8596] text-center py-2">
              No combatants added yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {visibleEntries.map((entry) => {
                const fullIdx = combat.entries.findIndex((x) => x.id === entry.id);
                const isTurn = fullIdx === combat.activeTurnIndex;
                return (
                  <div
                    key={entry.id}
                    className={`rounded-lg px-2.5 py-1.5 border text-xs transition-colors ${
                      isTurn
                        ? 'bg-[#1a150b] border-[#d4a853]/70 text-[#f3ead8]'
                        : 'bg-[#0b0e14]/90 border-[#1b2230] text-[#ccc6ba]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#141924] text-[#d4a853] font-semibold">
                          {entry.initiative}
                        </span>
                        {entry.characterId ? (
                          <button
                            type="button"
                            onClick={() => openCharacterTab(entry.characterId!)}
                            className="truncate font-semibold hover:text-[#d4a853] inline-flex items-center gap-1"
                            title="Open Character Sheet"
                          >
                            <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{entry.name}</span>
                          </button>
                        ) : (
                          <span className="truncate font-semibold">{entry.name}</span>
                        )}
                        {isTurn && (
                          <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#d4a853] text-black font-bold">
                            Turn
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          aria-label={`Remove ${entry.name}`}
                          className="text-[#6f7887] hover:text-red-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Conditions */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {CONDITIONS.map((cond) => {
                        const active = entry.conditions.includes(cond);
                        if (!active && !canManage) return null;
                        return (
                          <button
                            key={cond}
                            type="button"
                            disabled={!canManage}
                            onClick={() => toggleCondition(entry.id, cond)}
                            className={`px-1.5 py-0.5 rounded text-[9.5px] border transition-colors ${
                              active
                                ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 font-medium'
                                : 'bg-[#0f131b] border-[#1f2634] text-[#6d7686] hover:text-[#ccc6ba]'
                            }`}
                          >
                            {cond}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Combatant Form */}
          {canManage && (
            <form
              onSubmit={handleStartCombat}
              onClick={(e) => e.stopPropagation()}
              className="hidden"
            />
          )}
          {canManage && (
            <form onSubmit={handleAddCombatant} className="pt-1.5 border-t border-[#181e2a] space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label="Combatant Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Combatant name..."
                  className="flex-1 min-w-0 bg-[#06080c] border border-[#222938] rounded px-2 py-1 text-[11px] text-[#f3ead8]"
                />
                <input
                  type="number"
                  aria-label="Initiative Score"
                  value={initiative}
                  onChange={(e) => setInitiative(e.target.value)}
                  placeholder="Init"
                  className="w-14 bg-[#06080c] border border-[#222938] rounded px-2 py-1 text-[11px] font-mono text-[#f3ead8]"
                />
                <button
                  type="submit"
                  className="px-2 py-1 rounded bg-[#1b2230] hover:bg-[#d4a853]/25 border border-[#d4a853]/40 text-[11px] text-[#f3ead8] inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
              {characters.length > 0 && (
                <select
                  aria-label="Link Character"
                  value={linkedCharId}
                  onChange={(e) => {
                    setLinkedCharId(e.target.value);
                    const c = characters.find((x) => x.id === e.target.value);
                    if (c && !name) setName(c.name);
                  }}
                  className="w-full bg-[#06080c] border border-[#222938] rounded px-2 py-1 text-[11px] text-[#9aa3b2]"
                >
                  <option value="">Optional: Link campaign character...</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
};
