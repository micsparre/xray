import asyncio
from collections import defaultdict
from pathlib import Path

from backend.api.schemas import BlameEntry, BlameResult


async def get_blame(repo_path: Path, file_path: str) -> BlameResult | None:
    """Run git blame --line-porcelain on a file, aggregate by author."""
    full_path = repo_path / file_path
    if not full_path.exists():
        return None

    proc = await asyncio.create_subprocess_exec(
        "git", "-C", str(repo_path), "blame", "--line-porcelain", file_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        return None

    raw = stdout.decode(errors="replace")
    author_lines: dict[tuple[str, str], int] = defaultdict(int)
    current_author = ""
    current_email = ""
    total_lines = 0

    for line in raw.splitlines():
        if line.startswith("author "):
            current_author = line[7:]
        elif line.startswith("author-mail "):
            current_email = line[12:].strip("<>")
        elif line.startswith("\t"):
            author_lines[(current_author, current_email)] += 1
            total_lines += 1

    entries = [
        BlameEntry(author_name=name, author_email=email, lines=count)
        for (name, email), count in sorted(author_lines.items(), key=lambda x: -x[1])
    ]

    return BlameResult(file_path=file_path, entries=entries, total_lines=total_lines)


async def get_blame_for_files(repo_path: Path, file_paths: list[str]) -> list[BlameResult]:
    """Run blame on multiple files concurrently."""
    tasks = [get_blame(repo_path, fp) for fp in file_paths]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, BlameResult)]
