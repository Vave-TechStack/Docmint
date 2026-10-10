import { parseAmount, wordsMatchAmount, amountToIndianWords } from './amounts';

/**
 * Financial integrity checks for generated business documents.
 *
 * SCOPE AND INTENT
 * ----------------
 * The audit found that the generation pipeline echoes whatever the user
 * typed: a payslip claiming Basic 45,000 + HRA 18,000 against Gross 80,000
 * was generated without complaint, so the product could print a document
 * whose own figures contradict each other.
 *
 * What this module does is check **arithmetic identities that the template
 * itself declares** — "Gross Earnings is the sum of the rows above it" is a
 * statement about the document's own layout, not about payroll law. Those
 * checks are objective: a mismatch is wrong under any jurisdiction.
 *
 * What this module deliberately does NOT do is derive any rate or statutory
 * figure. PF, ESI, professional tax, income tax, GST slabs, place-of-supply
 * and rounding policy depend on employer type, state and filing category, and
 * the product has not specified them. Inventing them would silently produce
 * wrong numbers on real documents. See `docs/FINANCIAL_VALIDATION.md`.
 */

/** A field that failed a check and blocks generation. */
export interface FinancialError {
  /** Machine-readable rule id, e.g. 'identity:gross=sum(earnings)'. */
  rule: string;
  field: string;
  message: string;
}

/** A condition worth reporting that must not block generation. */
export interface FinancialWarning {
  rule: string;
  field: string;
  message: string;
}

export interface FinancialValidationResult {
  errors: FinancialError[];
  warnings: FinancialWarning[];
  ok: boolean;
}

/**
 * Placeholder keys verified as monetary against the seeded templates in
 * prisma/seed.ts. Matching on a suffix alone misses compound names such as
 * `GrossEarnings` or `TotalDeductions`, which are money but do not end in
 * "Gross" or "Total".
 */
const MONEY_KEYS = new Set([
  'basic', 'da', 'hra', 'conveyance', 'medical', 'specialallowance',
  'grossearnings', 'gross', 'pf', 'esi', 'professionaltax', 'incometax',
  'totaldeductions', 'netpay', 'salary', 'ctc', 'oldsalary', 'newsalary',
  'oldctc', 'newctc', 'incrementamount',
  'subtotal', 'discount', 'taxamount', 'taxpercentage', 'totaltax', 'grandtotal',
  'cgst', 'sgst', 'igst', 'gst', 'gst_amount', 'vat', 'sales',
  'baseprice', 'floorrise', 'carparking', 'registrationcharges',
  'additionalcharges', 'totalcost', 'totalvalue', 'projectcost',
  'bookingamount', 'rentamount', 'priceamount', 'rent', 'deposit',
  'advance', 'balance', 'fee', 'paymentamount', 'amount',
]);

/** Suffix heuristic so user-authored templates are also covered. */
const MONEY_SUFFIX = /(amount|total|cost|price|rent|salary|ctc|gross|net|tax|subtotal|deductions|balance|advance|due|fee|earnings)$/i;

/** Values that are legitimately prose and must never be treated as numbers. */
const NON_NUMERIC_HINTS = /(date|period|name|address|email|phone|number$|no\.|ifsc|gst$|pan$|words$|subject|body|description|terms|schedule|code|id$|state|url|website|link|author|size|experience|percentage$)/i;

/** Tolerance for float comparison; amounts are stored to 2 decimal places. */
const TOLERANCE = 0.005;

/** Guards against pathological input and absurd figures. */
const MAX_AMOUNT = 1e12;

interface IdentityRule {
  id: string;
  /** The field holding the derived figure. */
  target: string;
  /** How the target is derived from the members. */
  compute: (values: Record<string, number>) => number;
  members: string[];
  describe: (expected: number, actual: number, members: Record<string, number>) => string;
}

const sum = (keys: string[]) => (v: Record<string, number>) => keys.reduce((a, k) => a + (v[k] ?? 0), 0);

/**
 * Arithmetic identities taken from the row structure of the seeded
 * templates. Each is a statement about the document's own layout.
 */
