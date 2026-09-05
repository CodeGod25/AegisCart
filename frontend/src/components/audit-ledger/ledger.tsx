import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { chip, sealFor, reasonChipsFor } from "@/lib/ledger-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";

// Define the shape of a ledger event (same as in use-ledger.ts)
export const LedgerEventSchema = z.object({
  id: z.string(),
  actionType: z.string(),
  actor: z.string().optional(),
  timestamp: z.string(),
  explainability: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

interface LedgerProps {
  events: LedgerEvent[];
  isLoading: boolean;
  filter?: string;
  filterType?: "all" | "actionType" | "actor" | "explainability";
  timeRange?: "all" | "lastHour" | "lastDay" | "lastWeek";
  selectedEventTypes?: string[];
}

export default function Ledger({
  events,
  isLoading,
  filter = "",
  filterType = "all",
  timeRange = "all",
  selectedEventTypes = []
}: LedgerProps) {
  // Filter events based on all criteria
  const visibleEvents = events.filter(event => {
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3">
        <div className="flex flex-col items-center justify-center space-y-4">
          {/* Skeleton loader for ledger entries */}
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="ledger-item skeleton-loading">
                <div className="flex gap-4 p-4">
                  {/* The rail */}
                  <div className="flex-shrink-0 flex h-6 items-center justify-center">
                    <div className="h-3 w-3 rounded-full skeleton h-3 w-3"></div>
                    <div className="absolute left-[8px] top-[14px] bottom-0 w-0.5 bg-line/50"></div>
                  </div>
                  {/* Event content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium skeleton w-32"></span>
                        <span className="skeleton w-16"></span>
                        <span className="skeleton w-10"></span>
                      </div>
                      <p className="text-sm skeleton w-40 h-5"></p>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs">
                        <span className="skeleton w-24 h-4"></span>
                        <span className="skeleton w-20 h-4"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-sm text-ink-3">Loading ledger entries...</div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M5 19l14-7-3-17"></path>
          </svg>
        </div>
        <div className="text-sm">No money actions yet.</div>
        <div className="text-xs text-ink-2 mt-2">
          Run the guided demo or the buyer agent to populate the audit trail.
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line/10">
      {visibleEvents.map((event) => (
        <div key={event.id} className="ledger-item py-4">
          <EventRow event={event} />
        </div>
      ))}
    </div>
  );
}

// Helper function to format timestamp to time only
const formatTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const EventRow: React.FC<{ event: LedgerEvent }> = ({ event }) => {
  const { actionType, actor, timestamp, explainability, payload } = event;
  const time = formatTime(timestamp);
  const actorClass = (actor: string | undefined) => {
    switch (actor) {
      case "merchant":
        return "merchant";
      case "buyer":
        return "buyer";
      case "human":
        return "human";
      default:
        return "system";
    }
  };

  // Determine event type for styling (settled, blocked, approval)
  let extraClass = "";
  if (["PAYMENT_SUCCEEDED", "MANDATE_CREATED", "OFFER_CONSUMED"].includes(actionType)) {
    extraClass = "event-settled";
  } else if (["OFFER_REJECTED", "MANDATE_REJECTED", "PAYMENT_FAILED", "APPROVAL_REJECTED"].includes(actionType)) {
    extraClass = "event-blocked";
  } else if (actionType === "APPROVAL_REQUESTED") {
    extraClass = "event-approval";
  }

  // Reason chips and seal
  const reasonCodes = reasonChipsFor(event);
  const seal = sealFor(event);

  return (
    <div className={cn("flex gap-4 p-4", extraClass)}>
      {/* The rail */}
      <div className="flex-shrink-0 flex h-6 items-center justify-center">
        <div className="h-3 w-3 rounded-full">
          {actorClass(actor) === "merchant" && (
            <span className="bg-merchant"></span>
          )}
          {actorClass(actor) === "buyer" && (
            <span className="bg-buyer"></span>
          )}
          {actorClass(actor) === "human" && (
            <span className="bg-warn"></span>
          )}
          {actorClass(actor) === "system" && (
            <span className="bg-ink-3"></span>
          )}
        </div>
        {/* The line connecting events */}
        <div className="absolute left-[8px] top-[14px] bottom-0 w-0.5 bg-line/50"></div>
      </div>

      {/* Event content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink capitalize">{actionType.replace(/_/g, " ")}</span>
            <span className="text-ink-3">{actor !== undefined ? actor.toUpperCase() : "SYSTEM"}</span>
            <span className="text-ink-3">{time}</span>
          </div>
          {explainability && (
            <p className="text-sm text-ink-2">{explainability}</p>
          )}
          {reasonCodes || seal ? (
            <div className="flex flex-wrap gap-2 mt-1 text-xs"
                dangerouslySetInnerHTML={{ __html: reasonCodes + seal }} />
          ) : null}
        </div>
      </div>
    </div>
  );
};