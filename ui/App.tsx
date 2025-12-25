import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import {
  Search,
  ShieldAlert,
  Layers,
  RefreshCw,
  Filter,
  List,
  Network,
  ChevronRight,
  ChevronDown,
  FolderTree,
  LayoutGrid,
  X,
  ExternalLink,
  Database,
  Cloud,
  Code,
  Info,
  Maximize2,
  Minimize2,
  Check,
  ChevronUp,
  Trash2,
  FileCode,
  Settings,
} from "lucide-react";

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

interface ScanResult {
  totalFound: number;
  managedCount: number;
  orphans: any[];
}

interface StateMetadata {
  app: string;
  stage: string;
  region: string;
  account: string;
}

// --- CONSTANTS ---
const PROMOTED_TYPES = [
  "Bucket",
  "Function",
  "Dynamo",
  "Table",
  "Api",
  "ApiGateway",
  "Vpc",
  "Aurora",
  "Cluster",
  "Cron",
  "Queue",
  "StateMachine",
  "States",
  "StaticSite",
  "CDN",
];

const REFRESH_INTERVALS = [
  { label: "Manual", value: 0 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "5 minutes", value: 300000 },
];

// --- HELPERS ---
function safeRender(value: any): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!value) return "";
  if (typeof value === "object") {
    if (value.ciphertext || value["4dabf18193072939515e22adb298388d"])
      return "[Encrypted Secret]";
    return JSON.stringify(value);
  }
  return String(value);
}

function getHandlerName(r: Resource): string | null {
  const handler = r.outputs?._metadata?.handler || r.outputs?.handler;
  if (typeof handler === "string") {
    const fileName = handler.split("/").pop() || "";
    return fileName.split(".")[0] || handler;
  }
  return null;
}

function getResourceId(r: Resource): string {
  // Return the physical ID or the last segment of the URN
  if (r.id && typeof r.id === "string") return r.id;
  if (r.outputs) {
    if (
      r.outputs.arn &&
      typeof r.outputs.arn === "string" &&
      !r.outputs.arn.includes("ciphertext")
    ) {
      return r.outputs.arn.split(":").pop() || r.outputs.arn;
    }
    if (r.outputs.name) return safeRender(r.outputs.name);
  }
  const parts = r.urn.split("::");
  return parts[parts.length - 1] || "N/A";
}

function getSimpleType(type: string): string {
  const parts = type.split(":");
  const last = parts[parts.length - 1];
  return last.includes("/") ? last.split("/").pop() || last : last;
}

