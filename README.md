# Engineering Team X-Ray

**Reveal hidden knowledge structures in your engineering team.**

Engineering Team X-Ray analyzes GitHub repositories to uncover invisible team dynamics that no one talks about: who *really* owns the code, where bus factor risks lurk, and what patterns emerge from how your team reviews each other's work.

The core differentiator: **Claude Opus 4.6 reads actual code diffs** to understand expertise depth — not just commit counting. It classifies whether a contributor made surface-level changes or architect-level decisions, and whether reviews are thorough mentoring or rubber stamps.

## What It Does

1. **Knowledge Graph** — Interactive force-directed visualization showing contributor-to-module relationships, sized by contribution and colored by bus factor risk
2. **Bus Factor Analysis** — Gini coefficient-based ownership concentration per module, identifying single-point-of-failure risks
3. **AI Code Analysis** — Opus 4.6 reads PR diffs to classify expertise depth (surface → working → deep → architect)
4. **AI Review Quality** — Classifies review quality (rubber stamp → surface → thorough → mentoring) and knowledge transfer
5. **Pattern Detection** — Extended thinking synthesizes all data to find non-obvious insights: ghost architects, review rings, hidden experts, knowledge silos

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, async |
| AI | Anthropic SDK → Claude Opus 4.6 (direct API) |
| Data | `git` CLI (clone, log, blame, show) + GitHub GraphQL via `gh` |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Visualization | react-force-graph-2d (Canvas-based) |

## Quick Start

### Prerequisites

- Python 3.13+
- Node.js 18+
- `gh` CLI (authenticated: `gh auth login`)
- Anthropic API key

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/claude-hackathon.git
cd claude-hackathon

# Backend
cd backend
python3.13 -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt

# Set your API key
echo "ANTHROPIC_API_KEY=your-key-here" > ../.env

# Frontend
cd ../frontend
npm install
```

### Run

```bash
# Terminal 1: Backend (from project root)
source .venv/bin/activate
PYTHONPATH=. python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001

# Terminal 2: Frontend (from frontend/)
npm run dev -- --port 5174
```

Open http://localhost:5174

### Pre-cached Demos

Click any "Quick Demo" button in the sidebar to instantly load pre-analyzed results for popular open source repos. To generate your own cached results:

```bash
./scripts/demo-preload.sh http://localhost:8001
```

## Architecture

### 5-Stage Analysis Pipeline

```
Stage 1: Data Collection (git clone, log, blame + GitHub GraphQL)
    ↓ progressive rendering
Stage 2: Statistical Analysis (contributor×module matrix, bus factor)
    ↓ graph renders immediately
Stage 3: AI Code Analysis (Opus 4.6 reads diffs, classifies expertise)
    ↓ graph enriched with expertise depth
Stage 4: AI Review Analysis (Opus 4.6 assesses review quality)
    ↓ review quality data added
Stage 5: AI Pattern Detection (Opus 4.6 with extended thinking)
    ↓ insights + recommendations
```

Each stage streams progress via WebSocket. The frontend renders partial results as they arrive — the knowledge graph appears after Stage 2, then gets enriched as AI analysis completes.

### AI Agent Design

- **Code Analyzer**: Reads actual PR diffs, classifies change_type, complexity, and knowledge_depth. Calibrated so most changes are "working" level — "architect" is rare and meaningful.
- **Review Analyzer**: Classifies review quality based on comment substance. Empty or <10 word reviews are rubber stamps.
- **Pattern Detector**: Uses extended thinking (10K token budget) to cross-reference all data and find non-obvious patterns like ghost architects, review rings, and knowledge silos.

### Error Resilience

Each pipeline stage degrades gracefully:
- No `gh` auth → skips PR data, still produces commit/blame analysis
- AI call failures → continues with available data
- Individual blame failures → skips that file, continues
- No PRs/reviews → skips AI stages, still produces stats + pattern detection

## Project Structure

```
claude-hackathon/
├── backend/
│   ├── main.py                 # FastAPI app, CORS, lifespan
│   ├── config.py               # Environment configuration
│   ├── api/
│   │   ├── routes.py           # REST + WebSocket endpoints
│   │   └── schemas.py          # Pydantic models
│   ├── ingestion/
│   │   ├── clone.py            # git clone (async subprocess)
│   │   ├── commits.py          # git log --numstat parsing
│   │   ├── blame.py            # git blame ownership
│   │   ├── diffs.py            # git show for PR diffs
│   │   └── github_graphql.py   # PR + review data via gh CLI
│   ├── analysis/
│   │   ├── stats.py            # Contributor×module matrix, bus factor
│   │   ├── pr_ranker.py        # Score PRs for AI pre-filtering
│   │   └── graph_builder.py    # Knowledge graph data structure
│   └── agents/
│       ├── client.py           # Shared AsyncAnthropic client
│       ├── orchestrator.py     # 5-stage pipeline controller
│       ├── code_analyzer.py    # Opus 4.6: diff → expertise classification
│       ├── review_analyzer.py  # Opus 4.6: review → quality assessment
│       └── pattern_detector.py # Opus 4.6: extended thinking insights
├── frontend/
│   └── src/
│       ├── App.tsx             # Main app layout
│       ├── types/index.ts      # TypeScript interfaces
│       ├── api/client.ts       # API + WebSocket client
│       ├── hooks/useAnalysis.ts # State management (useReducer)
│       ├── components/
│       │   ├── graph/          # KnowledgeGraph, DetailPanel
│       │   ├── dashboard/      # BusFactorPanel, ReviewQuality, InsightCards
│       │   ├── input/          # RepoInput, AnalysisProgress
│       │   └── layout/         # Header
│       └── lib/graph-utils.ts  # Color/style helpers
├── cached_results/             # Pre-computed demo results
└── scripts/demo-preload.sh     # Cache generation script
```

## License

MIT
