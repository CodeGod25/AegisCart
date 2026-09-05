import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api-config";
import { z } from "zod";

// Define the shape of an approval (based on the backend)
const ApprovalSchema = z.object({
  approvalId: z.string(),
  kind: z.string(),
  riskScore: z.number().optional(),
  proposedAction: z.object({
    name: z.string().optional(),
    quantity: z.number().optional(),
    discountPct: z.number().optional(),
    totalInPaise: z.number().optional(),
  }).optional(),
  reasons: z.array(z.string()).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
});

type Approval = z.infer<typeof ApprovalSchema>;

export default function Approvals() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Fetch approvals
  const { data: approvalsData, isLoading: isFetching, error: fetchError } = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/approvals?status=PENDING`);
      if (!res.ok) throw new Error("Failed to fetch approvals");
      const data = await res.json();
      return z.array(ApprovalSchema).parse(data.approvals || []);
    },
  });

  // Mutation for approving an approval
  const approveMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await fetch(`${API_BASE_URL}/approvals/${encodeURIComponent(approvalId)}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decidedBy: "merchant-console" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to approve");
      }
      return res.json();
    },
  });

  // Mutation for rejecting an approval
  const rejectMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await fetch(`${API_BASE_URL}/approvals/${encodeURIComponent(approvalId)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decidedBy: "merchant-console" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to reject");
      }
      return res.json();
    },
  });

  // Handle approval
  const handleApprove = (approvalId: string) => {
    approveMutation.mutate(approvalId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["approvals"] });
      },
      onError: (err) => {
        setMutationError(err.message);
      },
    });
  };

  // Handle rejection
  const handleReject = (approvalId: string) => {
    rejectMutation.mutate(approvalId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["approvals"] });
      },
      onError: (err) => {
        setMutationError(err.message);
      },
    });
  };

  const approvals = approvalsData ?? [];
  const isLoading = isFetching;
  const error = mutationError ?? (fetchError instanceof Error ? fetchError.message : null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"></path>
          </svg>
        </div>
        <p className="text-sm">Loading approvals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"></path>
          </svg>
        </div>
        <p className="text-sm text-bad">{error}</p>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M5 19l14-7-3-17"></path>
          </svg>
        </div>
        <p className="text-sm">No pending approvals. Risky or high-value orders will surface here for a human decision.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.approvalId}
          approval={approval}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </div>
  );
}

interface ApprovalCardProps {
  approval: Approval;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}

function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const { approvalId, kind, riskScore, proposedAction, reasons } = approval;
  const pa = proposedAction || {};

  // Format the proposed action details
  const det = pa.name != null
    ? `${pa.quantity != null ? `${pa.quantity} × ` : ""}${pa.name}${
        pa.discountPct != null ? ` · ${pa.discountPct}% off · ` : ""
      }${pa.totalInPaise != null ? formatINR(pa.totalInPaise) : ""}`
    : esc(kind || "order");

  // Format reasons as chips
  const reasonsChips = (reasons || []).map((reason) => (
    <Chip key={reason} variant="default">
      {reason}
    </Chip>
  ));

  return (
    <div className="approval border border-warn/50 border-l-4 border-warn rounded-lg bg-surface/50 p-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-ink">{kind}</h3>
        <span className="text-xs font-mono text-warn bg-warn/10 px-2 py-0.5 rounded-full">
          risk {riskScore ?? "—"}
        </span>
      </div>
      <p className="text-sm text-ink-2 mb-2">{det}</p>
      {reasonsChips && (
        <div className="flex flex-wrap gap-1 mb-2 text-xs">{reasonsChips}</div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => onApprove(approvalId)}
          variant="outline"
          className="text-ok hover:bg-ok/10"
        >
          Approve
        </Button>
        <Button
          onClick={() => onReject(approvalId)}
          variant="outline"
          className="text-bad hover:bg-bad/10"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

// Helper function to escape HTML (to prevent XSS)
function esc(str: string): string {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&", "<": "<", ">": ">", '"': '"', "'": "'" }[c]) ?? c
  );
}