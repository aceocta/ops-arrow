# Till Report — Design Spec & Phased Plan

> Status: **brainstorm / design** (no implementation yet). Living document — iterate freely.
> Scope: capture, parse, map, reconcile and report the daily EPOS "Z-read" plus the
> convenience-store **service counters** (Lottery, PayPoint/Payzone, Post Office, Fuel,
> Parcels, Carrier bags). ATM is out of scope for now (slot kept for later).

---

## 1. Goal

Turn the end-of-day till/terminal paperwork into a **reconciled, signed-off day** that answers:
1. Does counted cash match expected? (**over/short**, fully explained)
2. What do we actually earn from each counter? (**commission income**)
3. What's **owed** to providers (PayPoint/Lottery DD) and is it settled correctly?
4. Clean, correctly-classified data for **accounting** and **loss-prevention**.

Capture is **multi-source** (EPOS + lottery terminal + PayPoint + fuel + Horizon), via
**photo/OCR, manual entry, or export** — always with a human **verify-the-amount** step.

---

## 2. The three data layers (don't mix them)

1. **Sales** — what was sold: departments, VAT rates, gross/net totals.
2. **Tenders** — how it was paid: cash, card, vouchers, mobile.
3. **Movements & exceptions** — float, paid-in/out, safe drops, voids, no-sales, refunds.

Plus the cross-cutting **service counters**, which behave as **agency/commission** business,
not retail sales (throughput ≠ income).

---

## 3. Canonical taxonomy

The label printed on a receipt is just an **alias** pointing at a fixed internal field. Each
canonical field carries **behaviour metadata** the engine reads (behaviour comes from the
field, never the printed word):

| Field (examples) | Group | Cash dir | Hits drawer | VAT | Notes |
|---|---|---|---|---|---|
| `CASH` | Tender | In | ✔ | — | retail cash |
| `CARD` (`_DEBIT/_CREDIT/_CONTACTLESS`) | Tender | — | ✖ | — | vs acquirer |
| `MOBILE_PAY` `VOUCHER` `GIFT_CARD` `CHEQUE` | Tender | — | ✖ | — | |
| `CASHBACK` | Tender | Out | ✔ | — | |
| `LOTTERY_SALES` / `_PRIZES` / `_COMMISSION` | Counter | In / Out / — | ✔ / ✔ / ✖ | exempt | DD weekly |
| `SCRATCHCARD_SALES` / `_PRIZES` | Counter | In / Out | ✔ | exempt | pack activation |
| `PAYPOINT` `PAYZONE` | Counter | In | ✔ | OOS | owed by DD; commission separate |
| `PARCELS` | Counter | None | ✖ | std | commission only |
| `CARRIER_BAGS` | Counter | In | ✔ | varies | levy |
| `POST_OFFICE` | Counter | Separate | ✖ | — | own Horizon balance |
| `FUEL_SALES` | Counter | In | ✔ | std | by grade (phase) |
| `ATM` | Counter | Out | ✔ | — | later |
| `OPENING_FLOAT` `PAID_IN` | Movement | In | ✔ | — | |
| `PAID_OUT` `SAFE_DROP` `PICKUP` `BANKING` | Movement | Out | ✔ | — | |
| `GROSS_SALES` `NET_SALES` `VAT_20/5/0` | Total | — | ✖ | — | headline |
| `TXN_COUNT` `ITEM_COUNT` | Stat | — | ✖ | — | |
| `NO_SALE` `VOID` `REFUND` `OVERRIDE` `DISCOUNT` | Exception | — | varies | — | risk |
| `DEPT_TOBACCO` `DEPT_ALCOHOL` `DEPT_GROCERY` … | Department | — | ✖ | — | |
| `SUBTOTAL_IGNORE` `UNMAPPED` | Control | — | — | — | skip / force review |

Two attributes drive reconciliation: **`cashDirection`** (In/Out/None/Separate) and **`affectsDrawer`**.

