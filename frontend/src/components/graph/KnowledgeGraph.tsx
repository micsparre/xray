import { useCallback, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphData, GraphNode } from '../../types';
import { nodeGlowColor, depthColor } from '../../lib/graph-utils';

interface Props {
  data: GraphData;
  selectedNode: GraphNode | null;
  onNodeClick: (node: GraphNode | null) => void;
  width: number;
  height: number;
}

export function KnowledgeGraph({ data, selectedNode, onNodeClick, width, height }: Props) {
  const fgRef = useRef<any>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const animStartRef = useRef<number>(0);
  const prevDataRef = useRef<GraphData | null>(null);

  // Entrance animation: grow nodes from 0 to full size over 600ms
  useEffect(() => {
    if (data !== prevDataRef.current && data.nodes.length > 0) {
      prevDataRef.current = data;
      animStartRef.current = Date.now();
      setAnimProgress(0);

      const animate = () => {
        const elapsed = Date.now() - animStartRef.current;
        const progress = Math.min(1, elapsed / 600);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimProgress(eased);
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  }, [data]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge')?.strength(-200);
      fgRef.current.d3Force('link')?.distance(100);
    }
  }, [data]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode;
      const baseSize = n.size || 5;
      const size = baseSize * animProgress;
      if (size < 0.5) return;

      const isSelected = selectedNode?.id === n.id;
      const isConnected =
        selectedNode &&
        data.links.some(
          (l) =>
            ((typeof l.source === 'string' ? l.source : l.source.id) === selectedNode.id &&
              (typeof l.target === 'string' ? l.target : l.target.id) === n.id) ||
            ((typeof l.target === 'string' ? l.target : l.target.id) === selectedNode.id &&
              (typeof l.source === 'string' ? l.source : l.source.id) === n.id)
        );

      const dimmed = selectedNode && !isSelected && !isConnected;
      const alpha = dimmed ? 0.15 : 1;

      ctx.globalAlpha = alpha;

      // Glow effect
      const glowColor = nodeGlowColor(n);
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size + 4, 0, 2 * Math.PI);
      ctx.fillStyle = glowColor;
      ctx.fill();

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, size + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label (fade in after nodes are mostly visible)
      const labelAlpha = Math.max(0, (animProgress - 0.5) * 2);
      ctx.fillStyle = dimmed
        ? `rgba(255,255,255,${0.15 * labelAlpha})`
        : `rgba(255,255,255,${0.9 * labelAlpha})`;
      ctx.font = `${Math.max(3, size * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label, node.x!, node.y! + size + 3);

      ctx.globalAlpha = 1;
    },
    [selectedNode, data.links, animProgress]
  );

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;

      if (!source.x || !target.x) return;

      const depth = link.expertise_depth || 'working';
      const isHighlighted =
        selectedNode &&
        (source.id === selectedNode.id || target.id === selectedNode.id);

      const baseAlpha = selectedNode ? (isHighlighted ? 0.8 : 0.05) : 0.3;
      ctx.globalAlpha = baseAlpha * animProgress;
      ctx.strokeStyle = isHighlighted ? depthColor(depth) : '#475569';
      ctx.lineWidth = Math.max(0.5, (link.weight || 0.1) * 3);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y!);
      ctx.lineTo(target.x, target.y!);
      ctx.stroke();

      ctx.globalAlpha = 1;
    },
    [selectedNode, animProgress]
  );

  return (
    <div className="relative w-full h-full bg-[#0f172a]">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={width}
        height={height}
        backgroundColor="#0f172a"
        nodeCanvasObject={paintNode}
        linkCanvasObject={paintLink}
        onNodeClick={(node) => onNodeClick(node as GraphNode)}
        onBackgroundClick={() => onNodeClick(null)}
        nodeId="id"
        cooldownTicks={100}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
      <GraphLegend />
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur border border-slate-700/50 rounded-lg p-3 text-xs space-y-2">
      <p className="text-slate-400 font-medium">Legend</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-slate-300">Contributor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-slate-300">Module (healthy)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-slate-300">Module (moderate risk)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-slate-300">Module (critical risk)</span>
        </div>
      </div>
      <div className="space-y-1 pt-1 border-t border-slate-700/50">
        <p className="text-slate-500">Edge = expertise depth</p>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-purple-500" />
          <span className="text-slate-400">architect</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500" />
          <span className="text-slate-400">deep</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-gray-500" />
          <span className="text-slate-400">working</span>
        </div>
      </div>
    </div>
  );
}
