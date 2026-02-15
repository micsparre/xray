import { forwardRef } from 'react';

export type NodeTypeFilter = 'contributor' | 'module';
export type RiskLevel = 'critical' | 'high' | 'moderate' | 'low';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  totalCount: number;
  typeFilters: Set<NodeTypeFilter>;
  onToggleType: (t: NodeTypeFilter) => void;
  riskFilters: Set<RiskLevel>;
  onToggleRisk: (r: RiskLevel) => void;
}

export const GraphSearchBar = forwardRef<HTMLInputElement, Props>(
  ({ query, onQueryChange, matchCount, totalCount, typeFilters, onToggleType, riskFilters, onToggleRisk }, ref) => {
    const isActive = query.length > 0;
    const showRiskFilters = typeFilters.has('module');

    return (
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Search input row */}
        <div className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/40 rounded-xl px-3 py-2 shadow-2xl min-w-[280px]">
          {/* Magnifying glass */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-zinc-500 flex-shrink-0">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>

          <input
            ref={ref}
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search nodes..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none min-w-0"
          />

          {isActive && (
            <>
              {/* Match count badge */}
              <span className="text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
                {matchCount} of {totalCount}
              </span>

              {/* Clear button */}
              <button
                onClick={() => onQueryChange('')}
                className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 1l8 8M9 1l-8 8" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Filter chips row */}
        <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
          {/* Type toggles */}
          <FilterChip
            label="Contributors"
            active={typeFilters.has('contributor')}
            activeColor="bg-blue-500/20 text-blue-400 border-blue-500/40"
            onClick={() => onToggleType('contributor')}
          />
          <FilterChip
            label="Modules"
            active={typeFilters.has('module')}
            activeColor="bg-green-500/20 text-green-400 border-green-500/40"
            onClick={() => onToggleType('module')}
          />

          {/* Risk level pills — only when Modules is active */}
          {showRiskFilters && (
            <>
              <div className="w-px h-4 bg-zinc-700/40 mx-1" />
              <FilterChip label="Critical" active={riskFilters.has('critical')} activeColor="bg-red-500/20 text-red-400 border-red-500/40" onClick={() => onToggleRisk('critical')} />
              <FilterChip label="High" active={riskFilters.has('high')} activeColor="bg-orange-500/20 text-orange-400 border-orange-500/40" onClick={() => onToggleRisk('high')} />
              <FilterChip label="Moderate" active={riskFilters.has('moderate')} activeColor="bg-yellow-500/20 text-yellow-400 border-yellow-500/40" onClick={() => onToggleRisk('moderate')} />
              <FilterChip label="Low" active={riskFilters.has('low')} activeColor="bg-green-500/20 text-green-400 border-green-500/40" onClick={() => onToggleRisk('low')} />
            </>
          )}

          {/* Escape hint */}
          {isActive && (
            <span className="text-[10px] text-zinc-600 ml-2">Esc to clear</span>
          )}
        </div>
      </div>
    );
  }
);

GraphSearchBar.displayName = 'GraphSearchBar';

function FilterChip({ label, active, activeColor, onClick }: {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
        active
          ? activeColor
          : 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40 hover:text-zinc-400 hover:border-zinc-600/40'
      }`}
    >
      {label}
    </button>
  );
}
