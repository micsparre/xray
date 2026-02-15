from __future__ import annotations
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional


class AnalyzeRequest(BaseModel):
    repo_url: str = Field(..., description="GitHub repo URL, e.g. https://github.com/pallets/flask")
    months: int = Field(default=6, ge=1, le=24)


class JobStatus(str, Enum):
    queued = "queued"
    collecting = "collecting"
    stats = "stats"
    code_analysis = "code_analysis"
    review_analysis = "review_analysis"
    pattern_detection = "pattern_detection"
    complete = "complete"
    error = "error"


class AnalyzeResponse(BaseModel):
    job_id: str


class StatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    stage: int = 0
    total_stages: int = 5
    message: str = ""
    progress: float = 0.0


# --- Data models ---

class CommitRecord(BaseModel):
    hash: str
    author_name: str
    author_email: str
    date: str
    message: str
    files: list[FileChange] = []


class FileChange(BaseModel):
    additions: int = 0
    deletions: int = 0
    path: str = ""


# Rebuild CommitRecord so FileChange is available
CommitRecord.model_rebuild()


class BlameEntry(BaseModel):
    author_name: str
    author_email: str
    lines: int


class BlameResult(BaseModel):
    file_path: str
    entries: list[BlameEntry]
    total_lines: int


class PRReview(BaseModel):
    author: str
    state: str
    body: str = ""
    is_bot: bool = False


class PRData(BaseModel):
    number: int
    title: str
    author: str
    author_email: str = ""
    is_bot: bool = False
    created_at: str = ""
    merged_at: str | None = None
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0
    body: str = ""
    reviews: list[PRReview] = []
    comments: int = 0
    files: list[str] = []


# --- Analysis models ---

class ModuleStats(BaseModel):
    module: str
    contributors: dict[str, ContributorModuleStats] = {}
    bus_factor: float = 0.0
    total_commits: int = 0
    total_lines: int = 0
    blame_ownership: dict[str, float] = {}


class ContributorModuleStats(BaseModel):
    commits: int = 0
    additions: int = 0
    deletions: int = 0
    blame_lines: int = 0


ModuleStats.model_rebuild()


class ContributorStats(BaseModel):
    name: str
    email: str
    is_bot: bool = False
    total_commits: int = 0
    total_additions: int = 0
    total_deletions: int = 0
    modules: list[str] = []
    first_commit: str = ""
    last_commit: str = ""


# --- Graph models ---

class GraphNode(BaseModel):
    id: str
    type: str  # "contributor", "bot", or "module"
    label: str
    size: float = 1.0
    color: str = "#3b82f6"
    # Contributor-specific
    total_commits: int = 0
    total_lines: int = 0
    expertise_areas: list[str] = []
    # Module-specific
    bus_factor: float = 0.0
    risk_level: str = ""


class GraphLink(BaseModel):
    source: str
    target: str
    weight: float = 1.0
    commits: int = 0
    expertise_depth: str = "working"


class GraphData(BaseModel):
    nodes: list[GraphNode] = []
    links: list[GraphLink] = []


# --- AI result models ---

class ExpertiseClassification(BaseModel):
    pr_number: int
    author: str
    change_type: str = ""
    complexity: str = ""
    knowledge_depth: str = "working"
    expertise_signals: list[str] = []
    modules_touched: list[str] = []
    summary: str = ""


class ReviewClassification(BaseModel):
    pr_number: int
    reviewer: str
    quality: str = "surface"
    signals: list[str] = []
    knowledge_transfer: bool = False
    summary: str = ""


class InsightCard(BaseModel):
    category: str  # risk, opportunity, pattern, recommendation
    title: str
    description: str
    severity: str = "medium"
    people: list[str] = []
    modules: list[str] = []


class PatternDetectionResult(BaseModel):
    executive_summary: str = ""
    insights: list[InsightCard] = []
    recommendations: list[str] = []


# --- Full result ---

class AnalysisResult(BaseModel):
    repo_url: str
    repo_name: str
    analysis_months: int
    total_commits: int = 0
    total_contributors: int = 0
    total_prs: int = 0
    contributors: list[ContributorStats] = []
    modules: list[ModuleStats] = []
    graph: GraphData = GraphData()
    expertise_classifications: list[ExpertiseClassification] = []
    review_classifications: list[ReviewClassification] = []
    pattern_result: PatternDetectionResult = PatternDetectionResult()
    login_to_email: dict[str, str] = {}


# --- WebSocket message ---

class WSMessage(BaseModel):
    type: str  # "progress" | "partial_result" | "complete" | "error"
    stage: int = 0
    total_stages: int = 5
    message: str = ""
    progress: float = 0.0
    data: dict | None = None
