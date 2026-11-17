import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileCode2,
  Image as ImageIcon,
  Link2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { SHEET_PRESET_5E } from '../../data/sheetPresets';
import { uploadVaultAsset } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import { CharacterRecord, CharacterSheetTemplate } from '../../types/vault';
import { SandboxedCharacterSheet } from './SandboxedCharacterSheet';

export const CharacterManagerPane: React.FC<{ initialCharacterId?: string }> = ({
  initialCharacterId,
}) => {
  const {
    world,
    user,
    campaignMembers,
    entities,
    characters,
    sheetTemplates,
    isEffectiveGm,
    createCharacter,
    updateCharacter,
    setActiveCharacter,
    deleteCharacter,
    openEntityTab,
    openSheetStudioTab,
  } = useVaultStore();

  const canGmEdit = isEffectiveGm();
  const isWestMarches = world.mode === 'west_marches';

  const myCharacters = useMemo(
    () => characters.filter((c) => c.user_id === user?.id),
    [characters, user?.id]
  );
  const myActiveChar = useMemo(
    () => myCharacters.find((c) => c.is_active) || null,
    [myCharacters]
  );

  const isSpecificInitial = Boolean(
    initialCharacterId && initialCharacterId !== 'roster' && initialCharacterId !== 'characters'
  );

  const [selectedId, setSelectedId] = useState<string>(
    isSpecificInitial
      ? initialCharacterId!
      : myActiveChar?.id || myCharacters[0]?.id || characters[0]?.id || ''
  );

  useEffect(() => {
    if (isSpecificInitial && initialCharacterId) {
      setSelectedId(initialCharacterId);
    } else if (!characters.some((c) => c.id === selectedId)) {
      setSelectedId(myActiveChar?.id || myCharacters[0]?.id || characters[0]?.id || '');
    }
  }, [isSpecificInitial, initialCharacterId, characters, selectedId, myActiveChar?.id, myCharacters]);

  const activeChar: CharacterRecord | null = useMemo(
    () => characters.find((c) => c.id === selectedId) || null,
    [characters, selectedId]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTemplateId, setNewTemplateId] = useState(
    world.active_sheet_template_id || sheetTemplates[0]?.id || ''
  );
  const [newEntityId, setNewEntityId] = useState('');
  const [createAsInactive, setCreateAsInactive] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  const canEditSelected = Boolean(
    activeChar && (activeChar.user_id === user?.id || canGmEdit)
  );

  const resolvedTemplate = useMemo<
    Pick<
      CharacterSheetTemplate,
      'id' | 'name' | 'system_label' | 'html_template' | 'css_template' | 'schema_json'
    >
  >(() => {
    if (activeChar?.sheet_template_id) {
      const match = sheetTemplates.find((t) => t.id === activeChar.sheet_template_id);
      if (match) return match;
    }
    if (world.active_sheet_template_id) {
      const def = sheetTemplates.find((t) => t.id === world.active_sheet_template_id);
      if (def) return def;
    }
    if (sheetTemplates[0]) return sheetTemplates[0];
    return SHEET_PRESET_5E;
  }, [activeChar?.sheet_template_id, sheetTemplates, world.active_sheet_template_id]);

  const loreCharEntities = useMemo(
    () =>
      [...entities].sort((a, b) => {
        if (a.type === 'Character' && b.type !== 'Character') return -1;
        if (b.type === 'Character' && a.type !== 'Character') return 1;
        return a.title.localeCompare(b.title);
      }),
    [entities]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setStatusError('Enter a character name.');
      return;
    }
    setStatusError(null);
    const { character, error } = await createCharacter({
      name: newName.trim(),
      sheet_template_id: newTemplateId || null,
      entity_id: newEntityId || null,
      is_active: isWestMarches && myActiveChar ? !createAsInactive : true,
    });
    if (error) {
      setStatusError(error);
      return;
    }
    if (character) {
      setSelectedId(character.id);
      setNewName('');
      setNewEntityId('');
      setCreateOpen(false);
      setStatusSuccess(`Created character "${character.name}".`);
      setTimeout(() => setStatusSuccess(null), 2600);
    }
  };

  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChar || !canEditSelected) return;
    const url = await uploadVaultAsset(file, 'portraits');
    await updateCharacter(activeChar.id, { portrait_url: url });
    e.target.value = '';
  };

  const getOwnerLabel = (uid: string) => {
    if (uid === user?.id) return 'You';
    const member = campaignMembers.find((m) => m.user_id === uid);
    return member?.profile?.display_name || 'Adventurer';
  };

  const renderCharCard = (char: CharacterRecord) => {
    const isSel = char.id === activeChar?.id;
    return (
      <button
        key={char.id}
        onClick={() => setSelectedId(char.id)}
        className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center gap-2.5 ${
          isSel
            ? 'bg-[#141008] border-[#b68d40]/65 text-[#f3ead8]'
            : 'bg-[#0b0e14] border-[#151a24] text-[#bdb7ac] hover:border-[#242c3b]'
        }`}
      >
        {char.portrait_url ? (
          <img
            src={char.portrait_url}
            alt={char.name}
            className="w-9 h-9 rounded-full object-cover border border-[#b68d40]/40 shrink-0"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-[#111621] border border-[#222938] flex items-center justify-center text-[#b68d40] shrink-0">
            <User className="w-4 h-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold truncate">{char.name}</span>
            {char.is_active ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 shrink-0">
                Active
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-[#141821] text-[#7a8291] shrink-0">
                Retired
              </span>
            )}
          </div>
          <div className="text-[10.5px] text-[#7c8493] truncate">
            {getOwnerLabel(char.user_id)}
            {char.attributes?.class_level ? ` · ${String(char.attributes.class_level)}` : ''}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="h-full w-full flex bg-[#06080c] text-[#e7e2d8] overflow-hidden">
      {/* Left Character Roster */}
      <aside className="w-72 shrink-0 border-r border-[#141821] bg-[#080a0f] flex flex-col">
        <div className="p-3 border-b border-[#141821] flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#b68d40]">
              {isWestMarches ? 'West Marches Roster' : 'Campaign Roster'}
            </div>
            <h2 className="font-serif text-sm font-semibold text-[#f3ead8]">
              Characters ({characters.length})
            </h2>
          </div>
          <button
            onClick={() => {
              setCreateAsInactive(Boolean(isWestMarches && myActiveChar));
              setStatusError(null);
              setCreateOpen((v) => !v);
            }}
            className="btn-gold-metallic px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>

        {isWestMarches && (
          <div className="mx-2.5 mt-2.5 px-2.5 py-2 rounded-lg bg-amber-950/25 border border-amber-500/30 text-[10.5px] text-amber-200/90 leading-relaxed">
            <strong>West Marches Rule:</strong> 1 active character per player ({myActiveChar ? `Active: ${myActiveChar.name}` : 'None active'}).
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
          <div className="space-y-1.5">
            <div className="px-1 text-[10px] font-mono uppercase tracking-wider text-[#8e97a6]">
              My Characters ({myCharacters.length})
            </div>
            {myCharacters.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-[#5e6776] italic">
                You have not created a character in this campaign yet.
              </div>
            ) : (
              myCharacters.map(renderCharCard)
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#141821]">
            <div className="px-1 text-[10px] font-mono uppercase tracking-wider text-[#8e97a6]">
              Party Companions ({characters.filter((c) => c.user_id !== user?.id).length})
            </div>
            {characters
              .filter((c) => c.user_id !== user?.id)
              .map(renderCharCard)}
          </div>
        </div>
      </aside>

      {/* Main Character Workspace */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {createOpen && (
          <form
            onSubmit={handleCreate}
            className="p-4 border-b border-[#1c222e] bg-[#0a0d14] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-sm font-semibold text-[#e6c687]">
                Create Campaign Character
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="text-xs text-[#7e8796] hover:text-white"
              >
                Cancel
              </button>
            </div>
            {statusError && (
              <div className="px-3 py-1.5 rounded bg-red-950/40 border border-red-500/40 text-xs text-red-200">
                {statusError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Character name (e.g. Kaelen Vance)"
                className="bg-[#050608] border border-[#1e2533] rounded px-3 py-1.5 text-xs text-[#f3ead8] focus:outline-none focus:border-[#b68d40]"
              />
              <select
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value)}
                className="bg-[#050608] border border-[#1e2533] rounded px-2.5 py-1.5 text-xs text-[#ded8cc]"
              >
                <option value="">Campaign Default Sheet</option>
                {sheetTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.system_label})
                  </option>
                ))}
              </select>
              <select
                value={newEntityId}
                onChange={(e) => setNewEntityId(e.target.value)}
                className="bg-[#050608] border border-[#1e2533] rounded px-2.5 py-1.5 text-xs text-[#ded8cc]"
              >
                <option value="">Optional Lore Link...</option>
                {loreCharEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.title}
                  </option>
                ))}
              </select>
            </div>
            {isWestMarches && myActiveChar && (
              <label className="flex items-center gap-2 text-xs text-amber-200">
                <input
                  type="checkbox"
                  checked={createAsInactive}
                  onChange={(e) => setCreateAsInactive(e.target.checked)}
                  className="accent-[#b68d40]"
                />
                <span>
                  Create as retired/inactive backup (since &ldquo;{myActiveChar.name}&rdquo; is already your active West Marches character)
                </span>
              </label>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn-gold-metallic px-4 py-1.5 rounded text-xs font-semibold"
              >
                Create Character
              </button>
            </div>
          </form>
        )}

        {statusSuccess && (
          <div className="px-4 py-2 bg-emerald-950/35 border-b border-emerald-500/35 text-xs text-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {statusSuccess}
          </div>
        )}

        {!activeChar ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Sparkles className="w-9 h-9 text-[#b68d40]/65" />
            <div className="font-serif text-lg text-[#e8dfd0]">No Character Selected</div>
            <p className="text-xs text-[#7e8796] max-w-md">
              Create your character for {world.name} to manage their custom character sheet, track stats, sign up on West Marches Guild Quest Boards, and roll dice into the table log.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="btn-gold-metallic px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create My Character
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Character Sheet Header Bar */}
            <div className="px-4 py-3 border-b border-[#141821] bg-[#080a0f] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {activeChar.portrait_url ? (
                  <img
                    src={activeChar.portrait_url}
                    alt={activeChar.name}
                    className="w-11 h-11 rounded-lg object-cover border border-[#b68d40]/45 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-[#10141d] border border-[#222938] flex items-center justify-center text-[#b68d40] shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {canEditSelected ? (
                      <input
                        type="text"
                        value={activeChar.name}
                        onChange={(e) =>
                          updateCharacter(activeChar.id, { name: e.target.value })
                        }
                        className="bg-transparent border-b border-transparent focus:border-[#b68d40] font-serif text-base font-semibold text-[#f3ead8] focus:outline-none"
                      />
                    ) : (
                      <h2 className="font-serif text-base font-semibold text-[#f3ead8] truncate">
                        {activeChar.name}
                      </h2>
                    )}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#121620] text-[#9aa3b2] border border-[#1d2330]">
                      {getOwnerLabel(activeChar.user_id)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-[#848d9c]">
                    <span>Sheet: {resolvedTemplate.name}</span>
                    {activeChar.entity_id && (
                      <button
                        onClick={() => openEntityTab(activeChar.entity_id!)}
                        className="text-[#c9a050] hover:underline flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" /> Open Lore Entry
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canEditSelected && (
                  <>
                    <label className="cursor-pointer px-2.5 py-1.5 rounded bg-[#0e121a] border border-[#222938] hover:border-[#b68d40]/60 text-[11px] text-[#ded8cc] flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-[#b68d40]" /> Portrait
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePortraitUpload}
                        className="hidden"
                      />
                    </label>

                    <select
                      aria-label="Character Sheet Template"
                      value={activeChar.sheet_template_id || ''}
                      onChange={(e) =>
                        updateCharacter(activeChar.id, {
                          sheet_template_id: e.target.value || null,
                        })
                      }
                      className="bg-[#0e121a] border border-[#222938] rounded px-2 py-1.5 text-[11px] text-[#ded8cc]"
                    >
                      <option value="">Campaign Default ({resolvedTemplate.system_label})</option>
                      {sheetTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Linked Lore Entity"
                      value={activeChar.entity_id || ''}
                      onChange={(e) =>
                        updateCharacter(activeChar.id, {
                          entity_id: e.target.value || null,
                        })
                      }
                      className="bg-[#0e121a] border border-[#222938] rounded px-2 py-1.5 text-[11px] text-[#ded8cc]"
                    >
                      <option value="">No Lore Link</option>
                      {loreCharEntities.map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.title} ({ent.type})
                        </option>
                      ))}
                    </select>

                    {!activeChar.is_active ? (
                      <button
                        onClick={() => setActiveCharacter(activeChar.id)}
                        className="px-2.5 py-1.5 rounded bg-emerald-950/40 border border-emerald-500/45 text-emerald-200 hover:bg-emerald-900/50 text-[11px] font-medium flex items-center gap-1"
                      >
                        <UserCheck className="w-3 h-3" />
                        {isWestMarches ? 'Swap Active (WM)' : 'Set Active'}
                      </button>
                    ) : (
                      <button
                        onClick={() => updateCharacter(activeChar.id, { is_active: false })}
                        className="px-2.5 py-1.5 rounded bg-[#121620] border border-[#242c3b] text-[#9aa3b2] hover:text-amber-200 text-[11px] flex items-center gap-1"
                      >
                        <UserMinus className="w-3 h-3" /> Retire
                      </button>
                    )}
                  </>
                )}

                {canGmEdit && (
                  <button
                    onClick={() => openSheetStudioTab(resolvedTemplate.id)}
                    className="px-2.5 py-1.5 rounded bg-[#0e121a] border border-[#222938] hover:border-[#b68d40] text-[11px] text-[#e6c687] flex items-center gap-1"
                  >
                    <FileCode2 className="w-3 h-3" /> Edit Sheet Template
                  </button>
                )}

                {canEditSelected && (
                  <button
                    onClick={() => deleteCharacter(activeChar.id)}
                    title="Delete Character"
                    className="p-1.5 rounded bg-[#140c0d] border border-red-500/30 text-red-300 hover:bg-red-950/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {!canEditSelected && (
                  <span className="px-2 py-1 rounded bg-[#0d1118] border border-[#1a202c] text-[11px] text-[#848d9c] flex items-center gap-1">
                    <Shield className="w-3 h-3 text-[#b68d40]" /> Read-only Companion Sheet
                  </span>
                )}
              </div>
            </div>

            {/* Sandboxed Roll20 Sheet Viewport */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#06080c]">
              <div className="max-w-4xl mx-auto">
                <SandboxedCharacterSheet
                  template={resolvedTemplate}
                  attributes={activeChar.attributes || {}}
                  characterId={activeChar.id}
                  readOnly={!canEditSelected}
                  onChangeAttributes={(nextAttrs) => {
                    updateCharacter(activeChar.id, { attributes: nextAttrs });
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
