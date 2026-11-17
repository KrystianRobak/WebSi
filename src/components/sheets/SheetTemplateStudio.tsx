import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Eye,
  FileCode2,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { SHEET_PRESETS } from '../../data/sheetPresets';
import { useVaultStore } from '../../store/useVaultStore';
import { SheetAttributeValue, SheetFieldSchema } from '../../types/vault';
import { SandboxedCharacterSheet } from './SandboxedCharacterSheet';

export const SheetTemplateStudio: React.FC<{ initialTemplateId?: string }> = ({
  initialTemplateId,
}) => {
  const {
    world,
    sheetTemplates,
    isEffectiveGm,
    createSheetTemplate,
    updateSheetTemplate,
    deleteSheetTemplate,
    setActiveCampaignSheetTemplate,
    rollDiceAndPublish,
    setDiceDrawerOpen,
  } = useVaultStore();

  const canEdit = isEffectiveGm();
  const isSpecificInitial = Boolean(
    initialTemplateId && initialTemplateId !== 'default' && initialTemplateId !== 'sheet_studio'
  );

  const [selectedId, setSelectedId] = useState<string>(
    isSpecificInitial
      ? initialTemplateId!
      : world.active_sheet_template_id || sheetTemplates[0]?.id || ''
  );

  useEffect(() => {
    if (isSpecificInitial && initialTemplateId) {
      setSelectedId(initialTemplateId);
    } else if (!sheetTemplates.some((t) => t.id === selectedId) && sheetTemplates.length > 0) {
      setSelectedId(world.active_sheet_template_id || sheetTemplates[0].id);
    }
  }, [isSpecificInitial, initialTemplateId, sheetTemplates, selectedId, world.active_sheet_template_id]);

  const activeTemplate = useMemo(
    () => sheetTemplates.find((t) => t.id === selectedId) || sheetTemplates[0] || null,
    [sheetTemplates, selectedId]
  );

  const [syncedTemplateId, setSyncedTemplateId] = useState<string>('');
  const [name, setName] = useState('');
  const [systemLabel, setSystemLabel] = useState('');
  const [html, setHtml] = useState('');
  const [css, setCss] = useState('');
  const [schemaText, setSchemaText] = useState('{}');
  const [codeTab, setCodeTab] = useState<'html' | 'css' | 'schema'>('html');
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [previewAttrs, setPreviewAttrs] = useState<Record<string, SheetAttributeValue>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (activeTemplate && activeTemplate.id !== syncedTemplateId) {
    setSyncedTemplateId(activeTemplate.id);
    setName(activeTemplate.name || '');
    setSystemLabel(activeTemplate.system_label || '');
    setHtml(activeTemplate.html_template || '');
    setCss(activeTemplate.css_template || '');
    setSchemaText(JSON.stringify(activeTemplate.schema_json || {}, null, 2));
    setSchemaError(null);
    setPreviewAttrs({ ...(activeTemplate.schema_json?.defaults || {}) });
  }

  const parsedSchema = useMemo<SheetFieldSchema | null>(() => {
    try {
      const parsed = JSON.parse(schemaText || '{}');
      return parsed && typeof parsed === 'object' ? (parsed as SheetFieldSchema) : {};
    } catch {
      return null;
    }
  }, [schemaText]);

  const handleSave = async () => {
    if (!activeTemplate || !canEdit) return;
    if (!parsedSchema) {
      setSchemaError('Schema JSON is invalid. Fix syntax before saving.');
      return;
    }
    setSchemaError(null);
    await updateSheetTemplate(activeTemplate.id, {
      name: (name || '').trim() || 'Custom Sheet',
      system_label: (systemLabel || '').trim() || 'Custom',
      html_template: html || '',
      css_template: css || '',
      schema_json: parsedSchema,
    });
    setStatusMsg('Sheet template saved to Supabase.');
    setTimeout(() => setStatusMsg(null), 2600);
  };

  const handleCreateFromPreset = async (presetId?: string) => {
    if (!canEdit) return;
    const preset = SHEET_PRESETS.find((p) => p.id === presetId) || SHEET_PRESETS[0];
    const created = await createSheetTemplate({
      name: `${preset.name} Copy`,
      system_label: preset.system_label,
      html_template: preset.html_template,
      css_template: preset.css_template,
      schema_json: preset.schema_json,
    });
    if (created) {
      setSelectedId(created.id);
      setStatusMsg(`Created template "${created.name}".`);
      setTimeout(() => setStatusMsg(null), 2600);
    }
  };

  const isDefaultActive = world.active_sheet_template_id === activeTemplate?.id;

  return (
    <div className="h-full w-full flex bg-[#06080c] text-[#e7e2d8] overflow-hidden">
      {/* Left Template Library Sidebar */}
      <aside className="w-64 shrink-0 border-r border-[#141821] bg-[#080a0f] flex flex-col">
        <div className="p-3 border-b border-[#141821] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#b68d40]">
              Sheet Studio
            </div>
            <h2 className="font-serif text-sm font-semibold text-[#f3ead8]">Templates</h2>
          </div>
          {canEdit && (
            <button
              onClick={() => handleCreateFromPreset(SHEET_PRESETS[0].id)}
              className="px-2 py-1 rounded bg-[#141008] border border-[#b68d40]/50 text-[#e6c687] hover:bg-[#b68d40]/20 text-[11px] font-medium flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {sheetTemplates.map((tpl) => {
            const active = tpl.id === activeTemplate?.id;
            const isCampaignDefault = world.active_sheet_template_id === tpl.id;
            return (
              <button
                key={tpl.id}
                onClick={() => setSelectedId(tpl.id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-[#141008] border-[#b68d40]/60 text-[#f3ead8]'
                    : 'bg-[#0b0e14] border-[#151a24] text-[#b8b3a8] hover:border-[#242c3b]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold truncate">{tpl.name}</span>
                  {isCampaignDefault && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-[#b68d40]/20 text-[#e6c687] border border-[#b68d40]/40 shrink-0">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-[#7a8393] mt-0.5 truncate">{tpl.system_label}</div>
              </button>
            );
          })}

          {canEdit && (
            <div className="pt-3 mt-2 border-t border-[#141821] space-y-1.5">
              <div className="px-1 text-[10px] font-mono uppercase tracking-wider text-[#6e7787]">
                Starter Presets
              </div>
              {SHEET_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleCreateFromPreset(preset.id)}
                  className="w-full text-left px-2.5 py-1.5 rounded bg-[#0a0d12] hover:bg-[#111620] border border-[#161b26] text-[11px] text-[#9ea6b5] hover:text-[#e6c687] flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-[#b68d40] shrink-0" />
                  <span className="truncate">+ Clone {preset.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Editor + Live Sandboxed Preview */}
      {!activeTemplate ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
          <FileCode2 className="w-9 h-9 text-[#b68d40]/60" />
          <div className="font-serif text-lg text-[#e8dfd0]">No Character Sheet Templates</div>
          <p className="text-xs text-[#7e8796] max-w-md">
            Create a custom Roll20-style HTML/CSS character sheet template for {world.name} or clone one of the starter presets.
          </p>
          {canEdit && (
            <button
              onClick={() => handleCreateFromPreset(SHEET_PRESETS[0].id)}
              className="btn-gold-metallic px-4 py-2 rounded-lg text-xs font-semibold"
            >
              Create 5e Starter Sheet
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Studio Top Toolbar */}
          <div className="px-4 py-2.5 border-b border-[#141821] bg-[#080a0f] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <input
                type="text"
                value={name}
                disabled={!canEdit}
                onChange={(e) => setName(e.target.value)}
                aria-label="Sheet Template Name"
                className="bg-[#050608] border border-[#1c222e] rounded px-2.5 py-1 text-xs font-semibold text-[#f3ead8] focus:outline-none focus:border-[#b68d40] min-w-[180px]"
              />
              <input
                type="text"
                value={systemLabel}
                disabled={!canEdit}
                onChange={(e) => setSystemLabel(e.target.value)}
                aria-label="System Label"
                placeholder="System (e.g. 5e, OSR, Custom)"
                className="bg-[#050608] border border-[#1c222e] rounded px-2.5 py-1 text-xs text-[#b8b3a8] focus:outline-none focus:border-[#b68d40] w-36"
              />
              {statusMsg && (
                <span className="text-[11px] text-emerald-300 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {statusMsg}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!canEdit ? (
                <span className="text-[11px] text-[#8d96a5] flex items-center gap-1 px-2 py-1 rounded bg-[#0d1118] border border-[#1a202c]">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#b68d40]" /> GM-only Editing (Read-only Preview)
                </span>
              ) : (
                <>
                  <button
                    onClick={() => setActiveCampaignSheetTemplate(activeTemplate.id)}
                    disabled={isDefaultActive}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                      isDefaultActive
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 cursor-default'
                        : 'bg-[#0e121a] border-[#262e3e] text-[#ded8cc] hover:border-[#b68d40]'
                    }`}
                  >
                    {isDefaultActive ? 'Campaign Default Sheet' : 'Set as Campaign Default'}
                  </button>
                  <button
                    onClick={handleSave}
                    className="btn-gold-metallic px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Template
                  </button>
                  {sheetTemplates.length > 1 && (
                    <button
                      onClick={() => deleteSheetTemplate(activeTemplate.id)}
                      title="Delete Template"
                      className="p-1.5 rounded bg-[#140c0d] border border-red-500/30 text-red-300 hover:bg-red-950/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Split Code Editor & Sandboxed Preview */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#141821]">
            {/* Code Pane */}
            <div className="flex flex-col min-h-0 bg-[#050609]">
              <div className="px-3 py-1.5 border-b border-[#141821] flex items-center justify-between bg-[#07090e]">
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'html', label: 'HTML Template' },
                      { id: 'css', label: 'CSS Styling' },
                      { id: 'schema', label: 'Schema & Formulas (JSON)' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setCodeTab(tab.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 ${
                        codeTab === tab.id
                          ? 'bg-[#141008] text-[#e6c687] border border-[#b68d40]/45'
                          : 'text-[#848d9c] hover:text-[#e7e2d8]'
                      }`}
                    >
                      <Code2 className="w-3 h-3" /> {tab.label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] font-mono text-[#6a7383]">
                  attr_* · repeating_* · @{'{'}formula{'}'}
                </span>
              </div>

              {schemaError && (
                <div className="px-3 py-1.5 bg-red-950/40 border-b border-red-500/30 text-[11px] text-red-200">
                  {schemaError}
                </div>
              )}

              <textarea
                value={codeTab === 'html' ? html : codeTab === 'css' ? css : schemaText}
                readOnly={!canEdit}
                onChange={(e) => {
                  const val = e.target.value;
                  if (codeTab === 'html') setHtml(val);
                  else if (codeTab === 'css') setCss(val);
                  else setSchemaText(val);
                }}
                spellCheck={false}
                className="flex-1 w-full bg-[#040508] text-[#d9d3c7] font-mono text-xs p-3 resize-none focus:outline-none leading-relaxed"
              />
            </div>

            {/* Sandboxed Live Preview */}
            <div className="flex flex-col min-h-0 bg-[#07090e]">
              <div className="px-3 py-2 border-b border-[#141821] flex items-center justify-between">
                <span className="text-[11px] font-medium text-[#d4a853] flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Sandboxed Live Preview (isolated iframe)
                </span>
                <button
                  onClick={() => setPreviewAttrs({ ...(parsedSchema?.defaults || {}) })}
                  className="text-[10.5px] text-[#7e8796] hover:text-[#e6c687]"
                >
                  Reset Test Values
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <SandboxedCharacterSheet
                  template={{
                    id: activeTemplate.id,
                    name,
                    html_template: html,
                    css_template: css,
                    schema_json: parsedSchema || activeTemplate.schema_json,
                  }}
                  attributes={previewAttrs}
                  onChangeAttributes={setPreviewAttrs}
                  onRollTriggered={async (expr, label) => {
                    setDiceDrawerOpen(true);
                    await rollDiceAndPublish(expr, { label: `[Sheet Test] ${label}` });
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
