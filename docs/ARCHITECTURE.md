# Architecture — xray

## System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                         React Frontend                         │
│  ┌──────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ RepoInput│  │ KnowledgeGraph │  │ Dashboard (Bus Factor, │ │
│  │          │  │ (force-graph)  │  │ Insights, Reviews)     │ │
│  └────┬─────┘  └───────▲────────┘  └───────▲────────────────┘ │
│       │                │                    │                  │
│       │         useAnalysis (useReducer)    │                  │
│       │         WebSocket partial results   │                  │
└───────┼─────────────────┼───────────────────┼──────────────────┘
        │                 │                   │
   POST /analyze    WS /ws/{job_id}    GET /results/{job_id}
        │                 │                   │
┌───────┼─────────────────┼───────────────────┼──────────────────┐
│       ▼                 │                   │   FastAPI Backend │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Orchestrator                          │   │
│  │  Stage 1: Data Collection (git clone + gh GraphQL)      │   │
│  │  Stage 2: Statistical Analysis (matrix, bus factor)     │──►│partial_result
│  │  Stage 3: AI Code Analysis (Opus 4.6, 30 PRs batched)  │──►│partial_result
│  │  Stage 4: AI Review Analysis (Opus 4.6, 20 PRs batched)│──►│partial_result
│  │  Stage 5: AI Pattern Detection (Opus 4.6, ext thinking) │──►│complete
│  └─────────────────────────────────────────────────────────┘   │
│       │                    │                                    │
│  ┌────▼─────┐    ┌────────▼─────────┐                         │
│  │ Local Git│    │ GitHub GraphQL   │                         │
│  │ (clone)  │    │ (via gh CLI)     │                         │
│  └──────────┘    └──────────────────┘                         │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow

### What we extract
| Source | Data | Method |
|--------|------|--------|
| Local git | Commits + per-file stats | `git log --numstat` |
| Local git | Full diffs for top PRs | `git show <sha>` |
| Local git | File ownership | `git blame --line-porcelain` |
| GitHub API | PR metadata + reviews | GraphQL via `gh pr list --json` |
| GitHub API | Review threads + comments | GraphQL via `gh api graphql` |

### Why hybrid (local git + API)?
- **Diffs via API:** 1000 commits = 1000+ API calls, rate limit risk, large diffs timeout
- **Diffs via local git:** Zero API calls, no limits, instant
- **PR/review data via API:** Rich structured data (review state, threads, timelines) not available in git
- **PR data via GraphQL:** 50 PRs per call vs 200+ REST calls

## AI Agent Architecture

Three specialized "agents" (each is a well-prompted Opus 4.6 API call):

### Agent 1: Code Analyzer
- **Input:** PR diff (truncated to ~8K chars) + metadata
- **Output:** change_type, complexity, knowledge_depth, expertise_signals
- **Concurrency:** 5 parallel, 30 PRs total, ~120s
- **Key prompt direction:** "Classify expertise depth, not code quality. Be calibrated — most changes are working level."

### Agent 2: Review Analyzer
- **Input:** Review comments + inline threads for a PR
- **Output:** quality per reviewer (rubber_stamp/surface/thorough/mentoring), knowledge_transfer_score
- **Concurrency:** 5 parallel, 20 PRs total, ~80s
- **Key prompt direction:** "Empty body or <10 words = rubber stamp. Mentoring means teaching why, not just what."

### Agent 3: Pattern Detector
- **Input:** ALL aggregated data from stages 1-4
- **Output:** executive_summary, 5-10 InsightCards, recommendations
- **Concurrency:** 1 call, extended thinking (10K token budget), ~30s
- **Key prompt direction:** "Be SPECIFIC (name people/modules). Be SURPRISING (not obvious from metrics). Be ACTIONABLE."

## Progressive Rendering

The frontend doesn't wait for the full 4-minute analysis. It renders incrementally:

1. **After Stage 2 (~30s):** Knowledge graph appears with statistical data (commit-based sizing, initial bus factor colors)
2. **After Stage 3 (~2.5min):** Graph edges update with AI expertise levels (line thickness/color changes)
3. **After Stage 4 (~3.5min):** Review quality data populates the dashboard tab
4. **After Stage 5 (~4min):** Insight cards and recommendations appear

This makes the wait feel interactive and demonstrates the layered analysis approach.
