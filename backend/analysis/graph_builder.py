from backend.api.schemas import (
    ContributorStats,
    ExpertiseClassification,
    GraphData,
    GraphLink,
    GraphNode,
    ModuleStats,
    ReviewClassification,
)


def bus_factor_color(bf: float) -> str:
    """Map bus factor (0-1) to risk color."""
    if bf < 0.3:
        return "#ef4444"  # red - critical
    elif bf < 0.5:
        return "#f97316"  # orange - high risk
    elif bf < 0.7:
        return "#eab308"  # yellow - moderate
    else:
        return "#22c55e"  # green - healthy


def bus_factor_risk(bf: float) -> str:
    if bf < 0.3:
        return "critical"
    elif bf < 0.5:
        return "high"
    elif bf < 0.7:
        return "moderate"
    return "low"


def build_graph(
    contributors: list[ContributorStats],
    modules: list[ModuleStats],
    expertise: list[ExpertiseClassification] | None = None,
    reviews: list[ReviewClassification] | None = None,
) -> GraphData:
    """Build knowledge graph from stats, optionally enriched with AI classifications."""
    nodes: list[GraphNode] = []
    links: list[GraphLink] = []

    # Build expertise lookup keyed by email: email -> {module -> depth}
    # Expertise classifications use GitHub usernames as author, but module
    # contributors are keyed by git email. Build a username->email mapping.
    expertise_by_email: dict[str, dict[str, str]] = {}
    if expertise:
        username_to_email = _build_username_email_map(
            contributors, [ec.author for ec in expertise]
        )

        for ec in expertise:
            email = username_to_email.get(ec.author.lower(), "")
            if not email:
                continue
            if email not in expertise_by_email:
                expertise_by_email[email] = {}
            for mod in ec.modules_touched:
                current = expertise_by_email[email].get(mod, "surface")
                if _depth_rank(ec.knowledge_depth) > _depth_rank(current):
                    expertise_by_email[email][mod] = ec.knowledge_depth

    max_commits = max((c.total_commits for c in contributors), default=1)

    # Contributor nodes
    for c in contributors:
        size = 3 + (c.total_commits / max_commits) * 12
        expertise_areas = list(expertise_by_email.get(c.email, {}).keys())
        nodes.append(GraphNode(
            id=f"c:{c.email}",
            type="contributor",
            label=c.name,
            size=size,
            color="#3b82f6",  # blue
            total_commits=c.total_commits,
            total_lines=c.total_additions + c.total_deletions,
            expertise_areas=expertise_areas,
        ))

    # Module nodes (top 20 by commit count)
    top_modules = modules[:20]
    max_mod_commits = max((m.total_commits for m in top_modules), default=1)

    for m in top_modules:
        size = 5 + (m.total_commits / max_mod_commits) * 15
        nodes.append(GraphNode(
            id=f"m:{m.module}",
            type="module",
            label=m.module,
            size=size,
            color=bus_factor_color(m.bus_factor),
            bus_factor=m.bus_factor,
            risk_level=bus_factor_risk(m.bus_factor),
        ))

    # Links: contributor -> module
    module_set = {m.module for m in top_modules}
    for m in top_modules:
        for author_email, cs in m.contributors.items():
            weight = cs.commits / max_mod_commits
            if weight < 0.01:
                continue

            # Look up expertise depth by email
            depth = expertise_by_email.get(author_email, {}).get(m.module, "working")

            links.append(GraphLink(
                source=f"c:{author_email}",
                target=f"m:{m.module}",
                weight=round(weight, 3),
                commits=cs.commits,
                expertise_depth=depth,
            ))

    # Filter out orphan nodes (contributors with no links to top modules)
    linked_ids = {l.source for l in links} | {l.target for l in links}
    nodes = [n for n in nodes if n.id in linked_ids]

    return GraphData(nodes=nodes, links=links)


def _build_username_email_map(
    contributors: list[ContributorStats],
    usernames: list[str],
) -> dict[str, str]:
    """Map GitHub usernames to git emails using multiple heuristics."""
    result: dict[str, str] = {}
    username_set = {u.lower() for u in usernames}
    unmatched = set(username_set)

    for c in contributors:
        email_lower = c.email.lower()
        prefix = email_lower.split("@")[0]
        # Handle noreply: "12345+username@users.noreply.github.com"
        if "+" in prefix:
            prefix = prefix.split("+", 1)[1]
        domain = email_lower.split("@")[1] if "@" in email_lower else ""
        domain_name = domain.split(".")[0] if domain else ""

        for uname in list(unmatched):
            # Strategy 1: exact prefix match (davidism@gmail.com ↔ davidism)
            if uname == prefix:
                result[uname] = c.email
                unmatched.discard(uname)
            # Strategy 2: username in domain name (m@mitchellh.com ↔ mitchellh)
            elif uname == domain_name:
                result[uname] = c.email
                unmatched.discard(uname)
            # Strategy 3: prefix starts with username or vice versa (3+ chars)
            elif len(uname) >= 3 and (prefix.startswith(uname) or uname.startswith(prefix)):
                result[uname] = c.email
                unmatched.discard(uname)

    return result


def _depth_rank(depth: str) -> int:
    return {"surface": 0, "working": 1, "deep": 2, "architect": 3}.get(depth, 1)
