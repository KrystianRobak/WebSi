import React from 'react';
import { formatEntityTypeLabel, getVisibleMetadataEntries } from '../../lib/wikilinks';
import type { Entity } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';

export const WikiLinkHoverCard: React.FC<{
  entity: Entity;
  x: number;
  y: number;
}> = ({ entity, x, y }) => {
  const safeLeft =
    typeof window !== 'undefined' ? Math.max(12, Math.min(x, window.innerWidth - 316)) : x;
  const safeTop =
    typeof window !== 'undefined' ? Math.max(12, Math.min(y, window.innerHeight - 250)) : y;
  const topMeta = getVisibleMetadataEntries(entity.metadata).slice(0, 2);

  return (
    <div
      style={{
        position: 'fixed',
        left: safeLeft,
        top: safeTop,
      }}
      className="z-50 w-[300px] rounded-xl dark-glass shadow-glass overflow-hidden pointer-events-none border border-[#d4a853]/35"
    >
      {entity.cover_image_url && (
        <div className="h-24 w-full overflow-hidden border-b border-[#19202d] relative">
          <img
            src={entity.cover_image_url}
            alt={entity.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090c12]/90 via-transparent to-transparent" />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#d4a853]">
            <EntityIcon type={entity.type} className="w-3 h-3" />
            <span>{formatEntityTypeLabel(entity.type)}</span>
          </span>
          {entity.tags.length > 0 && (
            <span className="font-mono text-[9.5px] text-[#7c8596] truncate max-w-[140px]">
              #{entity.tags[0]}
            </span>
          )}
        </div>
        <div className="font-serif text-[14.5px] font-semibold text-[#f3ead8] leading-snug">
          {entity.title}
        </div>
        {entity.summary && (
          <p className="text-[11.5px] text-[#b4becd] leading-snug line-clamp-3">
            {entity.summary}
          </p>
        )}
        {topMeta.length > 0 && (
          <div className="pt-1.5 border-t border-[#171d29] flex flex-wrap gap-1.5">
            {topMeta.map(([k, v]) => (
              <span
                key={k}
                className="px-1.5 py-0.5 rounded bg-[#07090e] border border-[#1a212f] text-[10px] text-[#c8c1b4]"
              >
                <span className="text-[#788294]">{k}:</span> {String(v)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
