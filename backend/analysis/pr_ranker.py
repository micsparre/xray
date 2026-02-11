from backend.api.schemas import PRData


def rank_prs(prs: list[PRData], top_n: int = 30) -> list[PRData]:
    """Rank PRs by significance for AI analysis pre-filtering.

    Score based on: size + breadth + discussion + controversy.
    """
    scored: list[tuple[float, PRData]] = []

    for pr in prs:
        size_score = min((pr.additions + pr.deletions) / 500, 3.0)
        breadth_score = min(pr.changed_files / 5, 2.0)
        discussion_score = min(pr.comments / 3, 2.0)

        # Controversy: changes requested or many reviews
        controversy = 0.0
        for r in pr.reviews:
            if r.state == "CHANGES_REQUESTED":
                controversy += 1.5
            elif r.state == "APPROVED":
                controversy += 0.3
            elif r.state == "COMMENTED":
                controversy += 0.5

        total = size_score + breadth_score + discussion_score + controversy
        scored.append((total, pr))

    scored.sort(key=lambda x: -x[0])
    return [pr for _, pr in scored[:top_n]]


def get_prs_with_reviews(prs: list[PRData], top_n: int = 20) -> list[PRData]:
    """Filter to PRs that actually have review content."""
    with_reviews = [
        pr for pr in prs
        if any(r.body.strip() for r in pr.reviews)
    ]
    # Sort by review depth
    with_reviews.sort(key=lambda pr: sum(len(r.body) for r in pr.reviews), reverse=True)
    return with_reviews[:top_n]
