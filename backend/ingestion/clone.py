import asyncio
import os
import shutil
from pathlib import Path

from backend.config import CLONE_BASE_DIR


def repo_slug(repo_url: str) -> str:
    """Extract 'owner/repo' from a GitHub URL."""
    url = repo_url.rstrip("/").removesuffix(".git")
    parts = url.split("/")
    return f"{parts[-2]}/{parts[-1]}"


def repo_local_path(repo_url: str) -> Path:
    slug = repo_slug(repo_url)
    return Path(CLONE_BASE_DIR) / slug.replace("/", "_")


async def clone_repo(repo_url: str, force: bool = False) -> Path:
    """Clone a repo (full clone so git log/blame don't trigger lazy fetches)."""
    dest = repo_local_path(repo_url)

    if dest.exists() and not force:
        # Check if this is a partial (blobless) clone — if so, nuke and re-clone
        # because git log --numstat / git blame trigger slow lazy blob fetches
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", str(dest), "config", "remote.origin.promisor",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if stdout.decode().strip() == "true":
            shutil.rmtree(dest)
            # Fall through to full clone below
        else:
            # Full clone exists — just pull latest
            proc = await asyncio.create_subprocess_exec(
                "git", "-C", str(dest), "pull", "--ff-only",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.wait()
            return dest

    if dest.exists():
        shutil.rmtree(dest)

    os.makedirs(dest.parent, exist_ok=True)

    proc = await asyncio.create_subprocess_exec(
        "git", "clone", repo_url, str(dest),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"git clone failed: {stderr.decode()}")

    return dest
