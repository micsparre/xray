// --- Graph types ---
export interface GraphNode {
  id: string;
  type: 'contributor' | 'module' | 'bot';
  label: string;
  size: number;
  color: string;
  total_commits: number;
  total_lines: number;
  expertise_areas: string[];
  bus_factor: number;
  risk_level: string;
  // Force graph internal
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
  commits: number;
  expertise_depth: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// --- Contributor & Module stats ---
export interface ContributorModuleStats {
  commits: number;
  additions: number;
  deletions: number;
  blame_lines: number;
}

export interface ContributorStats {
  name: string;
  email: string;
  is_bot: boolean;
  total_commits: number;
  total_additions: number;
  total_deletions: number;
  modules: string[];
  first_commit: string;
  last_commit: string;
}

export interface ModuleStats {
  module: string;
  contributors: Record<string, ContributorModuleStats>;
  bus_factor: number;
  total_commits: number;
  total_lines: number;
  blame_ownership: Record<string, number>;
}

// --- AI results ---
export interface ExpertiseClassification {
  pr_number: number;
  author: string;
  change_type: string;
  complexity: string;
  knowledge_depth: string;
  expertise_signals: string[];
  modules_touched: string[];
  summary: string;
}

export interface ReviewClassification {
  pr_number: number;
  reviewer: string;
  quality: string;
  signals: string[];
  knowledge_transfer: boolean;
  summary: string;
}

export interface InsightCard {
  category: 'risk' | 'opportunity' | 'pattern' | 'recommendation';
  title: string;
  description: string;
  severity: string;
  people: string[];
  modules: string[];
}

export interface PatternDetectionResult {
  executive_summary: string;
  insights: InsightCard[];
  recommendations: string[];
}

// --- Full result ---
export interface AnalysisResult {
  repo_url: string;
  repo_name: string;
  analysis_months: number;
  total_commits: number;
  total_contributors: number;
  total_prs: number;
  contributors: ContributorStats[];
  modules: ModuleStats[];
  graph: GraphData;
  expertise_classifications: ExpertiseClassification[];
  review_classifications: ReviewClassification[];
  pattern_result: PatternDetectionResult;
  login_to_email: Record<string, string>;
}

// --- WebSocket messages ---
export interface WSMessage {
  type: 'progress' | 'partial_result' | 'complete' | 'error' | 'ping';
  stage: number;
  total_stages: number;
  message: string;
  progress: number;
  data?: AnalysisResult;
}

// --- App state ---
export type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error';

export interface AppState {
  status: AnalysisStatus;
  jobId: string | null;
  analyzingRepoName: string | null;
  currentStage: number;
  stageProgress: number;
  stageMessage: string;
  analyzingResult: AnalysisResult | null;
  result: AnalysisResult | null;
  selectedNode: GraphNode | null;
  activeTab: 'graph' | 'dashboard' | 'insights';
  error: string | null;
}

export type AppAction =
  | { type: 'START_ANALYSIS'; jobId: string; repoName: string }
  | { type: 'PROGRESS'; stage: number; progress: number; message: string }
  | { type: 'PARTIAL_RESULT'; data: AnalysisResult }
  | { type: 'COMPLETE'; data: AnalysisResult }
  | { type: 'ERROR'; message: string }
  | { type: 'SELECT_NODE'; node: GraphNode | null }
  | { type: 'VIEW_CACHED'; data: AnalysisResult }
  | { type: 'VIEW_ANALYZING' }
  | { type: 'SET_TAB'; tab: 'graph' | 'dashboard' | 'insights' }
  | { type: 'RESET' };
