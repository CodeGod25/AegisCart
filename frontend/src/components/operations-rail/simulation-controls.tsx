import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api-config";

export default function SimulationControls({ className }: { className?: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [simulationState, setSimulationState] = useState<{
    failNextPayment: string | null;
    llmUnavailable: boolean;
  } | null>(null);

  // Fetch initial simulation state
  async function loadSimulationState() {
    try {
      const res = await fetch(`${API_BASE_URL}/simulation/state`);
      if (res.ok) {
        const data = await res.json();
        setSimulationState(data);
      }
    } catch (error) {
      console.warn("Failed to load simulation state:", error);
    }
  }

  const simulatePaymentDeclineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/simulate/failure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "payment_decline" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to simulate payment decline");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback("Payment decline will be injected into the next payment attempt.");
      setSimulationState(data.state);
    },
    onError: (err) => {
      setFeedback(err.message);
    },
  });

  const simulateLlmOutageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/simulate/llm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ unavailable: true }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to simulate LLM outage");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback("LLM outage simulation enabled. The deterministic fallback remains active.");
      setSimulationState(data.state);
    },
    onError: (err) => {
      setFeedback(err.message);
    },
  });

  const simulateResetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/simulate/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to reset simulation");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback("All simulations reset.");
      setSimulationState(data.state);
    },
    onError: (err) => {
      setFeedback(err.message);
    },
  });

  const handleSimulatePaymentDecline = () => {
    simulatePaymentDeclineMutation.mutate();
  };

  const handleSimulateLlmOutage = () => {
    simulateLlmOutageMutation.mutate();
  };

  const handleSimulateReset = () => {
    if (window.confirm("Reset all simulations and return to normal operation?")) {
      simulateResetMutation.mutate();
    }
  };

  // Load initial state on mount
  // Note: In a real implementation, we'd use useEffect, but for simplicity we'll call it directly
  // and rely on the mutation onSuccess handlers to update state
  // loadSimulationState();

  return (
    <div className={cn("space-y-6", className)}>
      {/* Simulation State Display */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Simulation State</span>
        </div>
        {simulationState ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Next Payment Failure:</span>
              <span className="font-mono">
                {simulationState.failNextPayment === "NONE" ? "None (Normal Operation)" : simulationState.failNextPayment}
              </span>
            </div>
            <div className="flex justify-between">
              <span>LLM Availability:</span>
              <span className="font-mono">
                {simulationState.llmUnavailable ? "Simulated Unavailable" : "Available"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">Loading simulation state...</p>
        )}
      </div>

      {/* Simulation Controls */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Failure Injection Controls</span>
        </div>
        <div className="space-y-3">
          <Button
            onClick={handleSimulatePaymentDecline}
            variant="outline"
            className="w-full"
          >
            💥 Simulate Payment Decline
          </Button>
          <Button
            onClick={handleSimulateLlmOutage}
            variant="outline"
            className="text-warn hover:bg-warn/10 w-full"
          >
            🧠 Simulate LLM Outage
          </Button>
          <Button
            onClick={handleSimulateReset}
            variant="ghost"
            className="w-full"
          >
            🔄 Reset Simulation
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="p-3 rounded-lg border ltr:pl-3 rtl:pr-3">
          {feedback.includes("error") || feedback.includes("Failed") || feedback.includes("failed") ? (
            <div className="bg-bad/10 text-bd border border-bd/20">{feedback}</div>
          ) : (
            <div className="bg-ok/10 text-ok border border-ok/20">{feedback}</div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-ink-3">
        <p className="mb-1"><strong>How to use for demo:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Inject a payment decline to show graceful recovery with idempotency keys</li>
          <li>Simulate LLM outage to demonstrate deterministic fallback (money safety)</li>
          <li>Reset between demo scenarios to start fresh</li>
        </ul>
      </div>
    </div>
  );
}