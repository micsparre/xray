import type { ModuleStats, ContributorStats } from '../../types';
import { riskBadgeColor } from '../../lib/graph-utils';

interface Props {
  modules: ModuleStats[];
  contributors: ContributorStats[];
}

function riskLevel(bf: number): string {
  if (bf < 0.3) return 'critical';
  if (bf < 0.5) return 'high';
  if (bf < 0.7) return 'moderate';
  return 'low';
}

export function BusFactorPanel({ modules, contributors }: Props) {
  // Build email → display name lookup
  const nameByEmail = new Map<string, string>();
  for (const c of contributors) {
    nameByEmail.set(c.email, c.name);
  }
  const displayName = (email: string) => nameByEmail.get(email) ?? email.split('@')[0];
  // Compute max commits for normalization
  const maxCommits = Math.max(1, ...modules.map((m) => m.total_commits));

  // Sort by risk score: combines low bus factor with module importance (commit activity).
  // A 0-bus-factor module with 3 commits is noise; one with 500 commits is critical.
  const sorted = [...modules].sort((a, b) => {
    const importanceA = a.total_commits / maxCommits;
    const importanceB = b.total_commits / maxCommits;
    const riskA = (1 - a.bus_factor) * importanceA;
    const riskB = (1 - b.bus_factor) * importanceB;
    return riskB - riskA;
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Bus Factor by Module</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sorted.slice(0, 15).map((mod) => {
          const risk = riskLevel(mod.bus_factor);
          // Prefer blame ownership; fall back to commit share when blame is unavailable
          let topOwners: [string, number][];
          if (Object.keys(mod.blame_ownership).length > 0) {
            topOwners = Object.entries(mod.blame_ownership)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3);
          } else {
            const totalCommits = Object.values(mod.contributors).reduce(
              (sum, c) => sum + c.commits,
              0,
            );
            topOwners = Object.entries(mod.contributors)
              .map(([email, c]) => [email, totalCommits > 0 ? c.commits / totalCommits : 0] as [string, number])
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3);
          }

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
                          ? '#c15f3c'
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
                <div className="space-y-1">
                  {topOwners.map(([email, pct]) => (
                    <div key={email} className="flex items-center gap-2 text-[10px]">
                      <span className="text-zinc-400 truncate w-32 shrink-0" title={displayName(email)}>{displayName(email)}</span>
                      <div className="flex-1 h-1 bg-zinc-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-zinc-400/60"
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                      <span className="text-zinc-500 tabular-nums w-7 text-right shrink-0">{(pct * 100).toFixed(0)}%</span>
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
