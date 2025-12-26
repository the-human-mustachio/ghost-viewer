import { useMemo } from "react";
import {
  Cloud,
  Code,
  X,
  ExternalLink,
  ArrowRightLeft,
  Database,
} from "lucide-react";
import { Resource } from "./types";
import { getAwsConsoleLink, getResourceId } from "./helpers";

export function DetailsPanel({
  resource,
  onClose,
  allResources,
}: {
  resource: Resource | null;
  onClose: () => void;
  allResources: Resource[];
}) {
  const consoleLink = resource ? getAwsConsoleLink(resource) : null;
  const handler =
    resource?.outputs?._metadata?.handler || resource?.outputs?.handler;

  const relationships = useMemo(() => {
    if (!resource) return { parents: [], children: [], references: [] };

    const parents = allResources.filter((r) => r.urn === resource.parent);
    const children = allResources.filter((r) => r.parent === resource.urn);

    // Look for references in outputs
    const resourceId = resource.id || "";
    const resourceArn = resource.outputs?.arn || "";

    const references = allResources.filter((r) => {
      if (r.urn === resource.urn) return false;
      const outputsStr = JSON.stringify(r.outputs || {});
      return (
        (resourceId && outputsStr.includes(resourceId)) ||
        (resourceArn && outputsStr.includes(resourceArn))
      );
    });

    return { parents, children, references };
  }, [resource, allResources]);

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
        <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-20">
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

          {/* Relationships Section */}
          {(relationships.parents.length > 0 ||
            relationships.children.length > 0 ||
            relationships.references.length > 0) && (
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
                <ArrowRightLeft className="w-3 h-3" /> Relationships
              </label>
              <div className="space-y-3">
                {relationships.parents.map((r) => (
                  <div
                    key={r.urn}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="text-[9px] font-bold text-gray-400 uppercase">
                      Parent
                    </div>
                    <div className="text-sm font-semibold text-gray-700 truncate">
                      {getResourceId(r)}
                    </div>
                  </div>
                ))}
                {relationships.children.length > 0 && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-[9px] font-bold text-gray-400 uppercase">
                      Children ({relationships.children.length})
                    </div>
                    <div className="mt-1 space-y-1">
                      {relationships.children.map((r) => (
                        <div key={r.urn} className="text-xs text-gray-600 truncate">
                          • {getResourceId(r)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {relationships.references.length > 0 && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-[9px] font-bold text-gray-400 uppercase">
                      Referenced By ({relationships.references.length})
                    </div>
                    <div className="mt-1 space-y-1">
                      {relationships.references.map((r) => (
                        <div key={r.urn} className="text-xs text-gray-600 truncate">
                          • {getResourceId(r)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
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
