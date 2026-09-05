import { useState } from "react";
import { useLedger } from "@/lib/hooks/use-ledger";
import Ledger from "./ledger";
import LedgerBody from "./ledger-body";
import LedgerHeader from "./ledger-header";

export default function AuditLedger() {
  const [filter, setFilter] = useState("");
  const [filterType, setFilterType] = useState<"all" | "actionType" | "actor" | "explainability">("all");
  const [timeRange, setTimeRange] = useState<"all" | "lastHour" | "lastDay" | "lastWeek">("all");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const { events, isLoading, isConnected, clearLedger, error } = useLedger();

  // Get all unique event types for the filter dropdown
  const eventTypes = Array.from(new Set((events as any[]).map((e: any) => e.actionType)));

  // Filter events based on all criteria
  const filteredEvents = (events as any[]).filter((event: any) => {
    // Time range filter
    const now = new Date();
    const eventTime = new Date(event.timestamp);
    const timeDiff = now.getTime() - eventTime.getTime();

    const passesTimeFilter = timeRange === "all" ||
      (timeRange === "lastHour" && timeDiff <= 60 * 60 * 1000) ||
      (timeRange === "lastDay" && timeDiff <= 24 * 60 * 60 * 1000) ||
      (timeRange === "lastWeek" && timeDiff <= 7 * 24 * 60 * 60 * 1000);

    // Event type filter
    const passesEventTypeFilter = selectedEventTypes.length === 0 ||
      selectedEventTypes.includes(event.actionType);

    // Text filter
    const passesTextFilter = !filter ||
      (filterType === "all" &&
        `${event.actionType} ${event.actor ?? ""} ${event.explainability}`.toLowerCase().includes(filter.toLowerCase())) ||
      (filterType === "actionType" && event.actionType.toLowerCase().includes(filter.toLowerCase())) ||
      (filterType === "actor" && (event.actor ?? "").toLowerCase().includes(filter.toLowerCase())) ||
      (filterType === "explainability" && event.explainability.toLowerCase().includes(filter.toLowerCase()));

    return passesTimeFilter && passesEventTypeFilter && passesTextFilter;
  });

  return (
    <div className="flex flex-col h-full">
      <LedgerHeader
        eventCount={events.length}
        filteredEventCount={filteredEvents.length}
        isConnected={isConnected}
        onClear={clearLedger}
        filter={filter}
        onFilterChange={setFilter}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        eventTypes={eventTypes as string[]}
        selectedEventTypes={selectedEventTypes}
        onSelectedEventTypesChange={setSelectedEventTypes}
      />
      {error && <div role="alert" className="px-4 py-2 text-xs text-bad">Ledger connection failed. Showing the last available snapshot.</div>}
      <LedgerBody
        className="flex-1 overflow-y-auto"
        events={filteredEvents}
        isLoading={isLoading}
        filter={filter}
        filterType={filterType}
        timeRange={timeRange}
        selectedEventTypes={selectedEventTypes}
      />
    </div>
  );
}