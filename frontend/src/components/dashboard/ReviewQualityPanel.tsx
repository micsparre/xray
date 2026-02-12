import type { ReviewClassification } from '../../types';
import { qualityBadgeColor } from '../../lib/graph-utils';

interface Props {
  reviews: ReviewClassification[];
}

interface ReviewerSummary {
  reviewer: string;
  counts: Record<string, number>;
  total: number;
  transferCount: number;
}

export function ReviewQualityPanel({ reviews }: Props) {
  // Aggregate by reviewer
  const byReviewer = new Map<string, ReviewerSummary>();

  for (const r of reviews) {
    if (!byReviewer.has(r.reviewer)) {
      byReviewer.set(r.reviewer, {
        reviewer: r.reviewer,
        counts: {},
        total: 0,
        transferCount: 0,
      });
    }
    const summary = byReviewer.get(r.reviewer)!;
    summary.counts[r.quality] = (summary.counts[r.quality] || 0) + 1;
    summary.total += 1;
    if (r.knowledge_transfer) summary.transferCount += 1;
  }

  const reviewers = [...byReviewer.values()].sort((a, b) => b.total - a.total);
  const qualities = ['mentoring', 'thorough', 'surface', 'rubber_stamp'];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Review Quality by Reviewer</h3>

      {reviewers.length === 0 ? (
        <p className="text-xs text-zinc-500">No review data available yet.</p>
      ) : (
        <div className="space-y-2">
          {reviewers.map((rev) => (
            <div
              key={rev.reviewer}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-200">{rev.reviewer}</span>
                <span className="text-[10px] text-zinc-500">{rev.total} reviews</span>
              </div>

              {/* Stacked bar */}
              <div className="flex h-2 rounded-full overflow-hidden mb-2">
                {qualities.map((q) => {
                  const count = rev.counts[q] || 0;
                  if (count === 0) return null;
                  const pct = (count / rev.total) * 100;
                  const colors: Record<string, string> = {
                    mentoring: '#a855f7',
                    thorough: '#a1a1aa',
                    surface: '#eab308',
                    rubber_stamp: '#ef4444',
                  };
                  return (
                    <div
                      key={q}
                      style={{ width: `${pct}%`, backgroundColor: colors[q] }}
                      title={`${q}: ${count}`}
                    />
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {qualities.map((q) => {
                  const count = rev.counts[q] || 0;
                  if (count === 0) return null;
                  return (
                    <span
                      key={q}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${qualityBadgeColor(q)}`}
                    >
                      {q.replace('_', ' ')} ({count})
                    </span>
                  );
                })}
                {rev.transferCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    knowledge transfer ({rev.transferCount})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
