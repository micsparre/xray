import { useReducer, useCallback, useRef } from 'react';
import { startAnalysis, createWebSocket, getCached } from '../api/client';
import type { AppState, AppAction, WSMessage } from '../types';

const initialState: AppState = {
  status: 'idle',
  jobId: null,
  currentStage: 0,
  stageProgress: 0,
  stageMessage: '',
  result: null,
  selectedNode: null,
  activeTab: 'graph',
  error: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_ANALYSIS':
      return {
        ...initialState,
        status: 'analyzing',
        jobId: action.jobId,
      };
    case 'PROGRESS':
      return {
        ...state,
        currentStage: action.stage,
        stageProgress: action.progress,
        stageMessage: action.message,
      };
    case 'PARTIAL_RESULT':
      return {
        ...state,
        result: action.data,
      };
    case 'COMPLETE':
      return {
        ...state,
        status: 'complete',
        result: action.data,
        currentStage: 5,
        stageProgress: 1,
        stageMessage: 'Analysis complete!',
      };
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

  const analyze = useCallback(async (repoUrl: string, months = 6) => {
    try {
      const jobId = await startAnalysis(repoUrl, months);
      dispatch({ type: 'START_ANALYSIS', jobId });

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
        dispatch({ type: 'COMPLETE', data });
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
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.close();
    dispatch({ type: 'RESET' });
  }, []);

  return { state, analyze, loadCached, selectNode, setTab, reset };
}
