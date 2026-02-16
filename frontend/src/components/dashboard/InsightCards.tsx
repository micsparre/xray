import React, { useMemo, useState } from 'react';
import type { PatternDetectionResult, InsightCard } from '../../types';

/* ─── constants ────────────────────────────────────────── */

const SEVERITY_META: Record<string, { color: string; label: string; order: number }> = {
  critical: { color: '#ef4444', label: 'Critical', order: 0 },
  high:     { color: '#d47d57', label: 'High',     order: 1 },
  medium:   { color: '#eab308', label: 'Medium',   order: 2 },
  low:      { color: '#22c55e', label: 'Low',      order: 3 },
};

const CATEGORY_META: Record<string, { color: string; label: string }> = {
  risk:           { color: '#ef4444', label: 'Risk' },
  opportunity:    { color: '#22c55e', label: 'Opportunity' },
  pattern:        { color: '#3b82f6', label: 'Pattern' },
  recommendation: { color: '#eab308', label: 'Recommendation' },
};

/* ─── SVG icons (inline, no emoji) ─────────────────────── */

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const color = CATEGORY_META[category]?.color ?? '#71717a';
  const cn = className ?? 'w-3.5 h-3.5';

  switch (category) {
    case 'risk':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'opportunity':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case 'pattern':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case 'recommendation':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="9" y1="18" x2="15" y2="18" />
          <line x1="10" y1="22" x2="14" y2="22" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" />
        </svg>
      );
    default:
      return null;
  }
}

/* ─── main component ───────────────────────────────────── */

interface Props {
  patternResult: PatternDetectionResult;
  repoUrl?: string;
}

