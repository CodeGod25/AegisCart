"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
import { z } from "zod";

// Define the shape of a ledger event (based on the backend)
const LedgerEventSchema = z.object({
  id: z.string(),
  actionType: z.string(),
  actor: z.string().optional(),
  timestamp: z.string(),
  explainability: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export function useLedger() {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch initial ledger snapshot
  const { data: snapshotData, isLoading: isSnapshotLoading, error: snapshotError } = useQuery({
    queryKey: ["ledger-events"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/ledger/events`);
      if (!res.ok) throw new Error("Failed to fetch ledger events");
      const data = await res.json();
      const rawEvents = Array.isArray(data.events) ? data.events : (Array.isArray(data) ? data : []);
      return (rawEvents as LedgerEvent[]).slice().sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },
  });

  // Mutation for clearing the ledger
  const clearLedgerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/ledger/events`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to clear ledger");
      }
    },
    onSuccess: () => {
      setEvents([]);
      queryClient.setQueryData(["ledger-events"], []);
      queryClient.invalidateQueries({ queryKey: ["ledger-events"] });
    },
  });

  // Set up EventSource for real-time updates
  useEffect(() => {
    const reset = () => {
      setEvents([]);
      queryClient.setQueryData(["ledger-events"], []);
    };
    window.addEventListener("aegis-demo-reset", reset);

    if (typeof EventSource === "undefined") {
      // Fallback to polling if EventSource is not supported
      console.warn("EventSource not supported, falling back to polling");
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/ledger/events`);
          if (res.ok) {
            const data = await res.json();
            setEvents((prev) => {
              const current = prev ?? [];
              const newEvents = Array.isArray(data.events) ? data.events : (Array.isArray(data) ? data : []);
              // Merge new events with existing, avoiding duplicates by id
              const merged = [...newEvents, ...current.filter((e) => !newEvents.some((ne: LedgerEvent) => ne.id === e.id))];
              // Sort by timestamp descending (newest first)
              return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            });
          }
        } catch (err) {
          console.error("Error polling ledger:", err);
        }
      }, 2500); // Poll every 2.5 seconds

      return () => {
        clearInterval(pollInterval);
        window.removeEventListener("aegis-demo-reset", reset);
      };
    }

    const eventSource = new EventSource(`${API_BASE_URL}/ledger/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // We don't close the connection here because the browser will retry automatically
    };

    eventSource.addEventListener("snapshot", (e) => {
      try {
        const snapshot = JSON.parse(e.data);
        const list: LedgerEvent[] = Array.isArray(snapshot)
          ? snapshot
          : (Array.isArray(snapshot?.events) ? snapshot.events : []);
        // Sort descending (newest first)
        const sorted = list.slice().sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setEvents(sorted);
      } catch (err) {
        console.error("Error parsing ledger snapshot:", err);
      }
    });

    eventSource.addEventListener("append", (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents((prev) => {
          // Avoid duplicates
          const current = prev ?? queryClient.getQueryData<LedgerEvent[]>(["ledger-events"]) ?? [];
          if (current.some((e) => e.id === event.id)) return current;
          return [event, ...current]; // Prepend new event
        });
      } catch (err) {
        console.error("Error parsing ledger append:", err);
      }
    });

    // Clean up on unmount
    return () => {
      eventSource.close();
      window.removeEventListener("aegis-demo-reset", reset);
    };
  }, [queryClient]);

  const clearLedger = () => {
    clearLedgerMutation.mutate();
  };

  return {
    events: events ?? snapshotData ?? [],
    isLoading: isSnapshotLoading && events === null,
    error: snapshotError,
    isConnected,
    clearLedger,
  };
}