---

## 4. Label mapping (the hard problem) — "map once per till, remember forever"

### Seed alias dictionary (Global tier; normalized = UPPER, no spaces/punctuation)
```
CASH:            CASH, CSH, TOTALCASH, CASHSALES, CASHTAKINGS, CASHTENDERED
CARD:            CARD, CARDS, CREDITCARD, DEBITCARD, CHIPPIN, EFT, EFTPOS, WORLDPAY
LOTTERY_SALES:   LOTTO, LOTTERY, NATIONALLOTTERY, NLSALES, CAMELOT, ALLWYN
LOTTERY_PRIZES:  LOTTOPAYOUT, LOTTERYPRIZE, NLPRIZES, PRIZESPAID, LOTTOWINS
SCRATCHCARD_SALES: SCRATCH, SCRATCHCARD, INSTANTS
PAYPOINT:        PAYPOINT, PPOINT, PP, PPBILLS, BILLPAY
PAYZONE:         PAYZONE, PZ, PZONE
PARCELS:         COLLECTPLUS, AMAZON, INPOST, EVRI, HERMES, YODEL, DPD, PARCEL
CARRIER_BAGS:    CARRIERBAG, BAGS, BAGLEVY, 10PBAG
PAID_OUT:        PAIDOUT, PDOUT, PO, EXPENSES, PETTYCASH
SAFE_DROP:       SAFEDROP, DROP, CASHDROP, LIFT, SKIM, BANKING
OPENING_FLOAT:   FLOAT, OPENINGFLOAT, STARTFLOAT, TILLFLOAT
NO_SALE:         NOSALE, NS, DRAWEROPEN
VOID:            VOID, CANCEL, CANCELLED
REFUND:          REFUND, RTN, RETURNS
VAT_20/5/0:      VAT20/STDVAT/A ; VAT5/REDUCED/B ; VAT0/ZERORATE/EXEMPT/C
DEPT_*:          TOBACCO/CIGS/VAPE ; ALCOHOL/BWS ; GROCERY ; SOFTDRINKS ; CONFECTIONERY …
```

### Mapping store (3 tiers, priority Till > Shop > Global)
```
TillLabelMapping {
  scope: Till | Shop | Global
  scopeId: tillId | shopId | null
  normalizedLabel, rawSample, section?
  canonicalField
  source: Learned | Seeded | Ai
  confidence, confirmedBy, confirmedOn
}
```

### Resolver cascade (stop at first hit)
```
n = normalize(rawLabel)                  // UPPER, strip amounts/codes/punct, OCR fixes (O→0,l→1)
1. Till-scope map (n, section)           // strongest — learned for this exact till
2. Shop-scope map
3. Global seed dictionary
4. Fuzzy match (token + Levenshtein ≥ .88)   // OCR typos: PAYPDINT→PAYPOINT
5. AI classify (≥ .7) [phase 2]
6. UNMAPPED → human review
```

### Learning loop
The verify screen confirms **amount + mapping**; every correction upserts a **Till-scope**
mapping → that till asks a few questions on day one, then maps **silently** forever. Recurring
corrections across shops can be **promoted to Global** (admin review).

---

## 5. OCR sectioning (photo → structured lines)

Use **Azure Document Intelligence (layout)** → words **with bounding boxes** (geometry, not just text).

1. Pre-process: deskew, crop, contrast; multi-photo stitch (long receipts).
2. OCR → words + coords.
3. Reconstruct rows by **y-band**; split **label (left) / amount (right)** at the x-gap.
4. Detect **section headers** (no amount, UPPERCASE/standalone, header dictionary:
   `PAYMENTS, TENDER, DEPARTMENTS, CASH MANAGEMENT, VAT ANALYSIS, FINANCIALS, X/Z-READ`).
5. Assign each row to its section (section is part of the mapping key — disambiguates "CASH").
6. Parse amounts: `£`, commas, negatives `(…)`/trailing `-`/`CR/DR`, qty columns.
7. Confidence per line → low → review.

