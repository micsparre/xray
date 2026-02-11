from collections import defaultdict

from backend.api.schemas import (
    BlameResult,
    CommitRecord,
    ContributorModuleStats,
    ContributorStats,
    ModuleStats,
)


def file_to_module(path: str) -> str:
    """Map file path to logical module (top 2 directory levels)."""
    parts = path.split("/")
    if len(parts) >= 2:
        return "/".join(parts[:2])
    return parts[0] if parts else "root"


def build_contributor_stats(commits: list[CommitRecord]) -> list[ContributorStats]:
    """Aggregate per-contributor statistics."""
    by_author: dict[str, ContributorStats] = {}

    for c in commits:
        key = c.author_email
        if key not in by_author:
            by_author[key] = ContributorStats(
                name=c.author_name,
                email=c.author_email,
                first_commit=c.date,
                last_commit=c.date,
            )

        s = by_author[key]
        s.total_commits += 1
        for f in c.files:
            s.total_additions += f.additions
            s.total_deletions += f.deletions
            mod = file_to_module(f.path)
            if mod not in s.modules:
                s.modules.append(mod)

        if c.date < s.first_commit:
            s.first_commit = c.date
        if c.date > s.last_commit:
            s.last_commit = c.date

    return sorted(by_author.values(), key=lambda s: -s.total_commits)


def build_module_stats(
    commits: list[CommitRecord],
    blame_results: list[BlameResult],
) -> list[ModuleStats]:
    """Build contributor x module matrix with bus factor."""
    modules: dict[str, ModuleStats] = {}

    # Aggregate commit data per module
    for c in commits:
        for f in c.files:
            mod = file_to_module(f.path)
            if mod not in modules:
                modules[mod] = ModuleStats(module=mod)
            m = modules[mod]
            m.total_commits += 1

            author = c.author_email
            if author not in m.contributors:
                m.contributors[author] = ContributorModuleStats()
            cs = m.contributors[author]
            cs.commits += 1
            cs.additions += f.additions
            cs.deletions += f.deletions

    # Integrate blame data
    for br in blame_results:
        mod = file_to_module(br.file_path)
        if mod not in modules:
            modules[mod] = ModuleStats(module=mod)
        m = modules[mod]
        m.total_lines += br.total_lines
        for entry in br.entries:
            author = entry.author_email
            if author not in m.contributors:
                m.contributors[author] = ContributorModuleStats()
            m.contributors[author].blame_lines += entry.lines
            pct = entry.lines / br.total_lines if br.total_lines > 0 else 0
            m.blame_ownership[author] = m.blame_ownership.get(author, 0) + pct

    # Normalize blame ownership and compute bus factor
    for m in modules.values():
        total_ownership = sum(m.blame_ownership.values())
        if total_ownership > 0:
            for k in m.blame_ownership:
                m.blame_ownership[k] /= total_ownership
        m.bus_factor = compute_bus_factor(m)

    return sorted(modules.values(), key=lambda m: -m.total_commits)


def compute_bus_factor(module: ModuleStats) -> float:
    """Compute bus factor using contribution concentration (Gini coefficient).

    Returns 0-1 where 0 = single contributor (highest risk), 1 = evenly distributed.
    Uses blame ownership as the primary signal when available, with commit
    counts as fallback.
    """
    # Prefer blame ownership (more accurate picture of who "owns" the code)
    if module.blame_ownership:
        weights = list(module.blame_ownership.values())
    else:
        weights = [cs.commits for cs in module.contributors.values()]

    if not weights or sum(weights) == 0:
        return 0.0

    n = len(weights)
    if n == 1:
        return 0.0

    total = sum(weights)
    weights_sorted = sorted(weights)

    # Standard Gini coefficient: G = (2 * sum(rank_i * x_i)) / (n * total) - (n+1)/n
    rank_weighted_sum = sum((i + 1) * w for i, w in enumerate(weights_sorted))
    gini = (2 * rank_weighted_sum) / (n * total) - (n + 1) / n

    # Invert: high gini = concentrated = low bus factor (risky)
    bus_factor = 1.0 - gini
    return round(max(0.0, min(1.0, bus_factor)), 2)


def get_most_changed_files(commits: list[CommitRecord], top_n: int = 30) -> list[str]:
    """Find the N most frequently changed files (for blame analysis)."""
    file_counts: dict[str, int] = defaultdict(int)
    for c in commits:
        for f in c.files:
            file_counts[f.path] += 1

    sorted_files = sorted(file_counts.items(), key=lambda x: -x[1])
    return [f for f, _ in sorted_files[:top_n]]
