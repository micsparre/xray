import asyncio
import re
from pathlib import Path

from backend.api.schemas import CommitRecord, FileChange
from backend.config import is_excluded_file

# Matches git rename notation: prefix/{old => new}/suffix or {old => new}/suffix
_RENAME_RE = re.compile(r'\{[^}]*\s+=>\s+[^}]*\}')

COMMIT_START = "---XRAY_COMMIT---"


def _resolve_rename(path: str) -> str:
    """Resolve git rename notation to the destination path.

    e.g. 'libs/{sql-babel => query-parser}/index.ts' -> 'libs/query-parser/index.ts'
         '{old => new}/foo.py' -> 'new/foo.py'
    """
    def _replace(m: re.Match) -> str:
        inner = m.group(0)[1:-1]  # strip { }
        _, new = inner.split("=>", 1)
        return new.strip()

    resolved = _RENAME_RE.sub(_replace, path)
    # Clean up any double slashes from empty segments (e.g. "{ => new}" at start)
    return re.sub(r'/+', '/', resolved).strip('/')


FORMAT = f"{COMMIT_START}%n%H%n%an%n%ae%n%aI%n%s"


async def get_commits(repo_path: Path, months: int = 6) -> list[CommitRecord]:
    """Parse git log --numstat output into CommitRecord objects."""
    cmd = [
        "git", "-C", str(repo_path),
        "log",
        f"--since={months} months ago",
        f"--format={FORMAT}",
        "--numstat",
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    raw = stdout.decode(errors="replace")

    commits: list[CommitRecord] = []
    # Split on start marker — first element is empty/pre-header junk
    blocks = raw.split(COMMIT_START)

    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 5:
            continue

        hash_val = lines[0].strip()
        author_name = lines[1].strip()
        author_email = lines[2].strip()
        date = lines[3].strip()
        message = lines[4].strip()

        files: list[FileChange] = []
        for line in lines[5:]:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) >= 3:
                add_str, del_str, path = parts[0], parts[1], parts[2]
                try:
                    additions = int(add_str) if add_str != "-" else 0
                    deletions = int(del_str) if del_str != "-" else 0
                except ValueError:
                    continue
                path = _resolve_rename(path)
                if is_excluded_file(path):
                    continue
                files.append(FileChange(additions=additions, deletions=deletions, path=path))

        commits.append(CommitRecord(
            hash=hash_val,
            author_name=author_name,
            author_email=author_email,
            date=date,
            message=message,
            files=files,
        ))

    return commits
