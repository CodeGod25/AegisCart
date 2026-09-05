import { formatINR } from "@/lib/format";
import { Check, Shield, Users, List, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock merchant policy for demo purposes
// In a real app, this would come from the backend or a shared data source
const merchantPolicy = {
  maxDiscountPct: 15,
  minMarginPct: 20,
};

export default function DeterministicGuarantee({ className }: { className?: string }) {
  return (
    <div className={cn("bg-surface/50 p-6 rounded-xl border border-line/20 shadow-sm", className)}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-ink">Deterministic Guarantees</h3>
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <div className="flex items-center gap-1">
            <Check className="h-4 w-4 text-ok" />
            <span>Verified</span>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {/* Guarantee Items */}
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-ok/10 rounded-lg">
              <Check className="h-4 w-4 text-ok" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-medium text-ink">Money Safety</h4>
              <p className="text-sm text-ink-2">
                Every monetary decision is made by deterministic code - never by LLM.
                <br className="hidden sm:block" />
                LLM only handles language and user experience.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-warn/10 rounded-lg">
              <Shield className="h-4 w-4 text-warn" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-medium text-ink">Policy-Bounded Flexibility</h4>
              <p className="text-sm text-ink-2">
                Discounts capped at {merchantPolicy.maxDiscountPct}%, margins floored at {merchantPolicy.minMarginPct}%.
                <br className="hidden sm:block" />
                System cannot violate merchant policy, even under LLM influence.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-brand/10 rounded-lg">
              <Users className="h-4 w-4 text-brand" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-medium text-ink">Spend Mandates</h4>
              <p className="text-sm text-ink-2">
                All agent spending requires pre-authorized, bounded spend mandates.
                <br className="hidden sm:block" />
                Agents cannot spend beyond approved limits.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-ok/10 rounded-lg">
              <List className="h-4 w-4 text-ok" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-medium text-ink">Human-in-the-Loop</h4>
              <p className="text-sm text-ink-2">
                High-value actions and policy exceptions require explicit human approval.
                <br className="hidden sm:block" />
                System pauses for human judgment when needed.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-ok/10 rounded-lg">
              <Zap className="h-4 w-4 text-ok" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-medium text-ink">Immutable Audit Trail</h4>
              <p className="text-sm text-ink-2">
                Every action is cryptographically sealed in an append-only ledger.
                <br className="hidden sm:block" />
                Tamper-evident and exportable for compliance.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-brand/10 rounded-lg">
              <Clock className="h-4 w-4 text-brand" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-medium text-ink">Idempotent Operations</h4>
              <p className="text-sm text-ink-2">
                Safe retries without financial risk or duplicate charges.
                <br className="hidden sm:block" />
                Built-in protection against replay attacks and network failures.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="pt-4 border-t border-line/20">
          <p className="text-xs text-ink-2">
            This architectural separation ensures that AI enhances the user experience
            <br className="hidden sm:block" />
            without ever putting your money at risk.
          </p>
        </div>
      </div>
    </div>
  );
}