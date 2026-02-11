from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

from backend.agents.client import get_client, semaphore
from backend.api.schemas import ExpertiseClassification, PRData
from backend.config import AI_CALL_TIMEOUT, ANTHROPIC_MODEL

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You analyze git diffs to understand expertise depth in engineering teams.

Given a pull request's diff, metadata, and file list, classify the author's expertise:

## Classification Fields

**change_type**: One of: feature, bugfix, refactor, test, docs, config, dependency, performance
**complexity**: One of: trivial, moderate, complex, highly_complex
**knowledge_depth**: One of:
- surface: Template-following, boilerplate, copy-paste patterns
- working: Non-trivial changes showing understanding of the codebase
- deep: Understands edge cases, architecture constraints, performance implications
- architect: Designed or reshaped this area; shows system-level thinking

**expertise_signals**: 2-4 specific observations from the diff that support your classification.
**modules_touched**: The logical modules (top 2 directory levels) this PR touches.
**summary**: One sentence describing what this change does and why it indicates this depth level.

## Calibration
- Be calibrated. Most changes are "working" level.
- "architect" is RARE — only for changes that restructure systems, define new abstractions, or show deep understanding of cross-cutting concerns.
- "surface" is for truly trivial changes: typo fixes, config tweaks, copy-pasted patterns.
- "deep" requires evidence: handling edge cases others would miss, performance-conscious choices, understanding of failure modes.

Respond with valid JSON matching this schema:
{
  "change_type": "string",
  "complexity": "string",
  "knowledge_depth": "string",
  "expertise_signals": ["string"],
  "modules_touched": ["string"],
  "summary": "string"
}"""


async def analyze_pr_expertise(pr: PRData, diff: str) -> ExpertiseClassification:
    """Analyze a single PR's diff to classify expertise depth."""
    client = get_client()

    user_message = f"""PR #{pr.number}: {pr.title}
Author: {pr.author}
Files changed: {pr.changed_files} | +{pr.additions} -{pr.deletions}
Files: {', '.join(pr.files[:20])}

--- DIFF ---
{diff}
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
            # Extract JSON from response (handle markdown code blocks)
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            data = json.loads(text.strip())

            return ExpertiseClassification(
                pr_number=pr.number,
                author=pr.author,
                change_type=data.get("change_type", ""),
                complexity=data.get("complexity", ""),
                knowledge_depth=data.get("knowledge_depth", "working"),
                expertise_signals=data.get("expertise_signals", []),
                modules_touched=data.get("modules_touched", []),
                summary=data.get("summary", ""),
            )

        except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as e:
            logger.warning(f"Code analysis failed for PR #{pr.number}: {e}")
            return ExpertiseClassification(
                pr_number=pr.number,
                author=pr.author,
                knowledge_depth="working",
                summary=f"Analysis failed: {type(e).__name__}",
            )


async def analyze_batch(
    prs: list[PRData],
    diffs: dict[int, str],
    on_progress: Callable | None = None,
) -> list[ExpertiseClassification]:
    """Analyze multiple PRs concurrently."""
    tasks = []
    for pr in prs:
        diff = diffs.get(pr.number, "")
        if not diff:
            continue
        tasks.append(analyze_pr_expertise(pr, diff))

    results = []
    total = len(tasks)
    for i, coro in enumerate(asyncio.as_completed(tasks)):
        result = await coro
        results.append(result)
        if on_progress:
            await on_progress(i + 1, total)

    return results
