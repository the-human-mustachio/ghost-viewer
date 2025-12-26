import { useState, useEffect, useRef } from "react";
import { RefreshCw, ChevronDown, Check } from "lucide-react";
import { REFRESH_INTERVALS } from "./constants";

export function AutoRefreshButton({
  interval,
  onIntervalChange,
  onRefresh,
  loading,
  isRefreshing,
}: {
  interval: number;
  onIntervalChange: (v: number) => void;
  onRefresh: () => void;
  loading: boolean;
  isRefreshing: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel =
    REFRESH_INTERVALS.find((i) => i.value === interval)?.label || "Manual";

  // Progress animation
  useEffect(() => {
    if (interval === 0 || loading) {
      setProgress(0);
      return;
    }

    // Start filling the bar
    setProgress(0);
    const timeoutId = setTimeout(() => setProgress(100), 50);
    
    // Set a timer to trigger the next visual cycle if the parent interval is slow
    const cycleId = setTimeout(() => {
        setCycleKey(k => k + 1);
    }, interval);

    return () => {
        clearTimeout(timeoutId);
        clearTimeout(cycleId);
    };
  }, [interval, loading, cycleKey]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative flex items-center" ref={ref}>
      <div
        className={`flex items-stretch border rounded-lg overflow-hidden shadow-sm h-9 transition-all relative ${
          interval > 0
            ? "border-indigo-200 bg-indigo-50/30"
            : "border-gray-200 bg-white"
        }`}
      >
        <button
          onClick={onRefresh}
          disabled={loading}
          className={`px-3 py-2 border-r transition-colors flex items-center justify-center disabled:opacity-50 z-10 ${
            interval > 0
              ? "text-indigo-600 border-indigo-100 hover:bg-indigo-50"
              : "text-gray-500 border-gray-100 hover:bg-gray-50"
          }`}
          title="Refresh Now"
        >
          <RefreshCw className={`w-4 h-4 ${(loading || isRefreshing) ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`pl-2 pr-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-colors z-10 ${
            interval > 0
              ? "text-indigo-700 hover:bg-indigo-50"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <span className="whitespace-nowrap min-w-[75px] text-center">
            {currentLabel}
          </span>
          <ChevronDown
            className={`w-3 h-3 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Progress Bar Container */}
        {interval > 0 && (
          <div className="absolute bottom-0 left-0 h-[3px] bg-indigo-500/20 w-full z-0" />
        )}
        {/* Animated Progress Bar */}
        {interval > 0 && (
          <div
            key={cycleKey}
            className={`absolute bottom-0 left-0 h-[3px] bg-indigo-600 z-0 ${
              progress === 100 ? "transition-all ease-linear" : "transition-none"
            }`}
            style={{ 
              width: `${progress}%`,
              transitionDuration: progress === 100 ? `${interval}ms` : '0ms'
            }}
          />
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 text-[10px] font-black uppercase text-gray-400 border-b border-gray-100 tracking-wider">
            Auto Refresh
          </div>
          <div className="py-1">
            {REFRESH_INTERVALS.map((i) => (
              <button
                key={i.value}
                onClick={() => {
                  onIntervalChange(i.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 transition-colors flex items-center justify-between ${
                  interval === i.value
                    ? "text-indigo-600 font-bold bg-indigo-50/50"
                    : "text-gray-600"
                }`}
              >
                {i.label}
                {interval === i.value && (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
