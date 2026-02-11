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

    # Build expertise lookup: author -> {module -> depth}
    expertise_lookup: dict[str, dict[str, str]] = {}
    if expertise:
        for ec in expertise:
            if ec.author not in expertise_lookup:
                expertise_lookup[ec.author] = {}
            for mod in ec.modules_touched:
                current = expertise_lookup[ec.author].get(mod, "surface")
                if _depth_rank(ec.knowledge_depth) > _depth_rank(current):
                    expertise_lookup[ec.author][mod] = ec.knowledge_depth

    max_commits = max((c.total_commits for c in contributors), default=1)

    # Contributor nodes
    for c in contributors:
        size = 3 + (c.total_commits / max_commits) * 12
        expertise_areas = list(expertise_lookup.get(c.name, {}).keys()) or \
                          list(expertise_lookup.get(c.email, {}).keys())
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

            # Look up expertise depth
            depth = "working"
            for name_or_email in [author_email]:
                if name_or_email in expertise_lookup:
                    depth = expertise_lookup[name_or_email].get(m.module, depth)

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


def _depth_rank(depth: str) -> int:
    return {"surface": 0, "working": 1, "deep": 2, "architect": 3}.get(depth, 1)
