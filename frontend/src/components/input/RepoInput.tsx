import { useState, useEffect } from 'react';
import type { AnalysisStatus } from '../../types';
import { listCached, type CachedRepo } from '../../api/client';

interface Props {
  onAnalyze: (repoUrl: string, months: number) => void;
  onLoadCached: (slug: string) => void;
  status: AnalysisStatus;
}

export function RepoInput({ onAnalyze, onLoadCached, status }: Props) {
  const [url, setUrl] = useState('');
  const [months, setMonths] = useState(6);
  const [cachedRepos, setCachedRepos] = useState<CachedRepo[]>([]);

  useEffect(() => {
    listCached().then(setCachedRepos).catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAnalyze(url.trim(), months);
    }
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

      {cachedRepos.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Previous Analyses</p>
          <div className="space-y-1.5">
            {cachedRepos.map((repo) => (
              <button
                key={repo.repo_name}
                onClick={() => onLoadCached(repo.repo_name)}
                disabled={isAnalyzing}
                className="w-full text-left px-3 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                <span className="flex-1 truncate">{repo.repo_name}</span>
                <span className="text-[9px] text-zinc-500 flex-shrink-0">
                  {formatTimeAgo(repo.analyzed_at)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
