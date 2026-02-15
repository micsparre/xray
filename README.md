# xray

**Reveal hidden knowledge structures in your engineering team.**

xray analyzes GitHub repositories to uncover invisible team dynamics: who *really* owns the code, where bus factor risks lurk, and what patterns emerge from how your team reviews each other's work.

The key insight: **Claude reads actual code diffs** to understand expertise depth — not just commit counting. It classifies whether a contributor made surface-level changes or architect-level decisions, and whether reviews are thorough mentoring or rubber stamps.

![xray demo](docs/demo.png)

## Features

- **Knowledge Graph** — Interactive force-directed visualization of contributor-to-module relationships
- **Bus Factor Analysis** — Gini coefficient-based ownership concentration per module
- **AI Code Analysis** — Claude reads PR diffs and classifies expertise depth (surface / working / deep / architect)
- **AI Review Quality** — Classifies review quality (rubber stamp / surface / thorough / mentoring)
- **Pattern Detection** — Extended thinking finds non-obvious insights: ghost architects, review rings, hidden experts, knowledge silos

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 18+
- [`gh` CLI](https://cli.github.com/) (authenticated via `gh auth login`)
- [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
git clone https://github.com/micsparre/xray.git
cd xray

# Backend
uv sync

# Frontend
cd frontend && npm install && cd ..

# Environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Run

```bash
# Terminal 1 — Backend
PYTHONPATH=. uv run uvicorn backend.main:app --host 0.0.0.0 --port 8001

# Terminal 2 — Frontend
cd frontend
npm run dev -- --port 5174
```

Open **http://localhost:5174**, enter a GitHub repo URL, and go.

Pre-analyzed demos (React, Flask, Bun, Ghostty) are available via the Quick Demo buttons.

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
