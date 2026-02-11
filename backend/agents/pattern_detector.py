import asyncio
import json
import logging

from backend.agents.client import get_client
from backend.api.schemas import (
    AnalysisResult,
    InsightCard,
    PatternDetectionResult,
)
from backend.config import ANTHROPIC_MODEL, PATTERN_THINKING_BUDGET

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert at detecting hidden patterns in engineering team dynamics.

You will receive aggregated data about a repository: contributor stats, module ownership, bus factors, expertise classifications, and review quality assessments.

Your job is to find things a human scanning git log would NEVER notice.

## What to Look For
- **Bus factor crisis**: Modules where one person holds all knowledge
- **Silent knowledge drain**: Contributors whose last commit is old but hold critical blame ownership
- **Review blindspots**: Modules with low review quality or no cross-team review
- **Hidden experts**: Low commit count but architect-level changes on critical modules
- **Cross-pollinators**: People who bridge multiple modules (valuable for knowledge sharing)
- **Emerging owners**: Recently active contributors taking over from original authors
- **Review asymmetry**: Reviewers who are thorough on some modules but rubber-stamp others
- **Knowledge silos**: Clusters of people who only review each other's code

## Output Format
Respond with JSON:
{
  "executive_summary": "2-3 sentence overview of the team's knowledge health",
  "insights": [
    {
      "category": "risk|opportunity|pattern|recommendation",
      "title": "Short, specific title",
      "description": "Detailed explanation with specific names, modules, and evidence",
      "severity": "low|medium|high|critical",
      "people": ["person1", "person2"],
      "modules": ["module1", "module2"]
    }
  ],
  "recommendations": ["Specific, actionable recommendation 1", "..."]
}

## Rules
- Be SPECIFIC: Name people and modules. "User X has 89% blame ownership of module Y" not "some modules have low bus factor".
- Be SURPRISING: Don't state the obvious ("the top committer knows the most"). Find non-obvious connections.
- Be ACTIONABLE: Each insight should suggest what a team lead could DO about it.
- Generate 5-10 insights, prioritized by impact.
- Keep executive_summary under 100 words.
- Keep each recommendation under 50 words."""


async def detect_patterns(result: AnalysisResult) -> PatternDetectionResult:
    """Run pattern detection with extended thinking on aggregated data (streaming)."""
    client = get_client()
    data_summary = _build_data_summary(result)

    try:
        # Use streaming to avoid SDK timeout for extended thinking
        text = ""
        async with client.messages.stream(
            model=ANTHROPIC_MODEL,
            max_tokens=16000,
            thinking={
                "type": "enabled",
                "budget_tokens": PATTERN_THINKING_BUDGET,
            },
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": data_summary}],
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta":
                    if hasattr(event.delta, "text"):
                        text += event.delta.text

        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        data = json.loads(text.strip())

        return PatternDetectionResult(
            executive_summary=data.get("executive_summary", ""),
            insights=[
                InsightCard(
                    category=i.get("category", "pattern"),
                    title=i.get("title", ""),
                    description=i.get("description", ""),
                    severity=i.get("severity", "medium"),
                    people=i.get("people", []),
                    modules=i.get("modules", []),
                )
                for i in data.get("insights", [])
            ],
            recommendations=data.get("recommendations", []),
        )

    except json.JSONDecodeError as e:
        logger.error(f"Pattern detection JSON parse failed: {e}\nRaw text: {text[:500]}")
        return PatternDetectionResult(
            executive_summary="Pattern detection completed but output parsing failed.",
            insights=[],
            recommendations=[],
        )
    except Exception as e:
        logger.error(f"Pattern detection failed: {e}")
        return PatternDetectionResult(
            executive_summary=f"Pattern detection encountered an error: {type(e).__name__}",
            insights=[],
            recommendations=[],
        )


def _build_data_summary(result: AnalysisResult) -> str:
    """Build a structured text summary of all analysis data for the AI."""
    parts = [
        f"# Repository Analysis: {result.repo_name}",
        f"Period: last {result.analysis_months} months",
        f"Total commits: {result.total_commits} | Contributors: {result.total_contributors} | PRs analyzed: {result.total_prs}",
        "",
        "## Top Contributors",
    ]

    for c in result.contributors[:15]:
        parts.append(
            f"- {c.name} ({c.email}): {c.total_commits} commits, "
            f"+{c.total_additions}/-{c.total_deletions} lines, "
            f"active in: {', '.join(c.modules[:5])}"
        )

    parts.append("\n## Module Ownership & Bus Factor")
    for m in result.modules[:15]:
        top_owners = sorted(
            m.blame_ownership.items(), key=lambda x: -x[1]
        )[:3]
        ownership_str = ", ".join(
            f"{email}: {pct:.0%}" for email, pct in top_owners
        )
        parts.append(
            f"- **{m.module}** (bus_factor={m.bus_factor:.2f}): "
            f"{m.total_commits} commits, ownership: [{ownership_str}]"
        )

    if result.expertise_classifications:
        parts.append("\n## AI Expertise Classifications")
        for ec in result.expertise_classifications:
            parts.append(
                f"- PR#{ec.pr_number} by {ec.author}: {ec.knowledge_depth} "
                f"({ec.change_type}, {ec.complexity}) — {ec.summary}"
            )

    if result.review_classifications:
        parts.append("\n## Review Quality Assessments")
        for rc in result.review_classifications:
            parts.append(
                f"- PR#{rc.pr_number} reviewer {rc.reviewer}: {rc.quality} "
                f"(knowledge_transfer={rc.knowledge_transfer}) — {rc.summary}"
            )

    return "\n".join(parts)
