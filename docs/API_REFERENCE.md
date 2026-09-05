# API Reference

AegisCart provides a RESTful API for agentic commerce. All endpoints are relative to the base URL.

## Conventions
- **Content-Type**: `application/json` for request and response bodies unless otherwise specified.
- **Errors**: Return JSON with `{ error: string, reasonCode?: string, retriable?: boolean }`.
- **Idempotency**: Endpoints marked as idempotent support the `Idempotency-Key` header.
- **Authentication**: No authentication is required in the demo/test mode. In production, authenticate via API keys or tokens (to be implemented).

## Agent Manifest
Discover the agent's capabilities and guarantees.

### Get Agent Manifest
```http
GET /.well-known/agent
```
Returns a JSON object describing the agent's capabilities, supported reason codes, guarantees, and protocol interop details.

## Catalog
Endpoints for browsing the merchant's product catalog.

### Get All Items
```http
GET /catalog/items
```
Returns an array of product objects.

#### Response
```json
[
  {
    "id": "sku-001",
    "name": "Example Product",
    "description": "A sample product",
    "price": 1000,
    "currency": "INR",
    "stock": 50,
    "category": "example"
  }
]
```

### Get Capabilities Card
```http
GET /catalog/capabilities
```
Returns a summary of the merchant's policy envelope (discount cap, margin floor, etc.).

## Negotiation
Negotiate prices and quantities with the merchant's agent.

### Request a Quote
```http
POST /negotiate/quote
```
**Request Body**
```json
{
  "items": [
    { "sku": "sku-001", "quantity": 2 }
  ],
  "buyerId": "buyer-123" // optional
}
```
**Response**: Either a signed offer or a pending approval requiring human intervention.

#### Success (Offer Ready)
```json
{
  "offerId": "offer-abc",
  "amount": 1500,
  "currency": "INR",
  "items": [
    { "sku": "sku-001", "quantity": 2, "unitPrice": 750 }
  ],
  "expiresAt": "2026-09-03T12:00:00Z",
  "signedOffer": "signed_string_here"
}
```
#### Pending Approval
```json
{
  "approvalId": "appr-xyz",
  "message": "Human approval required for this quote",
  "requiredApprover": "merchant-owner"
}
```

### Get Offer
```http
GET /offers/:offerId
```
Retrieve details of a signed offer.

## Mandates
Create, inspect, and revoke spend mandates (AP2-style bounded authorization).

### Create Mandate
```http
POST /mandates
```
**Request Body**
```json
{
  "buyerId": "buyer-123",
  "totalCap": 10000,
  "perOrderCap": 2000,
  "allowedCategories": ["electronics", "books"],
  "expiresAt": "2026-12-31T23:59:59Z",
  "resetSpentOnRenewal": true,
  "recurrenceType": "monthly",
  "recurrenceInterval": 1,
  "maxRenewals": 12
}
```
**Response**
```json
{
  "mandateId": "mandate-123",
  "buyerId": "buyer-123",
  "totalCap": 10000,
  "perOrderCap": 2000,
  "allowedCategories": ["electronics", "books"],
  "expiresAt": "2026-12-31T23:59:59Z",
  "spent": 0,
  "renewalCount": 0,
  "signedMandate": "signed_string_here"
}
```

### Get Mandate
```http
GET /mandates/:id
```
Retrieve mandate details.

### Revoke Mandate
```http
POST /mandates/:id/revoke
```
Immediately invalidate the mandate.

## Checkout
Pay for a signed offer or perform an x402 handshake.

### Pay Offer
```http
POST /checkout/pay
```
**Headers**: `Idempotency-Key: <unique-key>` (recommended)
**Request Body**
```json
{
  "offerId": "offer-abc",
  "signedOffer": "signed_string_here",
  "mandateId": "mandate-123" // optional
}
```
**Response**
```json
{
  "paymentId": "pay-789",
  "amount": 1500,
  "currency": "INR",
  "status": "success",
  "receipt": { /* Razorpay payment object */ }
}
```

### x402 Handshake
```http
POST /x402/checkout
```
**Request Body**
```json
{
  "resource": "/checkout/pay",
  "amount": 1500,
  "currency": "INR"
}
```
**Response (402 Payment Required)**
```http
HTTP/1.1 402 Payment Required
X-PAYMENT: challenge-string
```
Client must respond with:
```http
POST /x402/checkout
Headers: X-PAYMENT-RESPONSE: response-string
```
See the [x402 specification](https://x402.org) for details.

## Revenue Tools
Endpoints for pricing optimization and bundling.

### Get Best Offer
```http
GET /revenue/best-offer?sku=sku-001&maxQuantity=10
```
Returns the deepest discount that stays within policy bounds.

### Get Recommendations
```http
GET /revenue/recommendations?sku=sku-001&limit=5
```
Returns suggested complementary products.

### Create Bundle
```http
POST /revenue/bundle
```
**Request Body**
```json
{
  "items": [
    { "sku": "sku-001", "quantity": 2 },
    { "sku": "sku-002", "quantity": 1 }
  ]
}
```
**Response**: Bundle price that respects margin floors.

## Metrics
Get business metrics reconstructed from the ledger.

```http
GET /metrics
```
**Response**
```json
{
  "revenue": 150000,
  "grossMargin": 45000,
  "discountGiven": 20000,
  "aov": 1500,
  "orderCount": 100
}
```

## Approvals
Manage the human approval queue.

### List Pending Approvals
```http
GET /approvals
```
**Response**
```json
[
  {
    "approvalId": "appr-xyz",
    "offerId": "offer-abc",
    "amount": 5000,
    "reason": "High-value order requires approval",
    "createdAt": "2026-09-03T10:00:00Z"
  }
]
```

### Approve
```http
POST /approvals/:id/approve
```
Converts the pending approval into a payable offer.

### Reject
```http
POST /approvals/:id/reject
```
Cancels the approval request.

## Ledger
Access the immutable audit trail.

### Get Events
```http
GET /ledger/events?limit=100&offset=0
```
**Response**
```json
{
  "events": [
    {
      "id": "evt-001",
      "timestamp": "2026-09-03T10:00:00Z",
      "actor": "agent-service",
      "action": "offer-created",
      "reasonCode": "OFFER_CREATED",
      "amount": 1500,
      "metadata": { /* context */ }
    }
  ],
  "pagination": { "limit": 100, "offset": 0, "total": 250 }
}
```

### Stream Events (SSE)
```http
GET /ledger/stream
```
Server-Sent Events stream of ledger entries.

## Simulation
Inject failures for testing (development only).

### Simulate Failure
```http
POST /simulate/failure
```
**Request Body**
```json
{
  "failureMode": "PAYMENT_DECLINED",
  "durationMs": 5000
}
```

## Health
Check service liveness.

```http
GET /health
```
**Response**: `{ status: "ok" }`