export function InsightCards({ patternResult, repoUrl }: Props) {
  const [filter, setFilter] = useState<string>('all');

  // Severity counts for stat bar
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of patternResult.insights) {
      counts[i.severity] = (counts[i.severity] || 0) + 1;
    }
    return counts;
  }, [patternResult.insights]);

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of patternResult.insights) {
      counts[i.category] = (counts[i.category] || 0) + 1;
    }
    return counts;
  }, [patternResult.insights]);

  const filtered = useMemo(() => {
    const base = filter === 'all'
      ? patternResult.insights
      : patternResult.insights.filter((i) => i.category === filter);
    return [...base].sort(
      (a, b) => (SEVERITY_META[a.severity]?.order ?? 9) - (SEVERITY_META[b.severity]?.order ?? 9),
    );
  }, [patternResult.insights, filter]);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Severity stat bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
          const meta = SEVERITY_META[sev];
          const count = severityCounts[sev] || 0;
          return (
            <div
              key={sev}
              className="relative overflow-hidden rounded-xl border border-white/[0.06] p-4"
              style={{ background: `linear-gradient(135deg, ${meta.color}15 0%, ${meta.color}04 50%, transparent 100%)` }}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: meta.color, opacity: 0.7 }} />
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">{meta.label}</div>
              <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: count > 0 ? meta.color : '#3f3f46' }}>
                {count}
              </div>
              <div className="text-[10px] text-zinc-600 mt-1.5">
                {count === 1 ? 'insight' : 'insights'}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Executive Summary ── */}
      {patternResult.executive_summary && (
        <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-blue-500/70" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Executive Summary</h3>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {linkifyPRs(stripEmails(patternResult.executive_summary), repoUrl)}
          </p>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="flex gap-1.5">
          {(['all', 'risk', 'opportunity', 'pattern', 'recommendation'] as const).map((cat) => {
            const isActive = filter === cat;
            const catMeta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
            const count = cat === 'all'
              ? patternResult.insights.length
              : cat === 'recommendation'
                ? patternResult.recommendations.length
                : (categoryCounts[cat] || 0);
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`text-xs h-7 px-2.5 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white/[0.08] text-zinc-200 border border-white/[0.10]'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {cat !== 'all' && <CategoryIcon category={cat} className="w-3 h-3" />}
                {cat === 'all' ? 'All' : catMeta?.label ?? cat}
                <span className={`text-xs tabular-nums opacity-60 ${isActive ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-zinc-600">sorted by severity</span>
      </div>

      {/* ── Insight cards grid ── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((insight, i) => (
            <InsightCardItem key={`${insight.category}-${insight.title}-${i}`} insight={insight} repoUrl={repoUrl} />
          ))}
        </div>
      )}

      {/* ── Recommendations ── */}
      {(filter === 'all' || filter === 'recommendation') && patternResult.recommendations.length > 0 && (
        <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CategoryIcon category="recommendation" className="w-3.5 h-3.5" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Recommendations</h3>
            <span className="text-[10px] text-zinc-600 ml-auto">{patternResult.recommendations.length} items</span>
          </div>
          <div className="space-y-1">
            {patternResult.recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex gap-3 items-baseline text-xs text-zinc-300 rounded-lg px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <span
                  className="text-[10px] font-semibold tabular-nums shrink-0"
                  style={{ color: CATEGORY_META.recommendation.color }}
                >
                  {i + 1}.
                </span>
                <span className="leading-relaxed">{linkifyPRs(stripEmails(rec), repoUrl)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────── */

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;

/** Strip email addresses from a string (removes surrounding parens/plus if left empty) */
function stripEmails(text: string): string {
  return text
    .replace(EMAIL_RE, '')
    .replace(/\(\s*\+?\s*\)/g, '')        // empty "(  +  )" leftovers
    .replace(/\(\s*\+\s*/g, '(')           // leading "+ " inside parens
    .replace(/\s*\+\s*\)/g, ')')           // trailing " +" inside parens
    .replace(/\(\s*\)/g, '')               // empty parens
    .replace(/\s{2,}/g, ' ')              // collapse whitespace
    .trim();
}

/** Return true if string looks like an email */
function isEmail(s: string): boolean {
  return /^[\w.+-]+@[\w.-]+\.\w+$/.test(s);
}

/** Turn PR references like PR#123 or #123 into clickable GitHub links */
const PR_REF_RE = /(?:PR)?#(\d{2,})/g;

function linkifyPRs(text: string, repoUrl?: string): React.ReactNode {
  if (!repoUrl) return text;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(PR_REF_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const prNum = match[1];
    const baseUrl = repoUrl.replace(/\/$/, '');
    parts.push(
      <a
        key={`pr-${match.index}`}
        href={`${baseUrl}/pull/${prNum}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-300/50 transition-colors"
      >
        {match[0]}
      </a>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/* ─── Insight card ─────────────────────────────────────── */

function InsightCardItem({ insight, repoUrl }: { insight: InsightCard; repoUrl?: string }) {
  const sevMeta = SEVERITY_META[insight.severity] ?? { color: '#71717a', label: insight.severity, order: 9 };
  const catMeta = CATEGORY_META[insight.category] ?? { color: '#71717a', label: insight.category };
  const isCritical = insight.severity === 'critical';
  const isHigh = insight.severity === 'high';

  return (
    <div
      className={`relative overflow-hidden rounded-lg border transition-colors hover:bg-white/[0.03] ${
        isCritical
          ? 'border-red-500/20 bg-red-500/[0.04]'
          : isHigh
            ? 'border-white/[0.08] bg-white/[0.02]'
            : 'border-white/[0.06] bg-white/[0.015]'
      }`}
    >
      {/* Top accent bar */}
      <div
        className="h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${sevMeta.color}${isCritical ? 'cc' : '80'} 0%, transparent 100%)`,
        }}
      />

      <div className="p-4 space-y-2.5">
        {/* Header: category icon + title + severity badge */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">
            <CategoryIcon category={insight.category} className="w-3.5 h-3.5" />
          </div>
          <h4 className="text-sm font-medium text-zinc-100 leading-snug flex-1">{insight.title}</h4>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border shrink-0"
            style={{
              color: sevMeta.color,
              borderColor: `${sevMeta.color}33`,
              backgroundColor: `${sevMeta.color}15`,
            }}
          >
            {sevMeta.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-zinc-400 leading-relaxed">{linkifyPRs(stripEmails(insight.description), repoUrl)}</p>

        {/* Tags */}
        {(insight.people.filter((p) => !isEmail(p)).length > 0 || insight.modules.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {insight.people.filter((p) => !isEmail(p)).map((p) => (
              <span
                key={p}
                className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                style={{
                  color: '#a1a1aa',
                  backgroundColor: 'rgba(161,161,170,0.08)',
                  border: '1px solid rgba(161,161,170,0.15)',
                }}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {p}
              </span>
            ))}
            {insight.modules.map((m) => (
              <span
                key={m}
                className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                style={{
                  color: catMeta.color,
                  backgroundColor: `${catMeta.color}10`,
                  border: `1px solid ${catMeta.color}20`,
                }}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                </svg>
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
