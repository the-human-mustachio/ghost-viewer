import { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { Search, ShieldAlert, Layers, RefreshCw, Filter, List, Network, ChevronRight, ChevronDown, FolderTree, LayoutGrid, X, ExternalLink, Database, Cloud, Code, Info, Maximize2, Minimize2, Check, ChevronUp, Trash2, FileCode, Settings } from 'lucide-react';

// --- TYPES ---
interface Resource {
  type: string;
  urn: string;
  id?: string;
  outputs?: any;
  parent?: string;
}

interface TreeNode {
  resource: Resource;
  children: TreeNode[];
  isMatch: boolean;
  isVisible: boolean;
}

interface TypeGroup {
  typeName: string;
  nodes: TreeNode[];
  isVisible: boolean;
}

interface Orphan {
  arn: string;
  type: string;
  name: string;
  tags: Record<string, string>;
}

interface ScanResult {
  totalFound: number;
  managedCount: number;
  orphans: Orphan[];
}

interface StateMetadata {
  app: string;
  stage: string;
  region: string;
  account: string;
}

// --- CONSTANTS ---
const PROMOTED_TYPES = [
  'Bucket', 'Function', 'Dynamo', 'Table', 'Api', 'ApiGateway', 'Vpc', 
  'Aurora', 'Cluster', 'Cron', 'Queue', 'StateMachine', 'States', 'StaticSite', 'CDN'
];

// --- HELPERS ---
function safeRender(value: any): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (!value) return '';
  if (typeof value === 'object') {
    if (value.ciphertext || value['4dabf18193072939515e22adb298388d']) return '[Encrypted Secret]';
    return JSON.stringify(value);
  }
  return String(value);
}

function getHandlerName(r: Resource): string | null {
  const handler = r.outputs?._metadata?.handler || r.outputs?.handler;
  if (typeof handler === 'string') {
    const fileName = handler.split('/').pop() || "";
    return fileName.split('.')[0] || handler;
  }
  return null;
}

function getResourceId(r: Resource): string {
  // Return the physical ID or the last segment of the URN
  if (r.id && typeof r.id === 'string') return r.id;
  if (r.outputs) {
    if (r.outputs.arn && typeof r.outputs.arn === 'string' && !r.outputs.arn.includes('ciphertext')) {
      return r.outputs.arn.split(':').pop() || r.outputs.arn;
    }
    if (r.outputs.name) return safeRender(r.outputs.name);
  }
  const parts = r.urn.split('::');
  return parts[parts.length - 1] || 'N/A';
}

function getSimpleType(type: string): string {
  const parts = type.split(':');
  const last = parts[parts.length - 1];
  return last.includes('/') ? last.split('/').pop() || last : last;
}

