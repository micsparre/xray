import type { ReviewClassification } from '../../types';

interface Props {
  reviews: ReviewClassification[];
}

interface ReviewerSummary {
  reviewer: string;
  counts: Record<string, number>;
  total: number;
  transferCount: number;
}

const QUALITIES = ['mentoring', 'thorough', 'surface', 'rubber_stamp'] as const;

const QUALITY_META: Record<string, { color: string; label: string }> = {
  mentoring: { color: '#d47d57', label: 'Mentoring' },
  thorough: { color: '#a1a1aa', label: 'Thorough' },
  surface: { color: '#eab308', label: 'Surface' },
  rubber_stamp: { color: '#ef4444', label: 'Rubber stamp' },
};

export function ReviewQualityPanel({ reviews }: Props) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Review Quality by Reviewer</h3>
        <div className="flex items-center gap-3">
          {QUALITIES.map((q) => (
            <div key={q} className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: QUALITY_META[q].color }}
              />
              <span className="text-[10px] text-zinc-500">{QUALITY_META[q].label}</span>
            </div>
          ))}
        </div>
      </div>

      {reviewers.length === 0 ? (
        <p className="text-xs text-zinc-500">No review data available yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {reviewers.slice(0, 12).map((rev) => (
            <div
              key={rev.reviewer}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium text-zinc-200 truncate flex-1">
                  {rev.reviewer}
                </h4>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {rev.total} review{rev.total !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Stacked quality bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-700">
                {QUALITIES.map((q) => {
                  const count = rev.counts[q] || 0;
                  if (count === 0) return null;
                  return (
                    <div
                      key={q}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${(count / rev.total) * 100}%`,
                        backgroundColor: QUALITY_META[q].color,
                      }}
                    />
                  );
                })}
              </div>

              {/* Quality breakdown rows */}
              <div className="space-y-1">
                {QUALITIES.map((q) => {
                  const count = rev.counts[q] || 0;
                  if (count === 0) return null;
                  return (
                    <div key={q} className="flex items-center gap-2 text-[10px]">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: QUALITY_META[q].color }}
                      />
                      <span className="text-zinc-400 w-20 shrink-0">{QUALITY_META[q].label}</span>
                      <div className="flex-1 h-1 bg-zinc-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / rev.total) * 100}%`,
                            backgroundColor: QUALITY_META[q].color,
                            opacity: 0.6,
                          }}
                        />
                      </div>
                      <span className="text-zinc-500 tabular-nums w-4 text-right shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Knowledge transfer indicator */}
              {rev.transferCount > 0 && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                  <span className="text-[10px] text-emerald-400/70">
                    {rev.transferCount} knowledge transfer{rev.transferCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
