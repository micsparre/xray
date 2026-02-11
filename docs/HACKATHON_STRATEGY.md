# Hackathon Strategy

## Key Dates
- **Now:** Feb 10, 2026
- **Submission Deadline:** Feb 16, 3:00 PM EST
- **Async Judging:** Feb 16-17
- **Live Finals (Top 6):** Feb 18, 12:00 PM EST

## Time Budget (~6 days)
| Phase | Days | Focus |
|-------|------|-------|
| Architecture + Core Pipeline | Day 1-2 | GitHub ingestion, multi-agent analysis, data model |
| Analysis Engine + Frontend | Day 3-4 | Insight generation, interactive visualization, UI polish |
| Polish + Demo | Day 5 | Edge cases, demo repo testing, UX refinement |
| Demo Video + Submission | Day 6 | Record 3-min video, write summary, submit |

## Judging Criteria & Strategy

### Demo (30%) — THE PRIORITY
- Interactive knowledge graph is the visual centerpiece
- Pre-test on 5+ public repos, pick the most compelling for demo
- Script a tight 3-minute narrative:
  - 0:00-0:20: Problem framing
  - 0:20-0:50: Point at real repo, start analysis
  - 0:50-2:00: Walk through knowledge graph, bus factor, insights
  - 2:00-2:40: "Wow" moment — non-obvious AI insight
  - 2:40-3:00: Impact + vision
- **35% of total effort goes to frontend + demo prep**

### Opus 4.6 Use (25%)
- Multi-agent architecture (not one giant prompt)
- Extended thinking for complex expertise inference
- Show that AI reads CODE, not just metadata
- Demo moment: metrics say X, AI code-reading says Y, AI is right
- Angle for "Most Creative Opus 4.6 Exploration" prize: organizational psychology through code analysis

### Impact (25%)
- Frame around PS3: Amplify Human Judgment
- Costly problems this solves:
  - Key engineer leaves → weeks of knowledge reconstruction
  - Knowledge silos → incidents, slow onboarding
  - Rubber-stamp reviews → bugs ship
  - Conflicting work across teams → rework
- Not "nice to have" — reveals risks that are invisible until they explode

### Depth & Execution (20%)
- Multi-agent with clear separation of concerns
- Layered insights (map → bus factor → review quality → recommendations)
- Thoughtful edge case handling
- Clean, well-structured open source code
- "Keep Thinking" Prize angle: iteration story from newsletter → knowledge graph → organizational intelligence

## Feature Prioritization

### Must-Have (Demo-critical)
- [ ] Interactive Knowledge/Expertise Map visualization
- [ ] Bus Factor Dashboard
- [ ] AI-Inferred Insight Cards (non-obvious revelations)

### Should-Have (adds depth)
- [ ] Knowledge Flow / Review Quality analysis
- [ ] Actionable recommendations ("pair X with Y")

### Cut (mention in pitch, don't build)
- Personalized catch-up view
- Slack/Jira integration
- Historical trends over time
- Automated notifications/alerts

## Risks & Mitigations
| Risk | Severity | Mitigation |
|------|----------|------------|
| Insights are boring/obvious | HIGH | Test on 5+ repos early (day 1-2). If AI can't surface non-obvious insights, pivot scope. |
| Visualization looks bad | HIGH | Use proven graph viz library. Budget real time for polish. |
| Analysis too slow | MEDIUM | Scope to last 3-6 months, top 20 contributors. Stream agent activity. |
| AI makes wrong inferences | MEDIUM | Show confidence levels. Frame as "signals" not "truth." |

## Submission Requirements
- [ ] 3-minute demo video (YouTube/Loom)
- [ ] GitHub repository (open source)
- [ ] Written description/summary (100-200 words)
- [ ] Everything fully open source under approved license
