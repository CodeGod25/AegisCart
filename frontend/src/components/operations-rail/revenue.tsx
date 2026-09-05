import { formatINR } from "@/lib/format";

interface RevenueProps {
  agentRevenuePercentage?: number;
  agentAOV?: number;
  discountEfficiencyText?: string;
  agentUpiSuccessRate?: number;
  upiSuccessRateComparisonText?: string;
  agentGstTaxEfficiency?: number;
  gstTaxEfficiencyComparisonText?: string;
  funnel?: {
    negotiations: number | undefined;
    offersMinted: number | undefined;
    paymentAttempts: number | undefined;
    paymentsSucceeded: number | undefined;
    paymentsFailed: number | undefined;
  };
  perSku?: Array<{
    name: string;
    sku: string;
    revenueInPaise: number;
    unitsSold: number;
  }>;
  sales?: {
    revenueInPaise: number | undefined;
    discountGivenInPaise: number | undefined;
    costOfGoodsInPaise: number | undefined;
    grossProfitInPaise: number | undefined;
  };
  moneyFlowChartRef?: React.RefObject<HTMLCanvasElement>;
}

const defaultFunnel = {
  negotiations: undefined,
  offersMinted: undefined,
  paymentAttempts: undefined,
  paymentsSucceeded: undefined,
  paymentsFailed: undefined,
};

const defaultSales = {
  revenueInPaise: undefined,
  discountGivenInPaise: undefined,
  costOfGoodsInPaise: undefined,
  grossProfitInPaise: undefined,
};

export default function Revenue({
  agentRevenuePercentage = 0,
  agentAOV = 0,
  discountEfficiencyText = 'N/A',
  agentUpiSuccessRate,
  upiSuccessRateComparisonText,
  agentGstTaxEfficiency,
  gstTaxEfficiencyComparisonText,
  funnel = defaultFunnel,
  perSku = [],
  sales = defaultSales,
  moneyFlowChartRef,
}: RevenueProps) {
  return (
    <div className="space-y-6">
      {/* NEW AGENT PERFORMANCE METRICS */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Agent Revenue %</span>
        </div>
        <div className="text-2xl font-mono font-semibold text-ink">
          {agentRevenuePercentage.toFixed(1) + '%'}
        </div>
        <div className="text-xs text-ink-3">of total revenue</div>
      </div>
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Agent AOV</span>
        </div>
        <div className="text-2xl font-mono font-semibold text-ink">
          {formatINR(agentAOV)}
        </div>
        <div className="text-xs text-ink-3">average order value</div>
      </div>
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Agent Discount Eff.</span>
        </div>
        <div className="text-2xl font-mono font-semibold text-ink">
          {discountEfficiencyText}
        </div>
      </div>
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Agent UPI Success Rate</span>
        </div>
        <div className="text-2xl font-mono font-semibold text-ink">
          {agentUpiSuccessRate !== undefined ? agentUpiSuccessRate.toFixed(1) + '%' : 'N/A'}
        </div>
        <div className="text-xs text-ink-3">
          {upiSuccessRateComparisonText !== undefined ? upiSuccessRateComparisonText : 'Agent only data'}
        </div>
      </div>
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">GST Tax Eff.</span>
        </div>
        <div className="text-2xl font-mono font-semibold text-ink">
          {agentGstTaxEfficiency !== undefined ? agentGstTaxEfficiency.toFixed(1) + '%' : 'N/A'}
        </div>
        <div className="text-xs text-ink-3">
          {gstTaxEfficiencyComparisonText !== undefined ? gstTaxEfficiencyComparisonText : 'Agent only data'}
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Funnel</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Negotiations</span>
            <span>{funnel.negotiations ?? 0}</span>
          </div>
          <div className="h-2 w-full bg-sunken rounded-full overflow-hidden relative">
            <div
              className="h-full w-0 bg-brand transition-all duration-500"
              style={{
                width:
                  (funnel.negotiations ?? 0) > 0
                    ? Math.min(
                        100,
                        ((funnel.offersMinted ?? 0) / (funnel.negotiations ?? 1)) * 100
                      )
                    : 0,
              }}
            ></div>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Offers minted</span>
            <span>{funnel.offersMinted ?? 0}</span>
          </div>
          <div className="h-2 w-full bg-sunken rounded-full overflow-hidden relative">
            <div
              className="h-full w-0 bg-brand transition-all duration-500"
              style={{
                width:
                  (funnel.offersMinted ?? 0) > 0
                    ? Math.min(
                        100,
                        ((funnel.paymentAttempts ?? 0) / (funnel.offersMinted ?? 1)) * 100
                      )
                    : 0,
              }}
            ></div>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Payment tries</span>
            <span>{funnel.paymentAttempts ?? 0}</span>
          </div>
          <div className="h-2 w-full bg-sunken rounded-full overflow-hidden relative">
            <div
              className="h-full w-0 bg-ok transition-all duration-500"
              style={{
                width:
                  (funnel.paymentAttempts ?? 0) > 0
                    ? Math.min(
                        100,
                        ((funnel.paymentsSucceeded ?? 0) / (funnel.paymentAttempts ?? 1)) * 100
                      )
                    : 0,
              }}
            ></div>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Succeeded</span>
            <span>{funnel.paymentsSucceeded ?? 0}</span>
          </div>
          <div className="h-2 w-full bg-sunken rounded-full overflow-hidden relative">
            <div
              className="h-full w-0 bg-bad transition-all duration-500"
              style={{
                width:
                  (funnel.paymentsSucceeded ?? 0) > 0
                    ? Math.min(
                        100,
                        ((funnel.paymentsFailed ?? 0) / (funnel.paymentsSucceeded ?? 1)) * 100
                      )
                    : 0,
              }}
            ></div>
          </div>
          <div className="flex justify-between items-start text-sm text-ink-2">
            <span>Failed</span>
            <span>{funnel.paymentsFailed ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Per-SKU Revenue */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Revenue by SKU</span>
        </div>
        {perSku.length === 0 ? (
          <p className="text-xs text-ink-3">No sales recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {perSku.map((sku: { name: string; sku: string; revenueInPaise: number; unitsSold: number }) => (
              <div key={sku.sku} className="flex justify-between items-start text-sm">
                <span className="flex-1">
                  {sku.name} <code className="text-xs font-mono text-ink-3 ml-1">{sku.sku}</code>
                </span>
                <span className="text-xs font-mono font-semibold text-ink">
                  {formatINR(sku.revenueInPaise)}  {sku.unitsSold}u
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Money Flow Visualization */}
      <div className="bg-surface/50 p-4 rounded-lg border border-line/20">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-medium uppercase text-ink-3 tracking-wider">Money Flow Visualization</span>
        </div>
        <div>
          {sales.revenueInPaise !== undefined && sales.discountGivenInPaise !== undefined && sales.costOfGoodsInPaise !== undefined && sales.grossProfitInPaise !== undefined ? (
            <div className="h-32 relative">
              <canvas ref={moneyFlowChartRef} className="w-full h-full" />
            </div>
          ) : (
            <p className="text-xs text-ink-3">Insufficient data for money flow visualization.</p>
          )}
        </div>
      </div>
    </div>
  );
}