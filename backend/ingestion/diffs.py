import asyncio
from pathlib import Path

from backend.config import DIFF_TRUNCATE_CHARS


async def get_diff_for_commit(repo_path: Path, commit_hash: str) -> str:
    """Get the diff for a specific commit, truncated to stay within token budget."""
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", str(repo_path), "show", "--format=", "--stat", "--patch", commit_hash,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    diff = stdout.decode(errors="replace")
    if len(diff) > DIFF_TRUNCATE_CHARS:
        diff = diff[:DIFF_TRUNCATE_CHARS] + "\n... [truncated]"
    return diff


async def get_pr_diff(repo_path: Path, base_ref: str, head_ref: str) -> str:
    """Get diff between two refs (for PR analysis)."""
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", str(repo_path), "diff", f"{base_ref}...{head_ref}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    diff = stdout.decode(errors="replace")
    if len(diff) > DIFF_TRUNCATE_CHARS:
        diff = diff[:DIFF_TRUNCATE_CHARS] + "\n... [truncated]"
    return diff


async def get_diffs_for_prs(repo_path: Path, merge_commits: list[str]) -> dict[str, str]:
    """Get diffs for multiple merge commits. Returns {commit_hash: diff}."""
    tasks = {h: get_diff_for_commit(repo_path, h) for h in merge_commits}
    results = {}
    for h, task in zip(tasks.keys(), await asyncio.gather(*tasks.values(), return_exceptions=True)):
        if isinstance(task, str):
            results[h] = task
    return results
