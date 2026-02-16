import asyncio
import json
import logging
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from backend.agents.orchestrator import run_analysis
from backend.ingestion.clone import repo_slug
from backend.api.schemas import (
    AnalysisResult,
    AnalyzeRequest,
    AnalyzeResponse,
    JobStatus,
    StatusResponse,
    WSMessage,
)
from backend.config import MAX_CONCURRENT_ANALYSES, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# In-memory job storage
jobs: dict[str, dict] = {}

# Global analysis semaphore — caps concurrent pipelines
_analysis_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)

# Per-IP sliding window rate limiter: {ip: [timestamp, ...]}
_rate_limits: dict[str, list[float]] = {}

# Track active analysis tasks for graceful shutdown
_active_tasks: set[asyncio.Task] = set()


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from nginx."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> bool:
    """Return True if the request is allowed, False if rate-limited."""
    now = time.time()
    timestamps = _rate_limits.get(ip, [])
    # Remove timestamps outside the window
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    _rate_limits[ip] = timestamps
    if len(timestamps) >= RATE_LIMIT_MAX:
        return False
    timestamps.append(now)
    return True


async def cleanup_old_jobs():
    """Remove completed jobs older than 1 hour and prune stale rate limit entries."""
    now = time.time()
    stale_ids = [
        jid for jid, job in jobs.items()
        if job.get("completed_at") and now - job["completed_at"] > 3600
    ]
    for jid in stale_ids:
        del jobs[jid]
    if stale_ids:
        logger.info(f"Cleaned up {len(stale_ids)} old jobs")

    # Prune empty rate limit entries
    empty_ips = [ip for ip, ts in _rate_limits.items() if not ts or now - ts[-1] > RATE_LIMIT_WINDOW]
    for ip in empty_ips:
        del _rate_limits[ip]


@router.post("/analyze", response_model=AnalyzeResponse)
async def start_analysis(req: AnalyzeRequest, request: Request):
    # Rate limit check
    client_ip = _get_client_ip(request)
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Maximum {RATE_LIMIT_MAX} analyses per {RATE_LIMIT_WINDOW // 60} minutes.",
        )

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": JobStatus.queued,
        "stage": 0,
        "message": "Queued",
        "progress": 0.0,
        "result": None,
        "partial_data": None,
        "ws_clients": [],
        "completed_at": None,
    }

    # Run analysis in background, track the task
    task = asyncio.create_task(_run_job(job_id, req.repo_url, req.months))
    _active_tasks.add(task)
    task.add_done_callback(_active_tasks.discard)

    return AnalyzeResponse(job_id=job_id)


@router.get("/status/{job_id}", response_model=StatusResponse)
async def get_status(job_id: str):
    if job_id not in jobs:
        return StatusResponse(job_id=job_id, status=JobStatus.error, message="Job not found")
    job = jobs[job_id]
    return StatusResponse(
        job_id=job_id,
        status=job["status"],
        stage=job["stage"],
        message=job["message"],
        progress=job["progress"],
    )


@router.get("/results/{job_id}")
async def get_results(job_id: str):
    if job_id not in jobs:
        return {"error": "Job not found"}
    job = jobs[job_id]
    if job["result"] is None:
        return {"error": "Analysis not complete", "status": job["status"]}
    return job["result"].model_dump()


