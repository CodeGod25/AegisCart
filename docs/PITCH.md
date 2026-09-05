# AegisCart — Pitch (one page)

## Problem
Agent-to-agent commerce is the open problem of the year — NPCI's UAP and the ACP / AP2 / x402 protocol race are all racing to let AI agents *buy* on our behalf, and Razorpay's in-app pilots are already live. But handing a merchant's checkout to an autonomous agent is terrifying for one reason: **you're letting software spend money.** The unsolved part isn't "can an agent pay" — it's "can the merchant *trust* what the agent did, prove it, and stay in control when something goes wrong."

## What we built
**AegisCart** — a policy-first gateway that makes a merchant transactable by an AI buyer end to end on Razorpay test mode, where **every money action is explainable, bounded and gated**, streamed to a live audit ledger, with failure recovery built in.

## The insight that makes it trustworthy
**Money math is deterministic; the LLM only touches language.**
Every number that touches money — discount caps, the margin floor, offer and mandate signatures, mandate debits, idempotency — is plain, tested code. The LLM only parses intent and phrases replies; it rephrases a sentence *after* the price is already computed, so it can never invent a price. Pull the LLM out entirely and the money core still runs. That boundary *is* the trust model.

## What a judge can see in 90 seconds
1. **Sells** — a natural-language quote returns a signed, policy-bounded offer; checkout pays it. Revenue tooling computes the deepest *policy-safe* discount.
2. **Bounded** — push past the discount cap and you get a **counter-offer**, never a silent yes.
3. **Gated** — a high-value order is **held for a human**; no payable offer exists until approval.
4. **Recovers** — an injected payment decline leaves the offer valid; the retry succeeds. Nothing double-charges.
5. **Explains** — every step lands in an append-only ledger with a reason code, live over SSE.
6. **Agent-to-agent** — one click runs an autonomous buyer that signs a spend mandate, adapts to the counter-offer, survives the decline, and then **refuses to bypass the human gate**. Plus a real **x402** 402→settlement handshake.

## Why it maps to the judging bar
- **Problem taste** — we solved *trust and control*, the actually-hard part of agentic commerce, not just "an agent that can pay."
- **Build quality** — typed, layered, `node:test` suite, runs with one command; simulated payment path means it always demos.
- **AI judgment** — the LLM is used for language and *deliberately kept out* of the money core and the buyer loop (an autonomous spender must be predictable).
- **Failure recovery** — a taxonomy of failure modes each with a reason code + fallback; decline→retry recovery shown live.

## Interop / why now
Implements the primitives shared across **ACP, AP2, x402 and NPCI UAP** — signed price binding, signed spend mandate, delegated checkout, per-action reason codes — so the merchant is portable across the protocol race rather than locked to one. x402 is implemented for real.