**Robustness:** section **sum-check** vs printed subtotal; **till fingerprint** → apply saved
profile; **per-source** sectioning (lottery/PayPoint slips are separate docs); AI extraction fallback.

---

## 6. Capture & verify workflow

```
Draft
 → add sources (photo/OCR · manual · export), one per counter/system
 → OCR extracts; each figure pre-filled, editable
NeedsVerification
 → user confirms/corrects amount + mapping; mismatches flagged; learnings saved
 → cash count (blind)
Reconciled
 → engine computes expected vs counted → over/short
Approved
 → manager sign-off (locks the day)
```
OCR **never auto-commits** — it pre-fills; the verified value is what reconciliation uses.

---

## 7. Cash-count / denomination tool

- UK notes/coins + **coin bags**, qty × value → running total.
- **Blind count** (hide expected until counted) = key anti-fudge control.
- Three distinct numbers: **counted cash** → **float to carry** → **to bank/drop**.
- Optional **manager blind recount** with tolerance; save full **denomination snapshot** (audit).
- Escape hatch: "enter total only". Also collects card/cheque/voucher counted.

---

## 8. Reconciliation engine

**Master retail-cash equation:**
```
Expected drawer =
    opening float
  + retail cash sales
  + Σ counter.cashIn  where affectsDrawer     (PayPoint cash, lottery sales)
  − Σ counter.cashOut where affectsDrawer     (lottery prizes, cashback)
  + paid-in − paid-out − safe drops − pickups
Over/Short = counted cash − expected
```
**Per-counter self-reconciliation:**
- Lottery: `salesCash − prizesPaid − commission = net owed (DD)`
- PayPoint/Payzone: `cashCollected = owed (DD)`; `commission = income`
- Parcels: `count × rate ≈ commission`; Bags: `bagsSold × price = levy`
- **Post Office / Fuel wet-stock**: **separate block**, not in the drawer equation.

Card/other tenders reconcile on their own axis (EPOS vs acquirer).

---

## 9. Variance thresholds & alerting

- Per-shop band: `±£X` or `±% of cash sales`; separate **shorts vs overs**.
- Tiers: **within** (auto-OK) · **warning** (reason required) · **alert** (reason + manager
  approval + notification; blocks day close).
- **Reason codes** (structured): miscount, wrong change, unrecorded paid-out, prize not logged,
  card-as-cash, training, **suspected theft**, other.
- **Patterns**: repeat-offender (cashier/till), cumulative period variance, no-sale/void
  thresholds, counter vs DD-statement mismatch.
- Alerts via existing notification stack: push/email + daily digest + dashboard tiles.

---

## 10. Multi-till rollup & owner dashboard

Hierarchy: `Line → Source → Till Report → Shift → Business Day → Shop → Company`.
- **Day close gated** on "X of Y tills reconciled & signed off".
- Rollup: sales, tenders, **net variance**, counter throughput + commission, exceptions.
- **Banking reconciliation**: to-bank vs actual deposit (multi-day).
- Owner dashboard tiles per shop (sales, cash variance ⚠/🔴, commission, unreconciled count),
  cross-shop comparison, variance/commission trends, drill-down to the source photo.

---

## 11. Provider settlement reconciliation

Match **captured daily** totals against the provider's **periodic DD / commission statement**.
```
ProviderSettlementPeriod {
  provider, shopId, periodStart, periodEnd
  capturedSales, capturedPrizes, capturedCommission, capturedOwed
  statementAmount, statementCommission, ddAmount, ddDate
  variance, status: Open | Matched | Discrepancy | Settled
  source: Photo/OCR | Manual | CSV/API
}
```
- Track **"owed to provider"** liability that clears on the **DD date** (timing gap).
- Statement capture: photo/OCR · manual · **CSV/portal import**.
- Alerts: missing statement, DD ≠ captured, **commission underpaid**.
- Cadence per provider (lottery weekly, parcels monthly…).