@router.get("/cached")
async def list_cached():
    """List all available cached analysis results."""
    cache_dir = Path("cached_results")
    if not cache_dir.exists():
        return []
    results = []
    for f in sorted(cache_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
            results.append({
                "repo_name": data.get("repo_name", f.stem.replace("_", "/")),
                "repo_url": data.get("repo_url", ""),
                "total_commits": data.get("total_commits", 0),
                "total_contributors": data.get("total_contributors", 0),
                "analysis_months": data.get("analysis_months", 0),
                "analyzed_at": f.stat().st_mtime,
            })
        except Exception:
            continue
    return results


@router.get("/cached/{repo_slug:path}")
async def get_cached(repo_slug: str):
    """Serve pre-computed results from disk."""
    cache_path = Path("cached_results") / f"{repo_slug.replace('/', '_')}.json"
    if not cache_path.exists():
        return {"error": "No cached results for this repo"}
    return json.loads(cache_path.read_text())


@router.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()

    if job_id not in jobs:
        await websocket.send_json({"type": "error", "message": "Job not found"})
        await websocket.close()
        return

    job = jobs[job_id]
    job["ws_clients"].append(websocket)

    # Send current job state immediately so the client isn't stuck on stage 0
    if job["status"] == JobStatus.error:
        await websocket.send_json(WSMessage(
            type="error", message=job.get("message", "Analysis failed"),
        ).model_dump())
        await websocket.close()
        return
    elif job["result"] is not None and job["status"] == JobStatus.complete:
        await websocket.send_json(WSMessage(
            type="complete", stage=5, progress=1.0,
            message="Analysis complete!",
            data=job["result"].model_dump(),
        ).model_dump())
    elif job["stage"] > 0:
        # Job is in progress — send partial result if available so the graph renders
        if job["partial_data"] is not None:
            await websocket.send_json(WSMessage(
                type="partial_result",
                stage=job["stage"],
                progress=job["progress"],
                message=job["message"],
                data=job["partial_data"],
            ).model_dump())
        else:
            await websocket.send_json(WSMessage(
                type="progress",
                stage=job["stage"],
                progress=job["progress"],
                message=job["message"],
            ).model_dump())

    try:
        # Keep connection alive until job completes or client disconnects
        while True:
            try:
                # Wait for client messages (pings, etc.)
                await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in job["ws_clients"]:
            job["ws_clients"].remove(websocket)


async def _run_job(job_id: str, repo_url: str, months: int):
    """Run the analysis pipeline and broadcast progress via WebSocket."""
    job = jobs[job_id]

    async def on_progress(msg: WSMessage):
        # Update job state
        stage_to_status = {
            1: JobStatus.collecting,
            2: JobStatus.stats,
            3: JobStatus.code_analysis,
            4: JobStatus.review_analysis,
            5: JobStatus.pattern_detection,
        }
        job["status"] = stage_to_status.get(msg.stage, job["status"])
        job["stage"] = msg.stage
        job["message"] = msg.message
        job["progress"] = msg.progress
        if msg.data is not None:
            job["partial_data"] = msg.data

        # Broadcast to WebSocket clients
        msg_dict = msg.model_dump()
        dead_clients = []
        for ws in job["ws_clients"]:
            try:
                await ws.send_json(msg_dict)
            except Exception:
                dead_clients.append(ws)
        for ws in dead_clients:
            job["ws_clients"].remove(ws)

    try:
        # Wait for semaphore — caps concurrent analyses
        async with _analysis_semaphore:
            job["status"] = JobStatus.collecting
            job["message"] = "Starting analysis..."
            result = await run_analysis(repo_url, months, on_progress=on_progress)

        job["result"] = result
        job["status"] = JobStatus.complete
        job["completed_at"] = time.time()

        # Persist to disk so results survive refresh/restart
        try:
            cache_dir = Path("cached_results")
            cache_dir.mkdir(exist_ok=True)
            slug = repo_slug(repo_url)
            cache_path = cache_dir / f"{slug.replace('/', '_')}.json"
            cache_path.write_text(json.dumps(result.model_dump(), default=str))
            logger.info(f"Cached results to {cache_path}")
        except Exception as cache_err:
            logger.warning(f"Failed to cache results: {cache_err}")

    except Exception as e:
        logger.exception(f"Job {job_id} failed")
        job["status"] = JobStatus.error
        job["message"] = str(e)
        job["completed_at"] = time.time()

        # Notify clients of error
        error_msg = WSMessage(type="error", message=str(e)).model_dump()
        for ws in job["ws_clients"]:
            try:
                await ws.send_json(error_msg)
            except Exception:
                pass
