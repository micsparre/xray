interface HowItWorksProps {
  onNavigateHome: () => void;
}

const stages = [
  {
    num: 1,
    title: 'Data Collection',
    description:
      'We clone the repository and extract raw signals from multiple sources to build a complete picture of the codebase.',
    details: [
      'Full commit history with file-level diffs and numstat',
      'Pull requests and review threads via GitHub GraphQL API',
      'File-level blame ownership to map who wrote what',
      'Repository metadata including languages and structure',
    ],
  },
  {
    num: 2,
    title: 'Statistical Analysis',
    description:
      'Raw data is crunched into contributor profiles, module ownership maps, and risk metrics — no AI needed for this stage.',
    details: [
      'Per-contributor commit counts, lines changed, and active file spread',
      'Module-level ownership calculated from blame data',
      'Bus factor scoring using a Gini coefficient over ownership concentration',
      'Recency-weighted activity to distinguish active vs. dormant contributors',
    ],
  },
  {
    num: 3,
    title: 'AI Code Analysis',
    description:
      'Claude reviews the most impactful pull requests to classify each contributor\'s expertise areas and depth.',
    details: [
      'PRs ranked by impact (files changed, lines modified, review activity)',
      'Diff extraction with surrounding context for each top PR',
      'Claude classifies expertise: architecture, performance, security, testing, and more',
      'Results aggregated into a contributor-to-module knowledge graph',
    ],
  },
  {
    num: 4,
    title: 'Review Quality',
    description:
      'Each code review is assessed by AI to gauge whether reviews are thorough, superficial, or actively mentoring.',
    details: [
      'Review comments analyzed for depth, specificity, and constructiveness',
      'Classifications: rubber-stamp, surface-level, thorough, or mentoring',
      'Per-reviewer quality distribution to spot review culture patterns',
      'Cross-referenced with module ownership to find review blind spots',
    ],
  },
  {
    num: 5,
    title: 'Pattern Detection',
    description:
      'Claude uses extended thinking to synthesize all signals into actionable insights about team dynamics.',
    details: [
      'Extended thinking mode for deep multi-step reasoning',
      'Identifies knowledge silos, single points of failure, and collaboration gaps',
      'Generates prioritized recommendations for team resilience',
      'Produces a narrative summary connecting statistical and AI findings',
    ],
  },
];

export function HowItWorks({ onNavigateHome }: HowItWorksProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-16 animate-fade-in">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
            How xray Works
          </h1>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
            A 5-stage AI pipeline that turns raw git history into a knowledge map
            of your engineering team — from data collection to actionable insights.
          </p>
        </div>

        {/* Pipeline overview */}
        <div className="flex items-center justify-center gap-2 mb-16">
          {stages.map((stage, i) => (
            <div key={stage.num} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-xs font-bold text-white">
                  {stage.num}
                </div>
                <span className="text-[10px] text-zinc-400 hidden sm:inline whitespace-nowrap">
                  {stage.title}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div className="w-6 h-px bg-zinc-700" />
              )}
            </div>
          ))}
        </div>

        {/* Stage sections */}
        <div className="space-y-12">
          {stages.map((stage) => (
            <section key={stage.num} className="group">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-600/20 border border-orange-500/30 flex items-center justify-center text-sm font-bold text-orange-400">
                  {stage.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-white mb-1">
                    {stage.title}
                  </h2>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    {stage.description}
                  </p>
                  <ul className="space-y-1.5">
                    {stage.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-16 pt-12 border-t border-white/[0.06]">
          <p className="text-sm text-zinc-400 mb-4">
            See it in action on your own repository.
          </p>
          <button
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 text-sm font-medium text-white hover:from-orange-400 hover:to-amber-500 transition-all"
          >
            Try it now
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
