import { useState } from "react";
import { Search, Trash2, Clock, Filter, ChevronDown, ChevronUp, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LedgerHeaderProps {
  eventCount: number;
  filteredEventCount: number;
  isConnected: boolean;
  onClear: () => void;
  filter: string;
  onFilterChange: (value: string) => void;
  filterType: "all" | "actionType" | "actor" | "explainability";
  onFilterTypeChange: (value: "all" | "actionType" | "actor" | "explainability") => void;
  timeRange: "all" | "lastHour" | "lastDay" | "lastWeek";
  onTimeRangeChange: (value: "all" | "lastHour" | "lastDay" | "lastWeek") => void;
  eventTypes: string[];
  selectedEventTypes: string[];
  onSelectedEventTypesChange: (value: string[]) => void;
}

export default function LedgerHeader({
  eventCount,
  filteredEventCount,
  isConnected,
  onClear,
  filter,
  onFilterChange,
  filterType,
  onFilterTypeChange,
  timeRange,
  onTimeRangeChange,
  eventTypes,
  selectedEventTypes,
  onSelectedEventTypesChange,
}: LedgerHeaderProps) {
  // State for dropdown visibility
  const [filterTypeOpen, setFilterTypeOpen] = useState(false);
  const [timeRangeOpen, setTimeRangeOpen] = useState(false);
  const [eventTypesOpen, setEventTypesOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-line/20 bg-surface/50">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        Audit ledger
      </div>
      <div className="flex flex-1 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Search Bar */}
          <div className="relative w-48">
            <Search size={14} className="absolute left-2 top-2 text-ink-3" />
            <input
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder="Filter events"
              aria-label="Filter audit events"
              className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-xs text-ink outline-none focus:border-brand focus:ring-brand/20"
            />
          </div>

          {/* Filter Type */}
          <div className="relative w-32">
            <button
              onClick={() => setFilterTypeOpen(!filterTypeOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-ink-2 border border-line rounded-md hover:bg-surface/50"
            >
              <span>
                {filterType === "all"
                  ? "All fields"
                  : filterType === "actionType"
                    ? "Action type"
                    : filterType === "actor"
                      ? "Actor"
                      : "Explainability"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {filterTypeOpen && (
              <div className="absolute left-0 mt-2 w-32 bg-surface border border-line rounded-md shadow-lg z-10">
                {[["all", "All fields"], ["actionType", "Action type"], ["actor", "Actor"], ["explainability", "Explainability"]].map(
                  ([value, label]) => (
                    <button
                      key={value}
                      onClick={() => {
                        onFilterTypeChange(value as "all" | "actionType" | "actor" | "explainability");
                        setFilterTypeOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-left text-xs font-medium ${filterType === value ? "text-brand bg-brand/10" : "text-ink-2 hover:bg-surface/50"}`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Time Range */}
          <div className="relative w-32">
            <button
              onClick={() => setTimeRangeOpen(!timeRangeOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-ink-2 border border-line rounded-md hover:bg-surface/50"
            >
              <span>
                {timeRange === "all"
                  ? "All time"
                  : timeRange === "lastHour"
                    ? "Last hour"
                    : timeRange === "lastDay"
                      ? "Last day"
                      : "Last week"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {timeRangeOpen && (
              <div className="absolute left-0 mt-2 w-32 bg-surface border border-line rounded-md shadow-lg z-10">
                {[["all", "All time"], ["lastHour", "Last hour"], ["lastDay", "Last day"], ["lastWeek", "Last week"]].map(
                  ([value, label]) => (
                    <button
                      key={value}
                      onClick={() => {
                        const next = ["all", "lastHour", "lastDay", "lastWeek"][
                          (["all", "lastHour", "lastDay", "lastWeek"].indexOf(value as "all" | "lastHour" | "lastDay" | "lastWeek") + 1) %
                            4
                        ];
                        onTimeRangeChange(next as "all" | "lastHour" | "lastDay" | "lastWeek");
                        setTimeRangeOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-left text-xs font-medium ${timeRange === value ? "text-brand bg-brand/10" : "text-ink-2 hover:bg-surface/50"}`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Event Types Filter */}
          <div className="relative w-48">
            <button
              onClick={() => setEventTypesOpen(!eventTypesOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-ink-2 border border-line rounded-md hover:bg-surface/50"
            >
              <span>
                {selectedEventTypes.length === 0
                  ? "All event types"
                  : selectedEventTypes.length === eventTypes.length
                    ? "All selected"
                    : `${selectedEventTypes.length} selected`}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {eventTypesOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-surface border border-line rounded-md shadow-lg z-10">
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      onSelectedEventTypesChange([]);
                      setEventTypesOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-left text-xs font-medium ${selectedEventTypes.length === 0 ? "text-brand bg-brand/10" : "text-ink-2 hover:bg-surface/50"}`}
                  >
                    No event types
                  </button>
                  <button
                    onClick={() => {
                      onSelectedEventTypesChange(eventTypes);
                      setEventTypesOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-left text-xs font-medium ${selectedEventTypes.length === eventTypes.length ? "text-brand bg-brand/10" : "text-ink-2 hover:bg-surface/50"}`}
                  >
                    All event types
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="h-2.5 w-2.5 rounded-full">{isConnected ? (
            <span className="bg-ok"></span>
          ) : (
            <span className="bg-warn"></span>
          )}</span>
          <span className="flex-1 text-center">
            {filteredEventCount} of {eventCount} {eventCount === 1 ? "event" : "events"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:text-brand hover:bg-brand/10 transition-colors"
            aria-label="Clear ledger"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}