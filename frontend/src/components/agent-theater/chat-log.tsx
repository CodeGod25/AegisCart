import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart } from "lucide-react";

// Define the shape of a turn from the agent (same as in use-chat.ts)
const TurnSchema = z.object({
  sessionId: z.string().optional(),
  llm: z.object({
    intent: z.object({
      used: z.boolean(),
      provider: z.string().optional(),
      model: z.string().optional(),
      fallback: z.boolean().optional(),
      reason: z.string().optional(),
    }),
    reply: z.object({
      used: z.boolean(),
      provider: z.string().optional(),
      model: z.string().optional(),
      fallback: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  }).optional(),
  data: z.object({
    negotiation: z.object({
      offer: z.object({
        offerId: z.string().optional(),
      }).optional(),
      quote: z.object({
        offerId: z.string().optional(),
      }).optional(),
      decision: z.object({
        allowed: z.boolean().optional(),
        requiresApproval: z.boolean().optional(),
        riskScore: z.number().optional(),
        reasons: z.array(z.string()).optional(),
      }).optional(),
      requiresApproval: z.boolean().optional(),
    }).optional(),
    approval: z.object({
      approvalId: z.string().optional(),
    }).optional(),
    mandate: z.object({
      mandateId: z.string(),
      buyer: z.string(),
      maxTotalPaise: z.number(),
      maxPerOrderPaise: z.number(),
      allowedCategories: z.array(z.string()),
      spentPaise: z.number(),
      currency: z.enum(["INR"]),
      createdAt: z.string(),
      expiresAt: z.string(),
      status: z.enum(["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"]),
      signature: z.string(),
    }).optional(),
  }).optional(),
  action: z.string().optional(),
  reply: z.string().optional(),
  explainability: z.string().optional(),
  timestamp: z.string().optional(),
  actor: z.string().optional(),
  phase: z.string().optional(),
});

type Turn = z.infer<typeof TurnSchema>;

interface ChatLogProps {
  messages: Turn[];
  className?: string;
}

export default function ChatLog({
  messages,
  className = "",
}: ChatLogProps) {
  const chatLogRef = useRef<HTMLDivElement>(null);
  const [likedIndices, setLikedIndices] = useState<Set<number>>(new Set());

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages]);

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

  // Determine if a turn shows policy evaluation
  const showsPolicyEvaluation = (turn: Turn) => {
    return turn.phase === "policy_evaluation" ||
           (turn.data?.negotiation && turn.data.negotiation.decision);
  };

  // Determine if a turn shows approval requirement
  const showsApprovalRequired = (turn: Turn) => {
    return turn.data?.negotiation?.requiresApproval === true;
  };

  // Determine if a turn shows offer creation
  const showsOfferCreation = (turn: Turn) => {
    return turn.data?.negotiation?.offer?.offerId !== undefined ||
           turn.action === "OFFER_CREATED";
  };

  // Format timestamp to time only, fallback to client time if missing
  const formatTime = (timestamp: string | undefined) => {
    try {
      const date = timestamp ? new Date(timestamp) : new Date();
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Optional: show toast or feedback
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const toggleLike = (index: number) => {
    setLikedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div
      ref={chatLogRef}
      className={cn(
        "flex flex-col gap-4 p-4 overflow-y-auto",
        className
      )}
    >
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-ink-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.31-.211-2.57-.578-3.754Z" />
            </svg>
          </div>
          <div className="text-xl font-medium text-ink">Listening for agent activity...</div>
          <p className="text-sm text-ink-2 max-w-md text-center">
            Ask for a quote, a payment, or a spend mandate. The agent uses the LLM only for wording — every price and gate is deterministic.
          </p>
        </div>
      ) : (
        <>
          {messages.map((turn, index) => {
            const actor = turn.actor || "system";
            const isPolicyEval = showsPolicyEvaluation(turn);
            const isApprovalReq = showsApprovalRequired(turn);
            const isOfferCreated = showsOfferCreation(turn);
            const time = formatTime(turn.timestamp);
            const isLiked = likedIndices.has(index);

            return (
              <div key={index} className={cn(
                `bubble ${actorClass(actor)}`,
                isPolicyEval && "bubble-policy",
                isApprovalReq && "bubble-approval",
                isOfferCreated && "bubble-offer"
              )}>
                <div className="who flex items-center gap-2 text-xs font-medium whitespace-nowrap">
                  <span className={`${actorClass(actor)}-who`}>
                    {actor === "merchant" ? "merchant agent" :
                     actor === "buyer" ? "buyer agent" :
                     actor === "human" ? "human" : "system"}
                  </span>
                  {turn.phase && (
                    <span className="phase ml-1 text-xs text-ink-3">{turn.phase}</span>
                  )}
                  {/* Time stamp */}
                  {time && (
                    <span className="ml-2 text-xs text-ink-3">{time}</span>
                  )}
                  {/* Action buttons */}
                  <div className="ml-auto flex items-center gap-1">
                    {/* Copy button */}
                    <button
                      onClick={() => copyToClipboard(turn.reply || "")}
                      className="p-1 rounded hover:bg-surface/50 transition-colors"
                      title="Copy message"
                      aria-label="Copy message"
                    >
                      <svg className="h-3 w-3 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2-2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    {/* Like button */}
                    <button
                      onClick={() => toggleLike(index)}
                      className={cn(
                        "p-1 rounded hover:bg-surface/50 transition-colors",
                        isLiked ? "text-ok" : "text-ink-3"
                      )}
                      title="Like message"
                      aria-label="Like message"
                    >
                      <Heart className="h-3 w-3" fill={isLiked ? "currentColor" : "none"} stroke={isLiked ? "none" : "currentColor"} strokeWidth={2} />
                    </button>
                  </div>
                  {/* Policy evaluation indicator */}
                  {isPolicyEval && (
                    <span className="ml-2 h-2.5 w-2.5 rounded-full bg-warn/50">
                      <svg className="h-1.5 w-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22l-6.16-1.88L7 14.14 2 9.27l6.91-3.01z"/>
                      </svg>
                    </span>
                  )}
                  {/* Approval required indicator */}
                  {isApprovalReq && (
                    <span className="ml-2 h-2.5 w-2.5 rounded-full bg-warn/50">
                      <svg className="h-1.5 w-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </span>
                  )}
                  {/* Offer created indicator */}
                  {isOfferCreated && (
                    <span className="ml-2 h-2.5 w-2.5 rounded-full bg-ok/50">
                      <svg className="h-1.5 w-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.2l-3.95-5L4 11.7l5 6.43L22 3.5l1.41 1.41L9 16.2z"/>
                      </svg>
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink">{turn.reply || ""}</p>
                {turn.explainability && (
                  <p className="mt-2 text-xs text-ink-2">{turn.explainability}</p>
                )}
                {/* Show policy decision details if available */}
                {turn.data?.negotiation?.decision && (
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Decision:</span>
                      <span className={cn(
                        turn.data.negotiation.decision?.allowed ? "text-ok" : "text-bad"
                      )}>
                        {turn.data.negotiation.decision?.allowed ? "ALLOWED" : "REJECTED"}
                      </span>
                    </div>
                    {turn.data.negotiation.decision?.requiresApproval && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Approval:</span>
                        <span className="text-warn">REQUIRED</span>
                      </div>
                    )}
                    {turn.data?.negotiation?.decision?.riskScore !== undefined && (() => {
                      const riskScore = turn.data.negotiation.decision.riskScore;
                      return <div className="flex items-center gap-2">
                        <span className="font-medium">Risk:</span>
                        <span className={cn(
                          riskScore >= 5 ? "text-bad" :
                          riskScore >= 3 ? "text-warn" : "text-ok"
                        )}>
                          {riskScore}/10
                        </span>
                      </div>;
                    })()}
                  </div>
                )}
                {/* Reason codes and seals would go here in a full implementation */}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}