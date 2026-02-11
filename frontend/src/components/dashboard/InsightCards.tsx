import { useState } from 'react';
import type { PatternDetectionResult } from '../../types';
import { severityColor } from '../../lib/graph-utils';

interface Props {
  patternResult: PatternDetectionResult;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  risk: { label: 'Risk', icon: '\u26A0\uFE0F' },
  opportunity: { label: 'Opportunity', icon: '\u2728' },
  pattern: { label: 'Pattern', icon: '\uD83D\uDD0D' },
  recommendation: { label: 'Action', icon: '\uD83D\uDCA1' },
};

export function InsightCards({ patternResult }: Props) {
  const [filter, setFilter] = useState<string>('all');

  const filtered =
    filter === 'all'
      ? patternResult.insights
      : patternResult.insights.filter((i) => i.category === filter);

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {patternResult.executive_summary && (
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Executive Summary</h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            {patternResult.executive_summary}
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {['all', 'risk', 'opportunity', 'pattern', 'recommendation'].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filter === cat
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]?.label || cat}
          </button>
        ))}
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map((insight, i) => {
          const catInfo = CATEGORY_LABELS[insight.category] || { label: insight.category, icon: '' };
          return (
            <div
              key={i}
              className={`bg-slate-800/50 border border-slate-700/50 border-l-4 ${severityColor(insight.severity)} rounded-lg p-4 space-y-2`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-white">
                  {catInfo.icon} {insight.title}
                </h4>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  {insight.severity}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {insight.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {insight.people.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  >
                    {p}
                  </span>
                ))}
                {insight.modules.map((m) => (
                  <span
                    key={m}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      {patternResult.recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Recommendations</h3>
          <div className="space-y-1.5">
            {patternResult.recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex gap-2 text-xs text-slate-300 bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2"
              >
                <span className="text-blue-400 font-bold">{i + 1}.</span>
                {rec}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
