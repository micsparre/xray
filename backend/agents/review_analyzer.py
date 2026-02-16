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
- A review includes both the top-level body AND line-level comments on specific code changes.
- Only classify as rubber_stamp if BOTH the body is empty/trivial AND there are zero line comments.
- A reviewer with an empty body but multiple line comments is NOT a rubber stamp — judge quality by the comment content.
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

    review_parts = []
    for r in pr.reviews:
        part = f"Reviewer: {r.author}\nState: {r.state}\nBody: {r.body or '(empty)'}"
        if r.review_comments:
            # Include up to 15 line comments to stay within token limits
            comments_preview = r.review_comments[:15]
            part += f"\nLine comments ({len(r.review_comments)} total):"
            for j, c in enumerate(comments_preview, 1):
                # Truncate long comments
                snippet = c[:300] + "..." if len(c) > 300 else c
                part += f"\n  {j}. {snippet}"
            if len(r.review_comments) > 15:
                part += f"\n  ... and {len(r.review_comments) - 15} more comments"
        else:
            part += "\nLine comments: none"
        review_parts.append(part)
    reviews_text = "\n\n".join(review_parts)

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
                    quality="rubber_stamp" if (len(r.body.strip()) < 10 and not r.review_comments) else "surface",
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
