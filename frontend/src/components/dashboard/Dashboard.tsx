import { useMemo, useRef, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  PieChart, Pie,
} from 'recharts';
import type { AnalysisResult, ModuleStats, ReviewClassification } from '../../types';
import { riskBadgeColor } from '../../lib/graph-utils';

/* ─── constants ────────────────────────────────────────── */

const RISK_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#d47d57',
  moderate: '#eab308',
  low: '#22c55e',
};

const QUALITY_META: Record<string, { color: string; label: string }> = {
  mentoring: { color: '#d47d57', label: 'Mentoring' },
  thorough: { color: '#a1a1aa', label: 'Thorough' },
  surface: { color: '#eab308', label: 'Surface' },
  rubber_stamp: { color: '#ef4444', label: 'Rubber stamp' },
};

const QUALITIES = ['mentoring', 'thorough', 'surface', 'rubber_stamp'] as const;

/* ─── helpers ──────────────────────────────────────────── */

function riskLevel(bf: number): string {
  if (bf < 0.3) return 'critical';
  if (bf < 0.5) return 'high';
  if (bf < 0.7) return 'moderate';
  return 'low';
}

function healthGrade(score: number): { letter: string; color: string } {
  if (score >= 0.8) return { letter: 'A', color: '#22c55e' };
  if (score >= 0.6) return { letter: 'B', color: '#eab308' };
  if (score >= 0.4) return { letter: 'C', color: '#d47d57' };
  if (score >= 0.2) return { letter: 'D', color: '#ef4444' };
  return { letter: 'F', color: '#ef4444' };
}

interface ReviewerSummary {
  reviewer: string;
  counts: Record<string, number>;
  total: number;
  transferCount: number;
  qualityScore: number; // 0-1, weighted
  reviews: ReviewClassification[];
}

function buildReviewerSummaries(reviews: ReviewClassification[]): ReviewerSummary[] {
  const byReviewer = new Map<string, ReviewerSummary>();

  for (const r of reviews) {
    if (!byReviewer.has(r.reviewer)) {
      byReviewer.set(r.reviewer, {
        reviewer: r.reviewer,
        counts: {},
        total: 0,
        transferCount: 0,
        qualityScore: 0,
        reviews: [],
      });
    }
    const summary = byReviewer.get(r.reviewer)!;
    summary.counts[r.quality] = (summary.counts[r.quality] || 0) + 1;
    summary.total += 1;
    summary.reviews.push(r);
    if (r.knowledge_transfer) summary.transferCount += 1;
  }

  // Calculate quality score: mentoring=1, thorough=0.75, surface=0.35, rubber_stamp=0
  const WEIGHTS: Record<string, number> = { mentoring: 1, thorough: 0.75, surface: 0.35, rubber_stamp: 0 };
  for (const s of byReviewer.values()) {
    let weighted = 0;
    for (const [q, count] of Object.entries(s.counts)) {
      weighted += (WEIGHTS[q] ?? 0.5) * count;
    }
    s.qualityScore = s.total > 0 ? weighted / s.total : 0;
  }

  return [...byReviewer.values()].sort((a, b) => b.total - a.total);
}

/* ─── custom tooltip ───────────────────────────────────── */

function RiskTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; count: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs shadow-xl">
      <span className="text-zinc-300 capitalize">{d.name}</span>
      <span className="text-white font-semibold ml-2">{d.count} modules</span>
    </div>
  );
}

/* ─── main component ───────────────────────────────────── */

interface Props {
  result: AnalysisResult;
}

