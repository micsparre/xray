import asyncio
import json

from backend.api.schemas import PRData, PRReview
from backend.ingestion.clone import repo_slug


async def fetch_prs(repo_url: str, limit: int = 50) -> list[PRData]:
    """Fetch PRs with reviews using gh CLI + GraphQL (50 per call)."""
    slug = repo_slug(repo_url)
    owner, name = slug.split("/")

    query = """
    query($owner: String!, $name: String!, $limit: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequests(first: $limit, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            number
            title
            author { login }
            createdAt
            mergedAt
            additions
            deletions
            changedFiles
            body
            comments { totalCount }
            files(first: 50) { nodes { path } }
            reviews(first: 20) {
              nodes {
                author { login }
                state
                body
              }
            }
          }
        }
      }
    }
    """

    proc = await asyncio.create_subprocess_exec(
        "gh", "api", "graphql",
        "-f", f"query={query}",
        "-F", f"owner={owner}",
        "-F", f"name={name}",
        "-F", f"limit={limit}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode()
        if "auth" in err.lower() or "login" in err.lower():
            return await _fetch_prs_rest_fallback(slug, limit)
        raise RuntimeError(f"gh api graphql failed: {err}")

    data = json.loads(stdout.decode())
    pr_nodes = data["data"]["repository"]["pullRequests"]["nodes"]

    prs: list[PRData] = []
    for node in pr_nodes:
        reviews = [
            PRReview(
                author=r["author"]["login"] if r.get("author") else "ghost",
                state=r["state"],
                body=r.get("body", ""),
            )
            for r in (node.get("reviews", {}).get("nodes", []) or [])
        ]
        prs.append(PRData(
            number=node["number"],
            title=node["title"],
            author=node["author"]["login"] if node.get("author") else "ghost",
            created_at=node.get("createdAt", ""),
            merged_at=node.get("mergedAt"),
            additions=node.get("additions", 0),
            deletions=node.get("deletions", 0),
            changed_files=node.get("changedFiles", 0),
            body=node.get("body", ""),
            reviews=reviews,
            comments=node.get("comments", {}).get("totalCount", 0),
            files=[f["path"] for f in (node.get("files", {}).get("nodes", []) or [])],
        ))

    return prs


async def _fetch_prs_rest_fallback(slug: str, limit: int) -> list[PRData]:
    """Fallback using gh pr list (REST-based, simpler)."""
    proc = await asyncio.create_subprocess_exec(
        "gh", "pr", "list",
        "--repo", slug,
        "--state", "merged",
        "--limit", str(limit),
        "--json", "number,title,author,createdAt,mergedAt,additions,deletions,changedFiles,body,comments,files,reviews",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        return []

    items = json.loads(stdout.decode())
    prs: list[PRData] = []
    for item in items:
        reviews = [
            PRReview(
                author=r.get("author", {}).get("login", "ghost") if isinstance(r.get("author"), dict) else "ghost",
                state=r.get("state", ""),
                body=r.get("body", ""),
            )
            for r in (item.get("reviews", []) or [])
        ]
        author = item.get("author", {})
        prs.append(PRData(
            number=item["number"],
            title=item.get("title", ""),
            author=author.get("login", "ghost") if isinstance(author, dict) else "ghost",
            created_at=item.get("createdAt", ""),
            merged_at=item.get("mergedAt"),
            additions=item.get("additions", 0),
            deletions=item.get("deletions", 0),
            changed_files=item.get("changedFiles", 0),
            body=item.get("body", ""),
            reviews=reviews,
            comments=item.get("comments", 0) if isinstance(item.get("comments"), int) else len(item.get("comments", [])),
            files=[f.get("path", "") for f in (item.get("files", []) or [])] if isinstance(item.get("files"), list) else [],
        ))

    return prs
