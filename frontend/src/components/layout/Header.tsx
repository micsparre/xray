export function Header() {
  return (
    <header className="h-14 border-b border-white/10 bg-zinc-900/80 backdrop-blur flex items-center px-6 gap-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-white tracking-tight">
        xray
      </h1>
      <span className="text-xs text-zinc-500 ml-1 mt-0.5">
        AI-powered knowledge mapping
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/40">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[10px] text-zinc-400">
          Powered by <span className="text-orange-400 font-medium">Claude Opus 4.6</span>
        </span>
      </div>
    </header>
  );
}
