import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api-config";

export default function A2ATab() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isActionPending, setIsActionPending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { data: status, isLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["buyer-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/buyer/status`);
      if (!res.ok) throw new Error("Failed to fetch buyer status");
      return res.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Add log message
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    // Scroll to bottom
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  };

  // Start buyer agent
  const handleStart = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    addLog("Starting buyer agent...");

    try {
      const res = await fetch(`${API_BASE_URL}/buyer/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error("Failed to start buyer agent");
      }

      const result = await res.json();
      addLog(result.summary ? `Mission complete: ${result.summary}` : "Buyer agent mission completed.");
      await refetchStatus();
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsActionPending(false);
    }
  };

  // Stop buyer agent
  const handleStop = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    addLog("Stopping buyer agent...");

    try {
      const res = await fetch(`${API_BASE_URL}/buyer/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to stop buyer agent");
      }

      addLog("Stop requested; the current workflow will finish safely");
      await refetchStatus();
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsActionPending(false);
    }
  };

  // Scroll to bottom when logs change
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"></path>
          </svg>
        </div>
        <p className="text-sm">Loading buyer agent status...</p>
      </div>
    );
  }

  const isAgentRunning = status?.isRunning ?? false;
  const currentTask = status?.currentTask ?? "Idle";

  return (
    <div className="flex flex-col h-full">
      {/* Status Panel */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20 mb-4">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Buyer Agent Status</span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Status</span>
            <span className={`font-mono ${isAgentRunning ? "text-ok" : "text-ink-2"}`}>
              {isAgentRunning ? "Running" : "Stopped"}
            </span>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Current Task</span>
            <span className="font-mono text-ink-2">{currentTask}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20 mb-4">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Controls</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isAgentRunning && (
            <Button
              onClick={handleStart}
              disabled={isActionPending}
              variant="outline"
              className="text-ok hover:bg-ok/10"
            >
              Start
            </Button>
          )}
          {isAgentRunning && (
            <Button
              onClick={handleStop}
              disabled={isActionPending}
              variant="outline"
              className="text-bad hover:bg-bad/10"
            >
              Request stop
            </Button>
          )}
        </div>
      </div>

      {/* Logs */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20 flex-1 overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Agent Logs</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3" ref={logRef}>
          {logs.length === 0 ? (
            <p className="text-xs text-ink-3">No logs yet. Start the buyer agent to see activity.</p>
          ) : (
            <div className="space-y-1 text-xs font-mono">
              {logs.map((log, index) => (
                <div key={index} className="flex justify-start">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}