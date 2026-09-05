// Payment provider abstraction interface
export interface PaymentProvider {
  /** Unique identifier for the payment provider */
  id: string;

  /** Display name for the payment provider */
  name: string;

  /** Initialize the payment provider with configuration */
  initialize(config: Record<string, any>): Promise<void>;

  /** Create a payment order */
  createOrder(input: {
    amountInPaise: number;
    currency: string;
    receipt: string;
    metadata?: Record<string, any>;
  }): Promise<{ orderId: string; providerOrderId?: string }>;

  /** Attempt payment for an order */
  attemptPayment(input: {
    orderId: string;
    providerOrderId?: string;
    sessionId: string;
  }): Promise<{
    success: boolean;
    paymentId?: string;
    providerPaymentId?: string;
    message: string;
    failureCode?: string;
  }>;

  /** Verify payment signature/webhook */
  verifyPayment(input: {
    orderId: string;
    paymentId: string;
    signature: string;
    sessionId?: string;
  }): Promise<{ valid: boolean; reason: string }>;

  /** Handle webhook from the payment provider */
  handleWebhook(input: {
    rawBody: Buffer;
    headers: Record<string, string>;
  }): Promise<{
    eventType: string;
    eventId?: string;
    payload: Record<string, any>;
    signatureValid: boolean;
  }>;

  /** Refund a payment */
  refundPayment(input: {
    paymentId: string;
    amountInPaise?: number;
    reason?: string;
  }): Promise<{
    success: boolean;
    refundId?: string;
    message: string;
  }>;

  /** Check if the provider is properly configured */
  isConfigured(): boolean;
}

// Payment provider registry to manage multiple providers
export class PaymentProviderRegistry {
  private providers: Map<string, PaymentProvider> = new Map();

  registerProvider(provider: PaymentProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): PaymentProvider | undefined {
    return this.providers.get(id);
  }

  getConfiguredProviders(): PaymentProvider[] {
    return Array.from(this.providers.values())
      .filter(provider => provider.isConfigured());
  }

  getProviderById(id: string): PaymentProvider | undefined {
    return this.providers.get(id);
  }
}

// Global registry instance
export const paymentProviderRegistry = new PaymentProviderRegistry();