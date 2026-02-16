import { useReducer, useCallback, useRef, useEffect } from 'react';
import { startAnalysis, createWebSocket, getCached, getJobStatus } from '../api/client';
import type { AppState, AppAction, WSMessage, GraphData, GraphLink } from '../types';

type Tab = AppState['activeTab'];
const VALID_TABS: Tab[] = ['graph', 'dashboard', 'insights'];

function parseRoute(): { repoSlug: string | null; tab: Tab; page: string | null } {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return { repoSlug: null, tab: 'graph', page: null };
  if (path === 'how-it-works') return { repoSlug: null, tab: 'graph', page: 'how-it-works' };
  const parts = path.split('/');
  if (parts.length >= 2) {
    const slug = `${parts[0]}/${parts[1]}`;
    const tab = (VALID_TABS.includes(parts[2] as Tab) ? parts[2] : 'graph') as Tab;
    return { repoSlug: slug, tab, page: null };
  }
  return { repoSlug: null, tab: 'graph', page: null };
}

function buildPath(repoName: string | null, tab: Tab): string {
  if (!repoName) return '/';
  // repoName is "owner/repo" format
  return tab === 'graph' ? `/${repoName}` : `/${repoName}/${tab}`;
}

function pushUrl(repoName: string | null, tab: Tab) {
  const path = buildPath(repoName, tab);
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
}

function repoNameFromUrl(repoUrl: string): string {
  const cleaned = repoUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  return repoUrl;
}

const SESSION_KEY = 'xray_active_job';

function saveActiveJob(jobId: string, repoName: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ jobId, repoName }));
}

function loadActiveJob(): { jobId: string; repoName: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearActiveJob() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Merge new graph data into the previous graph, preserving d3-force positions
 * (x/y/vx/vy) when topology is unchanged. Returns the same reference if merged
 * in-place, or the new graph if topology changed. This prevents KnowledgeGraph
 * from re-animating and resetting the user's viewport on every partial result.
 */
function mergeGraphData(prev: GraphData | null | undefined, next: GraphData): GraphData {
  if (!prev ||
      prev.nodes.length !== next.nodes.length ||
      prev.links.length !== next.links.length) {
    return next;
  }

  // Same topology — update display properties in-place, preserve positions
  const nodeMap = new Map(next.nodes.map(n => [n.id, n]));
  for (const node of prev.nodes) {
    const updated = nodeMap.get(node.id);
    if (updated) {
      node.size = updated.size;
      node.color = updated.color;
      node.expertise_areas = updated.expertise_areas;
      node.bus_factor = updated.bus_factor;
      node.risk_level = updated.risk_level;
    }
  }

  const linkKey = (l: GraphLink) => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    return `${s}\0${t}`;
  };
  const linkMap = new Map(next.links.map(l => [linkKey(l), l]));
  for (const link of prev.links) {
    const updated = linkMap.get(linkKey(link));
    if (updated) {
      link.expertise_depth = updated.expertise_depth;
      link.weight = updated.weight;
    }
  }

  return prev; // Same reference — no re-animation
}

