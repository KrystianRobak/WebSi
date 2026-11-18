import React from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  MapPin,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { getEntityAppearance, getVisibleMetadataEntries } from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityIcon } from '../common/EntityIcon';

export const PinEntitySlideOver: React.FC = () => {
  const {
    mapPins,
    entities,
    selectedPinId,
    setSelectedPinId,
    isEffectiveGm,
    openEntityTab,
    openEntityByTitle,
    toggleFavorite,
    deleteMapPin,
    linkPinToEntity,
  } = useVaultStore();

  const effectiveGm = isEffectiveGm();
  const rightInsetPx = 14;
  const pin = mapPins.find((p) => p.id === selectedPinId);
  if (!pin) return null;
  if (!effectiveGm && pin.is_gm_only) return null;

  const entity = entities.find((e) => e.id === pin.entity_id);

  // Render markdown lore with clickable [[WikiLinks]]
  const renderLoreWithWikiLinks = (text: string) => {
    const lines = text
      .split('\n')
      .filter((l) => !l.trim().startsWith('# '));

    const renderInline = (lineText: string) => {
      const parts = lineText.split(/(\[\[[^\]]+\]\])/g);
      return parts.map((part, pIdx) => {
        const match = part.match(/^\[\[([^\]]+)\]\]$/);
        if (match) {
          const [target, alias] = match[1].split('|').map((s) => s.trim());
          return (
            <button
              key={pIdx}
              onClick={() => openEntityByTitle(target)}
              className="wikilink-pill mx-0.5 inline"
            >
              {alias || target}
            </button>
          );
        }
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <React.Fragment key={pIdx}>
            {boldParts.map((bp, bpIdx) =>
              bp.startsWith('**') && bp.endsWith('**') ? (
                <strong key={bpIdx} className="text-[#f3ead8] font-semibold">
                  {bp.slice(2, -2)}
                </strong>
              ) : (
                bp
              )
            )}
          </React.Fragment>
        );
      });
    };

    return lines.map((rawLine, idx) => {
      const line = rawLine.trim();
      if (!line) return <div key={idx} className="h-1.5" />;
      if (line.startsWith('## ')) {
        return (
          <h4
            key={idx}
            className="font-serif text-[13px] font-semibold text-[#e5be58] mt-2.5 mb-1 tracking-wide"
          >
            {line.replace(/^##\s+/, '')}
          </h4>
        );
      }
      if (line.startsWith('![')) {
        const imgM = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgM) {
          return (
            <img
              key={idx}
              src={imgM[2]}
              alt={imgM[1]}
              className="w-full max-h-44 object-contain rounded-md border border-[#d4a853]/30 my-2"
            />
          );
        }
      }
      if (line.startsWith('- ')) {
        return (
          <div key={idx} className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-[#c9c3b8] pl-1 mb-1">
            <span className="text-[#d4a853] mt-0.5">•</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        );
      }
      return (
        <p key={idx} className="text-[12.5px] leading-relaxed text-[#c9c3b8] mb-1.5">
          {renderInline(line)}
        </p>
      );
    });
  };

  const appearance = getEntityAppearance(entity?.metadata);
  const visibleMetadata = getVisibleMetadataEntries(entity?.metadata);

  return (
    <div
      style={{ right: rightInsetPx }}
      className="absolute top-14 bottom-16 w-[370px] max-w-[calc(100%-24px)] z-30 flex flex-col rounded-lg dark-glass shadow-glass overflow-hidden animate-in fade-in slide-in-from-right-4 duration-150"
    >
      {/* Header Art */}
      <div className="relative h-48 shrink-0 bg-[#0b0d10] border-b border-[#242a35] overflow-hidden">
        {entity?.cover_image_url ? (
          <img
            src={entity.cover_image_url}
            alt={pin.label}
            style={{ opacity: appearance.coverOpacity }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1b202b] via-[#11141a] to-[#0b0d10]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0e1117] via-[#0e1117]/65 to-transparent" />

        {/* Top-right controls */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {entity && (
            <button
              onClick={() => toggleFavorite(entity.id)}
              title="Toggle Favorite"
              className="p-1.5 rounded-md bg-[#0b0d10]/75 border border-[#272e3a] text-[#d4a853] hover:bg-[#171b22]"
            >
              <Star className={`w-3.5 h-3.5 ${entity.is_favorite ? 'fill-[#d4a853]' : ''}`} />
            </button>
          )}
          <button
            onClick={() => deleteMapPin(pin.id)}
            title="Remove Pin from Map"
            className="p-1.5 rounded-md bg-[#0b0d10]/75 border border-[#272e3a] text-[#9aa3b2] hover:text-red-400 hover:border-red-500/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSelectedPinId(null)}
            title="Close Card"
            className="p-1.5 rounded-md bg-[#0b0d10]/75 border border-[#272e3a] text-[#c7c2b8] hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Title & Badge */}
        <div className="absolute bottom-2.5 left-3.5 right-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#d4a853]/20 text-[#f0cf85] border border-[#d4a853]/40">
              <EntityIcon type={entity?.type || pin.icon_type} className="w-3 h-3" />
              {entity?.type || pin.icon_type}
            </span>
            {pin.is_gm_only && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-950/80 text-red-300 border border-red-500/40">
                <ShieldAlert className="w-3 h-3" />
                GM Pin
              </span>
            )}
          </div>
          <h3 className="font-serif text-lg font-semibold text-[#f5efe2] leading-tight truncate">
            {entity?.title || pin.label}
          </h3>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Coordinates */}
        <div className="flex items-center justify-between text-[11px] font-mono text-[#8b93a1] bg-[#0b0d10]/70 px-2.5 py-1.5 rounded border border-[#1d222b]">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-[#d4a853]" />
            <span>3D Coords</span>
          </span>
          <span>
            X:{pin.x.toFixed(1)} &nbsp; Y:{pin.y.toFixed(1)} &nbsp; Z:{pin.z.toFixed(1)}
          </span>
        </div>

        {entity ? (
          <>
            {/* Summary */}
            <p className="text-[12.5px] text-[#ded8cc] leading-relaxed border-l-2 border-[#d4a853]/60 pl-2.5">
              {entity.summary}
            </p>

            {/* Structured Frontmatter Attributes */}
            {visibleMetadata.length > 0 && (
              <div className="rounded-md bg-[#0b0d10]/75 border border-[#1d222b] divide-y divide-[#181d25]">
                {visibleMetadata.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-2.5 py-1.5 text-[11.5px]">
                    <span className="text-[#8b93a1]">{k}</span>
                    <span className="text-[#ebe5d9] font-medium text-right max-w-[190px] truncate">
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Lore Excerpt with [[WikiLinks]] */}
            <div>{renderLoreWithWikiLinks(entity.content)}</div>

            {/* GM SECRET Block (Visible ONLY when effective GM Mode is ON) */}
            {effectiveGm && entity.gm_secrets && (
              <div className="rounded-md bg-[#280e13]/90 border border-red-500/45 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>[GM SECRET]</span>
                </div>
                <p className="text-[12px] text-red-100/90 leading-relaxed">{entity.gm_secrets}</p>
              </div>
            )}
          </>
        ) : (
          <div className="p-3 rounded-md bg-[#12151a] border border-[#242a35] space-y-2.5">
            <p className="text-xs text-[#9aa3b2]">
              This pin is not yet bound to a vault entry. Link it to an existing note:
            </p>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) linkPinToEntity(pin.id, e.target.value);
              }}
              className="w-full bg-[#0b0d10] border border-[#272e3a] rounded px-2.5 py-1.5 text-xs text-[#e7e2d8]"
            >
              <option value="" disabled>
                Select an entry to link...
              </option>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  [{ent.type}] {ent.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      {entity && (
        <div className="p-3 border-t border-[#1d222b] bg-[#0c0f14] flex items-center gap-2">
          <button
            onClick={() => openEntityTab(entity.id)}
            className="flex-1 h-8 rounded-md btn-gold-metallic flex items-center justify-center gap-1.5 text-xs font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Full Note</span>
          </button>
          <button
            onClick={() => openEntityTab(entity.id, true)}
            title="Open in Split Pane"
            className="h-8 px-2.5 rounded-md bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-xs text-[#d4a853] flex items-center gap-1"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
        </div>
      )}
    </div>
  );
};
