# Brainstorm Log

## Ideas Explored & Killed

### Security Audit Agent
- **Why explored:** Multi-agent security scanning, high impact
- **Why killed:** Crowded space — Greptile, CodeRabbit, Aikido, Snyk, Semgrep all compete here. Hard to differentiate in a 3-min demo.

### Threat Modeling Agent
- **Why explored:** Seemed like an open lane in security
- **Why killed:** ThreatModeler + IriusRisk merged (~300 enterprise customers), Aristiun, Seezo, STRIDE-GPT all exist. Not as open as initially thought.

### AI On-Call / Incident Response Agent
- **Why explored:** Directly in domain (observability startup). Real pain point.
- **Why killed:** Massively competitive — Datadog Bits AI SRE, incident.io AI SRE, Rootly, Harness, Microsoft Azure SRE Agent, Parity. All well-funded.

### Dependency Release Intelligence
- **Why explored:** Personalized analysis of upstream releases against your code
- **Why killed:** User feedback — not a real pain point. "You upgrade, run tests, fix what breaks."

### "Explain This Repo" Architecture Docs
- **Why explored:** Universal pain point, visual output
- **Why killed:** User feedback — AI coding tools (Cursor, Claude Code, Codex) already handle codebase understanding on-the-fly. Less necessary than it seems.

### PR Blast Radius Analyzer
- **Why explored:** No incumbent, visual, in domain
- **Why killed:** Scope concerns — tracing cross-service dependencies is very complex for 5-6 days. User wasn't confident in feasibility.

### Technical Due Diligence Agent
- **Why explored:** No AI competition, clear value prop ($40K engagement → 5 minutes)
- **Why killed:** User lacks domain expertise in due diligence, couldn't sell it authentically.

### Decision Engine / Multi-Agent Debate
- **Why explored:** Novel (agents debating), good "Most Creative Opus 4.6" angle
- **Why killed:** Deprioritized in favor of domain-specific ideas.

### OSS Contribution Matchmaker
- **Why explored:** Wholesome, "Break the Barriers" fit
- **Why killed:** Not in user's domain. User not interested.

### Incident/On-Call Intelligence, Infra Drift, Sales Signals, Cloud Cost
- **Why explored:** "2nd layer" AI ideas across user's domains
- **Why killed:** All require private data to demo. Can't point at a public repo. Demo-ability (30% of score) is critical.

## Why Engineering Team X-Ray Won

1. **"2nd layer" AI philosophy** — AI reveals invisible patterns, humans act on them
2. **Demo-ability** — works on any public GitHub repo, no private data needed
3. **Novel** — no tool reads code to understand team dynamics (others just count metrics)
4. **In domain** — user works on engineering teams daily
5. **Opus 4.6 showcase** — code reading for expertise inference is genuinely novel model use
6. **PS3 fit** — textbook "Amplify Human Judgment"
7. **Buildable in 6 days** — scoped to 3 must-have features with clear cut line
