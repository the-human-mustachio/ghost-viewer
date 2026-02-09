import { useState } from "react";
import { Search, Database, Folder, FileJson, ChevronRight, AlertCircle, Loader2, X, RefreshCw } from "lucide-react";
import { COMMON_REGIONS } from "./constants";

interface S3BrowserProps {
  onSelect: (path: string, region: string) => void;
  onClose: () => void;
}

export function S3Browser({ onSelect, onClose }: S3BrowserProps) {
  const [region, setRegion] = useState("us-east-1");
  const [bootstrap, setBootstrap] = useState<any>(null);
  const [apps, setApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBootstrap = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/s3/bootstrap?region=${region}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBootstrap(data);
      fetchApps(data.state, region);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const fetchApps = async (bucket: string, r: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/s3/list-apps?bucket=${bucket}&region=${r}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setApps(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStages = async (appName: string) => {
    setSelectedApp(appName);
    setLoading(true);
    try {
      const res = await fetch(`/api/s3/list-stages?bucket=${bootstrap.state}&region=${region}&app=${appName}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStages(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] border border-gray-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-200">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">S3 State Browser</h2>
              <p className="text-xs text-gray-500 font-medium">Find and select SST Ion state files</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {!bootstrap ? (
            <div className="space-y-6 py-8">
              <div className="text-center space-y-2">
                <label className="block text-sm font-semibold text-gray-700">AWS Region</label>
                <p className="text-xs text-gray-400">Select the region where your SST app is bootstrapped</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all appearance-none cursor-pointer"
                >
                  {COMMON_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={fetchBootstrap}
                  disabled={loading}
                  className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Connect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="flex items-center gap-3 text-xs font-mono bg-indigo-900 text-indigo-100 p-3 rounded-xl border border-indigo-800 shadow-inner">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="opacity-70">Bucket:</span>
                  <span className="font-bold text-white">{bootstrap.state}</span>
                  <span className="bg-indigo-700/50 px-2 py-0.5 rounded ml-auto text-[10px] tracking-widest uppercase">{region}</span>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Apps List */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                      <Folder className="w-3 h-3 text-indigo-500" /> Apps
                    </label>
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden h-64 overflow-y-auto shadow-inner custom-scrollbar">
                      {apps.length === 0 && !loading && (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2">
                          <Folder className="w-8 h-8 text-gray-200" />
                          <p className="text-gray-400 text-sm">No apps found in this bucket</p>
                        </div>
                      )}
                      <div className="divide-y divide-gray-100/50">
                        {apps.map(app => (
                          <button
                            key={app}
                            onClick={() => fetchStages(app)}
                            className={`w-full text-left px-5 py-4 text-sm flex items-center justify-between transition-all ${selectedApp === app ? 'bg-white text-indigo-700 font-bold shadow-sm' : 'hover:bg-white/50 text-gray-600'}`}
                          >
                            <span className="truncate">{app}</span>
                            <ChevronRight className={`w-4 h-4 flex-shrink-0 ${selectedApp === app ? 'text-indigo-500' : 'text-gray-300'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stages List */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                      <FileJson className="w-3 h-3 text-purple-500" /> Stages
                    </label>
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden h-64 overflow-y-auto shadow-inner custom-scrollbar">
                      {!selectedApp ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2 opacity-50">
                          <ChevronRight className="w-8 h-8 text-gray-200 -rotate-90" />
                          <p className="text-gray-400 text-sm italic">Select an app first</p>
                        </div>
                      ) : stages.length === 0 && !loading ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2">
                          <FileJson className="w-8 h-8 text-gray-200" />
                          <p className="text-gray-400 text-sm">No state files found</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100/50">
                          {stages.map(stage => (
                            <button
                              key={stage}
                              onClick={() => onSelect(`s3://${bootstrap.state}/app/${selectedApp}/${stage}.json`, region)}
                              className="w-full text-left px-5 py-4 text-sm flex items-center justify-between hover:bg-white text-gray-600 group transition-all"
                            >
                              <span className="truncate font-medium">{stage}</span>
                              <div className="bg-green-500 text-white text-[9px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">SELECT</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
               </div>
               
               <div className="pt-2 flex justify-center">
                 <button 
                    onClick={() => setBootstrap(null)}
                    className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors uppercase tracking-widest flex items-center gap-2"
                 >
                   <RefreshCw className="w-3 h-3" /> Change Region
                 </button>
               </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 text-red-700 text-sm animate-in zoom-in-95 duration-200">
              <div className="bg-red-100 p-2 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              </div>
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
