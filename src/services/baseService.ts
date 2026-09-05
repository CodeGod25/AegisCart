import { getDb } from "../db/client";
import { Actor, MoneyActionType } from "../types/domain";
import { ledgerService } from "./ledgerService";

/**
 * Base service class providing common functionality for all services.
 * Reduces boilerplate and ensures consistent patterns across services.
 */
export class BaseService {
  protected db: Promise<SqliteDb> | null = null;

  /**
   * Get database connection with lazy initialization
   */
  protected async getDatabase(): Promise<SqliteDb> {
    if (!this.db) {
      this.db = getDb();
    }
    return this.db;
  }

  /**
   * Add an event to the ledger with standardized format
   */
  protected async ledgerAdd(
    actor: string,
    actionType: string,
    explainability: string,
    payload: Record<string, unknown> = {}
  ) {
    return ledgerService.add({
      actor: actor as Actor,
      actionType: actionType as MoneyActionType,
      explainability,
      payload,
    });
  }
}

// Import types that are needed but avoid circular dependencies
type SqliteDb = any; // Will be properly typed when used in concrete services