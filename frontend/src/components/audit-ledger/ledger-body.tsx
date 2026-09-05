import Ledger from "./ledger";
import type { LedgerEvent } from "./ledger";

interface LedgerBodyProps {
  className?: string;
  events: LedgerEvent[];
  isLoading: boolean;
  filter?: string;
  filterType?: "all" | "actionType" | "actor" | "explainability";
  timeRange?: "all" | "lastHour" | "lastDay" | "lastWeek";
  selectedEventTypes?: string[];
}

export default function LedgerBody({
  className = "",
  events,
  isLoading,
  filter,
  filterType = "all",
  timeRange = "all",
  selectedEventTypes = []
}: LedgerBodyProps) {
  return (
    <div className={className}>
      <Ledger
        events={events}
        isLoading={isLoading}
        filter={filter}
        filterType={filterType}
        timeRange={timeRange}
        selectedEventTypes={selectedEventTypes}
      />
    </div>
  );
}