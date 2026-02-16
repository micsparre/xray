import asyncio
import logging
import shutil
from pathlib import Path
from typing import Any, Callable, Coroutine

from backend.api.schemas import (
    AnalysisResult,
    PRData,
    WSMessage,
)
from backend.analysis.graph_builder import build_graph
from backend.analysis.pr_ranker import get_prs_with_reviews, rank_prs
from backend.analysis.stats import (
    build_contributor_stats,
    build_module_stats,
    get_most_changed_files,
)
from backend.agents.code_analyzer import analyze_batch as analyze_code_batch
from backend.agents.review_analyzer import analyze_batch as analyze_review_batch
from backend.agents.pattern_detector import detect_patterns
from backend.config import MAX_BLAME_FILES, MAX_PRS_CODE_ANALYSIS, MAX_PRS_REVIEW_ANALYSIS, MAX_REPO_SIZE_MB
from backend.ingestion.blame import get_blame_for_files
from backend.ingestion.clone import check_repo_size, clone_repo, repo_local_path, repo_slug
from backend.ingestion.commits import get_commits
from backend.ingestion.diffs import get_diff_for_commit
from backend.ingestion.github_graphql import fetch_prs

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[WSMessage], Coroutine[Any, Any, None]]


async def run_analysis(
    repo_url: str,
    months: int = 6,
    on_progress: ProgressCallback | None = None,
) -> AnalysisResult:
    """Run the full 5-stage analysis pipeline with graceful error handling."""

    async def emit(msg: WSMessage):
        if on_progress:
            await on_progress(msg)

    result = AnalysisResult(
        repo_url=repo_url,
        repo_name=repo_slug(repo_url),
        analysis_months=months,
    )

    clone_path = repo_local_path(repo_url)
    try:
        # ── Stage 1: Data Collection ──
        await emit(WSMessage(type="progress", stage=1, total_stages=5, message="Checking repository size...", progress=0.0))

        await check_repo_size(repo_url, MAX_REPO_SIZE_MB)

        await emit(WSMessage(type="progress", stage=1, total_stages=5, message="Cloning repository...", progress=0.0))

        async def clone_progress(msg: str):
            # Extract just the percentage if present
            pct = msg.split(":")[-1].strip() if ":" in msg else msg
            await emit(WSMessage(type="progress", stage=1, message=f"Cloning repository... {pct}", progress=0.0))

        repo_path = await clone_repo(repo_url, on_progress=clone_progress)

        await emit(WSMessage(type="progress", stage=1, message="Extracting commit history...", progress=0.2))
        commits = await get_commits(repo_path, months)
        result.total_commits = len(commits)

        if not commits:
            raise RuntimeError(f"No commits found in the last {months} months. Try a longer time range.")

        # Fetch PRs (non-fatal — gh may not be authenticated)
        await emit(WSMessage(type="progress", stage=1, message="Fetching pull requests...", progress=0.5))
        prs: list[PRData] = []
        try:
            prs = await asyncio.wait_for(fetch_prs(repo_url, months), timeout=120)
        except asyncio.TimeoutError:
            logger.warning("PR fetch timed out — continuing without PR data")
        except Exception as e:
            logger.warning(f"PR fetch failed ({e}) — continuing without PR data")
        result.total_prs = len(prs)

        # Build GitHub login → git email mapping from PR commit data
        # Also collect emails of known bot accounts (from GraphQL __typename)
        bot_emails: set[str] = set()
        for pr in prs:
            if pr.author_email and pr.author != "ghost":
                result.login_to_email.setdefault(pr.author, pr.author_email)
                if pr.is_bot:
                    bot_emails.add(pr.author_email)

        # Blame (non-fatal — some files may fail)
        await emit(WSMessage(type="progress", stage=1, message="Running git blame...", progress=0.7))
        blame_results = []
        try:
            top_files = get_most_changed_files(commits, MAX_BLAME_FILES)
            blame_results = await get_blame_for_files(repo_path, top_files)
        except Exception as e:
            logger.warning(f"Blame analysis failed ({e}) — continuing without blame data")

        await emit(WSMessage(type="progress", stage=1, message="Data collection complete", progress=1.0))

        # ── Stage 2: Statistical Analysis ──
        await emit(WSMessage(type="progress", stage=2, message="Building contributor statistics...", progress=0.0))

        contributors = build_contributor_stats(commits, result.login_to_email, bot_emails=bot_emails)
        result.contributors = contributors
        result.total_contributors = len([c for c in contributors if not c.is_bot])

        modules = build_module_stats(commits, blame_results, result.login_to_email, bot_emails=bot_emails)
        result.modules = modules

        graph = build_graph(contributors, modules)
        result.graph = graph

        await emit(WSMessage(
            type="partial_result",
            stage=2,
            message="Statistical analysis complete — graph ready",
            progress=1.0,
            data=result.model_dump(),
        ))

        # ── Stage 3: AI Code Analysis ──
        if prs:
            await emit(WSMessage(type="progress", stage=3, message="Ranking PRs for AI analysis...", progress=0.0))

            top_prs = rank_prs(prs, MAX_PRS_CODE_ANALYSIS)

            await emit(WSMessage(type="progress", stage=3, message="Fetching PR diffs...", progress=0.1))
            pr_diffs: dict[int, str] = {}
            for pr in top_prs:
                try:
                    diff = await _get_diff_for_pr(repo_path, pr, commits)
                    if diff:
                        pr_diffs[pr.number] = diff
                except Exception as e:
                    logger.warning(f"Failed to get diff for PR#{pr.number}: {e}")

            if pr_diffs:
                async def code_progress(done: int, total: int):
                    await emit(WSMessage(
                        type="progress", stage=3,
                        message=f"Analyzing {done} of {total} top-ranked PRs...",
                        progress=0.2 + (done / total) * 0.8,
                    ))

                try:
                    expertise = await analyze_code_batch(top_prs, pr_diffs, on_progress=code_progress)
                    result.expertise_classifications = expertise
                    result.graph = build_graph(contributors, modules, expertise=expertise)
                except Exception as e:
                    logger.error(f"Code analysis failed: {e}")
            else:
                logger.warning("No PR diffs available — skipping code analysis")

            await emit(WSMessage(
                type="partial_result",
                stage=3,
                message="Code analysis complete — expertise mapped",
                progress=1.0,
                data=result.model_dump(),
            ))
        else:
            await emit(WSMessage(
                type="partial_result",
                stage=3,
                message="No PRs available — skipping code analysis",
                progress=1.0,
                data=result.model_dump(),
            ))

        # ── Stage 4: AI Review Analysis ──
        review_prs = get_prs_with_reviews(prs, MAX_PRS_REVIEW_ANALYSIS) if prs else []

        if review_prs:
            await emit(WSMessage(type="progress", stage=4, message="Analyzing review quality...", progress=0.0))

            async def review_progress(done: int, total: int):
                await emit(WSMessage(
                    type="progress", stage=4,
                    message=f"Analyzing {done} of {total} reviewed PRs...",
                    progress=done / total,
                ))

            try:
                review_results = await analyze_review_batch(review_prs, on_progress=review_progress)
                result.review_classifications = review_results
            except Exception as e:
                logger.error(f"Review analysis failed: {e}")

            await emit(WSMessage(
                type="partial_result",
                stage=4,
                message="Review analysis complete",
                progress=1.0,
                data=result.model_dump(),
            ))
        else:
            await emit(WSMessage(
                type="partial_result",
                stage=4,
                message="No reviews available — skipping review analysis",
                progress=1.0,
                data=result.model_dump(),
            ))

        # ── Stage 5: Deep Reasoning ──
        await emit(WSMessage(type="progress", stage=5, message="Deep reasoning with extended thinking...", progress=0.0))

        try:
            pattern_result = await detect_patterns(result)
            result.pattern_result = pattern_result
        except Exception as e:
            logger.error(f"Deep reasoning failed: {e}")
            # Result still usable without deep reasoning

        await emit(WSMessage(
            type="complete",
            stage=5,
            message="Analysis complete!",
            progress=1.0,
            data=result.model_dump(),
        ))

        return result
    finally:
        if clone_path.exists():
            logger.info(f"Cleaning up clone: {clone_path}")
            shutil.rmtree(clone_path, ignore_errors=True)


async def _get_diff_for_pr(repo_path: Path, pr, commits) -> str:
    """Find a commit that matches this PR and get its diff."""
    # Strategy: look for merge commits mentioning the PR number, or use
    # commits by the PR author around the merge time
    for c in commits:
        if f"#{pr.number}" in c.message or f"#{pr.number} " in c.message:
            return await get_diff_for_commit(repo_path, c.hash)

    # Fallback: find commits by the PR author
    author_commits = [
        c for c in commits
        if c.author_name.lower() == pr.author.lower()
        or c.author_email.lower().startswith(pr.author.lower())
    ]
    if author_commits:
        # Use the most recent one
        return await get_diff_for_commit(repo_path, author_commits[0].hash)

    return ""
