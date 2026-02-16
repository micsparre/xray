import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from backend.api.schemas import PRData, PRReview
from backend.ingestion.clone import repo_slug

logger = logging.getLogger(__name__)

PAGE_SIZE = 100  # GitHub GraphQL max per page


def _parse_dt(s: str) -> datetime | None:
    """Parse an ISO 8601 datetime string from GitHub."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_bot_typename(author: dict | None) -> bool:
    """Check if a GraphQL author node is a Bot (via __typename)."""
    if not author:
        return False
    return author.get("__typename") == "Bot"


def _is_bot_login(login: str) -> bool:
    """Fallback bot detection by login name pattern."""
    return "[bot]" in login.lower()


def _merge_reviews(reviews: list[PRReview]) -> list[PRReview]:
    """Consolidate multiple review passes from the same reviewer into one.

    GitHub returns a separate review object per pass (e.g. first CHANGES_REQUESTED,
    then APPROVED). We merge them: concatenate bodies, keep the last state.
    """
    by_author: dict[str, PRReview] = {}
    for r in reviews:
        if r.author not in by_author:
            by_author[r.author] = r
        else:
            prev = by_author[r.author]
            combined_body = "\n\n".join(
                part for part in [prev.body, r.body] if part.strip()
            )
            by_author[r.author] = PRReview(
                author=r.author,
                state=r.state,  # last state wins (chronological order from API)
                body=combined_body,
                is_bot=r.is_bot,
            )
    return list(by_author.values())


def _parse_node(node: dict) -> PRData:
    """Convert a single GraphQL PR node into a PRData object."""
    author_node = node.get("author")
    author_login = author_node["login"] if author_node else "ghost"

    reviews = _merge_reviews([
        PRReview(
            author=r["author"]["login"] if r.get("author") else "ghost",
            state=r["state"],
            body=r.get("body", ""),
            is_bot=_is_bot_typename(r.get("author")),
        )
        for r in (node.get("reviews", {}).get("nodes", []) or [])
        if (r.get("author", {}) or {}).get("login") != author_login
    ])
    commit_nodes = (node.get("commits") or {}).get("nodes") or []
    author_email = ""
    if commit_nodes:
        author_email = (commit_nodes[0].get("commit", {}).get("author", {}).get("email") or "")

    return PRData(
        number=node["number"],
        title=node["title"],
        author=author_login,
        author_email=author_email,
        is_bot=_is_bot_typename(author_node),
        created_at=node.get("createdAt", ""),
        merged_at=node.get("mergedAt"),
        additions=node.get("additions", 0),
        deletions=node.get("deletions", 0),
        changed_files=node.get("changedFiles", 0),
        body=node.get("body", ""),
        reviews=reviews,
        comments=node.get("comments", {}).get("totalCount", 0),
        files=[f["path"] for f in (node.get("files", {}).get("nodes", []) or [])],
    )


async def fetch_prs(repo_url: str, months: int = 6) -> list[PRData]:
    """Fetch all merged PRs within the given timeframe using paginated GraphQL.

    Paginates through results until all PRs in the timeframe are collected,
    or we run out of pages.
    """
    slug = repo_slug(repo_url)
    owner, name = slug.split("/")
    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)

    query = """
    query($owner: String!, $name: String!, $limit: Int!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(first: $limit, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number
            title
            author { login __typename }
            commits(last: 1) {
              nodes { commit { author { email } } }
            }
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
                author { login __typename }
                state
                body
              }
            }
          }
        }
      }
    }
    """

    all_prs: list[PRData] = []
    cursor: str | None = None
    max_pages = 10  # Safety cap: 10 pages × 100 = 1000 PRs max

    max_retries = 3

    for _ in range(max_pages):
        args = [
            "gh", "api", "graphql",
            "-f", f"query={query}",
            "-F", f"owner={owner}",
            "-F", f"name={name}",
            "-F", f"limit={PAGE_SIZE}",
        ]
        if cursor:
            args += ["-f", f"cursor={cursor}"]

        stdout = b""
        stderr = b""
        returncode = 1
        for attempt in range(max_retries):
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            returncode = proc.returncode

            if returncode == 0:
                break

            err = stderr.decode()
            is_transient = "502" in err or "503" in err or "timeout" in err.lower()
            if not is_transient:
                break

            delay = 2 ** attempt
            logger.warning(f"GraphQL request failed (attempt {attempt + 1}/{max_retries}): {err.strip()} — retrying in {delay}s")
            await asyncio.sleep(delay)

        if returncode != 0:
            err = stderr.decode()
            if "auth" in err.lower() or "login" in err.lower():
                return await _fetch_prs_rest_fallback(slug, months)
            # If first page fails, raise. If later page, return what we have.
            if not all_prs:
                raise RuntimeError(f"gh api graphql failed: {err}")
            logger.warning(f"GraphQL pagination failed on page, returning {len(all_prs)} PRs: {err}")
            break

        data = json.loads(stdout.decode())
        connection = data["data"]["repository"]["pullRequests"]
        page_info = connection["pageInfo"]
        nodes = connection["nodes"]

        if not nodes:
            break

        # Check if the oldest PR on this page is beyond our cutoff.
        # Since results are ordered by UPDATED_AT DESC, once we see PRs
        # whose mergedAt is before the cutoff, we're likely past the window.
        past_cutoff = False
        for node in nodes:
            pr = _parse_node(node)
            merged = _parse_dt(pr.merged_at or "")
            if merged and merged >= cutoff:
                all_prs.append(pr)
            elif merged and merged < cutoff:
                past_cutoff = True
            else:
                # No merged_at — include it (edge case)
                all_prs.append(pr)

        if past_cutoff or not page_info["hasNextPage"]:
            break

        cursor = page_info["endCursor"]

    logger.info(f"Fetched {len(all_prs)} merged PRs within {months}-month window for {slug}")
    return all_prs


async def _fetch_prs_rest_fallback(slug: str, months: int) -> list[PRData]:
    """Fallback using gh pr list (REST-based, simpler)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)

    proc = await asyncio.create_subprocess_exec(
        "gh", "pr", "list",
        "--repo", slug,
        "--state", "merged",
        "--limit", "200",
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
        merged = _parse_dt(item.get("mergedAt", ""))
        if merged and merged < cutoff:
            continue

        author = item.get("author", {})
        author_login = author.get("login", "ghost") if isinstance(author, dict) else "ghost"
        reviews = _merge_reviews([
            PRReview(
                author=(r_login := r.get("author", {}).get("login", "ghost") if isinstance(r.get("author"), dict) else "ghost"),
                state=r.get("state", ""),
                body=r.get("body", ""),
                is_bot=_is_bot_login(r_login),
            )
            for r in (item.get("reviews", []) or [])
            if (r.get("author", {}) or {}).get("login") != author_login
        ])
        prs.append(PRData(
            number=item["number"],
            title=item.get("title", ""),
            author=author_login,
            is_bot=_is_bot_login(author_login),
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