function getAwsConsoleLink(r: Resource): string | null {
  const arn = r.outputs?.arn || r.id || "";
  const type = r.type.toLowerCase();
  const region = r.outputs?.region || "us-west-2";

  if (typeof arn === 'string' && arn.startsWith('arn:aws:')) {
    const parts = arn.split(':');
    const service = parts[2];
    switch (service) {
      case 'lambda': return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${parts[6]}?tab=code`;
      case 's3': return `https://s3.console.aws.amazon.com/s3/buckets/${arn.split(':::')[1]}?region=${region}`;
      case 'dynamodb': return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${parts[5].split('/')[1]}`;
      case 'sqs': return r.outputs?.url || `https://${region}.console.aws.amazon.com/sqs/v2/home?region=${region}#/queues`;
      case 'rds': return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${parts[parts.length - 1]};is-cluster=true`;
      case 'states': return `https://${region}.console.aws.amazon.com/states/home?region=${region}#/statemachines/view/${arn}`;
      case 'logs': return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(parts[6])}`;
      case 'apigateway': return arn.split('/apis/')[1] ? `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/apis/${arn.split('/apis/')[1]}/dashboard` : null;
      case 'iam': return `https://console.aws.amazon.com/iam/home?#/roles/details/${parts[5].split('/').slice(1).join('/')}`;
      case 'events': return `https://${region}.console.aws.amazon.com/events/home?region=${region}#/rules/${parts[5].split('/')[1]}`;
      case 'cognito-idp': return `https://${region}.console.aws.amazon.com/cognito/v2/idp/user-pools/${parts[5].split('/')[1]}/info?region=${region}`;
      case 'secretsmanager': return `https://${region}.console.aws.amazon.com/secretsmanager/home?region=${region}#!/secret?name=${encodeURIComponent(parts[6])}`;
      case 'acm': return `https://${region}.console.aws.amazon.com/acm/home?region=${region}#/?uuid=${parts[5].split('/')[1]}`;
      case 'cloudfront': return `https://console.aws.amazon.com/cloudfront/v3/home?#/distributions/${parts[5].split('/')[1]}`;
      default: return `https://${region}.console.aws.amazon.com/console/home?region=${region}`;
    }
  }
  if (typeof arn === 'string' && arn !== "") {
    if (type.includes('s3/bucket')) return `https://s3.console.aws.amazon.com/s3/buckets/${arn}?region=${region}`;
    if (type.includes('lambda/function')) return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${arn}`;
    if (type.includes('dynamodb/table')) return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${arn}`;
  }
  return null;
}

