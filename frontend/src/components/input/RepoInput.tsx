import { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalysisStatus } from '../../types';
import { listCached, type CachedRepo } from '../../api/client';

interface Props {
  onAnalyze: (repoUrl: string, months: number) => void;
  onLoadCached: (slug: string) => void;
  onViewAnalyzing: () => void;
  status: AnalysisStatus;
  isFormLocked: boolean;
  analyzingRepoName: string | null;
  activeRepoName: string | null;
  activeRepoUrl: string | null;
  activeAnalysisMonths: number | null;
  overviewSlot?: React.ReactNode;
}

export function RepoInput({ onAnalyze, onLoadCached, onViewAnalyzing, status, isFormLocked, analyzingRepoName, activeRepoName, activeRepoUrl, activeAnalysisMonths, overviewSlot }: Props) {
  const [url, setUrl] = useState('');
  const [months, setMonths] = useState(6);
  const [cachedRepos, setCachedRepos] = useState<CachedRepo[]>([]);
  const [confirm, setConfirm] = useState<{ repoName: string; repo?: CachedRepo } | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);

  // Populate the URL input and time range when an analysis is loaded
  useEffect(() => {
    if (activeRepoUrl) setUrl(activeRepoUrl);
  }, [activeRepoUrl]);

  useEffect(() => {
    if (activeAnalysisMonths) setMonths(activeAnalysisMonths);
  }, [activeAnalysisMonths]);

  const refreshCached = useCallback(() => {
    listCached().then(setCachedRepos).catch(() => {});
  }, []);

  useEffect(() => { refreshCached(); }, [refreshCached]);

  // Close time range dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) setTimeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Refresh the cached list when analysis completes
  useEffect(() => {
    if (status === 'complete') refreshCached();
  }, [status, refreshCached]);

  // Check if the current URL matches the active (already-loaded) analysis
  const isReanalyze = !!activeRepoName && !!activeRepoUrl && url.trim() === activeRepoUrl;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (isReanalyze) {
      setConfirm({ repoName: activeRepoName });
    } else {
      onAnalyze(url.trim(), months);
    }
  };

  const handleConfirm = () => {
    if (!confirm) return;
    if (confirm.repo?.repo_url) {
      onAnalyze(confirm.repo.repo_url, months);
    } else if (url.trim()) {
      onAnalyze(url.trim(), months);
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
            disabled={isFormLocked}
          />
        </div>
        <div ref={timeRef} className="relative">
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Time Range</label>
          <button
            type="button"
            onClick={() => !isFormLocked && setTimeOpen((o) => !o)}
            disabled={isFormLocked}
            className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-400/50 focus:border-zinc-400 disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            <span>Last {months} months</span>
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${timeOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {timeOpen && (
            <div className="absolute z-20 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMonths(m); setTimeOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    months === m
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-300 hover:bg-zinc-700/60 hover:text-white'
                  }`}
                >
                  Last {m} months
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={!url.trim() || isFormLocked}
          className="w-full py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-200 text-sm font-medium rounded-lg transition-colors border border-zinc-600 hover:border-zinc-500 cursor-pointer disabled:cursor-default"
        >
          {isFormLocked ? 'Analyzing...' : isReanalyze ? 'Re-analyze' : 'Analyze Repository'}
        </button>
      </form>

      {overviewSlot}

      {(cachedRepos.length > 0 || (isAnalyzing && analyzingRepoName)) && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Previous Analyses</p>
          <div className="space-y-1.5">
            {/* Currently analyzing repo */}
            {isAnalyzing && analyzingRepoName && !cachedRepos.some(r => r.repo_name === analyzingRepoName) && (
              <div
                onClick={onViewAnalyzing}
                className="w-full text-left px-3 py-2 bg-zinc-800/50 border border-orange-500/30 rounded-lg text-xs text-zinc-300 cursor-pointer"
              >
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
                onClick={() => { isReanalyzing ? onViewAnalyzing() : onLoadCached(repo.repo_name); }}
                className={`group w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  isReanalyzing
                    ? 'bg-zinc-800/50 border border-orange-500/30 text-zinc-300'
                    : isActive
                      ? 'bg-white/10 border border-white/20 text-white'
                      : 'bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-300'
                }`}
              >
                <div
                  className="w-full flex items-center gap-2"
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
                    <span className="text-[9px] text-zinc-500 flex-shrink-0 flex items-center gap-1">
                      {repo.analysis_months > 0 && <span className="text-zinc-600">{repo.analysis_months}m</span>}
                      {formatTimeAgo(repo.analyzed_at)}
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(null)} onKeyDown={(e) => { if (e.key === 'Escape') setConfirm(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">Re-analyze repository?</h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              This will re-run the full analysis for &ldquo;{confirm.repoName}&rdquo;, which may take several minutes.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border border-zinc-600 hover:border-zinc-500 cursor-pointer"
              >
                Re-analyze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
