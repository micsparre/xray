from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

from backend.agents.client import get_client, semaphore
from backend.api.schemas import PRData, ReviewClassification
from backend.config import AI_CALL_TIMEOUT, ANTHROPIC_MODEL

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You assess the quality of code reviews in engineering teams.

Given a PR's reviews (reviewer name, state, body text), classify each review:

## Review Quality Levels
- **rubber_stamp**: LGTM with no substance, empty body, or <10 words. Approved without meaningful review.
- **surface**: Only addresses style, naming, formatting. No logic analysis.
- **thorough**: Addresses logic, edge cases, architecture, or performance. Shows understanding of the change.
- **mentoring**: Teaching moment — explains WHY something should be different, provides context, references patterns or docs.

## Output Fields per Review
- **reviewer**: The reviewer's username
- **quality**: One of the levels above
- **signals**: 2-3 specific observations supporting your classification
- **knowledge_transfer**: true if the review teaches something (mentoring always true, thorough sometimes)
- **summary**: One sentence about this review's quality

## Rules
- If the review body is empty or <10 words, classify as rubber_stamp regardless of approval state.
- CHANGES_REQUESTED doesn't automatically mean thorough — check the content.
- Be calibrated. Most reviews are surface or rubber_stamp. Mentoring is RARE.

Respond with a JSON array of review classifications:
[{
  "reviewer": "string",
  "quality": "string",
  "signals": ["string"],
  "knowledge_transfer": boolean,
  "summary": "string"
}]"""


async def analyze_pr_reviews(pr: PRData) -> list[ReviewClassification]:
    """Analyze review quality for a single PR."""
    client = get_client()

    reviews_text = "\n\n".join([
        f"Reviewer: {r.author}\nState: {r.state}\nBody: {r.body or '(empty)'}"
        for r in pr.reviews
    ])

    user_message = f"""PR #{pr.number}: {pr.title}
Author: {pr.author}
+{pr.additions} -{pr.deletions} across {pr.changed_files} files

--- REVIEWS ---
{reviews_text}
"""

    async with semaphore:
        try:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=ANTHROPIC_MODEL,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_message}],
                ),
                timeout=AI_CALL_TIMEOUT,
            )

            text = response.content[0].text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            data = json.loads(text.strip())
            if not isinstance(data, list):
                data = [data]

            return [
                ReviewClassification(
                    pr_number=pr.number,
                    reviewer=item.get("reviewer", "unknown"),
                    quality=item.get("quality", "surface"),
                    signals=item.get("signals", []),
                    knowledge_transfer=item.get("knowledge_transfer", False),
                    summary=item.get("summary", ""),
                )
                for item in data
            ]

        except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as e:
            logger.warning(f"Review analysis failed for PR #{pr.number}: {e}")
            return [
                ReviewClassification(
                    pr_number=pr.number,
                    reviewer=r.author,
                    quality="rubber_stamp" if len(r.body.strip()) < 10 else "surface",
                    summary=f"Analysis failed: {type(e).__name__}",
                )
                for r in pr.reviews
            ]


async def analyze_batch(
    prs: list[PRData],
    on_progress: Callable | None = None,
) -> list[ReviewClassification]:
    """Analyze reviews for multiple PRs concurrently."""
    tasks = [analyze_pr_reviews(pr) for pr in prs if pr.reviews]

    results = []
    total = len(tasks)
    for i, coro in enumerate(asyncio.as_completed(tasks)):
        batch_results = await coro
        results.extend(batch_results)
        if on_progress:
            await on_progress(i + 1, total)

    return results
