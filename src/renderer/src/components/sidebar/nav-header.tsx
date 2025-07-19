import vimoLogo from '../../assets/images/vimi-logo.png'

export function VideoRAGHeader() {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <img 
        src={vimoLogo} 
        alt="Vimo" 
        className="size-8 rounded-lg shadow-lg border-2 border-white/20 hover:shadow-xl hover:scale-105 transition-all duration-300 ring-1 ring-gray-200/50" 
      />
      <div className="flex flex-col">
        <span className="text-sm font-semibold">Vimo</span>
        <span className="text-xs text-muted-foreground">AI Assistant</span>
      </div>
    </div>
  );
}
