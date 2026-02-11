import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.agents.orchestrator import run_analysis
from backend.api.schemas import (
    AnalysisResult,
    AnalyzeRequest,
    AnalyzeResponse,
    JobStatus,
    StatusResponse,
    WSMessage,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# In-memory job storage
jobs: dict[str, dict] = {}


@router.post("/analyze", response_model=AnalyzeResponse)
async def start_analysis(req: AnalyzeRequest):
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": JobStatus.queued,
        "stage": 0,
        "message": "Queued",
        "progress": 0.0,
        "result": None,
        "ws_clients": [],
    }

    # Run analysis in background
    asyncio.create_task(_run_job(job_id, req.repo_url, req.months))

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

    # If job already has partial or complete results, send them
    if job["result"] is not None and job["status"] == JobStatus.complete:
        await websocket.send_json(WSMessage(
            type="complete", stage=5, progress=1.0,
            message="Analysis complete!",
            data=job["result"].model_dump(),
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
        result = await run_analysis(repo_url, months, on_progress=on_progress)
        job["result"] = result
        job["status"] = JobStatus.complete

    except Exception as e:
        logger.exception(f"Job {job_id} failed")
        job["status"] = JobStatus.error
        job["message"] = str(e)

        # Notify clients of error
        error_msg = WSMessage(type="error", message=str(e)).model_dump()
        for ws in job["ws_clients"]:
            try:
                await ws.send_json(error_msg)
            except Exception:
                pass
