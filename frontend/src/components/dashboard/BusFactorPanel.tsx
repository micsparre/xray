import type { ModuleStats } from '../../types';
import { riskBadgeColor } from '../../lib/graph-utils';

interface Props {
  modules: ModuleStats[];
}

function riskLevel(bf: number): string {
  if (bf < 0.3) return 'critical';
  if (bf < 0.5) return 'high';
  if (bf < 0.7) return 'moderate';
  return 'low';
}

export function BusFactorPanel({ modules }: Props) {
  const sorted = [...modules].sort((a, b) => a.bus_factor - b.bus_factor);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Bus Factor by Module</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sorted.slice(0, 15).map((mod) => {
          const risk = riskLevel(mod.bus_factor);
          const topOwners = Object.entries(mod.blame_ownership)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3);

          return (
            <div
              key={mod.module}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-mono text-zinc-200 truncate flex-1">
                  {mod.module}
                </h4>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${riskBadgeColor(risk)}`}
                >
                  {risk}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${mod.bus_factor * 100}%`,
                      backgroundColor:
                        risk === 'critical'
                          ? '#ef4444'
                          : risk === 'high'
                          ? '#f97316'
                          : risk === 'moderate'
                          ? '#eab308'
                          : '#22c55e',
                    }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {(mod.bus_factor * 100).toFixed(0)}%
                </span>
              </div>

              <div className="text-[10px] text-zinc-400">
                {mod.total_commits} commits &middot; {Object.keys(mod.contributors).length} contributors
              </div>

              {topOwners.length > 0 && (
                <div className="space-y-0.5">
                  {topOwners.map(([email, pct]) => (
                    <div key={email} className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-400 truncate">{email.split('@')[0]}</span>
                      <span className="text-zinc-500 tabular-nums">{(pct * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