const initialState: AppState = {
  status: 'idle',
  jobId: null,
  analyzingRepoName: null,
  currentStage: 0,
  stageProgress: 0,
  stageMessage: '',
  analyzingResult: null,
  result: null,
  selectedNode: null,
  activeTab: parseRoute().tab,
  error: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_ANALYSIS':
      return {
        ...initialState,
        status: 'analyzing',
        jobId: action.jobId,
        analyzingRepoName: action.repoName,
      };
    case 'PROGRESS':
      return {
        ...state,
        currentStage: action.stage,
        stageProgress: action.progress,
        stageMessage: action.message,
      };
    case 'PARTIAL_RESULT': {
      if (state.status !== 'analyzing') return state;
      const graph = mergeGraphData(state.analyzingResult?.graph, action.data.graph);
      const updatedData = { ...action.data, graph };
      const isViewingAnalysis = !state.result || state.result.repo_name === state.analyzingRepoName;
      return {
        ...state,
        analyzingResult: updatedData,
        result: isViewingAnalysis ? updatedData : state.result,
      };
    }
    case 'COMPLETE': {
      const graph = mergeGraphData(state.analyzingResult?.graph, action.data.graph);
      const updatedData = { ...action.data, graph };
      // Update result when: no result loaded, no active analysis (loading cached), or viewing the analysis in progress
      const isViewingAnalysis = !state.result || !state.analyzingRepoName || state.result.repo_name === state.analyzingRepoName;
      return {
        ...state,
        status: 'complete',
        analyzingResult: updatedData,
        result: isViewingAnalysis ? updatedData : state.result,
        currentStage: 5,
        stageProgress: 1,
        stageMessage: 'Analysis complete!',
      };
    }
    case 'ERROR':
      return {
        ...state,
        status: 'error',
        error: action.message,
      };
    case 'VIEW_CACHED':
      return { ...state, result: action.data, selectedNode: null };
    case 'VIEW_ANALYZING':
      return { ...state, result: state.analyzingResult, selectedNode: null };
    case 'SELECT_NODE':
      return { ...state, selectedNode: action.node };
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useAnalysis() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const initialLoadDone = useRef(false);

  const connectWebSocket = useCallback((jobId: string) => {
    const ws = createWebSocket(jobId);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);

      switch (msg.type) {
        case 'progress':
          dispatch({
            type: 'PROGRESS',
            stage: msg.stage,
            progress: msg.progress,
            message: msg.message,
          });
          break;
        case 'partial_result':
          if (msg.data) {
            dispatch({ type: 'PARTIAL_RESULT', data: msg.data });
          }
          dispatch({
            type: 'PROGRESS',
            stage: msg.stage,
            progress: msg.progress,
            message: msg.message,
          });
          break;
        case 'complete':
          if (msg.data) {
            dispatch({ type: 'COMPLETE', data: msg.data });
          }
          clearActiveJob();
          ws.close();
          break;
        case 'error':
          dispatch({ type: 'ERROR', message: msg.message });
          ws.close();
          break;
      }
    };

    ws.onerror = () => {
      dispatch({ type: 'ERROR', message: 'WebSocket connection error' });
    };

    return ws;
  }, []);

  // On mount: reconnect to active job or load cached results
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const activeJob = loadActiveJob();
    if (activeJob) {
      // Check if the job is still alive on the backend
      getJobStatus(activeJob.jobId).then((status) => {
        if (!status || status.status === 'error') {
          // Job is gone or errored — clean up and try cached
          clearActiveJob();
          const { repoSlug, page } = parseRoute();
          if (repoSlug && !page) {
            const slug = repoSlug.replace('/', '_');
            getCached(slug).then((data) => {
              if (data && !data.error) dispatch({ type: 'COMPLETE', data });
            }).catch(() => {});
          }
          return;
        }

        // Job still running (or complete) — reconnect
        dispatch({ type: 'START_ANALYSIS', jobId: activeJob.jobId, repoName: activeJob.repoName });
        pushUrl(activeJob.repoName, 'graph');
        connectWebSocket(activeJob.jobId);
      }).catch(() => {
        clearActiveJob();
      });
      return;
    }

    // No active job — try loading cached results from URL
    const { repoSlug, page } = parseRoute();
    if (repoSlug && !page) {
      const slug = repoSlug.replace('/', '_');
      getCached(slug).then((data) => {
        if (data && !data.error) {
          dispatch({ type: 'COMPLETE', data });
        }
      }).catch(() => {});
    }
  }, [connectWebSocket]);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const { repoSlug, tab, page } = parseRoute();
      if (page || !repoSlug) {
        wsRef.current?.close();
        dispatch({ type: 'RESET' });
        return;
      }
      // If we're viewing a different repo or no result loaded, load it
      const currentRepo = state.result?.repo_name ?? null;
      if (repoSlug !== currentRepo) {
        const slug = repoSlug.replace('/', '_');
        getCached(slug).then((data) => {
          if (data && !data.error) {
            dispatch({ type: 'SELECT_NODE', node: null });
            dispatch({ type: 'COMPLETE', data });
            dispatch({ type: 'SET_TAB', tab });
          }
        }).catch(() => {});
      } else {
        dispatch({ type: 'SET_TAB', tab });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [state.result?.repo_name]);

  const analyze = useCallback(async (repoUrl: string, months = 6) => {
    try {
      const repoName = repoNameFromUrl(repoUrl);
      const jobId = await startAnalysis(repoUrl, months);
      dispatch({ type: 'START_ANALYSIS', jobId, repoName });
      pushUrl(repoName, 'graph');
      saveActiveJob(jobId, repoName);
      connectWebSocket(jobId);
    } catch (err) {
      dispatch({ type: 'ERROR', message: (err as Error).message });
    }
  }, [connectWebSocket]);

  const loadCached = useCallback(async (repoSlug: string) => {
    try {
      const data = await getCached(repoSlug);
      if (data && !data.error) {
        if (state.status === 'analyzing') {
          // Swap the viewed result without disrupting the in-progress analysis
          dispatch({ type: 'VIEW_CACHED', data });
        } else {
          clearActiveJob();
          dispatch({ type: 'SELECT_NODE', node: null });
          dispatch({ type: 'COMPLETE', data });
        }
        pushUrl(data.repo_name, 'graph');
      }
    } catch (err) {
      dispatch({ type: 'ERROR', message: (err as Error).message });
    }
  }, [state.status]);

  const viewAnalyzing = useCallback(() => {
    dispatch({ type: 'VIEW_ANALYZING' });
    if (state.analyzingRepoName) {
      pushUrl(state.analyzingRepoName, 'graph');
    }
  }, [state.analyzingRepoName]);

  const selectNode = useCallback((node: AppState['selectedNode']) => {
    dispatch({ type: 'SELECT_NODE', node });
  }, []);

  const setTab = useCallback((tab: AppState['activeTab']) => {
    dispatch({ type: 'SET_TAB', tab });
    if (state.result) {
      pushUrl(state.result.repo_name, tab);
    }
  }, [state.result]);

  const reset = useCallback(() => {
    wsRef.current?.close();
    clearActiveJob();
    dispatch({ type: 'RESET' });
    pushUrl(null, 'graph');
  }, []);

  return { state, analyze, loadCached, viewAnalyzing, selectNode, setTab, reset };
}
