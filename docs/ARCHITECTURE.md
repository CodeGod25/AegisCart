# AegisCart — Architecture

## System context

```mermaid
flowchart LR
    subgraph Buyers
      H["Human buyer<br/>(chat)"]
      AI["Autonomous AI buyer<br/>(/buyer/run)"]
    end

    subgraph AegisCart["AegisCart gateway"]
      AG["Agent<br/>(LLM: language only)"]
      POL["Policy engine<br/>(deterministic bounds)"]
      OFF["Offer service<br/>(HMAC signed, TTL)"]
      MAN["Mandate service<br/>(AP2-style envelope)"]
      APR["Approval gate<br/>(human-in-the-loop)"]
      CO["Checkout<br/>(idempotent)"]
      LED[("Append-only ledger")]
    end

    RZP["Razorpay<br/>test mode / simulated"]

    H -->|natural language| AG
    AI -->|manifest + signed offer| POL
    AG --> POL
    POL -->|in policy| OFF
    POL -->|risky / high value| APR
    APR -->|human approves| OFF
    OFF --> CO
    MAN -. envelope check .-> CO
    CO --> RZP
    AG -. words only .- POL
    POL --> LED
    OFF --> LED
    APR --> LED
    CO --> LED
```

## The deterministic / LLM boundary (the "AI judgment" story)

```mermaid
flowchart TB
    subgraph LLM["LLM — language ONLY"]
      I["parse intent from free text"]
      R["phrase a reply from an<br/>already-computed number"]
    end
    subgraph DET["Deterministic code — everything that touches money"]
      P["discount cap · margin floor · qty · stock"]
      S["HMAC sign / verify offers + mandates"]
      D["mandate debit after payment"]
      K["idempotency (no double charge)"]
      M["metrics reconstructed from ledger"]
    end
    I --> P
    P --> R
    classDef llm fill:#1e304a,stroke:#58a6ff,color:#eaf1fa;
    classDef det fill:#172538,stroke:#e8b24a,color:#eaf1fa;
    class I,R llm;
    class P,S,D,K,M det;
```

The LLM can be creative with words; it can never invent a price. Remove the LLM entirely and the money core still runs (deterministic template fallback).

## Negotiate → gate → offer → pay → ledger

```mermaid
sequenceDiagram
    participant B as Buyer
    participant N as Negotiation + Policy
    participant A as Approval gate
    participant O as Offer (signed)
    participant C as Checkout
    participant L as Ledger

    B->>N: quote(sku, qty, discount, mandate?)
    N->>N: enforce cap / margin / qty / stock / risk
    alt in policy
        N->>O: mint signed, TTL-bound offer
        O-->>L: OFFER_MINTED
        N-->>B: 200 signed offer
    else out of policy
        N-->>B: 422 + counter-offer
    else risky / high value
        N->>A: hold for human
        A-->>L: APPROVAL_REQUESTED
        N-->>B: 202 pending (no payable offer yet)
        B->>A: human approve
        A->>O: mint offer
        A-->>L: APPROVAL_GRANTED
    end
    B->>C: pay(offerId) [Idempotency-Key]
    C->>O: re-verify signature + expiry
    C->>C: mandate envelope re-check
    C->>C: payment (test mode / simulated)
    alt success
        C->>O: consume + debit mandate
        C-->>L: PAYMENT_SUCCEEDED
        C-->>B: 200 paid
    else decline (injected failure)
        C-->>L: PAYMENT_FAILED (offer stays ACTIVE)
        C-->>B: 402 retriable → retry recovers
    end
```

## x402 handshake

```mermaid
sequenceDiagram
    participant B as AI buyer
    participant X as POST /x402/checkout
    participant C as Money core
    B->>X: POST { offerId }  (no payment)
    X-->>B: 402 + accepts[] (signed offer requirement)
    B->>X: POST + X-PAYMENT header (base64 proof)
    X->>C: runCheckout(offerId)  (same core as /checkout/pay)
    C-->>X: settled
    X-->>B: 200 + X-PAYMENT-RESPONSE (settlement)
```