export function Dashboard({ result }: Props) {
  const { modules, contributors, review_classifications: reviews } = result;

  // Build email → name lookup
  const nameByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contributors) m.set(c.email, c.name);
    return m;
  }, [contributors]);
  const displayName = (email: string) => nameByEmail.get(email) ?? email.split('@')[0];

  // ── Computed metrics ──
  const riskDist = useMemo(() => {
    const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
    for (const m of modules) {
      const r = riskLevel(m.bus_factor) as keyof typeof counts;
      counts[r]++;
    }
    return counts;
  }, [modules]);

  const avgBusFactor = useMemo(
    () => modules.length > 0 ? modules.reduce((s, m) => s + m.bus_factor, 0) / modules.length : 0,
    [modules],
  );

  const reviewerSummaries = useMemo(() => buildReviewerSummaries(reviews), [reviews]);

  const reviewQualityDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reviews) counts[r.quality] = (counts[r.quality] || 0) + 1;
    return counts;
  }, [reviews]);

  const avgReviewScore = useMemo(() => {
    if (reviews.length === 0) return 0;
    const WEIGHTS: Record<string, number> = { mentoring: 1, thorough: 0.75, surface: 0.35, rubber_stamp: 0 };
    return reviews.reduce((s, r) => s + (WEIGHTS[r.quality] ?? 0.5), 0) / reviews.length;
  }, [reviews]);

  // Health = weighted average of bus factor health + review quality
  const healthScore = modules.length > 0 ? avgBusFactor * 0.6 + avgReviewScore * 0.4 : avgReviewScore;
  const grade = healthGrade(healthScore);

  // Top risk modules — sorted by risk * importance
  const maxCommits = Math.max(1, ...modules.map((m) => m.total_commits));
  const topRiskModules = useMemo(() => {
    return [...modules]
      .sort((a, b) => {
        const rA = (1 - a.bus_factor) * (a.total_commits / maxCommits);
        const rB = (1 - b.bus_factor) * (b.total_commits / maxCommits);
        return rB - rA;
      })
      .slice(0, 10);
  }, [modules, maxCommits]);

  // Bar chart data
  const riskBarData = [
    { name: 'critical', count: riskDist.critical, color: RISK_COLORS.critical },
    { name: 'high', count: riskDist.high, color: RISK_COLORS.high },
    { name: 'moderate', count: riskDist.moderate, color: RISK_COLORS.moderate },
    { name: 'low', count: riskDist.low, color: RISK_COLORS.low },
  ];

  // Pie chart data for review quality
  const reviewPieData = QUALITIES.map((q) => ({
    name: QUALITY_META[q].label,
    value: reviewQualityDist[q] || 0,
    color: QUALITY_META[q].color,
  })).filter((d) => d.value > 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-[1400px] mx-auto">

      {/* ── Hero Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroCard
          label="Health Grade"
          value={grade.letter}
          sub={`${(healthScore * 100).toFixed(0)}% overall`}
          accent={grade.color}
        />
        <HeroCard
          label="Critical Modules"
          value={riskDist.critical}
          sub={`of ${modules.length} total`}
          accent={riskDist.critical > 0 ? RISK_COLORS.critical : RISK_COLORS.low}
        />
        <HeroCard
          label="Avg Bus Factor"
          value={`${(avgBusFactor * 100).toFixed(0)}%`}
          sub={avgBusFactor < 0.4 ? 'needs attention' : avgBusFactor < 0.7 ? 'moderate' : 'healthy'}
          accent={avgBusFactor < 0.3 ? RISK_COLORS.critical : avgBusFactor < 0.5 ? RISK_COLORS.high : avgBusFactor < 0.7 ? RISK_COLORS.moderate : RISK_COLORS.low}
        />
        <HeroCard
          label="Review Quality"
          value={`${(avgReviewScore * 100).toFixed(0)}%`}
          sub={`${reviews.length} reviews analyzed`}
          accent={avgReviewScore < 0.4 ? RISK_COLORS.critical : avgReviewScore < 0.6 ? RISK_COLORS.moderate : RISK_COLORS.low}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Bus factor distribution — wider */}
        <div className="lg:col-span-3 bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Bus Factor Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskBarData} barSize={40}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#71717a', fontSize: 11, textTransform: 'capitalize' } as object}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#52525b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip content={<RiskTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {riskBarData.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Inline legend */}
          <div className="flex items-center gap-4 text-[10px] text-zinc-500">
            {riskBarData.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: d.color }} />
                <span className="capitalize">{d.name}</span>
                <span className="text-zinc-600">{d.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Review quality donut — narrower */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Review Quality</h3>
          {reviews.length === 0 ? (
            <p className="text-xs text-zinc-500 py-8 text-center">No review data</p>
          ) : (
            <>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reviewPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {reviewPieData.map((d, i) => (
                        <Cell key={i} fill={d.color} fillOpacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { name: string; value: number };
                        return (
                          <div className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs shadow-xl">
                            <span className="text-zinc-300">{d.name}</span>
                            <span className="text-white font-semibold ml-2">{d.value}</span>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                {reviewPieData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                    <span className="text-zinc-600">{d.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Top Risk Modules ── */}
      <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Highest Risk Modules</h3>
          <span className="text-[10px] text-zinc-600">sorted by risk * importance</span>
        </div>
        {/* Column headers */}
        <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider">
          <span className="w-4" />
          <span className="w-48 shrink-0">Module</span>
          <span className="shrink-0 w-14">Risk</span>
          <div className="flex-1 flex items-center gap-2">
            <span className="flex-1">Bus Factor</span>
            <span className="w-8 text-right shrink-0" />
          </div>
          <span className="hidden xl:block w-px h-3 bg-zinc-700/50" />
          <span className="hidden xl:block w-20 shrink-0">Commits</span>
          <span className="hidden lg:block w-px h-3 bg-zinc-700/50" />
          <span className="hidden lg:block w-40 shrink-0">Top Owner</span>
        </div>
        <div className="space-y-0.5">
          {topRiskModules.map((mod, i) => (
            <RiskRow
              key={mod.module}
              mod={mod}
              index={i}
              maxCommits={maxCommits}
              displayName={displayName}
            />
          ))}
        </div>
      </div>

      {/* ── Top Reviewers ── */}
      {reviewerSummaries.length > 0 && (
        <ReviewersSection
          summaries={reviewerSummaries.slice(0, 9)}
          repoUrl={result.repo_url}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────── */

function HeroCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/[0.06] p-4"
      style={{ background: `linear-gradient(135deg, ${accent}15 0%, ${accent}04 50%, transparent 100%)` }}
    >
      {/* Accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: accent, opacity: 0.7 }} />
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">{label}</div>
      <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-1.5">{sub}</div>
    </div>
  );
}

function RiskRow({ mod, index, maxCommits, displayName }: { mod: ModuleStats; index: number; maxCommits: number; displayName: (e: string) => string }) {
  const risk = riskLevel(mod.bus_factor);
  // sqrt scale so low-activity modules are still visually distinguishable
  const importance = Math.sqrt(mod.total_commits) / Math.sqrt(maxCommits);

  // Top owner
  let topOwner = '';
  let topPct = 0;
  if (Object.keys(mod.blame_ownership).length > 0) {
    const top = Object.entries(mod.blame_ownership).sort(([, a], [, b]) => b - a)[0];
    if (top) { topOwner = displayName(top[0]); topPct = top[1]; }
  } else {
    const total = Object.values(mod.contributors).reduce((s, c) => s + c.commits, 0);
    const top = Object.entries(mod.contributors).sort(([, a], [, b]) => b.commits - a.commits)[0];
    if (top && total > 0) { topOwner = displayName(top[0]); topPct = top[1].commits / total; }
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${index % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.04] transition-colors`}>
      {/* Rank */}
      <span className="text-[10px] text-zinc-600 w-4 text-right tabular-nums">{index + 1}</span>

      {/* Module name */}
      <span className="text-xs font-mono text-zinc-200 truncate w-48 shrink-0" title={mod.module}>
        {mod.module}
      </span>

      {/* Risk badge */}
      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${riskBadgeColor(risk)}`}>
        {risk}
      </span>

      {/* Bus factor bar */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.max(mod.bus_factor * 100, 2)}%`,
              backgroundColor: RISK_COLORS[risk],
            }}
          />
        </div>
        <span className="text-[10px] text-zinc-500 tabular-nums w-8 text-right shrink-0">
          {(mod.bus_factor * 100).toFixed(0)}%
        </span>
      </div>

      {/* Separator */}
      <div className="hidden xl:block w-px h-4 bg-zinc-700/30 shrink-0" />

      {/* Importance indicator */}
      <div className="hidden xl:flex items-center gap-1.5 w-20 shrink-0">
        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-zinc-500/50" style={{ width: `${importance * 100}%` }} />
        </div>
        <span className="text-[10px] text-zinc-600 tabular-nums">{mod.total_commits}</span>
      </div>

      {/* Separator */}
      <div className="hidden lg:block w-px h-4 bg-zinc-700/30 shrink-0" />

      {/* Top owner */}
      <div className="hidden lg:flex items-center gap-1.5 w-40 shrink-0">
        <span className="text-[10px] text-zinc-500 truncate">{topOwner}</span>
        {topPct > 0 && <span className="text-[10px] text-zinc-600 tabular-nums">{(topPct * 100).toFixed(0)}%</span>}
      </div>
    </div>
  );
}

function ReviewersSection({ summaries, repoUrl }: { summaries: ReviewerSummary[]; repoUrl: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRev = selected ? summaries.find((s) => s.reviewer === selected) : null;
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedRev && detailRef.current) {
      // Wait for the grid-template-rows animation (200ms) to finish before scrolling
      const timer = setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [selectedRev]);

  return (
    <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Reviewers</h3>
        <div className="flex items-center gap-3">
          {QUALITIES.map((q) => (
            <span key={q} className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: QUALITY_META[q].color }} />
              {QUALITY_META[q].label}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {summaries.map((rev) => (
          <ReviewerCard
            key={rev.reviewer}
            rev={rev}
            isSelected={selected === rev.reviewer}
            onSelect={() => setSelected(selected === rev.reviewer ? null : rev.reviewer)}
          />
        ))}
      </div>

      {/* Detail panel — full width below grid */}
      <div
        ref={detailRef}
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ display: 'grid', gridTemplateRows: selectedRev ? '1fr' : '0fr' }}
      >
        <div className="min-h-0">
          {selectedRev && <ReviewerDetail rev={selectedRev} repoUrl={repoUrl} onClose={() => setSelected(null)} />}
        </div>
      </div>
    </div>
  );
}

function ReviewerCard({ rev, isSelected, onSelect }: { rev: ReviewerSummary; isSelected: boolean; onSelect: () => void }) {
  return (
    <div
      className={`bg-white/[0.02] border rounded-lg p-3 space-y-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500/30 bg-blue-500/[0.04] ring-1 ring-blue-500/20'
          : 'border-white/[0.04] hover:bg-white/[0.04]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-200 truncate">{rev.reviewer}</span>
        <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">{rev.total} review{rev.total !== 1 ? 's' : ''}</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800">
        {QUALITIES.map((q) => {
          const count = rev.counts[q] || 0;
          if (count === 0) return null;
          return (
            <div
              key={q}
              className="h-full"
              style={{
                width: `${(count / rev.total) * 100}%`,
                backgroundColor: QUALITY_META[q].color,
                opacity: 0.8,
              }}
            />
          );
        })}
      </div>

      {/* Breakdown */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-zinc-500">
        {QUALITIES.map((q) => {
          const count = rev.counts[q] || 0;
          if (count === 0) return null;
          return (
            <span key={q} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: QUALITY_META[q].color }} />
              <span className="text-zinc-400">{QUALITY_META[q].label}</span>
              <span className="text-zinc-600">{count}</span>
            </span>
          );
        })}
        {rev.transferCount > 0 && (
          <span className="flex items-center gap-1 text-emerald-400/70 ml-auto" title={`${rev.transferCount} of ${rev.total} reviews included knowledge sharing`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" />
            {Math.round((rev.transferCount / rev.total) * 100)}% teaching
          </span>
        )}
      </div>
    </div>
  );
}

function ReviewerDetail({ rev, repoUrl, onClose }: { rev: ReviewerSummary; repoUrl: string; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-200">{rev.reviewer}</span>
          <span className="text-[10px] text-zinc-500">{rev.total} review{rev.total !== 1 ? 's' : ''} analyzed</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 -mr-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* PR rows */}
      <div className="divide-y divide-white/[0.04]">
        {rev.reviews.map((r) => {
          const meta = QUALITY_META[r.quality] ?? { color: '#71717a', label: r.quality };
          return (
            <div
              key={`${r.pr_number}-${r.quality}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors group"
            >
              {/* PR link */}
              <a
                href={`${repoUrl}/pull/${r.pr_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-mono text-xs shrink-0 flex items-center gap-1 w-16"
              >
                #{r.pr_number}
                <svg className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* Quality badge */}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded border shrink-0 w-24 text-center"
                style={{
                  color: meta.color,
                  borderColor: `${meta.color}33`,
                  backgroundColor: `${meta.color}11`,
                }}
              >
                {meta.label}
              </span>

              {/* Knowledge transfer */}
              {r.knowledge_transfer ? (
                <span className="w-4 shrink-0 flex justify-center" title="Knowledge transfer">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                </span>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              {/* Summary */}
              <span className="text-[11px] text-zinc-400 leading-snug break-words min-w-0">{r.summary}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
