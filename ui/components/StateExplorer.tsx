import { useState, useMemo, useEffect } from "react";
import Fuse from "fuse.js";
import {
  Search,
  Trash2,
  Maximize2,
  Minimize2,
  List,
  Network,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  FolderTree,
  FileCode,
} from "lucide-react";
import { Resource, TypeGroup, TreeNode, StateMetadata } from "./types";
import {
  getSimpleType,
  getResourceId,
  getHandlerName,
  safeRender,
  buildTree,
} from "./helpers";
import { StackInfoBanner } from "./StackInfoBanner";
import { TypeDropdown } from "./TypeDropdown";

export function StateExplorer({
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
