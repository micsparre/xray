#!/usr/bin/env bash
# Pre-analyze demo repos and save results as cached JSON files.
# Usage: ./scripts/demo-preload.sh [backend_url]
#
# Prerequisites:
#   - Backend running (uvicorn backend.main:app)
#   - ANTHROPIC_API_KEY set
#   - gh CLI authenticated

set -euo pipefail

BACKEND="${1:-http://localhost:8001}"
OUTDIR="cached_results"
mkdir -p "$OUTDIR"

REPOS=(
  "https://github.com/encode/httpx"
  "https://github.com/pallets/flask"
)

for REPO_URL in "${REPOS[@]}"; do
  SLUG=$(echo "$REPO_URL" | sed 's|https://github.com/||' | tr '/' '_')
  echo "=== Analyzing $REPO_URL ==="

  # Start analysis
  JOB_ID=$(curl -s -X POST "$BACKEND/api/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"repo_url\": \"$REPO_URL\", \"months\": 6}" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")

  echo "  Job ID: $JOB_ID"

  # Poll until complete (timeout after 10 minutes)
  ELAPSED=0
  while [ $ELAPSED -lt 600 ]; do
    STATUS=$(curl -s "$BACKEND/api/status/$JOB_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])")
    MSG=$(curl -s "$BACKEND/api/status/$JOB_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null || echo "")
    echo "  [$ELAPSED s] Status: $STATUS — $MSG"

    if [ "$STATUS" = "complete" ]; then
      echo "  Saving results to $OUTDIR/$SLUG.json"
      curl -s "$BACKEND/api/results/$JOB_ID" | python3 -m json.tool > "$OUTDIR/$SLUG.json"
      echo "  Done! ($(wc -c < "$OUTDIR/$SLUG.json" | tr -d ' ') bytes)"
      break
    fi

    if [ "$STATUS" = "error" ]; then
      echo "  ERROR: Analysis failed"
      break
    fi

    sleep 10
    ELAPSED=$((ELAPSED + 10))
  done

  if [ $ELAPSED -ge 600 ]; then
    echo "  TIMEOUT: Analysis did not complete in 10 minutes"
  fi

  echo ""
done

echo "=== Pre-load complete ==="
ls -lh "$OUTDIR"/*.json
