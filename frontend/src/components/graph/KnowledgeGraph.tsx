import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceX, forceY, forceCollide } from 'd3-force';
import type { GraphData, GraphNode } from '../../types';
import { nodeGlowColor, depthColor, depthGlowColor, depthWidthBonus, depthBaseAlpha, cleanUsername } from '../../lib/graph-utils';
import { GraphSearchBar, type NodeTypeFilter, type RiskLevel } from './GraphSearchBar';

interface Props {
  data: GraphData;
  selectedNode: GraphNode | null;
  onNodeClick: (node: GraphNode | null) => void;
  width: number;
  height: number;
}

// Minimum screen-space font size in pixels — labels never shrink below this
const MIN_SCREEN_FONT = 11;
// Node size threshold: below this (in screen-space), hide label unless hovered/selected
const LABEL_VISIBILITY_THRESHOLD = 8;

const ALL_RISK_LEVELS: RiskLevel[] = ['critical', 'high', 'moderate', 'low'];

export function KnowledgeGraph({ data, selectedNode, onNodeClick, width, height }: Props) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const zoomRef = useRef(1);

  // --- Search state ---
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState<Set<NodeTypeFilter>>(() => new Set(['contributor', 'module']));
  const [riskFilters, setRiskFilters] = useState<Set<RiskLevel>>(() => new Set(ALL_RISK_LEVELS));

  // Debounce search query (150ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Compute match set — O(1) lookups in paint callbacks
  const matchSetRef = useRef<Set<string>>(new Set());
  const searchActive = debouncedQuery.length > 0 || !typeFilters.has('contributor') || !typeFilters.has('module') || riskFilters.size < ALL_RISK_LEVELS.length;

  const matchCount = useMemo(() => {
    const set = new Set<string>();
    const q = debouncedQuery.toLowerCase();

    for (const node of data.nodes) {
      // Type filter
      if (!typeFilters.has(node.type)) continue;

      // Risk filter (modules only)
      if (node.type === 'module' && riskFilters.size < ALL_RISK_LEVELS.length) {
        if (!riskFilters.has(node.risk_level as RiskLevel)) continue;
      }

      // Text match (empty query matches all that pass filters)
      if (q) {
        const labelMatch = node.label.toLowerCase().includes(q);
        const idMatch = node.id.toLowerCase().includes(q);
        const expertiseMatch = node.expertise_areas?.some(a => a.toLowerCase().includes(q));
        if (!labelMatch && !idMatch && !expertiseMatch) continue;
      }

      set.add(node.id);
    }

    matchSetRef.current = set;
    return set.size;
  }, [data.nodes, debouncedQuery, typeFilters, riskFilters]);

  const ALL_TYPES: NodeTypeFilter[] = ['contributor', 'module'];
  const toggleType = useCallback((t: NodeTypeFilter) => {
    setTypeFilters(prev => {
      // If this is the only active filter, reset to show all
      if (prev.has(t) && prev.size === 1) {
        return new Set(ALL_TYPES);
      }
      // Otherwise, isolate to just this type
      return new Set([t]);
    });
  }, []);

  const toggleRisk = useCallback((r: RiskLevel) => {
    setRiskFilters(prev => {
      // If this is the only active filter, reset to show all
      if (prev.has(r) && prev.size === 1) {
        return new Set(ALL_RISK_LEVELS);
      }
      // Otherwise, isolate to just this risk level
      return new Set([r]);
    });
  }, []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F → focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        // Clear search first, then deselect node
        if (searchQuery) {
          setSearchQuery('');
          setDebouncedQuery('');
          return;
        }
        if (selectedNode) {
          onNodeClick(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, selectedNode, onNodeClick]);

  const animStartRef = useRef<number>(0);
  const prevDataRef = useRef<GraphData | null>(null);

  // Entrance animation: grow nodes from 0 to full size over 600ms
  // Also reset zoom to fit all nodes when data changes (e.g. switching analyses)
  useEffect(() => {
    if (data !== prevDataRef.current && data.nodes.length > 0) {
      prevDataRef.current = data;
      animStartRef.current = Date.now();
      setAnimProgress(0);

      const animate = () => {
        const elapsed = Date.now() - animStartRef.current;
        const progress = Math.min(1, elapsed / 600);
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimProgress(eased);
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);

      // Instantly reset view to neutral state so we don't stay zoomed
      // into the old graph's region, then fit properly once forces settle
      fgRef.current?.centerAt(0, 0, 0);
      fgRef.current?.zoom(1, 0);
      const zoomTimer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 700);
      return () => clearTimeout(zoomTimer);
    }
  }, [data]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    // --- Detect connected components ---
    const adj = new Map<string, Set<string>>();
    for (const n of data.nodes) adj.set(n.id, new Set());
    for (const l of data.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      adj.get(s)?.add(t);
      adj.get(t)?.add(s);
    }
    const clusterOf = new Map<string, number>();
    let clusterId = 0;
    for (const nodeId of adj.keys()) {
      if (clusterOf.has(nodeId)) continue;
      const queue = [nodeId];
      while (queue.length) {
        const cur = queue.pop()!;
        if (clusterOf.has(cur)) continue;
        clusterOf.set(cur, clusterId);
        for (const nb of adj.get(cur) || []) {
          if (!clusterOf.has(nb)) queue.push(nb);
        }
      }
      clusterId++;
    }
    const numClusters = clusterId;

    // Assign each cluster a target position on a circle around the center
    const clusterTargets = new Map<number, { x: number; y: number }>();
    const spreadRadius = Math.max(60, numClusters * 25);
    for (let i = 0; i < numClusters; i++) {
      const angle = (2 * Math.PI * i) / numClusters - Math.PI / 2;
      clusterTargets.set(i, {
        x: numClusters <= 1 ? 0 : Math.cos(angle) * spreadRadius,
        y: numClusters <= 1 ? 0 : Math.sin(angle) * spreadRadius,
      });
    }

    // Tag each node with its cluster target
    for (const node of data.nodes) {
      const cid = clusterOf.get(node.id) ?? 0;
      const target = clusterTargets.get(cid) ?? { x: 0, y: 0 };
      (node as any)._clusterX = target.x;
      (node as any)._clusterY = target.y;
    }

    // --- Configure forces — scale with graph size for readability ---
    const n = data.nodes.length;
    const chargeStrength = -(Math.max(160, 100 + n * 4));
    fg.d3Force('charge')?.strength(chargeStrength).distanceMin(30);
    fg.d3Force('link')?.distance(n > 60 ? 160 : 120).strength(0.5);

    // Pull nodes toward their cluster's target position
    const clusterGravity = numClusters <= 1 ? 0.03 : 0.06;
    fg.d3Force('x', forceX((node: any) => node._clusterX ?? 0).strength(clusterGravity));
    fg.d3Force('y', forceY((node: any) => node._clusterY ?? 0).strength(clusterGravity));

    // Collision force for individual node overlap
    fg.d3Force('collide', forceCollide((node: any) => {
      return (node.size || 5) + 22;
    }).strength(1).iterations(3));

    fg.d3ReheatSimulation();
  }, [data]);

  const handleZoom = useCallback((transform: { k: number }) => {
    zoomRef.current = transform.k;
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  // Bypass the library's click/drag detection entirely.
  // We listen for mousedown→mouseup on the canvas and do our own hit testing.
  // This fires reliably even when the library interprets a click as a micro-drag.
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const dataNodesRef = useRef(data.nodes);
  dataNodesRef.current = data.nodes;

  useEffect(() => {
    const container = containerRef.current;
    const fg = fgRef.current;
    if (!container || !fg) return;

    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    let downX = 0;
    let downY = 0;
    let downTime = 0;

    const onDown = (e: PointerEvent) => {
      downX = e.offsetX;
      downY = e.offsetY;
      downTime = Date.now();
    };

    const onUp = (e: PointerEvent) => {
      // Only treat as click if pointer barely moved and was quick
      const dx = e.offsetX - downX;
      const dy = e.offsetY - downY;
      const dt = Date.now() - downTime;
      if (dx * dx + dy * dy > 25 || dt > 500) return; // moved >5px or held >500ms → drag

      const coords = fg.screen2GraphCoords(e.offsetX, e.offsetY);
      let closest: GraphNode | null = null;
      let closestDist = Infinity;

      for (const node of dataNodesRef.current) {
        const n = node as GraphNode;
        const ndx = (n.x ?? 0) - coords.x;
        const ndy = (n.y ?? 0) - coords.y;
        const dist = Math.sqrt(ndx * ndx + ndy * ndy);
        const hitRadius = Math.max((n.size || 5) * 1.5 + 6, 14);
        if (dist < hitRadius && dist < closestDist) {
          closest = n;
          closestDist = dist;
        }
      }

      onNodeClickRef.current(closest);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [data]);

  // Pre-compute connected sets for selected and hovered nodes
  const connectedSetRef = useRef<Set<string>>(new Set());
  const hoverConnectedSetRef = useRef<Set<string>>(new Set());

  const buildConnectedSet = useCallback((nodeId: string | undefined) => {
    const set = new Set<string>();
    if (!nodeId) return set;
    set.add(nodeId);
    for (const l of data.links) {
      const srcId = typeof l.source === 'string' ? l.source : l.source.id;
      const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
      if (srcId === nodeId) set.add(tgtId);
      if (tgtId === nodeId) set.add(srcId);
    }
    return set;
  }, [data.links]);

  useEffect(() => {
    connectedSetRef.current = buildConnectedSet(selectedNode?.id);
  }, [selectedNode, buildConnectedSet]);

  useEffect(() => {
    hoverConnectedSetRef.current = buildConnectedSet(hoveredNode?.id);
  }, [hoveredNode, buildConnectedSet]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode;
      const baseSize = n.size || 5;
      const size = baseSize * animProgress;
      if (size < 0.5) return;

      const zoom = zoomRef.current;
      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const isConnected = selectedNode ? connectedSetRef.current.has(n.id) : false;
      const isHoverConnected = hoveredNode ? hoverConnectedSetRef.current.has(n.id) : false;

      // Search match state
      const isSearchMatch = searchActive ? matchSetRef.current.has(n.id) : false;

      // Determine alpha — hover and selection both dim unrelated nodes
      const isFocused = isSelected || isHovered;
      const isInNeighborhood = isConnected || isHoverConnected;
      let alpha: number;
      if (searchActive && selectedNode) {
        if (isSelected || isConnected) alpha = 1;
        else if (isSearchMatch) alpha = 0.5;
        else alpha = 0.05;
      } else if (searchActive) {
        alpha = isSearchMatch ? 1 : 0.08;
      } else if (selectedNode && hoveredNode) {
        // Both — prioritize hover neighborhood within selected context
        if (isFocused || isInNeighborhood) alpha = 1;
        else alpha = 0.08;
      } else if (selectedNode) {
        alpha = (isSelected || isConnected) ? 1 : 0.12;
      } else if (hoveredNode) {
        // Hover only — dim unconnected
        if (isHovered) alpha = 1;
        else if (isHoverConnected) alpha = 0.85;
        else alpha = 0.15;
      } else {
        alpha = 1;
      }

      // Hover enlargement
      const hoverScale = isHovered ? 1.2 : 1;
      const drawSize = size * hoverScale;

      ctx.globalAlpha = alpha;

      // Soft shadow — subtle depth instead of heavy glow
      if (isSelected || isHovered) {
        const shadowRadius = drawSize + drawSize * 0.6;
        const grad = ctx.createRadialGradient(node.x!, node.y!, drawSize * 0.6, node.x!, node.y!, shadowRadius);
        grad.addColorStop(0, nodeGlowColor(n));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, shadowRadius, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Main shape — rounded square for modules, circle for contributors
      ctx.beginPath();
      if (n.type === 'module') {
        const r = drawSize * 0.3;
        ctx.roundRect(node.x! - drawSize, node.y! - drawSize, drawSize * 2, drawSize * 2, r);
      } else {
        ctx.arc(node.x!, node.y!, drawSize, 0, 2 * Math.PI);
      }
      ctx.fillStyle = n.color;
      ctx.fill();

      // --- Label ---
      const labelAlpha = Math.max(0, (animProgress - 0.5) * 2);
      if (labelAlpha <= 0) {
        ctx.globalAlpha = 1;
        return;
      }

      // Determine if label should be shown at this zoom level
      const screenSize = size * zoom;
      const forceShowLabel = isSelected || isHovered || isConnected || isHoverConnected || (searchActive && isSearchMatch);
      const showLabel = forceShowLabel || screenSize > LABEL_VISIBILITY_THRESHOLD;

      if (showLabel) {
        // Zoom-adaptive font: ensure minimum screen-space readability
        const idealGraphFont = size * 0.5;
        const minGraphFont = MIN_SCREEN_FONT / zoom;
        const fontSize = Math.max(minGraphFont, idealGraphFont);

        const dimmed = alpha < 0.5;
        const prominent = isHovered || isSelected;
        const textAlpha = dimmed ? 0.15 * labelAlpha : prominent ? 1 * labelAlpha : 0.7 * labelAlpha;

        ctx.font = `${prominent ? 600 : 400} ${fontSize}px "SF Pro Display", -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const labelText = n.type === 'contributor' ? cleanUsername(n.label) : n.label;
        const labelY = node.y! + drawSize + 4 / zoom;

        // Text shadow for readability against dark background
        ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * labelAlpha})`;
        const shadowOff = 1 / zoom;
        ctx.fillText(labelText, node.x! + shadowOff, labelY + shadowOff);

        // Pill background only for hovered/selected
        if (prominent) {
          const textMetrics = ctx.measureText(labelText);
          const textWidth = textMetrics.width;
          const padX = 5 / zoom;
          const padY = 2.5 / zoom;
          const pillRadius = 3 / zoom;
          const pillX = node.x! - textWidth / 2 - padX;
          const pillY2 = labelY - padY;
          const pillW = textWidth + padX * 2;
          const pillH = fontSize + padY * 2;

          ctx.fillStyle = `rgba(9, 9, 11, ${0.85 * labelAlpha})`;
          ctx.beginPath();
          ctx.moveTo(pillX + pillRadius, pillY2);
          ctx.lineTo(pillX + pillW - pillRadius, pillY2);
          ctx.quadraticCurveTo(pillX + pillW, pillY2, pillX + pillW, pillY2 + pillRadius);
          ctx.lineTo(pillX + pillW, pillY2 + pillH - pillRadius);
          ctx.quadraticCurveTo(pillX + pillW, pillY2 + pillH, pillX + pillW - pillRadius, pillY2 + pillH);
          ctx.lineTo(pillX + pillRadius, pillY2 + pillH);
          ctx.quadraticCurveTo(pillX, pillY2 + pillH, pillX, pillY2 + pillH - pillRadius);
          ctx.lineTo(pillX, pillY2 + pillRadius);
          ctx.quadraticCurveTo(pillX, pillY2, pillX + pillRadius, pillY2);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.12 * labelAlpha})`;
          ctx.lineWidth = 0.5 / zoom;
          ctx.stroke();
        }

        // Text
        ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
        ctx.fillText(labelText, node.x!, labelY);
      }

      ctx.globalAlpha = 1;
    },
    [selectedNode, hoveredNode, animProgress, searchActive, matchCount]
  );

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;

      if (!source.x || !target.x) return;

      const depth: string = link.expertise_depth || 'working';
      const isHighlighted =
        selectedNode &&
        (source.id === selectedNode.id || target.id === selectedNode.id);

      // Search match: at least one endpoint must match
      const matchSet = matchSetRef.current;
      const eitherEndpointMatches = matchSet.has(source.id) || matchSet.has(target.id);
      const bothEndpointsMatch = matchSet.has(source.id) && matchSet.has(target.id);

      // --- Alpha: depth-aware base, boosted when highlighted, dimmed when unrelated ---
      const tierAlpha = depthBaseAlpha(depth);
      const isHoverHighlight =
        hoveredNode &&
        (source.id === hoveredNode.id || target.id === hoveredNode.id);
      let alpha: number;

      if (searchActive && selectedNode) {
        if (isHighlighted) alpha = Math.max(tierAlpha, 0.85);
        else if (bothEndpointsMatch) alpha = tierAlpha * 0.6;
        else alpha = 0.03;
      } else if (searchActive) {
        alpha = bothEndpointsMatch ? tierAlpha : eitherEndpointMatches ? tierAlpha * 0.3 : 0.03;
      } else if (selectedNode && hoveredNode) {
        // Both — hover edges within selection context
        if (isHighlighted || isHoverHighlight) alpha = Math.max(tierAlpha, 0.85);
        else alpha = 0.03;
      } else if (selectedNode) {
        alpha = isHighlighted ? Math.max(tierAlpha, 0.85) : 0.04;
      } else if (hoveredNode) {
        // Hover only — dim unconnected edges
        alpha = isHoverHighlight ? Math.max(tierAlpha, 0.7) : 0.03;
      } else {
        alpha = tierAlpha;
      }

      // --- Width: weight × depth bonus, boosted on highlight ---
      const weightWidth = Math.max(0.5, (link.weight || 0.1) * 2.5);
      const bonus = depthWidthBonus(depth);
      const active = isHighlighted || isHoverHighlight;
      const highlightBoost = active ? 1.6 : 1;
      const lineWidth = weightWidth * bonus * highlightBoost;

      // --- Color ---
      const color = depthColor(depth);
      const glowColor = depthGlowColor(depth);

      ctx.globalAlpha = alpha * animProgress;
      ctx.lineCap = 'round';

      // Compute curve control point — offset perpendicular to the edge midpoint
      const mx = (source.x! + target.x!) / 2;
      const my = (source.y! + target.y!) / 2;
      const dx = target.x! - source.x!;
      const dy = target.y! - source.y!;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Subtle curve: 8% of edge length, alternating direction based on link index
      const curvature = len * 0.08;
      const nx = -dy / len;
      const ny = dx / len;
      const cpx = mx + nx * curvature;
      const cpy = my + ny * curvature;

      // Glow pass — only on highlight
      if (active && glowColor !== 'transparent') {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y!);
        ctx.quadraticCurveTo(cpx, cpy, target.x!, target.y!);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = lineWidth + (depth === 'architect' ? 4 : 2);
        ctx.stroke();
      }

      // Main stroke
      ctx.beginPath();
      ctx.moveTo(source.x, source.y!);
      ctx.quadraticCurveTo(cpx, cpy, target.x!, target.y!);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      ctx.globalAlpha = 1;
    },
    [selectedNode, hoveredNode, animProgress, searchActive, matchCount]
  );

  // Generous pointer area so small nodes are easy to click
  const nodePointerArea = useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode;
      const size = (n.size || 5) * animProgress;
      // Hit area is at least 14px in graph-space, plus generous padding on larger nodes
      const hitRadius = Math.max(size * 1.5 + 6, 14);
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, hitRadius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [animProgress]
  );

  // Pre-compute layout before first render so users never see the clumped state
  const warmupTicks = useMemo(() => Math.max(100, data.nodes.length), [data.nodes.length]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#09090b]">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={width}
        height={height}
        backgroundColor="#09090b"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={nodePointerArea}
        linkCanvasObject={paintLink}
        onNodeHover={handleNodeHover}
        onZoom={handleZoom}
        nodeId="id"
        warmupTicks={warmupTicks}
        cooldownTicks={100}
        autoPauseRedraw={false}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
      <GraphSearchBar
        ref={searchInputRef}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        matchCount={matchCount}
        totalCount={data.nodes.length}
        typeFilters={typeFilters}
        onToggleType={toggleType}
        riskFilters={riskFilters}
        onToggleRisk={toggleRisk}
      />
      <GraphLegend />
      {/* Bottom-right controls — shift left when detail panel is open */}
      <div className={`absolute bottom-4 flex items-center gap-3 pointer-events-none select-none transition-[right] duration-300 ${selectedNode ? 'right-[336px]' : 'right-4'}`}>
        <span className="text-[10px] text-zinc-600">
          Scroll to zoom &middot; Drag to pan
        </span>
        <button
          onClick={() => fgRef.current?.zoomToFit(400, 60)}
          className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800/80 backdrop-blur border border-zinc-700/40 text-zinc-400 hover:text-white hover:bg-zinc-700/80 transition-colors cursor-pointer"
          title="Fit to view"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 5.5V3a1 1 0 011-1h2.5M10.5 2H13a1 1 0 011 1v2.5M14 10.5V13a1 1 0 01-1 1h-2.5M5.5 14H3a1 1 0 01-1-1v-2.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="absolute bottom-4 left-4 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/40 rounded-xl p-3.5 text-xs space-y-2.5 shadow-2xl">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Legend</p>
      <div className="space-y-1.5">
        <LegendDot color="bg-blue-500" label="Contributor" />
        <LegendSquare color="bg-green-500" label="Module (healthy)" />
        <LegendSquare color="bg-yellow-500" label="Module (moderate risk)" />
        <LegendSquare color="bg-red-500" label="Module (critical risk)" />
      </div>
      <div className="space-y-1.5 pt-2 border-t border-zinc-700/40">
        <p className="text-[10px] text-zinc-600">Edge = expertise depth</p>
        <LegendEdge color="#d47d57" glow="rgba(212,125,87,0.35)" thickness={3} label="architect" />
        <LegendEdge color="#7dd3fc" glow="rgba(125,211,252,0.18)" thickness={2} label="deep" />
        <LegendEdge color="#52525b" thickness={1.5} label="working" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${color} ring-1 ring-white/10`} />
      <span className="text-zinc-400">{label}</span>
    </div>
  );
}

function LegendSquare({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-[3px] ${color} ring-1 ring-white/10`} />
      <span className="text-zinc-400">{label}</span>
    </div>
  );
}

function LegendEdge({ color, glow, thickness, label }: { color: string; glow?: string; thickness: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-5 flex items-center justify-center" style={{ height: Math.max(8, thickness + 6) }}>
        {glow && (
          <div
            className="absolute rounded-full"
            style={{ width: '100%', height: thickness + 4, backgroundColor: glow }}
          />
        )}
        <div
          className="absolute rounded-full"
          style={{ width: '100%', height: thickness, backgroundColor: color }}
        />
      </div>
      <span className="text-zinc-500">{label}</span>
    </div>
  );
}
