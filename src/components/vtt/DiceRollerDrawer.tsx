import React, { useMemo, useState } from 'react';
import { Dices, EyeOff, Send, Sparkles, X } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';

const QUICK_DICE = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d20kh1', '2d20kl1', '1d100'];

export const DiceRollerDrawer: React.FC = () => {
  const {
    diceDrawerOpen,
    setDiceDrawerOpen,
    diceRolls,
    rollDiceAndPublish,
    isEffectiveGm,
    user,
    characters,
    campaignMembers,
    rightInspectorCollapsed,
    inspectorWidth,
  } = useVaultStore();

  const [expression, setExpression] = useState('1d20');
  const [label, setLabel] = useState('');
  const [blindGm, setBlindGm] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const canGmEdit = isEffectiveGm();

  const myCharacters = useMemo(
    () => characters.filter((c) => c.user_id === user?.id),
    [characters, user?.id]
  );

  const visibleRolls = useMemo(
    () => diceRolls.filter((r) => !r.is_gm_blind || canGmEdit || r.user_id === user?.id),
    [diceRolls, canGmEdit, user?.id]
  );

  if (!diceDrawerOpen) return null;

  const rightOffset = rightInspectorCollapsed ? 16 : inspectorWidth + 16;

  const handleRoll = async (exprOverride?: string, labelOverride?: string) => {
    const expr = (exprOverride ?? expression).trim();
    if (!expr) return;
    setErrorMsg(null);
    setRolling(true);
    const activeChar =
      myCharacters.find((c) => c.id === selectedCharId) ||
      myCharacters.find((c) => c.is_active) ||
      null;
    const { error } = await rollDiceAndPublish(expr, {
      label: labelOverride ?? (label.trim() || 'Table Roll'),
      characterId: activeChar?.id || null,
      isGmBlind: canGmEdit && blindGm,
    });
    setRolling(false);
    if (error) {
      setErrorMsg(error);
    } else if (!exprOverride) {
      setLabel('');
    }
  };

  const getRollerName = (userId: string, charId?: string | null) => {
    const char = charId ? characters.find((c) => c.id === charId) : null;
    if (char) return char.name;
    const mem = campaignMembers.find((m) => m.user_id === userId);
    return mem?.profile?.display_name || 'Adventurer';
  };

  return (
    <section
      aria-label="Dice Roller Drawer"
      style={{ right: `${rightOffset}px` }}
      className="fixed bottom-4 z-40 w-[350px] max-w-[calc(100vw-24px)] max-h-[72vh] flex flex-col rounded-xl bg-[#07090e]/98 backdrop-blur-md border border-[#b68d40]/45 shadow-[0_18px_48px_rgba(0,0,0,0.85)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-[#141821] bg-[#0a0d14] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-[#d4a853]" />
          <h3 className="font-serif text-sm font-semibold text-[#f3ead8]">Tabletop Dice Log</h3>
        </div>
        <button
          onClick={() => setDiceDrawerOpen(false)}
          aria-label="Hide Dice Log"
          title="Close"
          className="p-1 rounded-md text-[#8b94a5] hover:text-white hover:bg-[#161c28] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Dice Buttons */}
      <div className="px-3 py-2 border-b border-[#12161f] flex flex-wrap gap-1 bg-[#06080c]">
        {QUICK_DICE.map((die) => (
          <button
            key={die}
            type="button"
            disabled={rolling}
            onClick={() => {
              setExpression(die);
              handleRoll(die, `${die.toUpperCase()} Roll`);
            }}
            className="px-2 py-1 rounded bg-[#10141d] hover:bg-[#1a150b] border border-[#1f2634] hover:border-[#b68d40]/60 text-[10.5px] font-mono text-[#e6c687] transition-colors"
          >
            {die === '2d20kh1' ? 'Adv' : die === '2d20kl1' ? 'Dis' : die}
          </button>
        ))}
      </div>

      {/* Roll Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRoll();
        }}
        className="p-3 border-b border-[#141821] space-y-2 bg-[#080a10]"
      >
        <div className="flex gap-1.5">
          <input
            type="text"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="e.g. 1d20+@{dex_mod} or 4d6dl1"
            aria-label="Dice Expression"
            className="flex-1 bg-[#040508] border border-[#1c222e] rounded px-2.5 py-1.5 text-xs font-mono text-[#f3ead8] focus:outline-none focus:border-[#b68d40]"
          />
          <button
            type="submit"
            disabled={rolling}
            className="btn-gold-metallic px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 shrink-0"
          >
            <Send className="w-3 h-3" /> Roll
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Stealth)"
            className="bg-[#040508] border border-[#1c222e] rounded px-2 py-1 text-[11px] text-[#ded8cc] focus:outline-none focus:border-[#b68d40]"
          />
          <select
            value={selectedCharId}
            onChange={(e) => setSelectedCharId(e.target.value)}
            aria-label="Rolling Character"
            className="bg-[#040508] border border-[#1c222e] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
          >
            <option value="">Active Character</option>
            {myCharacters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {canGmEdit && (
          <label className="flex items-center gap-1.5 text-[11px] text-purple-300 cursor-pointer">
            <input
              type="checkbox"
              checked={blindGm}
              onChange={(e) => setBlindGm(e.target.checked)}
              className="accent-purple-500"
            />
            <EyeOff className="w-3 h-3" />
            <span>Blind GM Roll (hidden from players)</span>
          </label>
        )}

        {errorMsg && (
          <div className="text-[11px] text-red-300 bg-red-950/35 border border-red-500/35 rounded px-2 py-1">
            {errorMsg}
          </div>
        )}
      </form>

      {/* Realtime Roll Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visibleRolls.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#697282] space-y-1">
            <Sparkles className="w-5 h-5 mx-auto text-[#b68d40]/50" />
            <div>No dice rolled in this session yet.</div>
          </div>
        ) : (
          visibleRolls.map((roll) => {
            const hasNat20 = roll.breakdown?.groups?.some(
              (g) => g.notation.includes('d20') && g.kept.includes(20)
            );
            const hasNat1 = roll.breakdown?.groups?.some(
              (g) => g.notation.includes('d20') && g.kept.includes(1)
            );
            return (
              <div
                key={roll.id}
                className={`p-2.5 rounded-lg border text-xs ${
                  roll.is_gm_blind
                    ? 'bg-purple-950/20 border-purple-500/35'
                    : hasNat20
                    ? 'bg-emerald-950/20 border-emerald-500/40'
                    : hasNat1
                    ? 'bg-red-950/20 border-red-500/35'
                    : 'bg-[#0b0e14] border-[#151b26]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#f3ead8] truncate">
                      {getRollerName(roll.user_id, roll.character_id)}
                      <span className="font-normal text-[#8e97a6]"> · {roll.label}</span>
                    </div>
                    <div className="text-[10.5px] font-mono text-[#7c8493] truncate">
                      {roll.expression}
                    </div>
                  </div>
                  <div
                    className={`text-lg font-serif font-bold px-2.5 py-0.5 rounded bg-[#050608] border shrink-0 ${
                      hasNat20
                        ? 'text-emerald-300 border-emerald-500/45'
                        : hasNat1
                        ? 'text-red-300 border-red-500/45'
                        : 'text-[#e6c687] border-[#b68d40]/40'
                    }`}
                  >
                    {roll.total}
                  </div>
                </div>
                {roll.breakdown?.groups?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-mono text-[#9ea6b5]">
                    {roll.breakdown.groups.map((g, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-[#050608] border border-[#1a202c]"
                      >
                        {g.notation}: [{g.rolls.join(', ')}]
                      </span>
                    ))}
                    {roll.is_gm_blind && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-950/50 text-purple-200 border border-purple-500/40">
                        GM Secret
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