function getAwsConsoleLink(r: Resource): string | null {
  const arn = r.outputs?.arn || r.id || "";
  const type = r.type.toLowerCase();
  const region = r.outputs?.region || "us-west-2";

  if (typeof arn === "string" && arn.startsWith("arn:aws:")) {
    const parts = arn.split(":");
    const service = parts[2];
    switch (service) {
      case "lambda":
        return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${parts[6]}?tab=code`;
      case "s3":
        return `https://s3.console.aws.amazon.com/s3/buckets/${
          arn.split(":::")[1]
        }?region=${region}`;
      case "dynamodb":
        return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "sqs":
        return (
          r.outputs?.url ||
          `https://${region}.console.aws.amazon.com/sqs/v2/home?region=${region}#/queues`
        );
      case "sns":
        return `https://${region}.console.aws.amazon.com/sns/v3/home?region=${region}#/topics/${arn}`;
      case "rds":
        return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${
          parts[parts.length - 1]
        };is-cluster=true`;
      case "states":
        return `https://${region}.console.aws.amazon.com/states/home?region=${region}#/statemachines/view/${arn}`;
      case "logs":
        return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(
          parts[6]
        )}`;
      case "apigateway":
        if (arn.includes("/apis/")) {
          const apiId = arn.split("/apis/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/apis/${apiId}/dashboard`;
        }
        if (arn.includes("/restapis/")) {
          const apiId = arn.split("/restapis/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/apis/${apiId}/resources`;
        }
        if (arn.includes("/domainnames/")) {
          const domain = arn.split("/domainnames/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/domain-names/${domain}`;
        }
        if (arn.includes("/vpclinks/")) {
          const id = arn.split("/vpclinks/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/vpc-links/${id}`;
        }
        if (arn.includes("/usageplans/")) {
          const id = arn.split("/usageplans/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/usage-plans/${id}`;
        }
        if (arn.includes("/apikeys/")) {
          const id = arn.split("/apikeys/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/api-keys/${id}`;
        }
        return null;
      case "iam":
        return `https://console.aws.amazon.com/iam/home?#/roles/details/${
          parts[5]?.split("/").slice(1).join("/") || parts[5]
        }`;
      case "events":
        return `https://${region}.console.aws.amazon.com/events/home?region=${region}#/rules/${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "cognito-idp":
        return `https://${region}.console.aws.amazon.com/cognito/v2/idp/user-pools/${
          parts[5]?.split("/")[1] || parts[5]
        }/info?region=${region}`;
      case "secretsmanager":
        return `https://${region}.console.aws.amazon.com/secretsmanager/home?region=${region}#!/secret?name=${encodeURIComponent(
          parts[6]
        )}`;
      case "acm":
        return `https://${region}.console.aws.amazon.com/acm/home?region=${region}#/?uuid=${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "cloudfront":
        return `https://console.aws.amazon.com/cloudfront/v3/home?#/distributions/${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "appsync":
        return `https://${region}.console.aws.amazon.com/appsync/home?region=${region}#/apis/${parts[5]}/schema`;
      case "kinesis":
        return `https://${region}.console.aws.amazon.com/kinesis/home?region=${region}#/streams/details/${
          parts[5]?.split("/")[1] || parts[5]
        }/monitoring`;
      case "ec2":
        if (arn.includes("/vpc-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#VpcDetails:VpcId=${id}`;
        }
        if (arn.includes("/subnet-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#SubnetDetails:SubnetId=${id}`;
        }
        if (arn.includes("/igw-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#InternetGateway:internetGatewayId=${id}`;
        }
        if (arn.includes("/sg-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#SecurityGroup:groupId=${id}`;
        }
        if (arn.includes("/rtb-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#RouteTableDetails:RouteTableId=${id}`;
        }
        if (arn.includes("/nat-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#NatGatewayDetails:NatGatewayId=${id}`;
        }
        if (arn.includes("/eni-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#Nic:networkInterfaceId=${id}`;
        }
        return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}`;
      default:
        return `https://${region}.console.aws.amazon.com/console/home?region=${region}`;
    }
  }
  if (typeof arn === "string" && arn !== "") {
    if (type.includes("s3/bucket"))
      return `https://s3.console.aws.amazon.com/s3/buckets/${arn}?region=${region}`;
    if (type.includes("lambda/function"))
      return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${arn}`;
    if (type.includes("dynamodb/table"))
      return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${arn}`;
  }
  return null;
}

function buildTree(
  allResources: Resource[],
  matchedUrns: Set<string>,
  mode: "tree" | "categorized"
): TypeGroup[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  allResources.forEach((r) => {
    nodeMap.set(r.urn, {
      resource: r,
      children: [],
      isMatch: matchedUrns.has(r.urn),
      isVisible: false,
    });
  });
  allResources.forEach((r) => {
    const node = nodeMap.get(r.urn)!;
    const sType = getSimpleType(r.type);
    const isPromoted = PROMOTED_TYPES.includes(sType);
    const shouldBeRoot =
      mode === "categorized"
        ? isPromoted || !r.parent || r.parent.includes("pulumi:pulumi:Stack")
        : !r.parent || r.parent.includes("pulumi:pulumi:Stack");
    if (!shouldBeRoot && r.parent && nodeMap.has(r.parent)) {
      const parentNode = nodeMap.get(r.parent)!;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const calculateVisibility = (node: TreeNode): boolean => {
    let childVisible = false;
    node.children.forEach((child) => {
      if (calculateVisibility(child)) childVisible = true;
    });
    node.isVisible = node.isMatch || childVisible;
    return node.isVisible;
  };
  roots.forEach(calculateVisibility);
  const groups: Record<string, TreeNode[]> = {};
  roots.forEach((node) => {
    if (!node.isVisible) return;
    const typeName = getSimpleType(node.resource.type);
    if (!groups[typeName]) groups[typeName] = [];
    groups[typeName].push(node);
  });
  return Object.entries(groups)
    .map(([typeName, nodes]) => ({
      typeName,
      nodes,
      isVisible: nodes.length > 0,
    }))
    .sort((a, b) => a.typeName.localeCompare(b.typeName));
}

// --- COMPONENTS ---

function TypeDropdown({
  allTypes,
  selected,
  onChange,
}: {
  allTypes: string[];
  selected: string[];
  onChange: (s: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const filtered = allTypes
    .filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    .sort();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all ${
          selected.length > 0
            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
            : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
        }`}
      >
        <Filter className="w-4 h-4" /> Types{" "}
        {selected.length > 0 && (
          <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {selected.length}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col max-h-[400px]">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            {filtered.map((type) => (
              <label
                key={type}
                className="flex items-center px-3 py-2 hover:bg-gray-50 rounded-md cursor-pointer group"
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selected.includes(type)}
                  onChange={() =>
                    selected.includes(type)
                      ? onChange(selected.filter((t) => t !== type))
                      : onChange([...selected, type])
                  }
                />
                <div
                  className={`w-4 h-4 border rounded mr-3 flex items-center justify-center transition-colors ${
                    selected.includes(type)
                      ? "bg-indigo-600 border-indigo-600"
                      : "border-gray-300 group-hover:border-gray-400"
                  }`}
                >
                  {selected.includes(type) && (
                    <Check className="w-3 h-3 text-white" strokeWidth={4} />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    selected.includes(type)
                      ? "text-gray-900 font-semibold"
                      : "text-gray-600"
                  }`}
                >
                  {type}
                </span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => {
                onChange([]);
                setIsOpen(false);
              }}
              className="p-2 text-xs font-bold text-red-600 hover:bg-red-50 border-t border-gray-100 rounded-b-xl"
            >
              Clear All Types
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AutoRefreshButton({
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

function StackInfoBanner({
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

function DetailsPanel({
  resource,
  onClose,
}: {
  resource: Resource | null;
  onClose: () => void;
}) {
  const consoleLink = resource ? getAwsConsoleLink(resource) : null;
  const handler =
    resource?.outputs?._metadata?.handler || resource?.outputs?.handler;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white shadow-2xl z-50 border-l border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out ${
        resource ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 min-w-0">
          {resource?.type.startsWith("aws:") ? (
            <Cloud className="w-5 h-5 text-orange-500 flex-shrink-0" />
          ) : (
            <Code className="w-5 h-5 text-indigo-500 flex-shrink-0" />
          )}
          <h2 className="font-bold text-gray-900 truncate">
            {resource ? getResourceId(resource) : ""}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {resource && (
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                Resource Type
              </label>
              <div className="mt-1 font-mono text-sm text-indigo-600 bg-indigo-50 p-2 rounded border border-indigo-100 break-all">
                {resource.type}
              </div>
            </div>
            {handler && (
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  Handler Path
                </label>
                <div className="mt-1 font-mono text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 break-all">
                  {handler}
                </div>
              </div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                URN
              </label>
              <div className="mt-1 font-mono text-[10px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 break-all">
                {resource.urn}
              </div>
            </div>
          </div>
          {consoleLink && (
            <a
              href={consoleLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all shadow-md"
            >
              {" "}
              <ExternalLink className="w-4 h-4" /> View in AWS Console{" "}
            </a>
          )}
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
              <Database className="w-3 h-3" /> Outputs & Metadata
            </label>
            <div className="mt-2 bg-gray-900 rounded-xl p-4 overflow-x-auto shadow-inner">
              <pre className="text-xs text-green-400 font-mono">
                {JSON.stringify(
                  resource.outputs || { id: resource.id },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeGroupNode({
  group,
  autoExpand,
  onSelect,
  expansionKey,
  selectedResource,
}: {
  group: TypeGroup;
  autoExpand: boolean;
  onSelect: (r: Resource) => void;
  expansionKey: number;
  selectedResource: Resource | null;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

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

        <FolderTree className="w-4 h-4 mr-2 text-indigo-500" />

        <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
          {group.typeName}
        </span>

        <span className="ml-2 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-mono">
          {group.nodes.length}
        </span>
      </div>

      {expanded && (
        <div className="bg-white">
          {group.nodes.map((node) => (
            <ResourceNode
              key={node.resource.urn}
              node={node}
              depth={0}
              autoExpand={autoExpand}
              onSelect={onSelect}
              expansionKey={expansionKey}
              selectedResource={selectedResource}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceNode({
  node,
  depth = 0,
  autoExpand,
  onSelect,
  expansionKey,
  selectedResource,
}: {
  node: TreeNode;
  depth?: number;
  autoExpand: boolean;
  onSelect: (r: Resource) => void;
  expansionKey: number;
  selectedResource: Resource | null;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (autoExpand && node.isVisible && !node.isMatch) setExpanded(true);
  }, [autoExpand, node.isVisible, node.isMatch]);

  useEffect(() => {
    if (expansionKey > 0) setExpanded(true);
    if (expansionKey < 0) setExpanded(false);
  }, [expansionKey]);

  if (!node.isVisible) return null;

  const hasChildren = node.children.some((c) => c.isVisible);

  const resourceId = getResourceId(node.resource);

  const friendlyName = getHandlerName(node.resource);

  const isSelected = selectedResource?.urn === node.resource.urn;

  return (
    <div
      className={`${
        depth === 0 ? "" : "border-l border-gray-100 ml-6"
      } min-w-0`}
    >
      <div
        className={`flex items-center py-2 px-4 hover:bg-indigo-50/50 transition-colors group cursor-pointer min-w-0 ${
          node.isMatch ? "bg-indigo-50/50" : ""
        } ${
          isSelected
            ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200 z-10 relative"
            : ""
        }`}
        onClick={(e) => {
          if (
            hasChildren &&
            (e.target as HTMLElement).closest(".expand-toggle")
          )
            setExpanded(!expanded);
          else onSelect(node.resource);
        }}
      >
        <div className="expand-toggle mr-2 w-4 flex-shrink-0 text-gray-400 hover:text-indigo-600 p-1 -m-1 rounded">
          {hasChildren &&
            (expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-sm truncate min-w-0 flex-1 ${
                node.isMatch
                  ? "text-indigo-700 font-bold"
                  : hasChildren
                  ? "text-gray-900 font-semibold"
                  : "text-gray-600"
              }`}
            >
              {resourceId}
            </span>

            <span
              className={`inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                node.resource.type.startsWith("sst:")
                  ? "bg-purple-100 text-purple-700"
                  : "bg-orange-100 text-orange-700"
              }`}
            >
              {node.resource.type.split(":").pop()}
            </span>
          </div>

          {friendlyName && (
            <div className="flex items-center gap-1 mt-0.5 text-indigo-500 min-w-0">
              <FileCode className="w-3 h-3 flex-shrink-0" />

              <span className="text-[10px] font-bold uppercase tracking-tight truncate">
                {friendlyName}
              </span>
            </div>
          )}

          {node.resource.outputs?.arn && !friendlyName && (
            <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">
              {safeRender(node.resource.outputs.arn)}
            </div>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="pb-1 min-w-0">
          {node.children.map((child) => (
            <ResourceNode
              key={child.resource.urn}
              node={child}
              depth={depth + 1}
              autoExpand={autoExpand}
              onSelect={onSelect}
              expansionKey={expansionKey}
              selectedResource={selectedResource}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const COMMON_REGIONS = [
  "us-west-2",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "eu-west-1",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ca-central-1",
];

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

function StateExplorer({
  resources,
  onSelect,
  metadata,
  selectedResource,
  lastRefreshed,
}: {
  resources: Resource[];
  onSelect: (r: Resource) => void;
  metadata: StateMetadata | null;
  selectedResource: Resource | null;
  lastRefreshed: Date | null;
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "tree" | "categorized">(
    "categorized"
  );
  const [expansionKey, setExpansionKey] = useState(0);
  const availableTypes = useMemo(() => {
    let result = resources;
    if (activeFilters.length > 0) {
      result = result.filter((r) => {
        const isAws = r.type.startsWith("aws:"),
          isSstAws = r.type.startsWith("sst:aws:"),
          isSstOther = r.type.startsWith("sst:") && !isSstAws;
        return (
          (activeFilters.includes("aws") && isAws) ||
          (activeFilters.includes("sst:aws") && isSstAws) ||
          (activeFilters.includes("sst") && isSstOther)
        );
      });
    }
    if (query) {
      const fuse = new Fuse(result, {
        keys: [
          "type",
          "urn",
          "id",
          "outputs.arn",
          "outputs.name",
          "outputs.handler",
          "outputs._metadata.handler",
        ],
        threshold: 0.4,
      });
      result = fuse.search(query).map((r) => r.item);
    }
    return Array.from(
      new Set([...result.map((r) => getSimpleType(r.type)), ...selectedTypes])
    ).sort();
  }, [resources, query, activeFilters, selectedTypes]);

  useEffect(() => {
    if (query === "") setExpansionKey((p) => (p <= 0 ? p - 1 : -1));
  }, [query]);
  const filteredItems = useMemo(() => {
    let result = resources;
    if (activeFilters.length > 0) {
      result = result.filter((r) => {
        const isAws = r.type.startsWith("aws:"),
          isSstAws = r.type.startsWith("sst:aws:"),
          isSstOther = r.type.startsWith("sst:") && !isSstAws;
        return (
          (activeFilters.includes("aws") && isAws) ||
          (activeFilters.includes("sst:aws") && isSstAws) ||
          (activeFilters.includes("sst") && isSstOther)
        );
      });
    }
    if (selectedTypes.length > 0)
      result = result.filter((r) =>
        selectedTypes.includes(getSimpleType(r.type))
      );
    if (query) {
      const fuse = new Fuse(result, {
        keys: [
          "type",
          "urn",
          "id",
          "outputs.arn",
          "outputs.name",
          "outputs.handler",
          "outputs._metadata.handler",
        ],
        threshold: 0.4,
      });
      result = fuse.search(query).map((r) => r.item);
    }
    return result;
  }, [resources, query, activeFilters, selectedTypes]);
  const matchedUrns = useMemo(
    () => new Set(filteredItems.map((r) => r.urn)),
    [filteredItems]
  );
  const treeGroups = useMemo(
    () =>
      viewMode !== "list" ? buildTree(resources, matchedUrns, viewMode) : [],
    [resources, matchedUrns, viewMode]
  );
  return (
    <div className="space-y-6 pb-20">
      <div className="sticky top-0 z-10 space-y-4 pt-4 bg-gray-50/80 backdrop-blur-sm -mt-4 pb-4">
        {metadata && (
          <StackInfoBanner
            metadata={metadata}
            totalResources={resources.length}
            lastRefreshed={lastRefreshed}
          />
        )}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col xl:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-4 flex-1 w-full min-w-0">
            <div className="relative flex-1 max-sm:max-w-none max-w-sm min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search resources..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <TypeDropdown
              allTypes={availableTypes}
              selected={selectedTypes}
              onChange={setSelectedTypes}
            />
            {(query || activeFilters.length > 0 || selectedTypes.length > 0) && (
              <button
                onClick={() => {
                  setQuery("");
                  setActiveFilters([]);
                  setSelectedTypes([]);
                }}
                className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                title="Clear Filters"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md ${
                  viewMode === "list"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-500"
                }`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("tree")}
                className={`p-1.5 rounded-md ${
                  viewMode === "tree"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-500"
                }`}
                title="Tree View"
              >
                <Network className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("categorized")}
                className={`p-1.5 rounded-md ${
                  viewMode === "categorized"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-500"
                }`}
                title="Categories"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1 text-[10px] font-bold uppercase">
              {["all", "aws", "sst:aws", "sst"].map((f) => (
                <button
                  key={f}
                  onClick={() =>
                    f === "all"
                      ? setActiveFilters([])
                      : setActiveFilters((p) =>
                          p.includes(f) ? p.filter((x) => x !== f) : [...p, f]
                        )
                  }
                  className={`px-3 py-1.5 rounded-md ${
                    (
                      f === "all"
                        ? activeFilters.length === 0
                        : activeFilters.includes(f)
                    )
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  {f === "sst:aws" ? "SST AWS" : f === "sst" ? "SST" : f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px] w-full">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">
            {viewMode === "categorized"
              ? "Categorized Resources"
              : viewMode === "tree"
              ? "Component Tree"
              : "Flat List"}{" "}
            <span className="text-gray-400 font-normal ml-2">
              {filteredItems.length} matched
            </span>
          </h2>
        </div>
        <div className="w-full overflow-hidden">
          {viewMode !== "list" ? (
            <div className="divide-y divide-gray-50 w-full">
              {treeGroups.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  No results.
                </div>
              )}
              {treeGroups.map((group) => (
                <TypeGroupNode
                  key={group.typeName}
                  group={group}
                  autoExpand={!!query}
                  onSelect={onSelect}
                  expansionKey={expansionKey}
                  selectedResource={selectedResource}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-sm table-fixed">
                <thead className="bg-gray-50 text-gray-500 font-medium">
                  <tr>
                    <th className="px-6 py-3 w-1/3">Type</th>
                    <th className="px-6 py-3 w-1/2">ID / Name</th>
                    <th className="px-6 py-3 w-24">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map((r, i) => {
                    const rId = getResourceId(r);
                    const fName = getHandlerName(r);
                    const isSelected = selectedResource?.urn === r.urn;
                    return (
                      <tr
                        key={r.urn + i}
                        onClick={() => onSelect(r)}
                        className={`hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200 z-10 relative"
                            : ""
                        }`}
                      >
                        <td className="px-6 py-4 font-mono text-[10px] text-indigo-600 opacity-80">
                          {r.type}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{rId}</div>
                          {fName && (
                            <div className="flex items-center gap-1 mt-0.5 text-indigo-500">
                              <FileCode className="w-3 h-3" />
                              <span className="text-[10px] font-bold uppercase tracking-tight">
                                {fName}
                              </span>
                            </div>
                          )}
                          {r.outputs?.arn && !fName && (
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-sm">
                              {safeRender(r.outputs.arn)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                              r.type.startsWith("sst:")
                                ? "bg-purple-50 text-purple-600"
                                : "bg-orange-50 text-orange-600"
                            }`}
                          >
                            {r.type.split(":")[0]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredItems.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  No resources found.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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

function GhostHunter({
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
