from __future__ import annotations

import re
from collections import defaultdict
from typing import Callable

from backend.config import is_excluded_file
from backend.api.schemas import (
    BlameResult,
    CommitRecord,
    ContributorModuleStats,
    ContributorStats,
    ModuleStats,
)

# Matches GitHub noreply emails: "id+user@users.noreply.github.com" or "user@users.noreply.github.com"
_NOREPLY_RE = re.compile(r'^(?:\d+\+)?(.+)@users\.noreply\.github\.com$', re.IGNORECASE)

# Strip GitHub numeric ID prefix from names like "2937652+micsparre"
_GH_ID_PREFIX_RE = re.compile(r'^\d+\+')

# Heuristic bot detection for git commit authors (complements GraphQL __typename)
_BOT_NAME_PATTERNS = re.compile(r'\[bot\]|github-actions|dependabot|renovate|greenkeeper|semantic-release', re.IGNORECASE)


def is_bot_contributor(name: str, email: str) -> bool:
    """Detect bot contributors from git commit name/email patterns."""
    return bool(_BOT_NAME_PATTERNS.search(name) or _BOT_NAME_PATTERNS.search(email))


def build_email_resolver(login_to_email: dict[str, str]) -> Callable[[str], str]:
    """Build a function that resolves noreply emails to real emails via the login map."""
    # Reverse: noreply-username → real email (from login_to_email)
    cache: dict[str, str] = {}
    for login, email in login_to_email.items():
        cache[login.lower()] = email

    def resolve(email: str) -> str:
        m = _NOREPLY_RE.match(email)
        if m:
            username = m.group(1).lower()
            if username in cache:
                return cache[username]
        return email

    return resolve


def file_to_module(path: str) -> str:
    """Map file path to logical module (top 2 directory levels)."""
    parts = path.split("/")
    if len(parts) >= 2:
        return "/".join(parts[:2])
    return parts[0] if parts else "root"


def build_contributor_stats(
    commits: list[CommitRecord],
    login_to_email: dict[str, str] | None = None,
    bot_emails: set[str] | None = None,
) -> list[ContributorStats]:
    """Aggregate per-contributor statistics."""
    resolve = build_email_resolver(login_to_email or {})
    _bot_emails = bot_emails or set()
    by_author: dict[str, ContributorStats] = {}

    for c in commits:
        key = resolve(c.author_email)
        if key not in by_author:
            # Use the original name, strip GitHub numeric ID prefix (e.g. "2937652+user" → "user")
            name = _GH_ID_PREFIX_RE.sub('', c.author_name)
            bot = is_bot_contributor(c.author_name, c.author_email) or key in _bot_emails
            by_author[key] = ContributorStats(
                name=name,
                email=key,
                is_bot=bot,
                first_commit=c.date,
                last_commit=c.date,
            )
        else:
            # If we already have an entry, prefer longer/more human-readable name
            existing = by_author[key]
            if len(c.author_name) > len(existing.name) and ' ' in c.author_name:
                existing.name = c.author_name

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
    login_to_email: dict[str, str] | None = None,
    bot_emails: set[str] | None = None,
) -> list[ModuleStats]:
    """Build contributor x module matrix with bus factor."""
    resolve = build_email_resolver(login_to_email or {})
    _bot_emails = bot_emails or set()
    modules: dict[str, ModuleStats] = {}

    # Track which emails are bots (from both PR data and commit heuristics)
    all_bot_emails: set[str] = set(_bot_emails)

    # Aggregate commit data per module
    for c in commits:
        author = resolve(c.author_email)
        if is_bot_contributor(c.author_name, c.author_email):
            all_bot_emails.add(author)

        for f in c.files:
            mod = file_to_module(f.path)
            if mod not in modules:
                modules[mod] = ModuleStats(module=mod)
            m = modules[mod]
            m.total_commits += 1

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
            author = resolve(entry.author_email)
            if is_bot_contributor(entry.author_name, entry.author_email):
                all_bot_emails.add(author)
            if author not in m.contributors:
                m.contributors[author] = ContributorModuleStats()
            m.contributors[author].blame_lines += entry.lines
            pct = entry.lines / br.total_lines if br.total_lines > 0 else 0
            m.blame_ownership[author] = m.blame_ownership.get(author, 0) + pct

    # Normalize blame ownership and compute bus factor (excluding bots)
    for m in modules.values():
        total_ownership = sum(m.blame_ownership.values())
        if total_ownership > 0:
            for k in m.blame_ownership:
                m.blame_ownership[k] /= total_ownership
        m.bus_factor = compute_bus_factor(m, exclude_emails=all_bot_emails)

    return sorted(modules.values(), key=lambda m: -m.total_commits)


def compute_bus_factor(module: ModuleStats, exclude_emails: set[str] | None = None) -> float:
    """Compute bus factor using contribution concentration (Gini coefficient).

    Returns 0-1 where 0 = single contributor (highest risk), 1 = evenly distributed.
    Uses blame ownership as the primary signal when available, with commit
    counts as fallback. Excludes bot contributors from the calculation.
    """
    _exclude = exclude_emails or set()

    # Prefer blame ownership (more accurate picture of who "owns" the code)
    if module.blame_ownership:
        weights = [v for k, v in module.blame_ownership.items() if k not in _exclude]
    else:
        weights = [cs.commits for k, cs in module.contributors.items() if k not in _exclude]

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
            if is_excluded_file(f.path):
                continue
            file_counts[f.path] += 1

    sorted_files = sorted(file_counts.items(), key=lambda x: -x[1])
    return [f for f, _ in sorted_files[:top_n]]
