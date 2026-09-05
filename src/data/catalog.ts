import { CatalogItem, MerchantPolicy } from "../types/domain";

export const catalog: CatalogItem[] = [
  {
    sku: "KB-75-MECH",
    name: "Aether Mechanical Keyboard",
    description: "Hot-swappable 75% keyboard with tactile switches",
    category: "peripherals",
    priceInPaise: 899900,
    costInPaise: 560000,
    currency: "INR",
    stock: 23,
    upsellSku: "WR-4K-ULTRA",
    crossSellSkus: ["MS-ERG-PLUS", "WR-4K-ULTRA"],
  },
  {
    sku: "WR-4K-ULTRA",
    name: "Nova 4K Ultrawide Monitor",
    description: "34-inch curved ultrawide for dev and design workflows",
    category: "displays",
    priceInPaise: 3299900,
    costInPaise: 2440000,
    currency: "INR",
    stock: 12,
    crossSellSkus: ["KB-75-MECH", "MS-ERG-PLUS"],
  },
  {
    sku: "MS-ERG-PLUS",
    name: "Ergo Precision Mouse",
    description: "Programmable ergonomic mouse with low-latency sensor",
    category: "peripherals",
    priceInPaise: 299900,
    costInPaise: 170000,
    currency: "INR",
    stock: 41,
    upsellSku: "KB-75-MECH",
    crossSellSkus: ["KB-75-MECH", "WR-4K-ULTRA"],
  },
];

export const merchantPolicy: MerchantPolicy = {
  maxDiscountPct: 15,
  minMarginPct: 20,
  maxUnitsPerOrder: 5,
  blockedSkus: [],
  approvalRiskThreshold: 6,
  highValueApprovalPaise: 5000000, // ₹50,000 — orders at/above this need a human
};
