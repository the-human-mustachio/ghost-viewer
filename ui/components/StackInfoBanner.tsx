import { Info } from "lucide-react";
import { StateMetadata } from "./types";

export function StackInfoBanner({
  metadata,
  totalResources,
  lastRefreshed,
}: {
  metadata: StateMetadata;
  totalResources: number;
  lastRefreshed: Date | null;
}) {
  return (
    <div className="bg-indigo-900 text-indigo-100 p-4 rounded-xl shadow-lg border border-indigo-800 flex flex-wrap gap-x-8 gap-y-2 items-center text-xs">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-indigo-400" />{" "}
        <span className="font-bold uppercase tracking-wider text-indigo-300">
          Stack Info
        </span>
      </div>
      {Object.entries(metadata).map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <span className="text-[10px] text-indigo-400 uppercase font-black">
            {k}
          </span>
          <span className="font-mono font-bold text-white">{v}</span>
        </div>
      ))}
      <div className="flex flex-col">
        <span className="text-[10px] text-indigo-400 uppercase font-black">
          Resources
        </span>
        <span className="font-mono font-bold text-white">{totalResources}</span>
      </div>
      {lastRefreshed && (
        <div className="flex flex-col">
          <span className="text-[10px] text-indigo-400 uppercase font-black">
            Last Refreshed
          </span>
          <span className="font-mono font-bold text-white">
            {lastRefreshed.toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
