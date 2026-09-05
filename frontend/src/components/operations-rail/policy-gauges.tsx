import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { API_BASE_URL } from "@/lib/api-config";
import Gauge from "./gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";

// Define the shape of the capabilities response
const CapabilitiesSchema = z.object({
  agentCommerce: z.object({
    policyEnvelope: z.object({
      maxDiscountPct: z.number().optional(),
      minMarginPct: z.number().optional(),
      maxUnitsPerOrder: z.number().optional(),
      requiresApprovalAtRiskScore: z.number().optional(),
      highValueApprovalPaise: z.number().optional(),
    }).optional(),
  }).optional(),
});

type Capabilities = z.infer<typeof CapabilitiesSchema>;

export default function PolicyGauges() {
  const { data: capabilities, isLoading, error, refetch } = useQuery({
    queryKey: ["policy-envelope"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/catalog/capabilities`);
      if (!res.ok) throw new Error("Failed to fetch policy envelope");
      const data = await res.json();
      return data;
    },
  });

  const policyEnvelope = capabilities?.agentCommerce?.policyEnvelope;

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
    );
  }

  if (error) {
    return <div role="alert" className="panel-feedback"><p>Policy data could not be loaded.</p><button onClick={() => refetch()}>Retry</button></div>;
  }

  if (!policyEnvelope) {
    return (
      <div className="text-center py-8 text-ink-3">
        <div className="h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand mb-2">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"></path>
          </svg>
        </div>
        <p className="text-sm">No policy data available</p>
      </div>
    );
  }

  const hv = policyEnvelope.highValueApprovalPaise != null ? formatINR(policyEnvelope.highValueApprovalPaise) : "—";

  const gauges = [
    {
      name: "Discount cap",
      num: `${policyEnvelope.maxDiscountPct ?? 0}%`,
      pct: Math.min(100, ((policyEnvelope.maxDiscountPct ?? 0) / 30) * 100),
      foot: "clamped, never exceeded",
      cls: "",
    },
    {
      name: "Margin floor",
      num: `${policyEnvelope.minMarginPct ?? 0}%`,
      pct: Math.min(100, ((policyEnvelope.minMarginPct ?? 0) / 50) * 100),
      foot: "orders below are rejected",
      cls: "floor",
    },
    {
      name: "Units / order",
      num: `${policyEnvelope.maxUnitsPerOrder ?? 0}`,
      pct: Math.min(100, ((policyEnvelope.maxUnitsPerOrder ?? 0) / 10) * 100),
      foot: "per-order quantity limit",
      cls: "",
    },
    {
      name: "Approval @ risk",
      num: `${policyEnvelope.requiresApprovalAtRiskScore ?? 0}`,
      pct: Math.min(100, ((policyEnvelope.requiresApprovalAtRiskScore ?? 0) / 10) * 100),
      foot: `or any order ≥ ${hv}`,
      cls: "floor",
    },
  ];

  return (
    <div className="gap-4">
      {gauges.map((gauge, index) => (
        <Gauge
          key={index}
          name={gauge.name}
          num={gauge.num}
          pct={gauge.pct}
          foot={gauge.foot}
          cls={gauge.cls}
        />
      ))}
    </div>
  );
}