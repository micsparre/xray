interface Props {
  currentStage: number;
  stageProgress: number;
  stageMessage: string;
}

const STAGES = [
  { num: 1, label: 'Data Collection' },
  { num: 2, label: 'Statistical Analysis' },
  { num: 3, label: 'Code Analysis (AI)' },
  { num: 4, label: 'Review Analysis (AI)' },
  { num: 5, label: 'Pattern Detection (AI)' },
];

export function AnalysisProgress({ currentStage, stageProgress, stageMessage }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {STAGES.map((stage) => {
          const isActive = stage.num === currentStage;
          const isDone = stage.num < currentStage;

          return (
            <div
              key={stage.num}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded transition-colors ${
                isActive ? 'bg-zinc-500/10' : ''
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  isDone
                    ? 'bg-green-500 text-white'
                    : isActive
                    ? 'bg-white text-zinc-900 animate-pulse'
                    : 'bg-zinc-700 text-zinc-500'
                }`}
              >
                {isDone ? '\u2713' : stage.num}
              </div>
              <span
                className={`text-xs ${
                  isDone ? 'text-green-400' : isActive ? 'text-white' : 'text-zinc-500'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {currentStage > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full transition-all duration-500"
              style={{ width: `${stageProgress * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-zinc-400 truncate">{stageMessage}</p>
        </div>
      )}
    </div>
  );
}
