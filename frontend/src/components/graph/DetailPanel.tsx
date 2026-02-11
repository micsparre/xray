import type { GraphNode, AnalysisResult } from '../../types';
import { riskBadgeColor } from '../../lib/graph-utils';

interface Props {
  node: GraphNode;
  result: AnalysisResult;
  onClose: () => void;
}

export function DetailPanel({ node, result, onClose }: Props) {
  return (
    <div className="w-80 bg-slate-900/95 backdrop-blur border-l border-slate-700/50 p-4 overflow-y-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {node.type}
          </span>
          <h3 className="text-sm font-semibold text-white">{node.label}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {node.type === 'contributor' ? (
        <ContributorDetail node={node} result={result} />
      ) : (
        <ModuleDetail node={node} result={result} />
      )}
    </div>
  );
}

function ContributorDetail({ node, result }: { node: GraphNode; result: AnalysisResult }) {
  const email = node.id.replace('c:', '');
  const contributor = result.contributors.find((c) => c.email === email);
  const expertiseRecords = result.expertise_classifications.filter(
    (e) => e.author.toLowerCase() === node.label.toLowerCase() || e.author.toLowerCase() === email.split('@')[0]
  );
  const reviewRecords = result.review_classifications.filter(
    (r) => r.reviewer.toLowerCase() === node.label.toLowerCase() || r.reviewer.toLowerCase() === email.split('@')[0]
  );

  return (
    <div className="space-y-4">
      {contributor && (
        <div className="space-y-2">
          <Stat label="Commits" value={contributor.total_commits.toString()} />
          <Stat label="Lines added" value={`+${contributor.total_additions.toLocaleString()}`} />
          <Stat label="Lines removed" value={`-${contributor.total_deletions.toLocaleString()}`} />
          <Stat label="Active modules" value={contributor.modules.length.toString()} />
        </div>
      )}

      {expertiseRecords.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">Expertise (AI-classified)</h4>
          <div className="space-y-1.5">
            {expertiseRecords.map((e) => (
              <div key={e.pr_number} className="bg-slate-800/50 rounded p-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-300">PR #{e.pr_number}</span>
                  <span className="text-blue-400">{e.knowledge_depth}</span>
                </div>
                <p className="text-slate-500 mt-0.5">{e.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewRecords.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">Review quality</h4>
          <div className="space-y-1.5">
            {reviewRecords.map((r, i) => (
              <div key={i} className="bg-slate-800/50 rounded p-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-300">PR #{r.pr_number}</span>
                  <span className="text-purple-400">{r.quality}</span>
                </div>
                <p className="text-slate-500 mt-0.5">{r.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleDetail({ node, result }: { node: GraphNode; result: AnalysisResult }) {
  const moduleName = node.id.replace('m:', '');
  const moduleStats = result.modules.find((m) => m.module === moduleName);
  const risk = node.risk_level || 'unknown';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Bus Factor:</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${riskBadgeColor(risk)}`}>
            {risk} ({((node.bus_factor || 0) * 100).toFixed(0)}%)
          </span>
        </div>
        {moduleStats && (
          <>
            <Stat label="Total commits" value={moduleStats.total_commits.toString()} />
            <Stat label="Contributors" value={Object.keys(moduleStats.contributors).length.toString()} />
            <Stat label="Code lines" value={moduleStats.total_lines.toLocaleString()} />
          </>
        )}
      </div>

      {moduleStats && Object.keys(moduleStats.blame_ownership).length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">Code Ownership (blame)</h4>
          <div className="space-y-1">
            {Object.entries(moduleStats.blame_ownership)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([email, pct]) => (
                <div key={email} className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 w-20 truncate">{email.split('@')[0]}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">{(pct * 100).toFixed(0)}%</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 tabular-nums">{value}</span>
    </div>
  );
}
