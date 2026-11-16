import React, { useEffect, useMemo, useRef } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useVaultStore } from '../../store/useVaultStore';

const TYPE_COLORS: Record<string, string> = {
  Location: '#eab308',
  Character: '#38bdf8',
  Faction: '#c084fc',
  Organization: '#a78bfa',
  Session: '#fb923c',
  Campaign: '#facc15',
  Item: '#34d399',
  Bestiary: '#f87171',
  Deity: '#60a5fa',
  Region: '#4ade80',
};

export const ConnectionsGraph: React.FC<{ focusEntityId?: string | null }> = ({
  focusEntityId,
}) => {
  const { entities, entityLinks, openEntityTab } = useVaultStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods>();

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-160);
    fg.d3Force('link')?.distance(48);
  }, [entities.length, entityLinks.length]);

  const graphData = useMemo(() => {
    const validIds = new Set(entities.map((e) => e.id));
    const links = entityLinks
      .filter((l) => validIds.has(l.source_id) && validIds.has(l.target_id))
      .map((l) => ({ source: l.source_id, target: l.target_id }));

    const nodes = entities.map((e) => ({
      id: e.id,
      name: e.title,
      type: e.type,
      val: e.id === focusEntityId ? 6 : 3,
      color: e.id === focusEntityId ? '#fef08a' : TYPE_COLORS[e.type] || '#d4a853',
    }));

    return { nodes, links };
  }, [entities, entityLinks, focusEntityId]);

  return (
    <div ref={containerRef} className="w-full h-[360px] rounded-lg bg-[#040507] border border-[#141821] overflow-hidden relative">
      <ForceGraph2D
        ref={graphRef}
        width={296}
        height={358}
        graphData={graphData}
        backgroundColor="#040507"
        nodeRelSize={4}
        linkColor={() => 'rgba(182, 141, 64, 0.25)'}
        linkWidth={1.2}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleColor={() => '#b68d40'}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as {
            x?: number;
            y?: number;
            id: string;
            name: string;
            color: string;
          };
          if (n.x === undefined || n.y === undefined) return;
          const isFocus = n.id === focusEntityId;
          const radius = isFocus ? 5.5 : 3.6;

          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = n.color;
          ctx.fill();

          if (isFocus) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 2.5, 0, 2 * Math.PI, false);
            ctx.strokeStyle = 'rgba(182, 141, 64, 0.65)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }

          if (globalScale >= 0.85 || isFocus) {
            const label = n.name;
            const fontSize = Math.max(9 / globalScale, 3.2);
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isFocus ? '#d6b16a' : 'rgba(222, 216, 204, 0.72)';
            ctx.fillText(label, n.x, n.y + radius + 2);
          }
        }}
        onNodeClick={(node) => {
          const n = node as { id: string };
          if (n.id) openEntityTab(n.id);
        }}
      />
      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none text-[10px] font-mono text-[#6a7280]">
        <span>{graphData.nodes.length} nodes</span>
        <span>Click node to open</span>
        <span>{graphData.links.length} links</span>
      </div>
    </div>
  );
};
