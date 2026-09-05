import { PaymentFailureCode } from "./failureTaxonomy";
import { BaseService } from "./baseService";

// Controlled failure injection for the demo. Lets the operator arm exactly one
// failure on the next payment attempt, or simulate an LLM outage, so recovery
// paths can be shown deterministically on stage.
class SimulationService extends BaseService {
  private failNextPayment: PaymentFailureCode | "NONE" = "NONE";
  private llmUnavailable = false;

  setFailNextPayment(kind: PaymentFailureCode): void {
    this.failNextPayment = kind;
  }

  // Read-and-clear: a forced failure fires once, so the natural retry succeeds.
  consumePaymentFailure(): PaymentFailureCode | "NONE" {
    const current = this.failNextPayment;
    this.failNextPayment = "NONE";
    return current;
  }

  setLlmUnavailable(value: boolean): void {
    this.llmUnavailable = value;
  }

  isLlmUnavailable(): boolean {
    return this.llmUnavailable;
  }

  reset(): void {
    this.failNextPayment = "NONE";
    this.llmUnavailable = false;
  }

  getState(): { failNextPayment: PaymentFailureCode | "NONE"; llmUnavailable: boolean } {
    return { failNextPayment: this.failNextPayment, llmUnavailable: this.llmUnavailable };
  }
}

export const simulationService = new SimulationService();