---

## 12. Accounting export

- Export a **daily Z journal**: sales by **VAT rate**, by department; tenders; **commission income**;
  paid-outs; **cash over/short**; banking.
- **Agency throughput is NOT turnover** — PayPoint/lottery/PO are **liabilities**, only commission
  is income; services are exempt/outside-scope (driven by the canonical field's metadata).
- Configurable **chart-of-accounts mapping** (canonical field → nominal code).
- Targets: CSV first → Xero / QuickBooks / Sage. **Idempotent**, only **approved** days, posted once.

---

## 13. Offline capture

- **Offline-capable**: photo capture, manual entry, **denomination count**, and the
  **reconciliation maths** (on-device once verified — instant variance, no signal).
- **Deferred (needs network)**: server OCR / AI mapping (queue image → verify when online);
  optional on-device OCR fallback so staff can verify offline.
- Sync: queued sources with idempotency keys; per-source status; conflict handling
  (lock day to one device or per-line last-write-wins). **Approval is online-only.**

---

## 14. Per-shop configuration

`ShopServiceCounterConfig` — only enabled counters appear:
| Setting | Options |
|---|---|
| Lottery | off / on (+ scratchcards) |
| PayPoint / Payzone | off / PayPoint / Payzone / both |
| Post Office | none / Local (mixed till) / Main branch (separate Horizon) |
| Fuel | none / forecourt (+ grades, + wet-stock) |
| Parcels | multi-select carriers |
| Carrier bags | off / on |
| ATM | off (now) |

Each enabled counter carries defaults: `cashDirection`, `affectsDrawer`, `settlement`, `commissionRate?`.

---

## 15. Phased plan

### Phase 0 — Foundations (config + taxonomy)
- `ShopServiceCounterConfig` (per-shop counter selection).
- Canonical field enum + behaviour metadata; **seed alias dictionary**.
- `TillLabelMapping` store + tiered resolver (Till > Shop > Global) + `normalize()` + fuzzy.

### Phase 1 — MVP: drawer reconciliation (highest value, drawer-impacting only)
Counters: **retail + Lottery + Scratchcards + PayPoint/Payzone + Parcels + Carrier bags**.
- Capture: **manual + photo upload** (OCR can be basic/AI-extract first), always **verify** step.
- **Cash-count tool** (blind) + tenders.
- **Reconciliation engine** (master equation) → over/short.
- **Variance thresholds + reason codes** + manager sign-off.
- Single till per report; basic day view.
> Outcome: a real, explainable over/short that accounts for the cash-impacting counters.

### Phase 2 — Smarter capture + rollup
- **OCR sectioning** (Azure DI layout, geometry) + section-aware mapping + sum-checks.
- **Till fingerprint / profiles**; AI fallback for unknown labels.
- **Multi-till / whole-day rollup**, day-close gating, **owner dashboard** tiles + alerts.
- Per-cashier variance & exception analytics.

### Phase 3 — Separate systems & money-out
- **Post Office** (separate balance) and **Fuel** (grades + optional wet-stock).
- **Provider settlement reconciliation** (DD/commission statements, owed-vs-settled).
- **ATM** (retailer-filled).

### Phase 4 — Books & integrations
- **Accounting export** (CSV → Xero/QuickBooks/Sage) with COA mapping + VAT/agency rules.
- EPOS **digital export/API** ingestion (skip photos where a feed exists).
- **Offline capture** hardening (on-device OCR, conflict handling).

---

## 16. Open decisions
1. EPOS systems in use across shops (drives OCR templates / future API feeds).
2. Capture default: photo-first vs manual-first per counter.
3. Variance band defaults (absolute £ vs % of sales).
4. Post Office: how many shops are **Main branch** (separate Horizon) vs **Local**?
5. Accounting target(s): which package(s) first?
6. Who captures vs who approves (role model — reuse existing approval pattern).