const IDENTITY_RULES: IdentityRule[] = [
  {
    id: 'identity:gross=sum(earnings)',
    target: 'GrossEarnings',
    members: ['Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'SpecialAllowance'],
    compute: sum(['Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'SpecialAllowance']),
    describe: (expected, actual, m) =>
      `Gross Earnings is ${format(expected)} but the earnings lines add up to ${format(actual)} ` +
      `(Basic ${format(m.Basic ?? 0)} + DA ${format(m.DA ?? 0)} + HRA ${format(m.HRA ?? 0)} + ` +
      `Conveyance ${format(m.Conveyance ?? 0)} + Medical ${format(m.Medical ?? 0)} + ` +
      `Special Allowance ${format(m.SpecialAllowance ?? 0)}).`,
  },
  {
    id: 'identity:deductions=sum(deductions)',
    target: 'TotalDeductions',
    members: ['PF', 'ESI', 'ProfessionalTax', 'IncomeTax'],
    compute: sum(['PF', 'ESI', 'ProfessionalTax', 'IncomeTax']),
    describe: (expected, actual, m) =>
      `Total Deductions is ${format(expected)} but the deduction lines add up to ${format(actual)} ` +
      `(PF ${format(m.PF ?? 0)} + ESI ${format(m.ESI ?? 0)} + Professional Tax ${format(m.ProfessionalTax ?? 0)} + ` +
      `Income Tax ${format(m.IncomeTax ?? 0)}).`,
  },
  {
    id: 'identity:net=gross-deductions',
    target: 'NetPay',
    members: ['GrossEarnings', 'TotalDeductions'],
    compute: (v) => (v.GrossEarnings ?? 0) - (v.TotalDeductions ?? 0),
    describe: (expected, actual) =>
      `Net Pay is ${format(actual)} but Gross Earnings minus Total Deductions is ${format(expected)}.`,
  },
  {
    id: 'identity:tax=sum(components)',
    target: 'TotalTax',
    members: ['CGST', 'SGST', 'IGST'],
    compute: sum(['CGST', 'SGST', 'IGST']),
    describe: (expected, actual) =>
      `Total Tax is ${format(expected)} but CGST + SGST + IGST is ${format(actual)}.`,
  },
  {
    id: 'identity:grandtotal=subtotal+tax',
    target: 'GrandTotal',
    members: ['Subtotal', 'TotalTax'],
    compute: (v) => (v.Subtotal ?? 0) + (v.TotalTax ?? 0),
    describe: (expected, actual) =>
      `Grand Total is ${format(actual)} but Subtotal plus Total Tax is ${format(expected)}.`,
  },
  {
    id: 'identity:grandtotal=subtotal-discount+tax',
    target: 'GrandTotal',
    members: ['Subtotal', 'Discount', 'TaxAmount'],
    compute: (v) => (v.Subtotal ?? 0) - (v.Discount ?? 0) + (v.TaxAmount ?? 0),
    describe: (expected, actual) =>
      `Grand Total is ${format(actual)} but Subtotal less Discount plus Tax is ${format(expected)}.`,
  },
  {
    id: 'identity:taxamount=percentage-of-subtotal',
    target: 'TaxAmount',
    members: ['Subtotal', 'TaxPercentage', 'Discount'],
    compute: (v) => ((v.Subtotal ?? 0) - (v.Discount ?? 0)) * ((v.TaxPercentage ?? 0) / 100),
    describe: (expected, actual) =>
      `Tax Amount is ${format(actual)} but ${format(expected)} follows from the stated subtotal and ` +
      `tax percentage.`,
  },
  {
    id: 'identity:totalcost=sum(components)',
    target: 'TotalCost',
    members: ['BasePrice', 'FloorRise', 'CarParking', 'RegistrationCharges', 'GST_Amount', 'AdditionalCharges'],
    compute: sum(['BasePrice', 'FloorRise', 'CarParking', 'RegistrationCharges', 'GST_Amount', 'AdditionalCharges']),
    describe: (expected, actual) =>
      `Total Cost is ${format(expected)} but the component lines add up to ${format(actual)}.`,
  },
];

/** Words fields that must agree with a numeric field. */
const WORDS_RULES: Array<{ words: string; amount: string; label: string }> = [
  { words: 'NetPayWords', amount: 'NetPay', label: 'Net Pay' },
  { words: 'TotalInWords', amount: 'GrandTotal', label: 'Grand Total' },
];

function format(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ValidateFinancialsInput {
  /** The user's submitted values keyed by placeholder name. */
  values: Record<string, unknown>;
  /** Declared placeholder keys for the template, when known. */
  declaredKeys?: string[];
}

function isMoneyField(key: string): boolean {
  if (NON_NUMERIC_HINTS.test(key)) return false;
  return MONEY_KEYS.has(key.toLowerCase()) || MONEY_SUFFIX.test(key);
}

/**
 * Validate the financial figures a user supplied for a document.
 *
 * Only checks that are objectively decidable are enforced. Anything that
 * cannot be decided — a blank optional field, a field expressed as prose,
 * or a rule whose members were not all supplied — is skipped rather than
 * guessed at, so the validator never blocks a document over a value it
 * simply cannot interpret.
 */
export function validateFinancials(input: ValidateFinancialsInput): FinancialValidationResult {
  const errors: FinancialError[] = [];
  const warnings: FinancialWarning[] = [];
  const { values } = input;

  const raw = (k: string): unknown => values[k];

  // ── 1. Format sanity on fields that look monetary ─────────────────────────
  for (const key of Object.keys(values)) {
    if (!isMoneyField(key)) continue;
    const v = values[key];
    if (v === undefined || v === null || v === '') continue;

    const n = parseAmount(v);
    if (n === null) {
      warnings.push({
        rule: 'format:not-a-number',
        field: key,
        message: `"${key}" is not a number (${JSON.stringify(String(v)).slice(0, 40)}); it will be printed as typed.`,
      });
      continue;
    }
    if (Math.abs(n) > MAX_AMOUNT) {
      errors.push({
        rule: 'range:too-large',
        field: key,
        message: `"${key}" (${format(n)}) exceeds the maximum supported amount of ${format(MAX_AMOUNT)}.`,
      });
    }
    if (n < 0 && /^(gross|total|net|basic|price|subtotal|cost|rent|booking)/i.test(key)) {
      errors.push({
        rule: 'range:negative',
        field: key,
        message: `"${key}" cannot be negative in a business document.`,
      });
    }
    const decimals = Math.abs(n - Math.round(n * 100) / 100);
    if (decimals > 1e-9) {
      warnings.push({
        rule: 'format:precision',
        field: key,
        message: `"${key}" has more than two decimal places; it will be printed exactly as entered.`,
      });
    }
  }

  // ── 2. Arithmetic identities declared by the template ─────────────────────
  const numeric: Record<string, number> = {};
  for (const key of Object.keys(values)) {
    const n = parseAmount(values[key]);
    if (n !== null) numeric[key] = n;
  }

  for (const rule of IDENTITY_RULES) {
    // Only evaluate when the template actually uses the target AND every
    // member. A rule whose members are absent is not applicable.
    if (raw(rule.target) === undefined || raw(rule.target) === '') continue;
    if (!rule.members.every((m) => raw(m) !== undefined && raw(m) !== '')) continue;
    // Every member must be interpretable as a number, else the check would
    // silently treat prose as zero.
    if (!rule.members.every((m) => parseAmount(raw(m)) !== null)) continue;
    if (parseAmount(raw(rule.target)) === null) continue;

    const expected = rule.compute(numeric);
    const actual = numeric[rule.target];
    if (Math.abs(expected - actual) > TOLERANCE) {
      errors.push({
        rule: rule.id,
        field: rule.target,
        message: rule.describe(expected, actual, numeric),
      });
    }
  }

  // ── 3. Amount-in-words must agree with the figure ─────────────────────────
  for (const rule of WORDS_RULES) {
    const words = raw(rule.words);
    const amountRaw = raw(rule.amount);
    if (typeof words !== 'string' || !words.trim()) continue;
    const amount = parseAmount(amountRaw);
    if (amount === null) continue;
    if (!wordsMatchAmount(words, amount)) {
      errors.push({
        rule: 'consistency:words-vs-amount',
        field: rule.words,
        message:
          `The amount in words does not match ${rule.label} of ${format(amount)}. ` +
          `${amountToIndianWords(amount)} was expected.`,
      });
    }
  }

  return { errors, warnings, ok: errors.length === 0 };
}

/** Flatten errors into a single user-facing message. */
export function describeFinancialErrors(errors: FinancialError[]): string {
  return errors.map((e) => e.message).join(' ');
}