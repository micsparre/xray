import { useRef, useState, useEffect, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Header } from './components/layout/Header';
import { RepoInput } from './components/input/RepoInput';
import { AnalysisProgress } from './components/input/AnalysisProgress';
import { KnowledgeGraph } from './components/graph/KnowledgeGraph';
import { DetailPanel } from './components/graph/DetailPanel';
import { BusFactorPanel } from './components/dashboard/BusFactorPanel';
import { ReviewQualityPanel } from './components/dashboard/ReviewQualityPanel';
import { InsightCards } from './components/dashboard/InsightCards';
import { HowItWorks } from './components/pages/HowItWorks';
import { useAnalysis } from './hooks/useAnalysis';

function getInitialPage(): string | null {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (path === 'how-it-works') return 'how-it-works';
  return null;
}

function App() {
  const { state, analyze, loadCached, selectNode, setTab, reset } = useAnalysis();
  const mainRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState<string | null>(getInitialPage);

  const navigateTo = useCallback((path: string) => {
    const normalized = path.replace(/^\/+|\/+$/g, '');
    const page = normalized === 'how-it-works' ? 'how-it-works' : null;
    setActivePage(page);
    if (!page) reset();
    window.history.pushState(null, '', path);
  }, [reset]);

  // Sync activePage on browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
      setActivePage(path === 'how-it-works' ? 'how-it-works' : null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasResult = !!state.result;
  const hasGraph = hasResult && state.result!.graph.nodes.length > 0;
  const hasInsights = hasResult && state.result!.pattern_result.insights.length > 0;

  // Overall progress across all stages
  const overallProgress = state.status === 'analyzing'
    ? ((state.currentStage - 1) + state.stageProgress) / 5
    : state.status === 'complete' ? 1 : 0;

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <Header onNavigate={navigateTo} />

      {/* Global progress bar */}
      {state.status === 'analyzing' && (
        <div className="h-0.5 bg-zinc-800 relative">
          <div
            className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 transition-all duration-700 ease-out"
            style={{ width: `${overallProgress * 100}%` }}
          />
        </div>
      )}

      {activePage === 'how-it-works' ? (
        <HowItWorks onNavigateHome={() => navigateTo('/')} />
      ) : (
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className="flex-shrink-0 border-r border-white/[0.06] bg-zinc-900/50 flex flex-col transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden"
          style={{ width: sidebarOpen ? 288 : 48 }}
        >
          {/* Sidebar header with toggle */}
          <div className={`flex items-center h-10 flex-shrink-0 ${sidebarOpen ? 'justify-end px-3' : 'justify-center'}`}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          </div>

          {/* Sidebar content — fixed width, fades with collapse */}
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden transition-opacity duration-200"
            style={{ width: 288, opacity: sidebarOpen ? 1 : 0, pointerEvents: sidebarOpen ? 'auto' : 'none' }}
          >
            <div className="px-4 pb-4 space-y-6">
              <RepoInput
                onAnalyze={analyze}
                onLoadCached={loadCached}
                status={state.status}
                analyzingRepoName={state.analyzingRepoName}
                activeRepoName={state.result?.repo_name ?? null}
                activeRepoUrl={state.result?.repo_url ?? null}
                overviewSlot={
                  <>
                    {state.status === 'analyzing' && (
                      <AnalysisProgress
                        currentStage={state.currentStage}
                        stageProgress={state.stageProgress}
                        stageMessage={state.stageMessage}
                      />
                    )}

                    {hasResult && (
                      <div className="space-y-2 animate-fade-in">
                        <h3 className="text-xs font-medium text-zinc-400">Overview</h3>
                        <div className="grid grid-cols-3 gap-2">
                          <StatCard label="Commits" value={state.result!.total_commits} />
                          <StatCard label="Contributors" value={state.result!.total_contributors} />
                          <StatCard label="PRs" value={state.result!.total_prs} />
                        </div>
                        {state.status === 'complete' && (
                          <button
                            onClick={reset}
                            className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-white py-1 transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0">
                              <path d="M10 2L4 8l6 6" />
                            </svg>
                            Back to home
                          </button>
                        )}
                      </div>
                    )}
                  </>
                }
              />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          {hasResult && (
            <div className="flex border-b border-white/10 bg-zinc-900/30">
              {(['graph', 'dashboard', 'insights'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTab(tab)}
                  className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
                    state.activeTab === tab
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab === 'graph' ? 'Knowledge Graph' : tab === 'dashboard' ? 'Dashboard' : 'Insights'}
                  {state.activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                  )}
                </button>
              ))}
              {hasResult && (
                <div className="ml-auto flex items-center pr-4">
                  <span className="text-[10px] text-zinc-500">{state.result!.repo_name}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 relative overflow-hidden">
            <div ref={mainRef} className="absolute inset-0 overflow-auto">
              {/* Empty state */}
              {!hasResult && state.status !== 'analyzing' && state.status !== 'error' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-lg animate-fade-in">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-zinc-600/20 to-orange-500/20 border border-zinc-500/20 flex items-center justify-center animate-pulse-glow">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
                        <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-3">
                      xray
                    </h2>
                    <p className="text-sm text-zinc-400 mb-2 leading-relaxed">
                      Reveal hidden knowledge structures in your engineering team.
                      See who really owns what code, find bus factor risks,
                      and discover non-obvious team dynamics.
                    </p>
                    <p className="text-xs text-zinc-500">
                      Enter a GitHub repo URL to start, or try a pre-analyzed demo.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-zinc-600">
                      <span>Bus factor analysis</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-700" />
                      <span>AI code review</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-700" />
                      <span>Knowledge mapping</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Analyzing placeholder */}
              {state.status === 'analyzing' && !hasGraph && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center animate-fade-in">
                    <div className="w-16 h-16 mx-auto mb-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-zinc-300 mb-1">{state.stageMessage || 'Starting analysis...'}</p>
                    <p className="text-xs text-zinc-500">Stage {state.currentStage} of 5</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {state.status === 'error' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md animate-fade-in">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </div>
                    <p className="text-red-400 text-sm font-medium mb-2">Analysis failed</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{state.error}</p>
                    <button
                      onClick={reset}
                      className="mt-4 px-4 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {/* Graph tab */}
              {hasGraph && state.activeTab === 'graph' && (
                <KnowledgeGraph
                  data={state.result!.graph}
                  selectedNode={state.selectedNode}
                  onNodeClick={selectNode}
                  width={dimensions.width}
                  height={dimensions.height}
                />
              )}

              {/* Dashboard tab */}
              {hasResult && state.activeTab === 'dashboard' && (
                <div className="p-6 space-y-8 animate-fade-in">
                  <BusFactorPanel modules={state.result!.modules} contributors={state.result!.contributors} />
                  <ReviewQualityPanel reviews={state.result!.review_classifications} />
                </div>
              )}

              {/* Insights tab */}
              {hasResult && state.activeTab === 'insights' && (
                <div className="p-6 animate-fade-in">
                  {hasInsights ? (
                    <InsightCards patternResult={state.result!.pattern_result} />
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-zinc-400">
                        {state.status === 'analyzing'
                          ? 'Pattern detection in progress...'
                          : 'No insights generated yet.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detail Panel (overlay, slide-in from right) */}
            {state.selectedNode && hasResult && state.activeTab === 'graph' && (
              <div className="absolute top-0 right-0 bottom-0 z-10 animate-slide-in-right">
                <DetailPanel
                  node={state.selectedNode}
                  result={state.result!}
                  onClose={() => selectNode(null)}
                />
              </div>
            )}
          </div>
        </main>
      </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-2 text-center">
      <div className="text-sm font-semibold text-white tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

export default App;
