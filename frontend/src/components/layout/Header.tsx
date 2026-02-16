interface HeaderProps {
  onNavigate?: (path: string) => void;
}

export function Header({ onNavigate }: HeaderProps) {
  return (
    <header className="h-14 border-b border-white/10 bg-zinc-900/80 backdrop-blur flex items-center px-6 gap-3">
      <button
        onClick={() => onNavigate?.('/')}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            xray
          </h1>
          <span className="text-xs text-zinc-500">
            AI-powered knowledge mapping
          </span>
        </div>
      </button>
      <div className="flex-1" />
      <button
        onClick={() => onNavigate?.('/how-it-works')}
        className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
      >
        How It Works
      </button>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/40">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[10px] text-zinc-400">
          Powered by <span className="text-orange-400 font-medium">Claude Opus 4.6</span>
        </span>
      </div>
    </header>
  );
}
