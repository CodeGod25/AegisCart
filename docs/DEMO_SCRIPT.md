# AegisCart — Demo storyboard (~3 min)

A tight, rehearsed run for the live demo. The console's **Run guided demo** button performs steps 1–5 automatically; this script is what you *say* while it runs, plus the manual fallback.

---

### 0 · Open (15s)
> "AegisCart makes a merchant transactable by an AI buyer end to end — but the point isn't that an agent can pay. It's that every money action is explainable, bounded and gated. Here's the one idea: **money math is deterministic; the LLM only touches language.**"

Show the console. Point at the **policy envelope gauges** (discount cap, margin floor, units, approval threshold) and the **live ledger** (empty).

Click **Run guided demo**. Narrate as each stage lights up in the money-flow strip.

---

### 1 · It sells (25s)
> "Natural language in — 'two keyboards, 10% off'. The agent uses the LLM only to understand the words. The price comes from deterministic policy code, and it hands back a **signed, TTL-bound offer**. Checkout re-verifies that signature and pays it."

Point at the ledger: `OFFER_MINTED` → `PAYMENT_SUCCEEDED`, each with an explainability line. Point at the **seal chip** — that's the HMAC signature.

### 2 · It's bounded (25s)
> "Now I push past what's allowed — 40% off. A naive agent would just say yes. AegisCart returns a **counter-offer**: capped to 15%, max 5 units. Out-of-policy is refused with a reason code, not silently honored."

Point at `422` + `DISCOUNT_CAPPED_TO_POLICY` in the ledger / chat.

### 3 · It's gated (30s)
> "A high-value order — two ultrawides, over the human-approval threshold. The agent does **not** get a payable offer. It's *held* in the approval queue. A human clicks approve, and only then is the signed offer minted and paid."

Point at the **Approval queue** panel appearing, then `APPROVAL_REQUESTED` → `APPROVAL_GRANTED` → `PAYMENT_SUCCEEDED`.

### 4 · It recovers (30s)
> "The bar says 'one failure handled gracefully.' I arm a payment decline. First attempt — 402, declined. But the offer stays valid, and nothing is charged. The retry recovers and settles. Idempotency guarantees no double charge."

Point at `PAYMENT_FAILED` (offer still ACTIVE) → retry → `PAYMENT_SUCCEEDED`.

### 5 · Agent-to-agent (40s)
> "Now the real thing. This runs an **autonomous buyer agent** against the merchant. No LLM in its loop — an autonomous spender has to be predictable. Watch it: it reads the manifest, signs a **spend mandate** with caps, opens *above* policy, adapts to the counter-offer, survives an injected decline… and when it hits a risky order, it **refuses to bypass the human gate** and escalates."

Let the A2A transcript stream (buyer = azure, merchant = gold, human = violet). Point at the outcome stats: purchases, recovered, escalated, mandate remaining.

> "And there's a real **x402** handshake too — an unpaid request gets a 402 with payment requirements, the buyer retries with an X-PAYMENT header, and it settles against the same signed offer."

---

### 6 · Close (20s)
> "Everything you saw is in the ledger — append-only, reason-coded, and the metrics dashboard is reconstructed *from* that ledger so it can't drift. The LLM shaped words; deterministic, tested code moved every rupee. That's a merchant you could actually trust an agent to buy from."

Point at **Revenue & metrics** (revenue, margin, funnel) — all ledger-derived.

---

## If the LLM key isn't set
No problem — say so. `LLM_PROVIDER=mock` runs a deterministic language floor; the demo is identical except the phrasing is templated. This is the point: **the money core doesn't depend on the LLM.**

## If Wi-Fi dies
The console is fully offline (no CDN dependencies) and the payment path is simulated by default. The entire demo runs on localhost.

## One-liner to reset between runs
Click **Reset** (clears ledger + disarms failures), or `DELETE /ledger/events` + `POST /simulate/reset`.
