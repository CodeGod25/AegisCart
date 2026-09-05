import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { API_BASE_URL } from "@/lib/api-config";
import { z } from "zod";

// Define the shape of the best offer response
const BestOfferSchema = z.object({
  ok: z.boolean(),
  sku: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().optional(),
  listUnitPriceInPaise: z.number().optional(),
  bestDiscountPct: z.number().optional(),
  discountedUnitPriceInPaise: z.number().optional(),
  lineTotalInPaise: z.number().optional(),
  totalSavingsInPaise: z.number().optional(),
  resultingMarginPct: z.number().optional(),
  explanation: z.string().optional(),
});

type BestOffer = z.infer<typeof BestOfferSchema>;

export default function BestOffer({ className }: { className?: string }) {
  const { data: bestOfferData, isLoading, error, refetch } = useQuery({
    queryKey: ["best-offer"],
    queryFn: async () => {
      const catalogResponse = await fetch(`${API_BASE_URL}/catalog/items`);
      if (!catalogResponse.ok) throw new Error("Failed to fetch catalog");
      const catalog = await catalogResponse.json() as Array<{ sku?: string }>;
      const sku = catalog[0]?.sku;
      if (!sku) return { ok: false };
      const res = await fetch(`${API_BASE_URL}/revenue/best-offer?sku=${encodeURIComponent(sku)}`);
      if (!res.ok) throw new Error("Failed to fetch best offer");
      const data = await res.json();
      return BestOfferSchema.parse(data);
    },
  });

  if (isLoading) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full text-ink-3", className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3"></path>
          </svg>
        </div>
        <p className="text-sm">Loading best offer...</p>
      </div>
    );
  }

  if (error) {
    return <div role="alert" className={cn("panel-feedback", className)}><p>Best offer data could not be loaded.</p><button onClick={() => refetch()}>Retry</button></div>;
  }

  if (!bestOfferData || !bestOfferData.ok) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full text-ink-3", className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M5 19l14-7-3-17"></path>
          </svg>
        </div>
        <p className="text-sm">No best offer data available.</p>
      </div>
    );
  }

  if (!bestOfferData.name || bestOfferData.lineTotalInPaise === undefined) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full text-ink-3", className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M5 19l14-7-3-17"></path>
          </svg>
        </div>
        <p className="text-sm">No best offer calculated yet.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Best Offer Summary */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Best Offer</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Offer total</span>
            <span className="font-mono">{formatINR(bestOfferData.lineTotalInPaise)}</span>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Margin</span>
            <span className="font-mono">{bestOfferData.resultingMarginPct?.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Discount</span>
            <span className="font-mono">{bestOfferData.bestDiscountPct?.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Best Offer Items */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Recommended offer</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><span>{bestOfferData.quantity} × {bestOfferData.name}</span><code className="text-xs font-mono text-ink-3">{bestOfferData.sku}</code></div>
          <div className="flex justify-between text-xs text-ink-2"><span>Unit price after discount</span><span className="font-mono">{formatINR(bestOfferData.discountedUnitPriceInPaise ?? 0)}</span></div>
          <p className="border-t border-line/30 pt-2 text-xs text-ink-2">{bestOfferData.explanation}</p>
        </div>
      </div>
    </div>
  );
}