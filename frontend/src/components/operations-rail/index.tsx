import BestOffer from "./best-offer";
import Revenue from "./revenue";
import SimulationControls from "./simulation-controls";
import DeterministicGuarantee from "./deterministic-guarantee";
import { cn } from "@/lib/utils";

export default function OperationsRail() {
  return (
    <div className="space-y-6">
      {/* Deterministic Guarantees Panel */}
      <DeterministicGuarantee className="mb-4" />

      {/* Best Offer & Revenue Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BestOffer className="mb-0" />
        <Revenue className="mb-0" />
      </div>

      {/* Simulation Controls */}
      <SimulationControls className="mt-4" />
    </div>
  );
}