import { useState, useEffect, useCallback } from "react";
import { Layers, Check, X, Settings, RefreshCw } from "lucide-react";
import { AutoRefreshButton } from "./components/AutoRefreshButton";
import { DetailsPanel } from "./components/DetailsPanel";
import { StateExplorer } from "./components/StateExplorer";
import { GhostHunter } from "./components/GhostHunter";
import { COMMON_REGIONS } from "./components/constants";
import { Resource, ScanResult, StateMetadata } from "./components/types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"explorer" | "hunter">("explorer");
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );

  // Sync selected resource when resources list updates
  useEffect(() => {
    if (selectedResource) {
      const updated = resources.find((r) => r.urn === selectedResource.urn);
      if (updated) {
        // Only update if it's a different object but same URN
        if (updated !== selectedResource) {
          setSelectedResource(updated);
        }
      } else {
        // If it's gone from the list, close the panel
        setSelectedResource(null);
      }
    }
  }, [resources]);

  const [metadata, setMetadata] = useState<StateMetadata | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config State
  const [statePath, setStatePath] = useState<string>("");
  const [s3Region, setS3Region] = useState("us-west-2");
  const [showConfig, setShowConfig] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);

  // Hunter Persistant State
  const [hunterResult, setHunterResult] = useState<ScanResult | null>(null);
  const [hunterScanning, setHunterScanning] = useState(false);
  const [hunterError, setHunterError] = useState<string | null>(null);
  const [hunterConfig, setHunterConfig] = useState({
    appName: "",
    stage: "",
    region: "us-east-1",
  });

  const fetchState = useCallback(
    (detected?: { app: string; stage: string }, background: boolean = false) => {
      if (!background) setLoading(true);
      setRefreshing(true);
      fetch("/api/state")
        .then((res) => res.json())
        .then((data) => {
          const list =
            data.latest?.resources ||
            data.checkpoint?.latest?.resources ||
            data.deployment?.resources ||
            [];
          setResources(list);

          // improved metadata extraction
          let stackName = data.stack || data.deployment?.stack || "";
          let app = detected?.app || "Unknown";
          let stage = detected?.stage || "Unknown";

          if (app === "Unknown" || stage === "Unknown") {
            if (stackName) {
              const parts = stackName.split("/");
              if (parts.length >= 3) {
                app = app === "Unknown" ? parts[1] : app;
                stage = stage === "Unknown" ? parts[2] : stage;
              } else {
                app = app === "Unknown" ? stackName : app;
              }
            } else if (list.length > 0) {
              const refResource =
                list.find((r: any) => r.type !== "pulumi:pulumi:Stack") ||
                list[0];
              if (refResource?.urn) {
                const parts = refResource.urn.split("::");
                if (parts.length >= 3) {
                  const urnHeader = parts[0].split(":");
                  if (urnHeader.length >= 3) {
                    stage = stage === "Unknown" ? urnHeader[2] : stage;
                  }
                  app = app === "Unknown" ? parts[1] : app;
                }
              }
            }
          }

          const provider = list.find(
            (r: any) => r.type === "pulumi:providers:aws"
          );
          const arnSample =
            list.find((r: any) => r.outputs?.arn)?.outputs?.arn || "";

          setMetadata({
            app,
            stage,
            region: provider?.inputs?.region || "us-west-2",
            account: arnSample.split(":")[4] || "Unknown",
          });

          setLastRefreshed(new Date());
          if (!background) setLoading(false);
          setRefreshing(false);
          setError(null);
        })
        .catch((e) => {
          console.error(e);
          setError("Failed to load state.json. Check console for details.");
          if (!background) setLoading(false);
          setRefreshing(false);
        });
    },
    []
  );

  useEffect(() => {
    if (refreshInterval > 0) {
      const id = setInterval(() => fetchState(undefined, true), refreshInterval);
      return () => clearInterval(id);
    }
  }, [refreshInterval, fetchState]);

  useEffect(() => {
    // 1. Get Initial Config
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.stateFile && data.stateFile.startsWith("s3://")) {
          const parts = data.stateFile.split(":");
          if (parts.length > 2) {
            // s3://bucket/key:region
            setStatePath(parts.slice(0, 2).join(":"));
            setS3Region(parts[2]);
          } else {
            setStatePath(data.stateFile);
          }
        } else {
          setStatePath(data.stateFile);
        }
        // 2. Load State
        fetchState(
          data.app && data.stage
            ? { app: data.app, stage: data.stage }
            : undefined
        );
      });
  }, []);

  const handleUpdateConfig = () => {
    const finalPath =
      statePath.startsWith("s3://") && s3Region
        ? `${statePath}:${s3Region}`
        : statePath;

    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stateFile: finalPath }),
    })
      .then((res) => res.json())
      .then((data) => {
        setShowConfig(false);
        setHunterResult(null); // Clear stale results
        fetchState(
          data.app && data.stage
            ? { app: data.app, stage: data.stage }
            : undefined
        );
      });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden h-screen relative">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40 flex-shrink-0">
          <div className="w-[80%] mx-auto px-4 sm:px-6 lg:px-8 flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                Ghost Viewer
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <AutoRefreshButton
                interval={refreshInterval}
                onIntervalChange={setRefreshInterval}
                onRefresh={() => fetchState(undefined, true)}
                loading={loading && !refreshing}
                isRefreshing={refreshing}
              />
              {showConfig ? (
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg animate-in fade-in slide-in-from-top-2">
                  <input
                    type="text"
                    value={statePath}
                    onChange={(e) => setStatePath(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                    placeholder="/path/to/state.json or s3://bucket/key"
                  />
                  {statePath.startsWith("s3://") && (
                    <select
                      value={s3Region}
                      onChange={(e) => setS3Region(e.target.value)}
                      className="px-2 py-1.5 text-sm bg-white border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {COMMON_REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={handleUpdateConfig}
                    className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowConfig(false)}
                    className="p-1.5 text-gray-500 hover:bg-gray-200 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfig(true)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-transparent hover:border-gray-200 transition-all"
                  title={statePath}
                >
                  <Settings className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">
                    {statePath ? statePath.split("/").pop() : "Set State Path"}
                  </span>
                </button>
              )}

              <nav className="flex space-x-1 bg-gray-100 p-1 my-auto rounded-lg">
                <button
                  onClick={() => {
                    setActiveTab("explorer");
                    setSelectedResource(null);
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === "explorer"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Explorer
                </button>
                <button
                  onClick={() => {
                    setActiveTab("hunter");
                    setSelectedResource(null);
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === "hunter"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Hunter
                </button>
              </nav>
            </div>
          </div>
        </header>
        <main className="w-[80%] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 overflow-y-scroll">
          {loading ? (
            <div className="py-20 text-center text-indigo-500">
              <RefreshCw className="w-10 h-10 animate-spin mx-auto" />
            </div>
          ) : error ? (
            <div className="bg-red-50 p-6 rounded-xl text-red-700">{error}</div>
          ) : activeTab === "explorer" ? (
            <StateExplorer
              resources={resources}
              onSelect={setSelectedResource}
              metadata={metadata}
              selectedResource={selectedResource}
              lastRefreshed={lastRefreshed}
            />
          ) : (
            <GhostHunter
              metadata={metadata}
              onSelect={setSelectedResource}
              selectedResource={selectedResource}
              result={hunterResult}
              setResult={setHunterResult}
              scanning={hunterScanning}
              setScanning={setHunterScanning}
              error={hunterError}
              setError={setHunterError}
              config={hunterConfig}
              setConfig={setHunterConfig}
              totalResources={resources.length}
              lastRefreshed={lastRefreshed}
            />
          )}
        </main>
      </div>
      <DetailsPanel
        resource={selectedResource}
        onClose={() => setSelectedResource(null)}
        allResources={resources}
      />
      {selectedResource && (
        <div
          className="fixed inset-0 bg-black/10 z-40"
          onClick={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
}