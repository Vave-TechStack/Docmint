# Financial Validation — Scope and Open Decisions

**Status:** Implemented for arithmetic consistency. Statutory derivation
deliberately NOT implemented.
**Date:** 2026-10-10

## The defect

The document pipeline echoed whatever the user typed. A payslip claiming
`Basic 45,000 + HRA 18,000` against `Gross Earnings 80,000` was generated
without complaint, because no code anywhere compared the figures:

```
grep parseFloat|toFixed|subtotal|amountInWords  ->  hits only in admin
                                                    dashboards and SVG sizing,
                                                    nothing in document-engine.ts
                                                    or docx-generator.ts
```

A paid customer could download a salary document whose totals were
self-contradictory, and the product reported success.

## What is implemented

`src/lib/documents/amounts.ts` and `src/lib/documents/validation.ts`.

### 1. Amount parsing and formatting (no business rules)

`parseAmount` accepts what people actually type: `45,000`, `₹ 45,000`,
`Rs. 45000`, `1,00,000` (Indian grouping), `45 000`, `(1,200)` (accounting
negative), `-1200`, `₹1,00,000.75`. It returns **null** for prose and blanks
rather than coercing to `0` — treating a blank as zero would let an incomplete
document pass a consistency check, which is worse than skipping the check.

`formatIndianAmount` groups digits the Indian way (`1,00,000`, not
`100,000`). `amountToIndianWords` spells amounts using lakh/crore, e.g.
`1,23,45,678 → "one crore twenty-three lakh forty-five thousand six hundred
seventy-eight rupees only"`.

### 2. Arithmetic identities the template itself declares

These are statements about a document's own layout — "Gross Earnings is the sum
of the rows above it" — not about payroll law. A mismatch is wrong under any
jurisdiction.

| Rule | Identity |
|---|---|
| `identity:gross=sum(earnings)` | GrossEarnings = Basic + DA + HRA + Conveyance + Medical + SpecialAllowance |
| `identity:deductions=sum(deductions)` | TotalDeductions = PF + ESI + ProfessionalTax + IncomeTax |
| `identity:net=gross-deductions` | NetPay = GrossEarnings − TotalDeductions |
| `identity:tax=sum(components)` | TotalTax = CGST + SGST + IGST |
| `identity:grandtotal=subtotal+tax` | GrandTotal = Subtotal + TotalTax |
| `identity:grandtotal=subtotal-discount+tax` | GrandTotal = Subtotal − Discount + TaxAmount |
| `identity:taxamount=percentage-of-subtotal` | TaxAmount = (Subtotal − Discount) × TaxPercentage ÷ 100 |
| `identity:totalcost=sum(components)` | TotalCost = BasePrice + FloorRise + CarParking + RegistrationCharges + GST_Amount + AdditionalCharges |
| `consistency:words-vs-amount` | NetPayWords / TotalInWords must spell the figure printed beside them |

Comparison tolerance is `0.005` (amounts are held to two decimal places).

### 3. Safety rules

- Negative values rejected on fields where a negative is never meaningful
  (gross, total, net, price, subtotal, rent, basic).
- Amounts above `1e12` rejected.
- Non-numeric content in a money field produces a **warning**, not an error,
  and the identity check is skipped rather than evaluated against a zero.
- A rule is skipped entirely when any of its members is absent — the validator
  never blocks a document over a value it cannot interpret.

## Where it is enforced

| Route | Behaviour |
|---|---|
| `POST /api/instant/download` | 400 **before** the payment is consumed and before any file is generated, so a customer is never charged for a self-contradictory document |
| `POST /api/instant/preview` | 400 while the user is still filling the form |
| `POST /api/templates/[id]/download` | 400; auto-generated `sample=true` data is exempt because it is illustrative filler, not a declared figure |

## Open decisions — NOT implemented, needs a business answer

These are **not** guessed. Each requires a product or accounting decision, and
inventing a rule would silently produce wrong numbers on real documents.

1. **PF rate.** Commonly 12% of basic, but the employer/employee split and the
   ceiling depend on establishment type and statutory ceiling. Which applies?
   Should DocMint compute it, or only validate a user-entered value?

2. **ESI rate and applicability.** Rate and wage ceiling differ by employee
   category, and ESI does not apply above a wage threshold. Rule needed.

3. **Professional tax.** Varies **by state** (Karnataka, Maharashtra, Kerala,
   …) with different slabs and thresholds. A single default would be wrong for
   most users.

4. **Income tax.** Depends on the regime (old vs new), fiscal year, and
   declaration status (e.g. 80C, 80D investments). Needs product input.

5. **GST.** Which rate applies per item/service category; whether CGST+SGST
   (intra-state) or IGST (inter-state) applies is determined by the parties'
   addresses; HSN/SAC codes are not currently entered as structured data.

6. **Rounding policy.** Round each line, or round only totals? Round to the
   nearest rupee, or keep paise? Indian invoices frequently use whole rupees
   while the underlying computation is fractional.

7. **ItemsTable.** GST Invoice and Business Quotation expose `ItemsTable`,
   which is free-form HTML the user supplies. Line-item arithmetic is
   therefore **not** validated — `Subtotal` cannot be checked against the
   items without parsing that HTML. Should DocMint introduce a structured
   line-item editor so totals become checkable?

8. **Correct versus refuse.** Currently a mismatch is **refused**. An
   alternative is to auto-correct the derived field and warn, or to warn only.
   Refusing is safest for a payslip but may frustrate a user mid-entry.

## Recommendation

Ship items 1–8 as documented above: the validator blocks only what is
objectively wrong, and every rule it applies is visible in
`src/lib/documents/validation.ts`. Resolve decisions 1–6 with an accountant
before adding derivation; implement decision 7 (structured line items) before
claiming invoice arithmetic is validated.

## Tests

`src/lib/documents/amounts.test.ts` — 32 tests covering parsing (including
rejection of prose and malformed input), Indian grouping, lakh/crore words,
amount-in-words agreement, every identity rule, blank optional fields,
negative/oversized rejection, and an explicit test that implausible-but-
consistent PF/ESI figures are **not** second-guessed.