from __future__ import annotations

import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Callable, Awaitable

import logging

from backend.config import CLONE_BASE_DIR

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str], Awaitable[None]]

# Matches git progress lines like "Receiving objects:  45% (12345/27000), 150.00 MiB | 5.00 MiB/s"
_PROGRESS_RE = re.compile(
    r'(Receiving objects|Resolving deltas|Counting objects|Compressing objects|remote: Counting objects|remote: Compressing objects):\s+(\d+)%'
)


def repo_slug(repo_url: str) -> str:
    """Extract 'owner/repo' from a GitHub URL."""
    url = repo_url.strip().rstrip("/").removesuffix(".git")
    parts = [p for p in url.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Cannot parse owner/repo from URL: {repo_url!r}")
    return f"{parts[-2]}/{parts[-1]}"


def repo_local_path(repo_url: str) -> Path:
    slug = repo_slug(repo_url)
    return Path(CLONE_BASE_DIR) / slug.replace("/", "_")


async def check_repo_size(repo_url: str, max_mb: int) -> None:
    """Check repo size via GitHub API; raise if too large. Non-fatal if gh fails."""
    slug = repo_slug(repo_url)
    try:
        proc = await asyncio.create_subprocess_exec(
            "gh", "api", f"repos/{slug}", "--jq", ".size",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            logger.warning("gh api call failed — skipping repo size check")
            return
        size_kb = int(stdout.decode().strip())
        size_mb = size_kb / 1024
        if size_mb > max_mb:
            raise ValueError(
                f"Repository {slug} is {size_mb:.0f} MB, exceeding the {max_mb} MB limit. "
                f"Try a smaller repository."
            )
        logger.info(f"Repo size check passed: {slug} is {size_mb:.0f} MB (limit: {max_mb} MB)")
    except ValueError:
        raise
    except Exception as e:
        logger.warning(f"Repo size check failed ({e}) — skipping")


async def clone_repo(
    repo_url: str,
    force: bool = False,
    on_progress: ProgressCallback | None = None,
) -> Path:
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
            if on_progress:
                await on_progress("Updating existing clone...")
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
        "git", "clone", "--progress", repo_url, str(dest),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Read stderr incrementally to capture git progress
    stderr_chunks: list[bytes] = []
    if proc.stderr and on_progress:
        buf = b""
        while True:
            chunk = await proc.stderr.read(512)
            if not chunk:
                break
            stderr_chunks.append(chunk)
            buf += chunk
            # Git uses \r to overwrite progress lines, \n for final lines
            while b"\r" in buf or b"\n" in buf:
                # Split on whichever delimiter comes first
                cr = buf.find(b"\r")
                nl = buf.find(b"\n")
                if cr == -1:
                    idx, skip = nl, 1
                elif nl == -1:
                    idx, skip = cr, 1
                else:
                    idx, skip = min(cr, nl), 1
                line = buf[:idx].decode(errors="replace").strip()
                buf = buf[idx + skip:]
                if line:
                    m = _PROGRESS_RE.search(line)
                    if m:
                        phase = m.group(1).replace("remote: ", "")
                        pct = m.group(2)
                        await on_progress(f"{phase}: {pct}%")
        await proc.wait()
    else:
        _, stderr_data = await proc.communicate()
        stderr_chunks.append(stderr_data)

    if proc.returncode != 0:
        full_stderr = b"".join(stderr_chunks).decode(errors="replace")
        raise RuntimeError(f"git clone failed: {full_stderr}")

    return dest
