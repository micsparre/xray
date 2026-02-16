import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from backend.api.routes import _active_tasks, cleanup_old_jobs, router
from backend.config import CORS_ORIGINS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def _cleanup_loop():
    """Run job cleanup every 5 minutes."""
    while True:
        await asyncio.sleep(300)
        try:
            await cleanup_old_jobs()
        except Exception as e:
            logger.warning(f"Cleanup loop error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Path("cached_results").mkdir(exist_ok=True)
    cleanup_task = asyncio.create_task(_cleanup_loop())
    logger.info("xray backend starting")
    yield
    # Shutdown: cancel cleanup loop
    cleanup_task.cancel()
    # Cancel all active analysis tasks
    if _active_tasks:
        logger.info(f"Cancelling {len(_active_tasks)} active analysis tasks...")
        for task in _active_tasks:
            task.cancel()
        await asyncio.gather(*_active_tasks, return_exceptions=True)
    logger.info("Backend shutting down")


app = FastAPI(
    title="xray",
    description="AI-powered analysis of engineering team knowledge structures",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "xray"}
