import React, { useState } from 'react';
import { Check, Copy, Image as ImageIcon, Layers, Sparkles, Trash2 } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { AssetKind } from '../../types/vault';

export const AssetViewerPane: React.FC<{ assetId: string }> = ({ assetId }) => {
  const { assets, entities, updateAsset, deleteAsset, attachAssetToEntity, openEntityTab } =
    useVaultStore();

  const asset = assets.find((a) => a.id === assetId);
  const [targetEntityId, setTargetEntityId] = useState<string>(entities[0]?.id || '');
  const [previewOpacity, setPreviewOpacity] = useState(1);
  const [copiedToken, setCopiedToken] = useState<'obsidian' | 'md' | null>(null);

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#7c8493]">
        Asset not found.
      </div>
    );
  }

  const obsidianSnippet =
    previewOpacity < 0.99
      ? `![[${asset.slug}|opacity=${Math.round(previewOpacity * 100)}]]`
      : `![[${asset.slug}]]`;
  const markdownSnippet =
    previewOpacity < 0.99
      ? `![${asset.name}|opacity=${Math.round(previewOpacity * 100)}](asset://${asset.slug})`
      : `![${asset.name}](asset://${asset.slug})`;

  const copySnippet = async (kind: 'obsidian' | 'md') => {
    await navigator.clipboard.writeText(kind === 'obsidian' ? obsidianSnippet : markdownSnippet);
    setCopiedToken(kind);
    setTimeout(() => setCopiedToken(null), 1600);
  };

  return (
    <div className="h-full bg-[#101318] flex flex-col overflow-y-auto p-6">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1d222b] pb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="p-2 rounded-lg bg-[#171b22] border border-[#d4a853]/40 text-[#d4a853]">
              <ImageIcon className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#d4a853]">
                Vault Asset • asset://{asset.slug}
              </div>
              <input
                value={asset.name}
                onChange={(e) => updateAsset(asset.id, { name: e.target.value })}
                className="w-full bg-transparent font-serif text-2xl font-bold text-[#f5efe2] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={asset.kind}
              onChange={(e) => updateAsset(asset.id, { kind: e.target.value as AssetKind })}
              className="bg-[#141820] border border-[#242a35] rounded-md px-2.5 py-1.5 text-xs text-[#e7e2d8]"
            >
              <option value="portrait">Portrait</option>
              <option value="scene">Scene / Location</option>
              <option value="handout">Handout / Crest</option>
              <option value="map">Map / Chart</option>
            </select>
            <button
              onClick={() => deleteAsset(asset.id)}
              className="p-2 rounded-md bg-[#141820] border border-[#242a35] text-[#8b93a1] hover:text-red-400 hover:border-red-500/40"
              title="Delete Asset"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Large Image Canvas */}
        <div
          className="surface-card rounded-xl p-6 flex items-center justify-center min-h-[340px] relative overflow-hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 45%, rgba(212, 168, 83, 0.08), transparent 68%)',
          }}
        >
          <div className="gold-hairline absolute top-0 inset-x-0 opacity-70" />
          <img
            src={asset.url}
            alt={asset.name}
            style={{ opacity: previewOpacity }}
            className="max-h-[440px] max-w-full rounded-lg object-contain shadow-[0_16px_42px_rgba(0,0,0,0.65)] border border-[#d4a853]/20 transition-opacity"
          />
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Embed Syntax & Opacity */}
          <div className="surface-card rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Link in Note Code</span>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-[#9aa3b2] mb-1">
                <span>Embed Opacity</span>
                <span className="font-mono text-[#d4a853]">{Math.round(previewOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={previewOpacity}
                onChange={(e) => setPreviewOpacity(parseFloat(e.target.value))}
                className="w-full accent-[#d4a853]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1.5">
                <code className="font-mono text-[11.5px] text-[#e5be58] truncate">
                  {obsidianSnippet}
                </code>
                <button
                  onClick={() => copySnippet('obsidian')}
                  className="text-xs text-[#9aa3b2] hover:text-white flex items-center gap-1 shrink-0"
                >
                  {copiedToken === 'obsidian' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1.5">
                <code className="font-mono text-[11.5px] text-[#b8b1a3] truncate">
                  {markdownSnippet}
                </code>
                <button
                  onClick={() => copySnippet('md')}
                  className="text-xs text-[#9aa3b2] hover:text-white flex items-center gap-1 shrink-0"
                >
                  {copiedToken === 'md' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 1-Click Attach to Any Note */}
          <div className="surface-card rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Attach to Grimoire Entry</span>
            </div>

            <select
              value={targetEntityId}
              onChange={(e) => setTargetEntityId(e.target.value)}
              className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-2.5 py-2 text-xs text-[#e7e2d8]"
            >
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  [{ent.type}] {ent.title}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-2">
              <button
                disabled={!targetEntityId}
                onClick={() => {
                  attachAssetToEntity(targetEntityId, asset.id, 'cover');
                  openEntityTab(targetEntityId);
                }}
                className="py-2 px-2 rounded bg-[#1a1f29] border border-[#2a3140] hover:border-[#d4a853] text-[11px] font-medium text-[#e7e2d8]"
              >
                Set as Cover
              </button>
              <button
                disabled={!targetEntityId}
                onClick={() => {
                  attachAssetToEntity(targetEntityId, asset.id, 'background');
                  openEntityTab(targetEntityId);
                }}
                className="py-2 px-2 rounded bg-[#1a1f29] border border-[#2a3140] hover:border-[#d4a853] text-[11px] font-medium text-[#e7e2d8]"
              >
                Set as BG
              </button>
              <button
                disabled={!targetEntityId}
                onClick={() => {
                  attachAssetToEntity(targetEntityId, asset.id, 'inline', previewOpacity);
                  openEntityTab(targetEntityId);
                }}
                className="py-2 px-2 rounded btn-gold-metallic text-[11px] font-semibold"
              >
                Embed in Text
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
