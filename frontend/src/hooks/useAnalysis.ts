import { useReducer, useCallback, useRef, useEffect } from 'react';
import { startAnalysis, createWebSocket, getCached } from '../api/client';
import type { AppState, AppAction, WSMessage } from '../types';

type Tab = AppState['activeTab'];
const VALID_TABS: Tab[] = ['graph', 'dashboard', 'insights'];

function parseRoute(): { repoSlug: string | null; tab: Tab } {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return { repoSlug: null, tab: 'graph' };
  const parts = path.split('/');
  if (parts.length >= 2) {
    const slug = `${parts[0]}/${parts[1]}`;
    const tab = (VALID_TABS.includes(parts[2] as Tab) ? parts[2] : 'graph') as Tab;
    return { repoSlug: slug, tab };
  }
  return { repoSlug: null, tab: 'graph' };
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

function replaceUrl(repoName: string | null, tab: Tab) {
  const path = buildPath(repoName, tab);
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}

function repoNameFromUrl(repoUrl: string): string {
  const cleaned = repoUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  return repoUrl;
}

const initialState: AppState = {
  status: 'idle',
  jobId: null,
  analyzingRepoName: null,
  currentStage: 0,
  stageProgress: 0,
  stageMessage: '',
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
      // Preserve graph reference if the graph hasn't meaningfully changed,
      // so KnowledgeGraph doesn't re-render and reset the user's viewport.
      const prevGraph = state.result?.graph;
      const newGraph = action.data.graph;
      const graphChanged = !prevGraph ||
        prevGraph.nodes.length !== newGraph.nodes.length ||
        prevGraph.links.length !== newGraph.links.length ||
        prevGraph.links.some((l, i) => l.expertise_depth !== newGraph.links[i]?.expertise_depth);
      return {
        ...state,
        result: {
          ...action.data,
          graph: graphChanged ? newGraph : prevGraph,
        },
      };
    }
    case 'COMPLETE': {
      const prevGraph = state.result?.graph;
      const newGraph = action.data.graph;
      const graphChanged = !prevGraph ||
        prevGraph.nodes.length !== newGraph.nodes.length ||
        prevGraph.links.length !== newGraph.links.length ||
        prevGraph.links.some((l, i) => l.expertise_depth !== newGraph.links[i]?.expertise_depth);
      return {
        ...state,
        status: 'complete',
        result: {
          ...action.data,
          graph: graphChanged ? newGraph : prevGraph,
        },
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

  // On mount: load repo from URL if present
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    const { repoSlug } = parseRoute();
    if (repoSlug) {
      // Convert "owner/repo" to "owner_repo" for the cached API
      const slug = repoSlug.replace('/', '_');
      getCached(slug).then((data) => {
        if (data && !data.error) {
          dispatch({ type: 'COMPLETE', data });
        }
      }).catch(() => {});
    }
  }, []);

  // Sync URL when result or tab changes
  useEffect(() => {
    const repoName = state.result?.repo_name ?? null;
    if (state.status === 'complete' || state.result) {
      replaceUrl(repoName, state.activeTab);
    }
  }, [state.result, state.activeTab, state.status]);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const { repoSlug, tab } = parseRoute();
      if (!repoSlug) {
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

      // Connect WebSocket
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
              pushUrl(msg.data.repo_name, 'graph');
            }
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

    } catch (err) {
      dispatch({ type: 'ERROR', message: (err as Error).message });
    }
  }, []);

  const loadCached = useCallback(async (repoSlug: string) => {
    try {
      const data = await getCached(repoSlug);
      if (data && !data.error) {
        dispatch({ type: 'SELECT_NODE', node: null });
        dispatch({ type: 'COMPLETE', data });
        pushUrl(data.repo_name, 'graph');
      }
    } catch (err) {
      dispatch({ type: 'ERROR', message: (err as Error).message });
    }
  }, []);

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
    dispatch({ type: 'RESET' });
    pushUrl(null, 'graph');
  }, []);

  return { state, analyze, loadCached, selectNode, setTab, reset };
}
