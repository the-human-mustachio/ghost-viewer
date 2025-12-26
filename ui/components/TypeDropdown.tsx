import { useState, useEffect, useRef } from "react";
import { Filter, ChevronUp, ChevronDown, Check } from "lucide-react";

export function TypeDropdown({
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
