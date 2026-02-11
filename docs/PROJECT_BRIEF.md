# Engineering Team X-Ray

## One-Liner
AI that reads your codebase to reveal the invisible knowledge structure of your engineering team.

## Problem Statement
**PS3 — Amplify Human Judgment:** Build AI that makes researchers, professionals, and decision-makers dramatically more capable — without taking them out of the loop.

## The Problem
Your git history is the richest dataset about your engineering organization — but nobody reads it that way.

Existing tools (LinearB, Jellyfish, GitHub Insights) **count metrics**: commits, cycle time, lines changed. They tell you "42 PRs merged this week" but not "Alice is the only person who understands the billing reconciliation logic, and she's about to go on vacation."

The qualitative understanding — who truly owns what, where knowledge is siloed, whether code reviews are actually transferring knowledge — lives only in the heads of senior engineering managers who've been around long enough to observe it.

## The Solution
A multi-agent system powered by Opus 4.6 that analyzes a GitHub repository and reveals:

1. **Knowledge/Expertise Map** — Interactive visualization of who truly owns what, inferred by reading actual code diffs (not counting commits)
2. **Bus Factor Dashboard** — Where are the knowledge risks? Which areas have single points of failure?
3. **AI-Inferred Insight Cards** — Non-obvious revelations about team dynamics, knowledge distribution, and emerging patterns
4. **Knowledge Flow Analysis** — Are code reviews actually transferring knowledge, or rubber stamps?
5. **Actionable Recommendations** — "Pair X with Y for the next PR in this module to spread knowledge"

## The "2nd Layer" AI Approach
The AI doesn't write code, find bugs, or replace anyone. It reads the same git history every engineer has access to and **reveals patterns no human could see** across thousands of commits and reviews. Humans decide what to do about it.

## Key Differentiator: Code Reading, Not Commit Counting
Opus 4.6 reads actual code diffs to understand expertise depth:
- "Alice made 3 commits but they redesigned the core payment architecture. Bob made 50 commits but they were all config tweaks. Alice is the real expert."
- This is impossible with metrics-only tools. It requires the model to understand code.

## Target Users
- Engineering managers understanding team dynamics
- Tech leads identifying knowledge risks
- ICs wanting to know who to ask about unfamiliar code
- Teams onboarding new members

## Competitive Landscape
| Tool | What it does | Gap |
|------|-------------|-----|
| LinearB / Jellyfish | DORA metrics, cycle time | Counts commits, doesn't read code |
| GitHub Insights | Activity graphs, contribution charts | Pure metadata, no qualitative analysis |
| Pluralsight Flow | Engineering analytics | Metrics dashboard, no knowledge inference |

None of them read the code. They count. That's the gap.
