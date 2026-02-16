import type { GraphNode } from '../types';

export function nodeColor(node: GraphNode): string {
  return node.color;
}

export function nodeGlowColor(node: GraphNode): string {
  if (node.type === 'module') {
    if (node.risk_level === 'critical') return 'rgba(239, 68, 68, 0.25)';
    if (node.risk_level === 'high') return 'rgba(193, 95, 60, 0.25)';
    if (node.risk_level === 'moderate') return 'rgba(234, 179, 8, 0.15)';
    return 'rgba(34, 197, 94, 0.15)';
  }
  return 'rgba(161, 161, 170, 0.2)';
}

export function depthColor(depth: string): string {
  switch (depth) {
    case 'architect': return '#d47d57';  // orange-400
    case 'deep': return '#7dd3fc';       // sky-300 — cool blue, clearly distinct
    case 'working': return '#52525b';    // zinc-600 — subtle baseline
    case 'surface': return '#3f3f46';    // zinc-700
    default: return '#52525b';
  }
}

export function depthGlowColor(depth: string): string {
  switch (depth) {
    case 'architect': return 'rgba(212, 125, 87, 0.35)';  // orange glow
    case 'deep': return 'rgba(125, 211, 252, 0.18)';       // sky glow
    default: return 'transparent';
  }
}

/** Base width multiplier per depth tier (applied on top of weight) */
export function depthWidthBonus(depth: string): number {
  switch (depth) {
    case 'architect': return 1.8;
    case 'deep': return 1.2;
    case 'working': return 0.8;
    case 'surface': return 0.5;
    default: return 0.8;
  }
}

/** Base alpha per depth tier — subtle by default, prominent on interaction */
export function depthBaseAlpha(depth: string): number {
  switch (depth) {
    case 'architect': return 0.7;
    case 'deep': return 0.5;
    case 'working': return 0.35;
    case 'surface': return 0.18;
    default: return 0.25;
  }
}

export function riskBadgeColor(risk: string): string {
  switch (risk) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'moderate': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

export function qualityBadgeColor(quality: string): string {
  switch (quality) {
    case 'mentoring': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'thorough': return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
    case 'surface': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'rubber_stamp': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

export function categoryIcon(category: string): string {
  switch (category) {
    case 'risk': return '\u26A0';
    case 'opportunity': return '\u2728';
    case 'pattern': return '\uD83D\uDD0D';
    case 'recommendation': return '\uD83D\uDCA1';
    default: return '\u2139';
  }
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'border-l-red-500';
    case 'high': return 'border-l-orange-500';
    case 'medium': return 'border-l-yellow-500';
    case 'low': return 'border-l-green-500';
    default: return 'border-l-gray-500';
  }
}