function buildTree(allResources: Resource[], matchedUrns: Set<string>, mode: 'tree' | 'categorized'): TypeGroup[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  allResources.forEach(r => {
    nodeMap.set(r.urn, { resource: r, children: [], isMatch: matchedUrns.has(r.urn), isVisible: false });
  });
  allResources.forEach(r => {
    const node = nodeMap.get(r.urn)!;
    const sType = getSimpleType(r.type);
    const isPromoted = PROMOTED_TYPES.includes(sType);
    const shouldBeRoot = mode === 'categorized' ? (isPromoted || !r.parent || r.parent.includes('pulumi:pulumi:Stack')) : (!r.parent || r.parent.includes('pulumi:pulumi:Stack'));
    if (!shouldBeRoot && r.parent && nodeMap.has(r.parent)) {
      const parentNode = nodeMap.get(r.parent)!;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const calculateVisibility = (node: TreeNode): boolean => {
    let childVisible = false;
    node.children.forEach(child => { if (calculateVisibility(child)) childVisible = true; });
    node.isVisible = node.isMatch || childVisible;
    return node.isVisible;
  };
  roots.forEach(calculateVisibility);
  const groups: Record<string, TreeNode[]> = {};
  roots.forEach(node => {
    if (!node.isVisible) return;
    const typeName = getSimpleType(node.resource.type);
    if (!groups[typeName]) groups[typeName] = [];
    groups[typeName].push(node);
  });
  return Object.entries(groups).map(([typeName, nodes]) => ({ typeName, nodes, isVisible: nodes.length > 0 })).sort((a, b) => a.typeName.localeCompare(b.typeName));
}

// --- COMPONENTS ---

function TypeDropdown({ allTypes, selected, onChange }: { allTypes: string[], selected: string[], onChange: (s: string[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const filtered = allTypes.filter(t => t.toLowerCase().includes(search.toLowerCase())).sort();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all ${selected.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
        <Filter className="w-4 h-4" /> Types {selected.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{selected.length}</span>}
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col max-h-[400px]">
          <div className="p-2 border-b border-gray-100"><input autoFocus type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          <div className="overflow-y-auto flex-1 p-1">
            {filtered.map(type => (
              <label key={type} className="flex items-center px-3 py-2 hover:bg-gray-50 rounded-md cursor-pointer group">
                <input type="checkbox" className="hidden" checked={selected.includes(type)} onChange={() => selected.includes(type) ? onChange(selected.filter(t => t !== type)) : onChange([...selected, type])} />
                <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center transition-colors ${selected.includes(type) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 group-hover:border-gray-400'}`}>{selected.includes(type) && <Check className="w-3 h-3 text-white" strokeWidth={4} />}</div>
                <span className={`text-sm ${selected.includes(type) ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{type}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && <button onClick={() => { onChange([]); setIsOpen(false); }} className="p-2 text-xs font-bold text-red-600 hover:bg-red-50 border-t border-gray-100 rounded-b-xl">Clear All Types</button>}
        </div>
      )}
    </div>
  );
}

function DetailsPanel({ resource, onClose }: { resource: Resource | null, onClose: () => void }) {
  if (!resource) return null;
  const consoleLink = getAwsConsoleLink(resource);
  const handler = resource.outputs?._metadata?.handler || resource.outputs?.handler;
  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white shadow-2xl z-50 border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          {resource.type.startsWith('aws:') ? <Cloud className="w-5 h-5 text-orange-500" /> : <Code className="w-5 h-5 text-indigo-500" />}
          <h2 className="font-bold text-gray-900 truncate max-w-[300px]">{getResourceId(resource)}</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="space-y-4">
          <div><label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Resource Type</label><div className="mt-1 font-mono text-sm text-indigo-600 bg-indigo-50 p-2 rounded border border-indigo-100 break-all">{resource.type}</div></div>
          {handler && <div><label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Handler Path</label><div className="mt-1 font-mono text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 break-all">{handler}</div></div>}
          <div><label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">URN</label><div className="mt-1 font-mono text-[10px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 break-all">{resource.urn}</div></div>
        </div>
        {consoleLink && <a href={consoleLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all shadow-md"> <ExternalLink className="w-4 h-4" /> View in AWS Console </a>}
        <div><label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-2"><Database className="w-3 h-3" /> Outputs & Metadata</label><div className="mt-2 bg-gray-900 rounded-xl p-4 overflow-x-auto shadow-inner"><pre className="text-xs text-green-400 font-mono">{JSON.stringify(resource.outputs || { id: resource.id }, null, 2)}</pre></div></div>
      </div>
    </div>
  );
}

function TypeGroupNode({ group, autoExpand, onSelect, expansionKey }: { group: TypeGroup; autoExpand: boolean, onSelect: (r: Resource) => void, expansionKey: number }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (autoExpand) setExpanded(true); }, [autoExpand]);
  useEffect(() => { if (expansionKey > 0) setExpanded(true); if (expansionKey < 0) setExpanded(false); }, [expansionKey]);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <div onClick={() => setExpanded(!expanded)} className="flex items-center py-3 px-4 bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer group">
        <div className="mr-2 text-gray-400">{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</div>
        <FolderTree className="w-4 h-4 mr-2 text-indigo-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-gray-600">{group.typeName}</span>
        <span className="ml-2 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-mono">{group.nodes.length}</span>
      </div>
      {expanded && <div className="bg-white">{group.nodes.map(node => <ResourceNode key={node.resource.urn} node={node} depth={0} autoExpand={autoExpand} onSelect={onSelect} expansionKey={expansionKey} />)}</div>}
    </div>
  );
}

function ResourceNode({ node, depth = 0, autoExpand, onSelect, expansionKey }: { node: TreeNode; depth?: number; autoExpand: boolean, onSelect: (r: Resource) => void, expansionKey: number }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (autoExpand && node.isVisible && !node.isMatch) setExpanded(true); }, [autoExpand, node.isVisible, node.isMatch]);
  useEffect(() => { if (expansionKey > 0) setExpanded(true); if (expansionKey < 0) setExpanded(false); }, [expansionKey]);
  if (!node.isVisible) return null;
  const hasChildren = node.children.some(c => c.isVisible);
  const resourceId = getResourceId(node.resource);
  const friendlyName = getHandlerName(node.resource);

  return (
    <div className={`${depth === 0 ? '' : 'border-l border-gray-100 ml-6'}`}>
      <div className={`flex items-center py-2 px-4 hover:bg-gray-50 transition-colors group cursor-pointer ${node.isMatch ? 'bg-indigo-50/50' : ''}`} onClick={(e) => { if (hasChildren && (e.target as HTMLElement).closest('.expand-toggle')) setExpanded(!expanded); else onSelect(node.resource); }}>
        <div className="expand-toggle mr-2 w-4 flex-shrink-0 text-gray-400 hover:text-indigo-600 p-1 -m-1 rounded">{hasChildren && (expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm truncate ${node.isMatch ? 'text-indigo-700 font-bold' : hasChildren ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{resourceId}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${node.resource.type.startsWith('sst:') ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{node.resource.type.split(':').pop()}</span>
          </div>
          {friendlyName && (
            <div className="flex items-center gap-1 mt-0.5 text-indigo-500">
              <FileCode className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-tight">{friendlyName}</span>
            </div>
          )}
          {node.resource.outputs?.arn && !friendlyName && <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">{safeRender(node.resource.outputs.arn)}</div>}
        </div>
      </div>
      {expanded && hasChildren && <div className="pb-1">{node.children.map(child => <ResourceNode key={child.resource.urn} node={child} depth={depth + 1} autoExpand={autoExpand} onSelect={onSelect} expansionKey={expansionKey} />)}</div>}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'hunter'>('explorer');
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [metadata, setMetadata] = useState<StateMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Config State
  const [statePath, setStatePath] = useState<string>('');
  const [showConfig, setShowConfig] = useState(false);

  const fetchState = () => {
    setLoading(true);
    fetch('/api/state').then(res => res.json()).then(data => {
      const list = data.latest?.resources || data.checkpoint?.latest?.resources || data.deployment?.resources || [];
      setResources(list);
      
      // improved metadata extraction
      let stackName = data.stack || data.deployment?.stack || "";
      let app = "Unknown";
      let stage = "Unknown";

      if (stackName) {
          const parts = stackName.split('/');
          if (parts.length >= 3) {
             app = parts[1];
             stage = parts[2];
          } else {
             app = stackName;
          }
      } else if (list.length > 0) {
          // Fallback: Try to infer from URN of the first resource
          // Format: urn:pulumi:STACK::PROJECT::TYPE::NAME
          // Example: urn:pulumi:dev::ghost-viewer::aws:s3/bucket:Bucket::public
          // Split by '::':
          // [0] urn:pulumi:dev
          // [1] ghost-viewer
          // [2] aws:s3/bucket:Bucket
          
          // Find a resource that isn't the stack root itself for cleaner inference, though strictly not required if logic is sound.
          const refResource = list.find((r: any) => r.type !== 'pulumi:pulumi:Stack') || list[0];
          
          if (refResource?.urn) {
              const parts = refResource.urn.split("::");
              if (parts.length >= 3) {
                  // parts[0] is "urn:pulumi:stage"
                  const urnHeader = parts[0].split(':');
                  if (urnHeader.length >= 3) {
                      stage = urnHeader[2];
                  }
                  app = parts[1];
              }
          }
      }

      const provider = list.find((r: any) => r.type === "pulumi:providers:aws");
      const arnSample = list.find((r: any) => r.outputs?.arn)?.outputs?.arn || "";
      
      setMetadata({ 
          app, 
          stage, 
          region: provider?.inputs?.region || "us-west-2", 
          account: arnSample.split(':')[4] || "Unknown" 
      });
      
      setLoading(false);
      setError(null);
    }).catch((e) => { 
        console.error(e);
        setError("Failed to load state.json. Check console for details."); 
        setLoading(false); 
    });
  };

  useEffect(() => {
    // 1. Get Initial Config
    fetch('/api/config').then(res => res.json()).then(data => {
        setStatePath(data.stateFile);
        // 2. Load State
        fetchState();
    });
  }, []);

  const handleUpdateConfig = () => {
      fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stateFile: statePath })
      }).then(res => res.json()).then(() => {
          setShowConfig(false);
          fetchState();
      });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex overflow-hidden">
      <div className={`flex-1 flex flex-col transition-all duration-300 ${selectedResource ? 'mr-[500px]' : ''} overflow-hidden h-screen`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 flex-shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg"><Layers className="w-6 h-6 text-white" /></div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Ghost Viewer</h1>
            </div>
            
            <div className="flex items-center gap-4">
                {showConfig ? (
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg animate-in fade-in slide-in-from-top-2">
                        <input 
                            type="text" 
                            value={statePath} 
                            onChange={(e) => setStatePath(e.target.value)} 
                            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                            placeholder="/path/to/state.json"
                        />
                        <button onClick={handleUpdateConfig} className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setShowConfig(false)} className="p-1.5 text-gray-500 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
                    </div>
                ) : (
                   <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-transparent hover:border-gray-200 transition-all" title={statePath}>
                       <Settings className="w-3 h-3" />
                       <span className="max-w-[150px] truncate">{statePath ? statePath.split('/').pop() : 'Set State Path'}</span>
                   </button>
                )}

                <nav className="flex space-x-1 bg-gray-100 p-1 my-auto rounded-lg">
                <button onClick={() => { setActiveTab('explorer'); setSelectedResource(null); }} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'explorer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Explorer</button>
                <button onClick={() => { setActiveTab('hunter'); setSelectedResource(null); }} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'hunter' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Hunter</button>
                </nav>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 overflow-y-auto">
          {loading ? <div className="py-20 text-center text-indigo-500"><RefreshCw className="w-10 h-10 animate-spin mx-auto" /></div> : error ? <div className="bg-red-50 p-6 rounded-xl text-red-700">{error}</div> : (activeTab === 'explorer' ? <StateExplorer resources={resources} onSelect={setSelectedResource} metadata={metadata} /> : <GhostHunter metadata={metadata} />)}
        </main>
      </div>
      <DetailsPanel resource={selectedResource} onClose={() => setSelectedResource(null)} />
      {selectedResource && <div className="fixed inset-0 bg-black/20 z-40 sm:hidden" onClick={() => setSelectedResource(null)} />}
    </div>
  );
}

function StateExplorer({ resources, onSelect, metadata }: { resources: Resource[], onSelect: (r: Resource) => void, metadata: StateMetadata | null }) {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'tree' | 'categorized'>('categorized');
  const [expansionKey, setExpansionKey] = useState(0);
  const allTypes = useMemo(() => Array.from(new Set(resources.map(r => getSimpleType(r.type)))), [resources]);
  useEffect(() => { if (query === "") setExpansionKey(p => p <= 0 ? p - 1 : -1); }, [query]);
  const filteredItems = useMemo(() => {
    let result = resources;
    if (activeFilters.length > 0) { result = result.filter(r => { const isAws = r.type.startsWith('aws:'), isSstAws = r.type.startsWith('sst:aws:'), isSstOther = r.type.startsWith('sst:') && !isSstAws; return (activeFilters.includes('aws') && isAws) || (activeFilters.includes('sst:aws') && isSstAws) || (activeFilters.includes('sst') && isSstOther); }); }
    if (selectedTypes.length > 0) result = result.filter(r => selectedTypes.includes(getSimpleType(r.type)));
    if (query) { const fuse = new Fuse(result, { keys: ['type', 'urn', 'id', 'outputs.arn', 'outputs.name', 'outputs.handler', 'outputs._metadata.handler'], threshold: 0.4 }); result = fuse.search(query).map(r => r.item); }
    return result;
  }, [resources, query, activeFilters, selectedTypes]);
  const matchedUrns = useMemo(() => new Set(filteredItems.map(r => r.urn)), [filteredItems]);
  const treeGroups = useMemo(() => viewMode !== 'list' ? buildTree(resources, matchedUrns, viewMode) : [], [resources, matchedUrns, viewMode]);
  return (
    <div className="space-y-6 pb-20">
      {metadata && (
        <div className="bg-indigo-900 text-indigo-100 p-4 rounded-xl shadow-lg border border-indigo-800 flex flex-wrap gap-x-8 gap-y-2 items-center text-xs">
           <div className="flex items-center gap-2"><Info className="w-4 h-4 text-indigo-400" /> <span className="font-bold uppercase tracking-wider text-indigo-300">Stack Info</span></div>
           {Object.entries(metadata).map(([k, v]) => (<div key={k} className="flex flex-col"> <span className="text-[10px] text-indigo-400 uppercase font-black">{k}</span> <span className="font-mono font-bold text-white">{v}</span> </div>))}
        </div>
      )}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col xl:flex-row gap-4 justify-between items-center sticky top-0 z-10 transition-all">
        <div className="flex items-center gap-4 flex-1 w-full">
          <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Search resources..." value={query} onChange={e => setQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          <TypeDropdown allTypes={allTypes} selected={selectedTypes} onChange={setSelectedTypes} />
          {(query || activeFilters.length > 0 || selectedTypes.length > 0) && <button onClick={() => { setQuery(''); setActiveFilters([]); setSelectedTypes([]); }} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Clear Filters"><Trash2 className="w-4 h-4" /></button>}
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex bg-gray-100 p-1 rounded-lg gap-1"><button onClick={() => setExpansionKey(p => p >= 0 ? p + 1 : 1)} className="p-1.5 hover:bg-white rounded transition-all text-gray-500" title="Expand All"><Maximize2 className="w-4 h-4" /></button><button onClick={() => setExpansionKey(p => p <= 0 ? p - 1 : -1)} className="p-1.5 hover:bg-white rounded transition-all text-gray-500" title="Collapse All"><Minimize2 className="w-4 h-4" /></button></div>
          <div className="flex bg-gray-100 p-1 rounded-lg"><button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`} title="List View"><List className="w-4 h-4" /></button><button onClick={() => setViewMode('tree')} className={`p-1.5 rounded-md ${viewMode === 'tree' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`} title="Tree View"><Network className="w-4 h-4" /></button><button onClick={() => setViewMode('categorized')} className={`p-1.5 rounded-md ${viewMode === 'categorized' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`} title="Categories"><LayoutGrid className="w-4 h-4" /></button></div>
          <div className="flex bg-gray-100 p-1 rounded-lg gap-1 text-[10px] font-bold uppercase">{['all', 'aws', 'sst:aws', 'sst'].map(f => (<button key={f} onClick={() => f === 'all' ? setActiveFilters([]) : setActiveFilters(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f])} className={`px-3 py-1.5 rounded-md ${ (f === 'all' ? activeFilters.length === 0 : activeFilters.includes(f)) ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>{f === 'sst:aws' ? 'SST AWS' : f === 'sst' ? 'SST' : f}</button>))}</div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center"><h2 className="font-semibold text-gray-900">{viewMode === 'categorized' ? 'Categorized Resources' : viewMode === 'tree' ? 'Component Tree' : 'Flat List'} <span className="text-gray-400 font-normal ml-2">{filteredItems.length} matched</span></h2></div>
        <div>
          {viewMode !== 'list' ? (
            <div className="divide-y divide-gray-50">{treeGroups.length === 0 && <div className="p-12 text-center text-gray-500">No results.</div>}{treeGroups.map(group => <TypeGroupNode key={group.typeName} group={group} autoExpand={!!query} onSelect={onSelect} expansionKey={expansionKey} />)}</div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500 font-medium"><tr><th className="px-6 py-3">Type</th><th className="px-6 py-3">ID / Name</th><th className="px-6 py-3 w-20">Source</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredItems.map((r, i) => { 
              const rId = getResourceId(r); 
              const fName = getHandlerName(r); 
              return (<tr key={r.urn + i} onClick={() => onSelect(r)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="px-6 py-4 font-mono text-[10px] text-indigo-600 opacity-80">{r.type}</td>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{rId}</div>
                  {fName && <div className="flex items-center gap-1 mt-0.5 text-indigo-500"><FileCode className="w-3 h-3" /><span className="text-[10px] font-bold uppercase tracking-tight">{fName}</span></div>}
                  {r.outputs?.arn && !fName && <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-sm">{safeRender(r.outputs.arn)}</div>}
                </td>
                <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${r.type.startsWith('sst:') ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>{r.type.split(':')[0]}</span></td>
              </tr>)})}</tbody></table>{filteredItems.length === 0 && <div className="p-12 text-center text-gray-500">No resources found.</div>}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function GhostHunter({ metadata }: { metadata: StateMetadata | null }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [config, setConfig] = useState({ appName: 'pulsecx-v3', stage: 'production', region: 'us-west-2' });

  useEffect(() => {
      if (metadata) {
          setConfig(prev => ({
              ...prev,
              appName: metadata.app !== 'Unknown' ? metadata.app : prev.appName,
              stage: metadata.stage !== 'Unknown' ? metadata.stage : prev.stage,
              region: metadata.region !== 'Unknown' ? metadata.region : prev.region
          }));
      }
  }, [metadata]);

  const scan = async () => { setScanning(true); setResult(null); try { const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }); setResult(await res.json()); } catch { alert('Scan failed.'); } finally { setScanning(false); } };
  return (
    <div className="space-y-6"><div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h2 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2"><ShieldAlert className="w-5 h-5" />Hunt Configuration</h2><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">{['appName', 'stage', 'region'].map(k => (<div key={k}><label className="block text-[10px] font-black uppercase text-gray-400 mb-1 tracking-wider">{k.replace(/([A-Z])/g, ' $1')}</label><input type="text" value={(config as any)[k]} onChange={e => setConfig({ ...config, [k]: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-gray-50/50" /></div>))}<button onClick={scan} disabled={scanning} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md">{scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />} {scanning ? 'Hunting...' : 'Start Hunt'}</button></div></div>{result && (<div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">{[{ l: 'Tracked', v: result.managedCount, c: 'gray' }, { l: 'In AWS', v: result.totalFound, c: 'indigo' }, { l: 'Orphans', v: result.orphans.length, c: 'red' }].map(s => (<div key={s.l} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm"><div className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">{s.l}</div><div className={`text-4xl font-black mt-2 text-${s.c}-600`}>{s.v}</div></div>))}</div>{result.orphans.length > 0 ? (<div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg border-red-100"><div className="px-6 py-4 bg-red-50 border-b border-red-100 text-red-900 font-bold flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-600" />Orphaned Resources</div><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500 border-b border-gray-100"><tr><th className="px-6 py-3">Type</th><th className="px-6 py-3">Physical Name</th><th className="px-6 py-3">Tags</th></tr></thead><tbody className="divide-y divide-gray-100">{result.orphans.map((o, i) => (<tr key={i} className="hover:bg-red-50 transition-colors"><td className="px-6 py-4 font-mono text-xs text-gray-500">{o.type}</td><td className="px-6 py-4 font-bold text-gray-900">{o.name}</td><td className="px-6 py-4"><div className="flex gap-2"><span className="px-1.5 py-0.5 bg-gray-100 text-[9px] rounded font-bold text-gray-600">App: {o.tags['sst:app']}</span><span className="px-1.5 py-0.5 bg-gray-100 text-[9px] rounded font-bold text-gray-600">Stage: {o.tags['sst:stage']}</span></div></td></tr>))}</tbody></table></div>) : <div className="bg-green-50 p-12 text-center rounded-xl font-bold text-xl text-green-800 border border-green-200">✅ No orphaned resources found!</div>}</div>)}</div>
  );
}