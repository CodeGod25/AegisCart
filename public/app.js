// EDIT_TEST
/* =====================================================================
   AegisCart Control Console — client logic.
   Dependency-free on purpose: the live demo must work even with no network
   to a CDN. All animation is CSS; all data comes from the local API.
   ===================================================================== */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------------ utils
  function esc(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // Indian-format rupees from paise (deterministic, matches the server's formatter).
  function inr(paise) {
    const n = Number(paise);
    const safe = Number.isFinite(n) ? n : 0;
    const [ip, dp] = (Math.abs(safe) / 100).toFixed(2).split(".");
    const whole = ip || "0";
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
    return (safe < 0 ? "-₹" : "₹") + grouped + "." + (dp || "00");
  }

  function shortId(s, n) {
    const str = String(s == null ? "" : s);
    const len = n || 10;
    return str.length > len ? str.slice(0, len) + "…" : str;
  }

  function clockOf(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function safeParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    const text = await res.text();
    let body = {};
    if (text) body = safeParse(text, { raw: text });
    return { status: res.status, ok: res.ok, body };
  }
  const getJson = async (p) => (await api(p)).body;
  const post = (p, obj) =>
    api(p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj || {}),
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 40) : ms));

  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      t.classList.remove("show");
    }, 3800);
  }

  // ------------------------------------------------------ reason-code styling
  const RC_OK = new Set(["OFFER_VALID", "PAYMENT_SUCCEEDED", "MANDATE_VALID", "APPROVAL_GRANTED"]);
  const RC_WARN = new Set([
    "REQUIRES_HUMAN_APPROVAL", "HIGH_VALUE_ORDER", "DISCOUNT_CAPPED_TO_POLICY",
    "ESCALATED", "LLM_UNAVAILABLE", "LLM_UNAVAILABLE_SIMULATED", "UNEXPECTED",
  ]);
  const RC_BAD = new Set([
    "PAYMENT_DECLINED", "PAYMENT_FAILED", "OFFER_REJECTED", "MANDATE_REJECTED",
    "MANDATE_REVOKED", "MANDATE_EXHAUSTED", "MANDATE_EXPIRED", "OFFER_EXPIRED",
    "OFFER_SIGNATURE_INVALID", "OFFER_AMOUNT_MISMATCH", "INSUFFICIENT_STOCK",
    "WEBHOOK_SIGNATURE_INVALID", "MANDATE_SIGNATURE_INVALID", "APPROVAL_REJECTED",
    "GATEWAY_TIMEOUT", "MARGIN_BELOW_POLICY_FLOOR", "POLICY_REJECTED",
    "MANDATE_PER_ORDER_EXCEEDED", "MANDATE_BUDGET_EXCEEDED", "MANDATE_CATEGORY_NOT_ALLOWED",
    "SKU_BLOCKED_BY_POLICY", "QUANTITY_EXCEEDS_LIMIT", "INVALID_QUANTITY", "SKU_NOT_FOUND",
  ]);
  function rcClass(code) {
    if (!code) return "";
    if (RC_OK.has(code)) return "ok";
    if (RC_WARN.has(code)) return "warn";
    if (RC_BAD.has(code)) return "bad";
    return "";
  }
  const chip = (code) =>
    code ? `<span class="rc ${rcClass(code)}">${esc(code)}</span>` : "";

  // Money flow history for chart (last 20 points)
  let moneyFlowHistory = [];

  const ATYPE_OK = new Set([
    "OFFER_MINTED", "PAYMENT_SUCCEEDED", "MANDATE_CREATED", "APPROVAL_GRANTED",
    "MANDATE_DEBITED", "PAYMENT_VERIFIED", "OFFER_CONSUMED",
  ]);
  const ATYPE_WARN = new Set(["APPROVAL_REQUESTED", "UPSELL_SUGGESTED", "ESCALATED", "FAILURE_INJECTED"]);
  const ATYPE_BAD = new Set(["PAYMENT_FAILED", "OFFER_REJECTED", "MANDATE_REJECTED", "APPROVAL_REJECTED"]);
  function atypeColor(t) {
    if (ATYPE_OK.has(t)) return "var(--ok)";
    if (ATYPE_WARN.has(t)) return "var(--warn)";
    if (ATYPE_BAD.has(t)) return "var(--bad)";
    return "var(--paper)";
  }

  // ============================================================ MONEY FLOW
  const FLOW_STAGES = [
    { id: "negotiate", cap: "Negotiate", node: "N", types: ["NEGOTIATION_EVALUATED"] },
    {
      id: "gate", cap: "Gate", node: "G",
      types: ["APPROVAL_REQUESTED", "APPROVAL_GRANTED", "APPROVAL_REJECTED", "ESCALATED"],
    },
    {
      id: "offer", cap: "Sign offer", node: "O",
      types: ["OFFER_MINTED", "OFFER_CONSUMED", "OFFER_REJECTED"],
    },
    {
      id: "pay", cap: "Pay", node: "P",
      types: ["PAYMENT_ATTEMPTED", "PAYMENT_RETRIED", "PAYMENT_FAILED", "PAYMENT_SUCCEEDED"],
    },
    {
      id: "settle", cap: "Settle", node: "S",
      types: ["MANDATE_CREATED", "MANDATE_DEBITED", "PAYMENT_VERIFIED"],
    },
    { id: "ledger", cap: "Ledger", node: "L", types: ["*"] },
  ];
  function buildFlow() {
    const host = $("flow");
    host.innerHTML = FLOW_STAGES.map(
      (s) =>
        `<div class="stage" data-stage="${s.id}">
           <div class="node">${s.node}</div>
           <div class="cap">${s.cap}</div>
         </div>`
    ).join("");
  }
  function lightFlow(actionType) {
    if (!actionType) return;
    FLOW_STAGES.forEach((s) => {
      if (s.types.indexOf("*") !== -1 || s.types.indexOf(actionType) !== -1) {
        const el = document.querySelector(`.stage[data-stage="${s.id}"]`);
        if (!el) return;
        el.classList.add("on");
        el.classList.remove("pulse");
        // force reflow so the pulse animation can retrigger
        void el.offsetWidth;
        el.classList.add("pulse");
      }
    });
  }
  function resetFlow() {
    document.querySelectorAll(".stage").forEach((el) => el.classList.remove("on", "pulse"));
  }

  // ============================================================ LEDGER
  let ledgerEvents = []; // newest-first
  const ledgerIds = new Set();

  function reasonChipsFor(ev) {
    const p = ev && ev.payload && typeof ev.payload === "object" ? ev.payload : {};
    const codes = [];
    const cand = [p.reason, p.failureCode, p.reasonCode, p.code, p.error];
    cand.forEach((c) => {
      if (typeof c === "string" && c && codes.indexOf(c) === -1) codes.push(c);
    });
    return codes.map(chip).join("");
  }

  function sealFor(ev) {
    const t = ev.actionType;
    const p = ev.payload && typeof ev.payload === "object" ? ev.payload : {};
    if ((t === "OFFER_MINTED" || t === "OFFER_CONSUMED") && p.offerId) {
      return `<span class="seal">offer ${esc(shortId(p.offerId, 14))}</span>`;
    }
    if (t === "MANDATE_CREATED" && p.mandateId) {
      return `<span class="seal buyer-seal">mandate ${esc(shortId(p.mandateId, 14))}</span>`;
    }
    if (t === "MANDATE_DEBITED" && typeof p.amountInPaise === "number") {
      return `<span class="seal buyer-seal">debit ${esc(inr(p.amountInPaise))}</span>`;
    }
    return "";
  }

  function eventHtml(ev) {
    const actor = String(ev.actor || "system");
    const chips = reasonChipsFor(ev);
    const seal = sealFor(ev);
    const foot = chips || seal ? `<div class="foot">${chips}${seal}</div>` : "";
    
    let extraClass = "";
    if (ATYPE_BAD.has(ev.actionType) || (ev.payload && String(ev.payload.reasonCode || "").includes("REJECTED"))) {
      extraClass = "event-blocked";
    } else if (ev.actionType === "APPROVAL_REQUESTED") {
      extraClass = "event-approval";
    } else if (ev.actionType === "PAYMENT_SUCCEEDED" || ev.actionType === "MANDATE_CREATED" || ev.actionType === "OFFER_CONSUMED") {
      extraClass = "event-settled";
    }

    return `<div class="event actor-${esc(actor)} ${extraClass}">
        <div class="rail"><span class="dot"></span><span class="line"></span></div>
        <div>
          <div class="head">
            <span class="atype" style="color:${atypeColor(ev.actionType)}">${esc(ev.actionType)}</span>
            <span class="actor">${esc(actor)}</span>
            <span class="ts">${esc(clockOf(ev.timestamp))}</span>
          </div>
          <p class="explain">${esc(ev.explainability)}</p>
          ${foot}
        </div>
      </div>`;
  }

  function renderLedger() {
    const host = $("ledger");
    if (!ledgerEvents.length) {
      host.innerHTML = `<div class="empty" style="margin:24px auto"><div class="big">No money actions yet.</div>Run the guided demo or the buyer agent to populate the audit trail. Every approved offer and payment will appear here as an immutable record.</div>`;
    } else {
      host.innerHTML = ledgerEvents.map(eventHtml).join("");
    }
    $("ledger-count").textContent =
      ledgerEvents.length + (ledgerEvents.length === 1 ? " event" : " events");
  }

  function setLedger(arr) {
    ledgerEvents = Array.isArray(arr) ? arr.slice().reverse() : [];
    ledgerIds.clear();
    ledgerEvents.forEach((e) => e && e.id && ledgerIds.add(e.id));
    renderLedger();
    // Reconstruct which flow stages have fired (oldest -> newest for correct order).
    resetFlow();
    ledgerEvents
      .slice()
      .reverse()
      .forEach((e) => e && lightFlow(e.actionType));
  }

  function addLedgerEvent(ev, animate) {
    if (!ev || (ev.id && ledgerIds.has(ev.id))) return;
    if (ev.id) ledgerIds.add(ev.id);
    ledgerEvents.unshift(ev);
    if (ledgerEvents.length > 400) {
      const dropped = ledgerEvents.pop();
      if (dropped && dropped.id) ledgerIds.delete(dropped.id);
    }
    const host = $("ledger");
    const emptyEl = host.querySelector(".empty");
    if (emptyEl) host.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.innerHTML = eventHtml(ev);
    const node = wrap.firstElementChild;
    host.insertBefore(node, host.firstChild);
    if (animate && !reduceMotion) {
      node.style.opacity = "0";
      node.style.transform = "translateY(-6px)";
      requestAnimationFrame(() => {
        node.style.transition = "opacity .35s ease, transform .35s ease";
        node.style.opacity = "1";
        node.style.transform = "translateY(0)";
      });
    }
    $("ledger-count").textContent =
      ledgerEvents.length + (ledgerEvents.length === 1 ? " event" : " events");
    lightFlow(ev.actionType);
  }

  // ============================================================ LIVE STREAM
  let pollTimer = null;
  function setStreamStatus(live) {
    const el = $("stream-status");
    el.className = "status-chip " + (live ? "live" : "offline");
    el.querySelector(".txt").textContent = live ? "live" : "reconnecting…";
  }
  function startPolling() {
    if (pollTimer) return;
    setStreamStatus(false);
    const tick = async () => {
      try {
        const data = await getJson("/ledger/events");
        if (data && Array.isArray(data.events)) setLedger(data.events);
      } catch {
        /* keep trying */
      }
    };
    tick();
    pollTimer = setInterval(tick, 2500);
  }
  function connectStream() {
    if (typeof window.EventSource === "undefined") {
      startPolling();
      return;
    }
    let es;
    try {
      es = new EventSource("/ledger/stream");
    } catch {
      startPolling();
      return;
    }
    es.addEventListener("snapshot", (e) => {
      setStreamStatus(true);
      setLedger(safeParse(e.data, []));
      scheduleDashboards();
    });
    es.addEventListener("append", (e) => {
      const ev = safeParse(e.data, null);
      if (ev) addLedgerEvent(ev, true);
      scheduleDashboards();
    });
    es.onopen = () => setStreamStatus(true);
    es.onerror = () => {
      setStreamStatus(false);
      // Non-recoverable close -> fall back to polling so the demo never goes dark.
      if (es.readyState === 2) startPolling();
    };
  }

  // ============================================================ DASHBOARDS
  let dashTimer = null;
  function scheduleDashboards() {
    clearTimeout(dashTimer);
    dashTimer = setTimeout(() => {
      loadMetrics();
      loadApprovals();
    }, 350);
  }

  async function loadMetrics() {
    let m;
    try {
      m = await getJson("/metrics");
    } catch {
      return;
    }
    if (!m || !m.sales) {
      $("metrics").innerHTML = `<div class="hint">No sales recorded yet. Run the guided demo or the buyer agent to see metrics.</div>`;
      $("funnel").innerHTML = `<div class="hint">No sales data available.</div>`;
      $("persku").innerHTML = `<div class="hint">No sales recorded yet.</div>`;
      // Update money flow visualization with empty state
      updateMoneyFlowChart(null);
      return;
    }
    const s = m.sales;
    const f = m.funnel || {};

    // Calculate trend indicators
    const getTrendIndicator = (current, history) => {
      if (history.length < 2) return '';
      const previous = history[history.length - 2];
      const currentValue = current || 0;
      const previousValue = previous || 0;
      if (previousValue === 0) return '';
      const change = ((currentValue - previousValue) / previousValue) * 100;
      const trendClass = change > 0 ? 'trend-up' : change < 0 ? 'trend-down' : 'trend-neutral';
      const trendIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      return `<span class="trend ${trendClass}">${trendIcon} ${Math.abs(change).toFixed(1)}%</span>`;
    };

    const cards = [
      { k: "Revenue", v: inr(s.revenueInPaise), t: getTrendIndicator(s.revenueInPaise / 100, metricsHistory.map(h => h.revenue)) },
      { k: "Gross margin", v: (s.blendedMarginPct ?? 0) + "<small>%</small>", t: getTrendIndicator(s.blendedMarginPct ?? 0, metricsHistory.map(h => h.margin)) },
      { k: "Sales", v: String(s.count ?? 0), t: getTrendIndicator(s.count ?? 0, metricsHistory.map(h => h.count || 0)) },
      { k: "Avg order", v: inr(s.averageOrderValueInPaise), t: getTrendIndicator(s.averageOrderValueInPaise / 100, metricsHistory.map(h => h.avgOrder)) },
      { k: "Discount given", v: inr(s.discountGivenInPaise), t: getTrendIndicator(s.discountGivenInPaise / 100, metricsHistory.map(h => h.discountGiven)) },
      { k: "Eff. discount", v: (s.effectiveDiscountRatePct ?? 0) + "<small>%</small>", t: getTrendIndicator(s.effectiveDiscountRatePct ?? 0, metricsHistory.map(h => h.effectiveDiscount)) },
    ];
    $("metrics").innerHTML = cards
      .map((c) => `<div class="metric"><div class="k">${c.k}</div><div class="v">${c.v}</div>${c.t}</div>`)
      .join("");

    const rows = [
      { name: "negotiations", val: f.negotiations ?? 0 },
      { name: "offers minted", val: f.offersMinted ?? 0 },
      { name: "payment tries", val: f.paymentAttempts ?? 0 },
      { name: "succeeded", val: f.paymentsSucceeded ?? 0 },
      { name: "failed", val: f.paymentsFailed ?? 0 },
    ];
    const total = rows.reduce((sum, r) => sum + r.val, 0);
    if (total === 0) {
      $("funnel").innerHTML = `<div class="hint">No sales data available.</div>`;
    } else {
      const max = Math.max(1, ...rows.map((r) => r.val));
      $("funnel").innerHTML = rows
        .map(
          (r) =>
            `<div class="frow"><span class="fname">${r.name}</span>
               <span class="fbar"><span style="width:${Math.round((r.val / max) * 100)}%"></span></span>
               <span class="fval">${r.val}</span></div>`
        )
        .join("");
    }

    const per = Array.isArray(m.perSku) ? m.perSku : [];
    $("persku").innerHTML = per.length
      ? per
          .map(
            (r) =>
              `<div class="sku-row"><span class="nm">${esc(r.name)}<code>${esc(r.sku)}</code></span>
                 <span class="rv">${inr(r.revenueInPaise)} · ${r.unitsSold}u</span></div>`
          )
          .join("")
      : `<div class="hint">No sales recorded yet.</div>`;

    // Update money flow history for trend visualization
  if (m.sales && m.sales.count > 0) {
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    moneyFlowHistory.push({
      time: timestamp,
      cost: m.sales.costOfGoodsInPaise / 100,
      discount: m.sales.discountGivenInPaise / 100,
      profit: m.sales.grossProfitInPaise / 100
    });
    // Keep only last 20 points
    if (moneyFlowHistory.length > 20) {
      moneyFlowHistory = moneyFlowHistory.slice(-20);
    }

    // Update metrics history for trend indicators
    metricsHistory.push({
      time: timestamp,
      revenue: s.revenueInPaise / 100,
      margin: s.blendedMarginPct ?? 0,
      avgOrder: s.averageOrderValueInPaise / 100,
      discountGiven: s.discountGivenInPaise / 100,
      effectiveDiscount: s.effectiveDiscountRatePct ?? 0
    });
    // Keep only last 10 points
    if (metricsHistory.length > 10) {
      metricsHistory = metricsHistory.slice(-10);
    }
  }

  // Update money flow visualization
  updateMoneyFlowChart(m);
  }

  // Money flow visualization function
  function updateMoneyFlowChart(metrics) {
    const container = $("money-flow-container");
    const chartCanvas = $("money-flow-chart");
    const emptyState = container.querySelector(".empty");

    if (!metrics || !metrics.sales || metrics.sales.count === 0) {
      if (emptyState) emptyState.style.display = "block";
      if (chartCanvas) chartCanvas.style.display = "none";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (chartCanvas) chartCanvas.style.display = "block";

    // Get 2D context
    const ctx = chartCanvas.getContext("2d");

    // Clear previous chart if exists
    if (chartCanvas.chart) {
      chartCanvas.chart.destroy();
    }

    // Prepare data for money flow chart - show trend over time
    if (moneyFlowHistory.length > 0) {
      // Time series chart showing trend of cost, discount, profit over time
      const timeLabels = moneyFlowHistory.map(point => point.time);
      const costData = moneyFlowHistory.map(point => point.cost);
      const discountData = moneyFlowHistory.map(point => point.discount);
      const profitData = moneyFlowHistory.map(point => point.profit);

      // Create stacked bar chart showing money flow trends over time
      chartCanvas.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: timeLabels,
          datasets: [
            {
              label: 'Cost of Goods Sold',
              data: costData,
              backgroundColor: 'rgba(220, 38, 38, 0.8)', // --bad
              borderColor: 'rgba(220, 38, 38, 1)',
              borderWidth: 1
            },
            {
              label: 'Discount Given',
              data: discountData,
              backgroundColor: 'rgba(217, 119, 6, 0.8)', // --warn
              borderColor: 'rgba(217, 119, 6, 1)',
              borderWidth: 1
            },
            {
              label: 'Gross Profit',
              data: profitData,
              backgroundColor: 'rgba(5, 150, 105, 0.8)', // --ok
              borderColor: 'rgba(5, 150, 105, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            title: {
              display: true,
              text: 'Money Flow Trends: Cost, Discount, Profit Over Time'
            },
            tooltip: {
              mode: 'index',
              intersect: false,
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              stacked: true,
              ticks: {
                callback: function(value) {
                  return '₹' + value;
                }
              }
            },
            x: {
              stacked: true
            }
          }
        }
      });
    } else {
      // Fallback to single breakdown if no history
      const sales = metrics.sales;
      const revenue = sales.revenueInPaise / 100; // Convert paise to rupees
      const cost = sales.costOfGoodsInPaise / 100;
      const discount = sales.discountGivenInPaise / 100;
      const grossProfit = sales.grossProfitInPaise / 100;

      // Create stacked bar chart showing revenue breakdown
      chartCanvas.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Revenue Breakdown'],
          datasets: [
            {
              label: 'Cost of Goods Sold',
              data: [cost],
              backgroundColor: 'rgba(220, 38, 38, 0.8)', // --bad
              borderColor: 'rgba(220, 38, 38, 1)',
              borderWidth: 1
            },
            {
              label: 'Discount Given',
              data: [discount],
              backgroundColor: 'rgba(217, 119, 6, 0.8)', // --warn
              borderColor: 'rgba(217, 119, 6, 1)',
              borderWidth: 1
            },
            {
              label: 'Gross Profit',
              data: [grossProfit],
              backgroundColor: 'rgba(5, 150, 105, 0.8)', // --ok
              borderColor: 'rgba(5, 150, 105, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            title: {
              display: true,
              text: 'Money Flow: Revenue = Cost + Discount + Profit'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              stacked: true,
              ticks: {
                callback: function(value) {
                  return '₹' + value;
                }
              }
            },
            x: {
              stacked: true
            }
          }
        }
      });
    }
  }

  async function loadApprovals() {
    let data;
    try {
      data = await getJson("/approvals?status=PENDING");
    } catch {
      return;
    }
    const list = data && Array.isArray(data.approvals) ? data.approvals : [];
    const host = $("approvals");
    if (!list.length) {
      host.innerHTML = `<div class="hint">No pending approvals. Risky or high-value orders will surface here for a human decision.</div>`;
      return;
    }
    host.innerHTML = list
      .map((a) => {
        const pa = a.proposedAction || {};
        const det =
          pa.name != null
            ? `${esc(String(pa.quantity ?? ""))} × ${esc(String(pa.name))} · ${
                pa.discountPct != null ? esc(String(pa.discountPct)) + "% off · " : ""
              }${pa.totalInPaise != null ? inr(pa.totalInPaise) : ""}`
            : esc(a.kind || "order");
        const reasons = Array.isArray(a.reasons) ? a.reasons.map(chip).join("") : "";
        return `<div class="approval" data-id="${esc(a.approvalId)}">
            <div class="top">
              <span class="title">${esc(a.kind || "Approval")}</span>
              <span class="risk">risk ${esc(String(a.riskScore ?? "—"))}</span>
            </div>
            <div class="det">${det}</div>
            <div class="reasons">${reasons}</div>
            <div class="btns">
              <button class="btn tiny approve" data-approve="${esc(a.approvalId)}">Approve</button>
              <button class="btn tiny reject" data-reject="${esc(a.approvalId)}">Reject</button>
            </div>
          </div>`;
      })
      .join("");
  }

  async function decideApproval(id, approve) {
    const path = `/approvals/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`;
    const r = await post(path, { decidedBy: "merchant-console" });
    if (r.ok && r.body && r.body.ok) {
      if (approve && r.body.offer) {
        toast(`Approved · signed offer minted (${shortId(r.body.offer.offerId, 12)})`, "good");
      } else {
        toast(approve ? "Approved." : "Rejected.", approve ? "good" : "bad");
      }
    } else {
      const err = (r.body && (r.body.error || r.body.status)) || "failed";
      toast("Could not decide approval: " + err, "bad");
    }
    loadApprovals();
    loadMetrics();
  }

  // ============================================================ POLICY GAUGES
  let policyEnvelope = null;
  async function loadPolicy() {
    let cap;
    try {
      cap = await getJson("/catalog/capabilities");
    } catch {
      return;
    }
    const p = (cap && cap.agentCommerce && cap.agentCommerce.policyEnvelope) || {};
    policyEnvelope = p;
    const hv = p.highValueApprovalPaise != null ? inr(p.highValueApprovalPaise) : "—";
    const gauges = [
      {
        name: "Discount cap", num: (p.maxDiscountPct ?? 0) + "%",
        pct: Math.min(100, ((p.maxDiscountPct ?? 0) / 30) * 100),
        foot: "clamped, never exceeded", cls: "",
      },
      {
        name: "Margin floor", num: (p.minMarginPct ?? 0) + "%",
        pct: Math.min(100, ((p.minMarginPct ?? 0) / 50) * 100),
        foot: "orders below are rejected", cls: "floor",
      },
      {
        name: "Units / order", num: String(p.maxUnitsPerOrder ?? 0),
        pct: Math.min(100, ((p.maxUnitsPerOrder ?? 0) / 10) * 100),
        foot: "per-order quantity limit", cls: "",
      },
      {
        name: "Approval @ risk", num: String(p.requiresApprovalAtRiskScore ?? 0),
        pct: Math.min(100, ((p.requiresApprovalAtRiskScore ?? 0) / 10) * 100),
        foot: "or any order ≥ " + hv, cls: "floor",
      },
    ];
    $("gauges").innerHTML = gauges
      .map(
        (g) =>
          `<div class="gauge ${g.cls}">
             <div class="label"><span class="name">${g.name}</span><span class="num">${g.num}</span></div>
             <div class="track"><span class="fill" style="width:0"></span></div>
             <div class="foot">${g.foot}</div>
           </div>`
      )
      .join("");
    // Animate fills after paint.
    requestAnimationFrame(() => {
      const fills = document.querySelectorAll("#gauges .fill");
      gauges.forEach((g, i) => {
        if (fills[i]) fills[i].style.width = g.pct + "%";
      });
    });
  }

  // ============================================================ SIMULATION
  let llmOut = false;
  function renderSimState(state) {
    const el = $("sim-state");
    if (!state) {
      el.textContent = "";
      return;
    }
    const armed = state.failNextPayment && state.failNextPayment !== "NONE";
    llmOut = !!state.llmUnavailable;
    $("sim-llm").textContent = llmOut ? "Restore LLM" : "Simulate LLM outage";
    const parts = [];
    parts.push(
      armed
        ? `<span class="armed">⚠ next payment will fail as ${esc(state.failNextPayment)}</span>`
        : "No payment failure armed."
    );
    if (llmOut) parts.push(`<span class="armed">LLM outage simulated (language falls back)</span>`);
    el.innerHTML = parts.join(" · ");
  }
  async function loadSimState() {
    try {
      renderSimState(await getJson("/simulate/state"));
    } catch {
      /* ignore */
    }
  }

  // ============================================================ LLM BADGE
  async function loadLlmInfo() {
    const el = $("llm-status");
    try {
      const info = await getJson("/agent/info");
      const configured = info && info.configured;
      el.className = "status-chip";
      el.querySelector(".dot").style.background = configured ? "var(--ok)" : "var(--warn)";
      el.querySelector(".txt").textContent = configured
        ? `LLM · ${esc(info.provider || "live")}`
        : "LLM · deterministic floor";
      el.title = configured
        ? `Live model: ${info.provider}/${info.model}. Used for language only.`
        : "No LLM configured — language uses deterministic templates. Money math is unaffected.";
    } catch {
      el.querySelector(".txt").textContent = "LLM · unknown";
    }
  }

  // ============================================================ CATALOG (for explorer)
  async function loadCatalogInto() {
    try {
      const data = await getJson("/catalog/items");
      const items = data && Array.isArray(data.items) ? data.items : [];
      const sel = $("bo-sku");
      sel.innerHTML = items
        .map((i) => `<option value="${esc(i.sku)}">${esc(i.name)} (${esc(i.sku)})</option>`)
        .join("");
    } catch {
      /* ignore */
    }
  }
  async function runBestOffer() {
    const sku = $("bo-sku").value;
    const qty = Math.max(1, Math.min(5, Number($("bo-qty").value) || 1));
    if (!sku) return;
    const out = $("bo-out");
    out.innerHTML = `<span class="hint">computing…</span>`;
    try {
      const r = await getJson(`/revenue/best-offer?sku=${encodeURIComponent(sku)}&quantity=${qty}`);
      if (!r || r.ok === false) {
        out.innerHTML = `<span class="hint">No policy-safe offer (${esc((r && r.reason) || "unknown")}).</span>`;
        return;
      }
      out.innerHTML = `
        <div><span class="price">${inr(r.lineTotalInPaise)}</span>
          <span class="hint"> for ${r.quantity} · ${r.bestDiscountPct}% off, margin ${r.resultingMarginPct}%</span></div>
        <div style="margin-top:6px">${chip(
          r.bindingConstraint === "MARGIN_FLOOR"
            ? "MARGIN_BELOW_POLICY_FLOOR"
            : r.bindingConstraint === "DISCOUNT_CAP"
            ? "DISCOUNT_CAPPED_TO_POLICY"
            : "OFFER_VALID"
        )} <span class="hint">${esc(r.explanation || "")}</span></div>`;
    } catch {
      out.innerHTML = `<span class="hint">Request failed.</span>`;
    }
  }

  // ============================================================ CHAT
  let chatSession = null;
  function clearEmpty(host) {
    const e = host.querySelector(".empty");
    if (e) host.innerHTML = "";
  }
  function pushBubble(host, cls, who, phase, text, reasonCode, seal) {
    clearEmpty(host);
    const b = document.createElement("div");
    b.className = "bubble " + cls;
    b.innerHTML =
      `<div class="who">${esc(who)}${phase ? ` · <span class="phase">${esc(phase)}</span>` : ""}</div>` +
      `<p>${esc(text)}</p>` +
      (reasonCode || seal
        ? `<div class="reason">${reasonCode ? chip(reasonCode) : ""}${seal || ""}</div>`
        : "");
    host.appendChild(b);
    host.scrollTop = host.scrollHeight;
    return b;
  }

  function llmMetaLine(turn) {
    const meta = turn && turn.llm ? turn.llm : {};
    const say = (m) => {
      if (!m) return "n/a";
      if (m.used) return `${m.provider}/${m.model}`;
      return "deterministic floor";
    };
    return `understanding: <b>${esc(say(meta.intent))}</b> · phrasing: <b>${esc(say(meta.reply))}</b>`;
  }

  function offerSealFromTurn(turn) {
    const neg = turn && turn.data && turn.data.negotiation;
    const oid = neg && ((neg.offer && neg.offer.offerId) || (neg.quote && neg.quote.offerId));
    return oid ? `<span class="seal">offer ${esc(shortId(oid, 12))}</span>` : "";
  }

  async function sendChat(message) {
    const log = $("chat-log");
    pushBubble(log, "buyer", "you", "", message);
    $("chat-input").value = "";
    const pending = pushBubble(log, "merchant", "merchant agent", "thinking", "");
    // Replace text with animated typing dots
    const pEl = pending.querySelector("p");
    if (pEl) pEl.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    try {
      const r = await post("/agent/message", {
        message,
        ...(chatSession ? { sessionId: chatSession } : {}),
      });
      const turn = r.body || {};
      chatSession = turn.sessionId || chatSession;
      pending.remove();
      pushBubble(
        log, "merchant", "merchant agent", turn.action || "", turn.reply || "(no reply)",
        null, offerSealFromTurn(turn)
      );
      $("chat-meta").innerHTML = llmMetaLine(turn);
    } catch {
      pending.remove();
      pushBubble(log, "merchant", "merchant agent", "error", "Something went wrong reaching the agent.");
    }
  }

  // ============================================================ A2A BUYER RUN
  let a2aRunning = false;
  async function runBuyerAgent() {
    if (a2aRunning) return;
    a2aRunning = true;
    switchTab("a2a");
    const log = $("a2a-log");
    const outcome = $("a2a-outcome");
    outcome.className = "outcome";
    outcome.innerHTML = "";
    log.innerHTML = `<div class="empty"><div class="big">Running…</div>The buyer is negotiating with the merchant.</div>`;
    setButtonsBusy(true);
    $("a2a-hint").textContent = "running…";
    try {
      const r = await post("/buyer/run", {});
      const res = r.body || {};
      if (!res.ok || !Array.isArray(res.transcript)) {
        log.innerHTML = `<div class="empty"><div class="big">Run failed.</div>${esc(
          (res && res.detail) || "The buyer agent did not complete."
        )}</div>`;
        toast("Buyer agent run failed.", "bad");
        return;
      }
      log.innerHTML = "";
      for (const t of res.transcript) {
        const cls = t.from === "buyer" ? "buyer" : t.from === "human" ? "human" : "merchant";
        const who = t.from === "buyer" ? "buyer agent" : t.from === "human" ? "human" : "merchant agent";
        pushBubble(log, cls, who, t.phase, t.text, t.reasonCode || null, "");
        await sleep(230);
      }
      renderOutcome(res);
      toast("Buyer agent mission complete.", "good");
      // The escalated order now sits in the approval queue.
      scheduleDashboards();
    } catch {
      log.innerHTML = `<div class="empty"><div class="big">Run failed.</div>Could not reach the buyer endpoint.</div>`;
      toast("Buyer agent run failed.", "bad");
    } finally {
      a2aRunning = false;
      setButtonsBusy(false);
      $("a2a-hint").textContent = "deterministic · no LLM in the buyer loop";
    }
  }

  function renderOutcome(res) {
    const o = res.outcome || {};
    const el = $("a2a-outcome");
    const stats = [
      { k: "Purchases", v: String(o.purchases ?? 0), cls: (o.purchases ? "good" : "") },
      { k: "Units", v: String(o.unitsBought ?? 0), cls: "" },
      { k: "Spent", v: inr(o.totalSpentPaise), cls: "" },
      { k: "Recovered", v: String(o.paymentsRecovered ?? 0), cls: (o.paymentsRecovered ? "good" : "") },
      { k: "Escalated", v: String((o.escalatedApprovals || []).length), cls: (((o.escalatedApprovals || []).length) ? "warn" : "") },
      { k: "Mandate left", v: inr(o.mandateRemainingPaise), cls: "" },
    ];
    el.innerHTML =
      stats
        .map(
          (s) =>
            `<div class="stat ${s.cls}"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`
        )
        .join("") +
      `<div class="stat" style="flex:1 1 100%;min-width:0"><div class="k">Summary</div>
         <div style="font-size:.8rem;color:var(--muted);margin-top:4px;line-height:1.45">${esc(res.summary || "")}</div></div>`;
    el.classList.add("show");
  }

  // ============================================================ GUIDED DEMO
  let demoRunning = false;
  function setDemoStatus(text, busy) {
    const el = $("demo-status");
    el.className = "demo-status" + (busy ? " busy" : "");
    el.innerHTML = text ? `<span class="step">${esc(text)}</span>` : "";
  }
  function setButtonsBusy(busy) {
    ["run-guided", "run-buyer", "run-buyer-top", "reset-all"].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = busy;
    });
  }

  async function negotiateQuote(sku, quantity, requestedDiscountPct) {
    return post("/negotiate/quote", { sku, quantity, requestedDiscountPct });
  }
  async function payOffer(offerId, receipt) {
    return post("/checkout/pay", {
      offerId,
      receipt,
      idempotencyKey:
        (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
        "idem_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    });
  }

  async function runGuidedDemo() {
    if (demoRunning) return;
    demoRunning = true;
    setButtonsBusy(true);
    switchTab("chat");
    try {
      setDemoStatus("Resetting ledger and simulation…", true);
      await post("/simulate/reset", {});
      await api("/ledger/events", { method: "DELETE" });
      setLedger([]); // DELETE emits no SSE event — clear the client view to match.
      await sleep(500);

      // 1) A clean, policy-compliant sale.
      setDemoStatus("1/5 · Negotiating a compliant quote (2 keyboards, 10% off)…", true);
      let r = await negotiateQuote("KB-75-MECH", 2, 10);
      let offerId = r.body && r.body.offer && r.body.offer.offerId;
      await sleep(700);
      if (offerId) {
        setDemoStatus("1/5 · Paying against the signed offer…", true);
        await payOffer(offerId, "demo-sale-" + Date.now());
        await sleep(700);
      }

      // 2) A request beyond policy — bounded, with a counter-offer.
      setDemoStatus("2/5 · Pushing past the discount cap (40% off) → expect a counter…", true);
      await negotiateQuote("KB-75-MECH", 2, 40);
      await sleep(900);

      // 3) A high-value order that must be gated for a human, then approved.
      setDemoStatus("3/5 · High-value order (2 ultrawides) → human approval gate…", true);
      r = await negotiateQuote("WR-4K-ULTRA", 2, 0);
      const approvalId =
        r.body && r.body.approval && r.body.approval.approvalId;
      await sleep(900);
      if (approvalId) {
        setDemoStatus("3/5 · Human approves the held order → offer minted…", true);
        const ap = await post(`/approvals/${encodeURIComponent(approvalId)}/approve`, {
          decidedBy: "guided-demo",
        });
        const mintedOffer = ap.body && ap.body.offer && ap.body.offer.offerId;
        await sleep(700);
        if (mintedOffer) {
          setDemoStatus("3/5 · Paying the approved offer…", true);
          await payOffer(mintedOffer, "demo-appr-" + Date.now());
          await sleep(700);
        }
      }

      // 4) Failure recovery: arm a decline, then recover on retry.
      setDemoStatus("4/5 · Arming a payment decline, then recovering on retry…", true);
      await post("/simulate/failure", { type: "PAYMENT_DECLINED" });
      r = await negotiateQuote("MS-ERG-PLUS", 3, 10);
      offerId = r.body && r.body.offer && r.body.offer.offerId;
      await sleep(600);
      if (offerId) {
        const first = await payOffer(offerId, "demo-fail-" + Date.now());
        await sleep(700);
        if (!(first.body && first.body.ok)) {
          setDemoStatus("4/5 · Decline received (offer still valid) → retrying…", true);
          await payOffer(offerId, "demo-recover-" + Date.now());
          await sleep(700);
        }
      }
      await loadSimState();

      // 5) Hand off to the autonomous buyer agent.
      setDemoStatus("5/5 · Handing off to the autonomous buyer agent…", true);
      await sleep(500);
      setDemoStatus("Guided demo complete — money flow filled, ledger populated. Running buyer agent next…", false);
      setButtonsBusy(false);
      await runBuyerAgent();
      setDemoStatus("Demo complete. Explore the ledger, approvals and metrics.", false);
    } catch (err) {
      setDemoStatus("Demo hit an error — the app stays consistent; try Reset.", false);
      toast("Guided demo error.", "bad");
    } finally {
      demoRunning = false;
      setButtonsBusy(false);
      scheduleDashboards();
      loadSimState();
    }
  }

  // ============================================================ RESET
  async function resetAll() {
    setButtonsBusy(true);
    try {
      await post("/simulate/reset", {});
      await api("/ledger/events", { method: "DELETE" });
      setLedger([]); // DELETE emits no SSE event — clear the client view to match.
      $("a2a-outcome").className = "outcome";
      $("a2a-outcome").innerHTML = "";
      $("a2a-log").innerHTML = `<div class="empty"><div class="big">The A2A demo hasn't run yet.</div>Hit “Run buyer agent” to watch the two agents negotiate.</div>`;
      $("chat-log").innerHTML = `<div class="empty"><div class="big">Language in, money math out.</div>Ask for a quote, a payment, or a spend mandate.</div>`;
      $("chat-meta").innerHTML = "";
      chatSession = null;
      setDemoStatus("", false);
      await loadSimState();
      await loadMetrics();
      await loadApprovals();
      toast("Console reset — ledger cleared.", "good");
    } catch {
      toast("Reset failed.", "bad");
    } finally {
      setButtonsBusy(false);
    }
  }

  // ============================================================ TABS
  function switchTab(which) {
    const chat = which === "chat";
    $("tab-chat").setAttribute("aria-selected", chat ? "true" : "false");
    $("tab-a2a").setAttribute("aria-selected", chat ? "false" : "true");
    $("pane-chat").classList.toggle("active", chat);
    $("pane-a2a").classList.toggle("active", !chat);
    $("pane-chat").hidden = !chat;
    $("pane-a2a").hidden = chat;
  }

  // ============================================================ WIRING
  function wire() {
    buildFlow();

    $("tab-chat").addEventListener("click", () => switchTab("chat"));
    $("tab-a2a").addEventListener("click", () => switchTab("a2a"));

    // Keyboard navigation for tabs
    const tabsContainer = $(".tabs");
    if (tabsContainer) {
      tabsContainer.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          switchTab($("tab-chat").getAttribute("aria-selected") === "true" ? "a2a" : "chat");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          switchTab($("tab-chat").getAttribute("aria-selected") === "true" ? "a2a" : "chat");
        } else if (e.key === "Home") {
          e.preventDefault();
          switchTab("chat");
        } else if (e.key === "End") {
          e.preventDefault();
          switchTab("a2a");
        }
      });

      // Ensure tabs are focusable
      $("tab-chat").setAttribute("tabindex", "0");
      $("tab-a2a").setAttribute("tabindex", "0");
    }
}

    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = $("chat-input").value.trim();
      if (msg) sendChat(msg);
    });
    $("chat-suggest").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-msg]");
      if (btn) sendChat(btn.getAttribute("data-msg"));
    });

    $("run-buyer").addEventListener("click", runBuyerAgent);
    $("run-buyer-top").addEventListener("click", runBuyerAgent);
    $("run-guided").addEventListener("click", runGuidedDemo);
    $("reset-all").addEventListener("click", resetAll);

    $("sim-decline").addEventListener("click", async () => {
      const r = await post("/simulate/failure", { type: "PAYMENT_DECLINED" });
      renderSimState(r.body && r.body.state);
      toast("Armed: next payment will decline once, then recover.", "warn");
    });
    $("sim-llm").addEventListener("click", async () => {
      const r = await post("/simulate/llm", { unavailable: !llmOut });
      renderSimState(r.body && r.body.state);
      loadLlmInfo();
      toast(!llmOut ? "LLM outage simulated." : "LLM restored.", "warn");
    });
    $("sim-reset").addEventListener("click", async () => {
      const r = await post("/simulate/reset", {});
      renderSimState(r.body && r.body.state);
      loadLlmInfo();
      toast("Simulated failures cleared.", "good");
    });

    $("refresh-metrics").addEventListener("click", loadMetrics);
    $("refresh-approvals").addEventListener("click", loadApprovals);
    $("clear-ledger").addEventListener("click", async () => {
      await api("/ledger/events", { method: "DELETE" });
      setLedger([]); // DELETE emits no SSE event — clear the client view to match.
      toast("Ledger cleared.", "good");
    });

    $("approvals").addEventListener("click", (e) => {
      const ap = e.target.closest("[data-approve]");
      const rj = e.target.closest("[data-reject]");
      if (ap) decideApproval(ap.getAttribute("data-approve"), true);
      else if (rj) decideApproval(rj.getAttribute("data-reject"), false);
    });

    $("bo-run").addEventListener("click", runBestOffer);
  }

  // ============================================================ BOOT
  function boot() {
    wire();
    connectStream();
    loadPolicy();
    loadLlmInfo();
    loadSimState();
    loadMetrics();
    loadApprovals();
    loadCatalogInto().then(runBestOffer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
