import { catalog, merchantPolicy } from "../data/catalog";

/**
 * Simple in-memory cache service for frequently accessed data.
 * In a production environment, this could be replaced with Redis or another distributed cache.
 */
class CacheService {
  private catalogCache: { items: CatalogItem[]; timestamp: number } | null = null;
  private policyCache: { policy: MerchantPolicy; timestamp: number } | null = null;
  private queryCache: Map<string, { data: any; timestamp: number }> = new Map();

  // Performance monitoring metrics
  private hits = { catalog: 0, policy: 0, query: 0 };
  private misses = { catalog: 0, policy: 0, query: 0 };

  // Cache TTL in milliseconds
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for most data
  private static readonly QUERY_CACHE_TTL_MS = 30 * 1000; // 30 seconds for database queries

  /**
   * Get catalog items from cache or fetch if expired
   */
  getCatalog(): CatalogItem[] {
    const now = Date.now();
    if (
      this.catalogCache &&
      now - this.catalogCache.timestamp < CacheService.CACHE_TTL_MS
    ) {
      this.hits.catalog++;
      return this.catalogCache.items;
    }

    this.misses.catalog++;
    // Cache miss or expired - refresh cache
    this.catalogCache = {
      items: catalog,
      timestamp: now
    };
    return catalog;
  }

  /**
   * Get merchant policy from cache or fetch if expired
   */
  getPolicy(): MerchantPolicy {
    const now = Date.now();
    if (
      this.policyCache &&
      now - this.policyCache.timestamp < CacheService.CACHE_TTL_MS
    ) {
      this.hits.policy++;
      return this.policyCache.policy;
    }

    this.misses.policy++;
    // Cache miss or expired - refresh cache
    this.policyCache = {
      policy: merchantPolicy,
      timestamp: now
    };
    return merchantPolicy;
  }

  /**
   * Cache a database query result with a specific key
   * @param cacheKey Unique key for the query
   * @param queryFn Function that executes the query and returns data
   * @param ttlMs Optional TTL override (defaults to QUERY_CACHE_TTL_MS)
   */
  async cacheQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttlMs: number = CacheService.QUERY_CACHE_TTL_MS
  ): Promise<T> {
    const now = Date.now();

    // Check if we have a valid cached entry
    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)!;
      if (now - cached.timestamp < ttlMs) {
        this.hits.query++;
        return cached.data;
      }
      // Remove expired entry
      this.queryCache.delete(cacheKey);
    }

    this.misses.query++;
    // Execute query and cache result
    const result = await queryFn();
    this.queryCache.set(cacheKey, {
      data: result,
      timestamp: now
    });

    // Limit cache size to prevent memory leaks
    if (this.queryCache.size > 100) {
      // Remove oldest entries
      const oldestKeys = Array.from(this.queryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.floor(this.queryCache.size * 0.2)) // Remove oldest 20%
        .map(([key]) => key);

      for (const key of oldestKeys) {
        this.queryCache.delete(key);
      }
    }

    return result;
  }

  /**
   * Clear all caches
   */
  clear() {
    this.catalogCache = null;
    this.policyCache = null;
    this.queryCache.clear();
  }

  clearQueryCache(prefix?: string): void {
    for (const key of this.queryCache.keys()) {
      if (!prefix || key.startsWith(prefix)) this.queryCache.delete(key);
    }
  }

  /**
   * Get cache performance statistics
   */
  getStats() {
    const totalCatalog = this.hits.catalog + this.misses.catalog;
    const totalPolicy = this.hits.policy + this.misses.policy;
    const totalQuery = this.hits.query + this.misses.query;

    return {
      catalog: {
        hits: this.hits.catalog,
        misses: this.misses.catalog,
        hitRate: totalCatalog > 0 ? (this.hits.catalog / totalCatalog) * 100 : 0
      },
      policy: {
        hits: this.hits.policy,
        misses: this.misses.policy,
        hitRate: totalPolicy > 0 ? (this.hits.policy / totalPolicy) * 100 : 0
      },
      query: {
        hits: this.hits.query,
        misses: this.misses.query,
        hitRate: totalQuery > 0 ? (this.hits.query / totalQuery) * 100 : 0
      }
    };
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Import types to avoid circular dependencies
interface CatalogItem {
  sku: string;
  name: string;
  description: string;
  category: string;
  priceInPaise: number;
  costInPaise: number;
  currency: "INR";
  stock: number;
  upsellSku?: string;
  crossSellSkus?: string[];
}

interface MerchantPolicy {
  maxDiscountPct: number;
  minMarginPct: number;
  maxUnitsPerOrder: number;
  blockedSkus: string[];
  approvalRiskThreshold: number;
  highValueApprovalPaise: number;
}