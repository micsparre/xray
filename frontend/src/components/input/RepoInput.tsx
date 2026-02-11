import { useState } from 'react';
import type { AnalysisStatus } from '../../types';

interface Props {
  onAnalyze: (repoUrl: string, months: number) => void;
  onLoadCached: (slug: string) => void;
  status: AnalysisStatus;
}

const DEMO_REPOS = [
  { slug: 'pallets/flask', label: 'pallets/flask', cached: true },
  { slug: 'encode/httpx', label: 'encode/httpx', cached: true },
  { slug: 'tiangolo/fastapi', label: 'tiangolo/fastapi', cached: false },
];

export function RepoInput({ onAnalyze, onLoadCached, status }: Props) {
  const [url, setUrl] = useState('');
  const [months, setMonths] = useState(6);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAnalyze(url.trim(), months);
    }
  };

  const isAnalyzing = status === 'analyzing';

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Repository URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            disabled={isAnalyzing}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Time Range</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Repository'}
        </button>
      </form>

      <div>
        <p className="text-xs text-slate-500 mb-2">Quick Demo</p>
        <div className="space-y-1.5">
          {DEMO_REPOS.map((repo) => (
            <button
              key={repo.slug}
              onClick={() => repo.cached ? onLoadCached(repo.slug) : onAnalyze(`https://github.com/${repo.slug}`, months)}
              disabled={isAnalyzing}
              className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {repo.cached ? (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" title="Pre-analyzed" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" title="Live analysis" />
              )}
              <span className="flex-1">{repo.label}</span>
              {repo.cached && (
                <span className="text-[9px] text-slate-500">instant</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
