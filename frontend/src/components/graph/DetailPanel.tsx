import type { GraphNode, AnalysisResult, ModuleStats } from '../../types';
import { riskBadgeColor, cleanUsername } from '../../lib/graph-utils';

interface Props {
  node: GraphNode;
  result: AnalysisResult;
  onClose: () => void;
}

export function DetailPanel({ node, result, onClose }: Props) {
  const isModule = node.type === 'module';

  return (
    <div className="w-80 h-full bg-zinc-900/95 backdrop-blur-lg border-l border-zinc-800 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: node.color }}
              />
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                {node.type}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold text-white leading-tight truncate">
              {node.type === 'contributor' ? cleanUsername(node.label) : node.label}
            </h3>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0 mt-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1">
        {isModule ? (
          <ModuleDetail node={node} result={result} />
        ) : (
          <ContributorDetail node={node} result={result} />
        )}
      </div>
    </div>
  );
}

function ContributorDetail({ node, result }: { node: GraphNode; result: AnalysisResult }) {
  const email = node.id.replace('c:', '');
  const contributor = result.contributors.find((c) => c.email === email);
  const repoBase = result.repo_url.replace(/\.git$/, '').replace(/\/$/, '');

  // Build reverse map: GitHub login → does this contributor's email match?
  const loginToEmail = result.login_to_email || {};
  const matchesLogin = (login: string) => {
    const mapped = loginToEmail[login];
    if (mapped && mapped.toLowerCase() === email.toLowerCase()) return true;
    // Fallback: name or email prefix match
    const lc = login.toLowerCase();
    return lc === node.label.toLowerCase() || lc === cleanUsername(email).toLowerCase();
  };

  const DEPTH_ORDER: Record<string, number> = { architect: 0, deep: 1, working: 2, surface: 3 };
  const QUALITY_ORDER: Record<string, number> = { mentoring: 0, thorough: 1, surface: 2, rubber_stamp: 3 };

  const expertiseRecords = result.expertise_classifications
    .filter((e) => matchesLogin(e.author))
    .sort((a, b) => (DEPTH_ORDER[a.knowledge_depth] ?? 9) - (DEPTH_ORDER[b.knowledge_depth] ?? 9));
  const reviewRecords = result.review_classifications
    .filter((r) => matchesLogin(r.reviewer))
    .sort((a, b) => (QUALITY_ORDER[a.quality] ?? 9) - (QUALITY_ORDER[b.quality] ?? 9));

  return (
    <div className="space-y-5">
      {contributor && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Commits" value={contributor.total_commits.toLocaleString()} />
          <StatCard label="Active modules" value={contributor.modules.length.toString()} />
          <StatCard label="Lines added" value={`+${contributor.total_additions.toLocaleString()}`} accent="text-emerald-400" />
          <StatCard label="Lines removed" value={`-${contributor.total_deletions.toLocaleString()}`} accent="text-red-400" />
        </div>
      )}

      {expertiseRecords.length > 0 && (
        <Section title="Expertise" subtitle="AI-classified">
          <div className="space-y-1.5">
            {expertiseRecords.map((e) => (
              <div key={e.pr_number} className="bg-zinc-800/40 border border-zinc-800/60 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <a
                    href={`${repoBase}/pull/${e.pr_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-400 hover:text-orange-400 transition-colors inline-flex items-center gap-1"
                  >PR #{e.pr_number}<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="M6 3h7v7" /><path d="M13 3L6 10" /></svg></a>
                  <DepthBadge depth={e.knowledge_depth} />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{e.summary}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {reviewRecords.length > 0 && (
        <Section title="Review quality">
          <div className="space-y-1.5">
            {reviewRecords.map((r, i) => (
              <div key={i} className="bg-zinc-800/40 border border-zinc-800/60 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <a
                    href={`${repoBase}/pull/${r.pr_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-400 hover:text-orange-400 transition-colors inline-flex items-center gap-1"
                  >PR #{r.pr_number}<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="M6 3h7v7" /><path d="M13 3L6 10" /></svg></a>
                  <span className="text-[10px] text-orange-400 font-medium">{r.quality}</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{r.summary}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function ModuleDetail({ node, result }: { node: GraphNode; result: AnalysisResult }) {
  const moduleName = node.id.replace('m:', '');
  const moduleStats = result.modules.find((m) => m.module === moduleName);
  const risk = node.risk_level || 'unknown';

  return (
    <div className="space-y-5">
      {/* Risk badge — prominent */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-zinc-500">Bus Factor</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${riskBadgeColor(risk)}`}>
          {risk} ({((node.bus_factor || 0) * 100).toFixed(0)}%)
        </span>
      </div>

      {moduleStats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Commits" value={moduleStats.total_commits.toLocaleString()} />
          <StatCard label="Contributors" value={Object.keys(moduleStats.contributors).length.toString()} />
          <StatCard label="Code lines" value={moduleStats.total_lines.toLocaleString()} />
        </div>
      )}

      {moduleStats && <OwnershipSection moduleStats={moduleStats} />}
    </div>
  );
}

function OwnershipSection({ moduleStats }: { moduleStats: ModuleStats }) {
  const hasBlame = Object.keys(moduleStats.blame_ownership).length > 0;

  // Build ownership entries: prefer blame, fall back to commit share
  let entries: { email: string; pct: number }[];
  let source: string;

  if (hasBlame) {
    source = 'blame';
    entries = Object.entries(moduleStats.blame_ownership)
      .map(([email, pct]) => ({ email, pct }));
  } else {
    source = 'commits';
    const totalCommits = Object.values(moduleStats.contributors)
      .reduce((sum, c) => sum + c.commits, 0);
    if (totalCommits === 0) return null;
    entries = Object.entries(moduleStats.contributors)
      .map(([email, stats]) => ({ email, pct: stats.commits / totalCommits }));
  }

  entries.sort((a, b) => b.pct - a.pct);
  entries = entries.slice(0, 5);

  if (entries.length === 0) return null;

  return (
    <Section title="Code Ownership" subtitle={source}>
      <div className="space-y-2.5">
        {entries.map(({ email, pct }) => (
          <div key={email} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 truncate max-w-[140px]">{cleanUsername(email)}</span>
              <span className="text-[11px] text-zinc-300 tabular-nums font-medium">{(pct * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct * 100}%`,
                  backgroundColor: pct > 0.5 ? '#c15f3c' : pct > 0.25 ? '#a1a1aa' : '#52525b',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-2.5">
        <h4 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">{title}</h4>
        {subtitle && <span className="text-[10px] text-zinc-600">({subtitle})</span>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 text-center">
      <div className={`text-sm font-semibold tabular-nums ${accent || 'text-zinc-100'}`}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{label}</div>
    </div>
  );
}

function DepthBadge({ depth }: { depth: string }) {
  const colors: Record<string, string> = {
    architect: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    deep: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20',
    working: 'bg-zinc-700/30 text-zinc-500 border-zinc-700/30',
    surface: 'bg-zinc-800/40 text-zinc-600 border-zinc-800/40',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[depth] || colors.working}`}>
      {depth}
    </span>
  );
}
