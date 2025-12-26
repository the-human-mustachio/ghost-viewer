import { useState, useMemo, useEffect } from "react";
import Fuse from "fuse.js";
import {
  ShieldAlert,
  RefreshCw,
  Search,
  Trash2,
  Download,
  Maximize2,
  Minimize2,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  FolderTree,
} from "lucide-react";
import { Resource, ScanResult, StateMetadata } from "./types";
import { StackInfoBanner } from "./StackInfoBanner";
import { TypeDropdown } from "./TypeDropdown";

export function GhostHunter({
  metadata,
  onSelect,
  selectedResource,
  result,
  setResult,
  scanning,
  setScanning,
  error,
  setError,
  config,
  setConfig,
  totalResources,
  lastRefreshed,
}: {
  metadata: StateMetadata | null;
  onSelect: (r: Resource) => void;
  selectedResource: Resource | null;
  result: ScanResult | null;
  setResult: (r: ScanResult | null) => void;
  scanning: boolean;
  setScanning: (s: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
  config: { appName: string; stage: string; region: string };
  setConfig: (c: { appName: string; stage: string; region: string }) => void;
  totalResources: number;
  lastRefreshed: Date | null;
}) {
  // View & Filter State
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "categorized">("list");
  const [expansionKey, setExpansionKey] = useState(0);

  useEffect(() => {
    if (metadata && !result && !scanning) {
      setConfig({
        appName: metadata.app !== "Unknown" ? metadata.app : config.appName,
        stage: metadata.stage !== "Unknown" ? metadata.stage : config.stage,
        region: metadata.region !== "Unknown" ? metadata.region : config.region,
      });
    }
  }, [metadata, result, scanning]);

  useEffect(() => {
    if (query !== "") setExpansionKey(-1);
  }, [query]);

  const scan = async () => {
    setScanning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scan failed.");
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message || "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const filteredOrphans = useMemo(() => {
    if (!result) return [];
    let list = result.orphans;
    if (selectedTypes.length > 0)
      list = list.filter((o) => selectedTypes.includes(o.type || "unknown"));
    if (query) {
      const fuse = new Fuse(list, {
        keys: ["type", "name", "arn"],
        threshold: 0.4,
      });
      list = fuse.search(query).map((r) => r.item);
    }
    return list;
  }, [result, query, selectedTypes]);

  const availableTypes = useMemo(() => {
    if (!result) return [];
    let list = result.orphans;
    if (query) {
      const fuse = new Fuse(list, {
        keys: ["type", "name", "arn"],
        threshold: 0.4,
      });
      list = fuse.search(query).map((r) => r.item);
    }
    return Array.from(
      new Set([...list.map((o) => o.type || "unknown"), ...selectedTypes])
    ).sort();
  }, [result, query, selectedTypes]);

  const groupedOrphans = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredOrphans.forEach((o) => {
      const t = o.type || "unknown";
      if (!groups[t]) groups[t] = [];
      groups[t].push(o);
    });
    return Object.entries(groups)
      .map(([typeName, items]) => ({ typeName, items }))
      .sort((a, b) => a.typeName.localeCompare(b.typeName));
  }, [filteredOrphans]);

  const exportOrphans = () => {
    const data = JSON.stringify(filteredOrphans, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ghost-viewer-orphans-${config.appName}-${config.stage}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="sticky top-0 z-10 space-y-4 bg-gray-50/80 backdrop-blur-sm -mt-4 pt-4 pb-4">
        {metadata && (
          <StackInfoBanner
            metadata={metadata}
            totalResources={totalResources}
            lastRefreshed={lastRefreshed}
          />
        )}

        {result && result.orphans && (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col xl:flex-row gap-4 justify-between items-center">
            <div className="flex items-center gap-4 flex-1 w-full min-w-0">
              <div className="relative flex-1 max-w-sm min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search orphans..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <TypeDropdown
                allTypes={availableTypes}
                selected={selectedTypes}
                onChange={setSelectedTypes}
              />
              <div className="flex items-center gap-2">
                {(query || selectedTypes.length > 0) && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setSelectedTypes([]);
                    }}
                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                    title="Clear Filters"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={exportOrphans}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 transition-all text-sm font-medium"
                  title="Export to JSON"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 items-center flex-shrink-0">
              <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                <button
                  onClick={() => setExpansionKey((p) => (p >= 0 ? p + 1 : 1))}
                  className="p-1.5 hover:bg-white rounded transition-all text-gray-500"
                  title="Expand All"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExpansionKey((p) => (p <= 0 ? p - 1 : -1))}
                  className="p-1.5 hover:bg-white rounded transition-all text-gray-500"
                  title="Collapse All"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md ${
                    viewMode === "list"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-gray-500"
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("categorized")}
                  className={`p-1.5 rounded-md ${
                    viewMode === "categorized"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-gray-500"
                  }`}
                  title="Categorized View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          Hunt Configuration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {["appName", "stage", "region"].map((k) => (
            <div key={k}>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1 tracking-wider">
                {k.replace(/([A-Z])/g, " $1")}
              </label>
              <input
                type="text"
                value={(config as any)[k]}
                onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-gray-50/50"
              />
            </div>
          ))}
          <button
            onClick={scan}
            disabled={scanning}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
          >
            {scanning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldAlert className="w-4 h-4" />
            )}
            {scanning ? "Hunting..." : "Start Hunt"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-700 font-medium flex items-center gap-3">
          <ShieldAlert className="w-5 h-5" />
          {error}
        </div>
      )}

      {result && result.orphans && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            {[
              { l: "Tracked", v: result.managedCount, c: "gray" },
              { l: "In AWS", v: result.totalFound, c: "indigo" },
              { l: "Orphans", v: result.orphans.length, c: "red" },
            ].map((s) => (
              <div
                key={s.l}
                className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm"
              >
                <div className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">
                  {s.l}
                </div>
                <div className={`text-4xl font-black mt-2 text-${s.c}-600`}>
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {result.orphans.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg border-red-100">
              <div className="px-6 py-4 bg-red-50 border-b border-red-100 text-red-900 font-bold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                {filteredOrphans.length}{" "}
                {viewMode === "categorized"
                  ? "Categories"
                  : "Orphaned Resources"}{" "}
                Matched
              </div>

              {viewMode === "list" ? (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-sm table-fixed">
                    <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3 w-1/4">Type</th>
                        <th className="px-6 py-3 w-1/3">Physical Name</th>
                        <th className="px-6 py-3">Tags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredOrphans.map((o, i) => {
                        const resource: Resource = {
                          type: `aws:${o.type}`,
                          urn: o.arn,
                          id: o.arn,
                          outputs: {
                            arn: o.arn,
                            name: o.name,
                            region: config.region,
                            ...o.tags,
                          },
                        };
                        return (
                          <tr
                            key={i}
                            onClick={() => onSelect(resource)}
                            className="hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-4 font-mono text-xs text-gray-500 truncate">
                              {o.type}
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-900 truncate">
                              {o.name}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2 overflow-hidden">
                                <span className="px-1.5 py-0.5 bg-gray-100 text-[9px] rounded font-bold text-gray-600 whitespace-nowrap">
                                  App: {o.tags["sst:app"]}
                                </span>
                                <span className="px-1.5 py-0.5 bg-gray-100 text-[9px] rounded font-bold text-gray-600 whitespace-nowrap">
                                  Stage: {o.tags["sst:stage"]}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredOrphans.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                      No orphans match your search.
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-50 w-full">
                  {groupedOrphans.map((group) => (
                    <OrphanTypeGroup
                      key={group.typeName}
                      typeName={group.typeName}
                      items={group.items}
                      expansionKey={expansionKey}
                      onSelect={onSelect}
                      selectedResource={selectedResource}
                      region={config.region}
                    />
                  ))}
                  {groupedOrphans.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                      No orphans match your search.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-green-50 p-12 text-center rounded-xl font-bold text-xl text-green-800 border border-green-200">
              ✅ No orphaned resources found!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrphanTypeGroup({
  typeName,
  items,
  expansionKey,
  onSelect,
  selectedResource,
  region,
}: {
  typeName: string;
  items: any[];
  expansionKey: number;
  onSelect: (r: Resource) => void;
  selectedResource: Resource | null;
  region: string;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (expansionKey > 0) setExpanded(true);
    if (expansionKey < 0) setExpanded(false);
  }, [expansionKey]);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center py-3 px-4 bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer group"
      >
        <div className="mr-2 text-gray-400">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
        <FolderTree className="w-4 h-4 mr-2 text-red-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
          {typeName}
        </span>
        <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-mono font-bold">
          {items.length}
        </span>
      </div>
      {expanded && (
        <div className="bg-white divide-y divide-gray-50">
          {items.map((o, i) => {
            const resource: Resource = {
              type: `aws:${o.type}`,
              urn: o.arn,
              id: o.arn,
              outputs: { arn: o.arn, name: o.name, region, ...o.tags },
            };
            const isSelected = selectedResource?.urn === resource.urn;
            return (
              <div
                key={i}
                onClick={() => onSelect(resource)}
                className={`px-10 py-3 hover:bg-red-50 transition-colors flex justify-between items-center gap-4 cursor-pointer ${
                  isSelected
                    ? "bg-red-50 ring-1 ring-inset ring-red-200 z-10 relative"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 text-sm truncate">
                    {o.name}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono truncate">
                    {o.arn}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <span className="px-1.5 py-0.5 bg-gray-50 text-[9px] rounded font-bold text-gray-500 border border-gray-100">
                    App: {o.tags["sst:app"]}
                  </span>
                  <span className="px-1.5 py-0.5 bg-gray-50 text-[9px] rounded font-bold text-gray-500 border border-gray-100">
                    Stage: {o.tags["sst:stage"]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
