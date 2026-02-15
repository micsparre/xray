import { useState, useEffect, useCallback } from 'react';
import type { AnalysisStatus } from '../../types';
import { listCached, deleteCached, type CachedRepo } from '../../api/client';

interface Props {
  onAnalyze: (repoUrl: string, months: number) => void;
  onLoadCached: (slug: string) => void;
  status: AnalysisStatus;
  analyzingRepoName: string | null;
  activeRepoName: string | null;
  activeRepoUrl: string | null;
  overviewSlot?: React.ReactNode;
}

export function RepoInput({ onAnalyze, onLoadCached, status, analyzingRepoName, activeRepoName, activeRepoUrl, overviewSlot }: Props) {
  const [url, setUrl] = useState('');
  const [months, setMonths] = useState(6);
  const [cachedRepos, setCachedRepos] = useState<CachedRepo[]>([]);
  const [confirm, setConfirm] = useState<{ action: 'delete' | 'reanalyze'; repoName: string; repo?: CachedRepo } | null>(null);

  // Populate the URL input when an analysis is loaded
  useEffect(() => {
    if (activeRepoUrl) setUrl(activeRepoUrl);
  }, [activeRepoUrl]);

  const refreshCached = useCallback(() => {
    listCached().then(setCachedRepos).catch(() => {});
  }, []);

  useEffect(() => { refreshCached(); }, [refreshCached]);

  // Refresh the cached list when analysis completes
  useEffect(() => {
    if (status === 'complete') refreshCached();
  }, [status, refreshCached]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAnalyze(url.trim(), months);
    }
  };

  const handleDelete = async (repoName: string) => {
    const slug = repoName.replace('/', '_');
    await deleteCached(slug);
    refreshCached();
  };

  const handleReanalyze = (repo: CachedRepo) => {
    if (repo.repo_url) {
      onAnalyze(repo.repo_url, months);
    }
  };

  const handleConfirm = () => {
    if (!confirm) return;
    if (confirm.action === 'delete') {
      handleDelete(confirm.repoName);
    } else if (confirm.action === 'reanalyze' && confirm.repo) {
      handleReanalyze(confirm.repo);
    }
    setConfirm(null);
  };

  const isAnalyzing = status === 'analyzing';

  const formatTimeAgo = (ts: number) => {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Repository URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/50 focus:border-zinc-400"
            disabled={isAnalyzing}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Time Range</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-400/50"
            disabled={isAnalyzing}
          >
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={!url.trim() || isAnalyzing}
          className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Repository'}
        </button>
      </form>

      {overviewSlot}

      {(cachedRepos.length > 0 || (isAnalyzing && analyzingRepoName)) && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Previous Analyses</p>
          <div className="space-y-1.5">
            {/* Currently analyzing repo */}
            {isAnalyzing && analyzingRepoName && !cachedRepos.some(r => r.repo_name === analyzingRepoName) && (
              <div className="w-full text-left px-3 py-2 bg-zinc-800/50 border border-orange-500/30 rounded-lg text-xs text-zinc-300">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="flex-1 truncate">{analyzingRepoName}</span>
                  <span className="text-[9px] text-orange-400 flex-shrink-0">analyzing</span>
                </div>
              </div>
            )}
            {cachedRepos.map((repo) => {
              const isActive = activeRepoName === repo.repo_name;
              const isReanalyzing = isAnalyzing && analyzingRepoName === repo.repo_name;
              return (
              <div
                key={repo.repo_name}
                className={`group w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  isReanalyzing
                    ? 'bg-zinc-800/50 border border-orange-500/30 text-zinc-300'
                    : isActive
                      ? 'bg-white/10 border border-white/20 text-white'
                      : 'bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-300'
                }`}
              >
                <button
                  onClick={() => onLoadCached(repo.repo_name)}
                  disabled={isAnalyzing}
                  className="w-full flex items-center gap-2 disabled:opacity-50"
                >
                  {isReanalyzing ? (
                    <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-orange-400' : 'bg-green-400'}`} />
                  )}
                  <span className="flex-1 truncate text-left">{repo.repo_name}</span>
                  {isReanalyzing ? (
                    <span className="text-[9px] text-orange-400 flex-shrink-0">analyzing</span>
                  ) : (
                    <span className="text-[9px] text-zinc-500 flex-shrink-0">
                      {formatTimeAgo(repo.analyzed_at)}
                    </span>
                  )}
                </button>
                <div className={`flex gap-1 mt-1.5 transition-opacity ${isReanalyzing ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirm({ action: 'reanalyze', repoName: repo.repo_name, repo }); }}
                    disabled={isAnalyzing || !repo.repo_url}
                    className="flex-1 py-1 text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-600/50 rounded transition-colors disabled:opacity-30"
                  >
                    Re-analyze
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirm({ action: 'delete', repoName: repo.repo_name }); }}
                    disabled={isAnalyzing}
                    className="flex-1 py-1 text-[10px] text-red-400/70 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">
              {confirm.action === 'delete' ? 'Delete analysis?' : 'Re-analyze repository?'}
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              {confirm.action === 'delete'
                ? `This will permanently delete the cached analysis for "${confirm.repoName}".`
                : `This will re-run the full analysis for "${confirm.repoName}", which may take several minutes.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  confirm.action === 'delete'
                    ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30'
                    : 'bg-white text-zinc-900 hover:bg-zinc-200'
                }`}
              >
                {confirm.action === 'delete' ? 'Delete' : 'Re-analyze'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
