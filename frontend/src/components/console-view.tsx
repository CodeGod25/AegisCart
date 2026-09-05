"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AgentTheater from "@/components/agent-theater";
import AuditLedger from "@/components/audit-ledger";
import OperationsRail from "@/components/operations-rail";
import { RotateCcw, SunMoon, CircleHelp, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api-config";

interface ConsoleViewProps {
  onBack: () => void;
}

export default function ConsoleView({ onBack }: ConsoleViewProps) {
  const [activePanel, setActivePanel] = useState<'theater' | 'ledger' | 'operations'>('theater');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const queryClient = useQueryClient();
  const activeStage = activePanel === 'theater' ? 0 : activePanel === 'ledger' ? 5 : 1;

  return (
    <div className="console-view flex min-h-screen flex-col bg-background">
      {/* Console Header */}
      <header className="console-header flex h-16 items-center gap-4 border-b border-line/50 bg-surface px-4 py-2 sm:px-6">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:text-brand hover:bg-brand/10 transition-colors"
          title="Back to Overview"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="console-title flex-1 flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-ink tracking-tight">
              AegisCart Control Console
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium ${showHelp ? 'text-brand bg-brand/10' : 'text-ink-2 hover:text-brand hover:bg-brand/10'} transition-colors`}
            >
              <CircleHelp className="h-4 w-4" />
              Help
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-ink-2">
            <span className="h-2 w-2 rounded-full">
              <span className="bg-merchant" />
            </span>
            <span>Merchant Agent</span>
          </div>
          <div className="flex items-center gap-2 text-ink-2">
            <span className="h-2 w-2 rounded-full">
              <span className="bg-warn" />
            </span>
            <span>LLM · deterministic floor</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Reset demo"
              title="Reset demo"
              onClick={async () => {
                const response = await fetch(`${API_BASE_URL}/demo/reset`, { method: "POST" });
                if (response.ok) {
                  await queryClient.invalidateQueries();
                }
                setResetMessage(response.ok ? "Demo reset" : "Reset failed");
                window.dispatchEvent(new Event("aegis-demo-reset"));
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-brand/10 hover:text-brand transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              aria-label="Toggle theme"
              title="Toggle theme"
              onClick={() => window.dispatchEvent(new CustomEvent("aegis-theme", { detail: "toggle" }))}
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-brand/10 hover:text-brand transition-colors"
            >
              <SunMoon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface/90 backdrop-blur-sm rounded-xl p-6 max-w-md w-full relative">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-3 right-3 text-ink-2 hover:text-brand h-8 w-8 rounded-full flex items-center justify-center"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink">Demo Help</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <CircleHelp className="h-5 w-5 text-brand" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-ink">How to Use</h4>
                    <p className="text-sm text-ink-2">
                      1. Start in Agent Theater to see natural language processing<br className="hidden sm:block" />
                      2. Watch LLM usage indicator to see when AI is working on language<br className="hidden sm:block" />
                      3. Use Operations Rail to inject failures and see deterministic guarantees<br className="hidden sm:block" />
                      4. Review Audit Ledger for complete, immutable transaction history<br className="hidden sm:block" />
                      5. All monetary decisions are made by deterministic code - never by LLM
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <Shield className="h-5 w-5 text-ok" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-ink">Money Safety Guarantees</h4>
                    <p className="text-sm text-ink-2">
                      • LLM handles language ONLY<br className="hidden sm:block" />
                      • Policies enforced by deterministic code<br className="hidden sm:block" />
                      • Spend requires pre-authorized mandates<br className="hidden sm:block" />
                      • High-value actions get human approval<br className="hidden sm:block" />
                      • Complete cryptographic audit trail<br className="hidden sm:block" />
                      • Idempotent operations prevent duplicate charges
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetMessage && (
        <div className="console-notice flex items-center justify-between px-4 py-2 mb-4 rounded-lg border-l-4"
          role="status"
          data-state={resetMessage.includes("failed") ? "error" : "success"}
        >
          <span className="flex-1">{resetMessage}</span>
          {resetMessage.includes("failed") ? (
            <svg className="h-4 w-4 text-bd" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-ok" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}

      {/* Panel Switcher */}
      <nav className="flex flex-wrap items-center justify-center gap-2 border-b border-line/20 bg-surface/50 px-4 py-2">
        <button
          onClick={() => setActivePanel('theater')}
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium",
            activePanel === 'theater' ? 'text-brand bg-brand/10' : 'text-ink-2 hover:text-brand hover:bg-brand/10'
          )}
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-merchant"></span>
            Agent Theater
          </span>
        </button>
        <button
          onClick={() => setActivePanel('ledger')}
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium",
            activePanel === 'ledger' ? 'text-brand bg-brand/10' : 'text-ink-2 hover:text-brand hover:bg-brand/10'
          )}
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-buyer"></span>
            Audit Ledger
          </span>
        </button>
        <button
          onClick={() => setActivePanel('operations')}
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium",
            activePanel === 'operations' ? 'text-brand bg-brand/10' : 'text-ink-2 hover:text-brand hover:bg-brand/10'
          )}
          aria-current={activePanel === 'operations' ? 'page' : undefined}
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-warn"></span>
            Operations Rail
          </span>
        </button>
      </nav>

      <div className="decision-trail" aria-label="Transaction decision trail">
        <div className="flex items-center gap-1 px-4 py-2">
          {['Intent', 'Policy', 'Approval', 'Offer', 'Payment', 'Ledger'].map((stage, index) => (
            <div key={stage} className={cn(
              `decision-stage flex items-center gap-2 text-xs font-medium`,
              index === activeStage ? 'is-active' : ''
            )}>
              <span className="decision-index flex h-5 w-5 items-center justify-center rounded-md">{index + 1}</span>
              <span>{stage}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={cn("flex-1 min-w-0 h-full", activePanel !== 'theater' && "hidden")}><AgentTheater /></div>
        <div className={cn("flex-1 min-w-0 h-full", activePanel !== 'ledger' && "hidden")}><AuditLedger /></div>
        <div className={cn("flex-1 min-w-0 h-full", activePanel !== 'operations' && "hidden")}><OperationsRail /></div>
      </div>

    </div>
  );
}