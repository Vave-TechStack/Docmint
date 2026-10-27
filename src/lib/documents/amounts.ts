/**
 * Indian currency parsing, formatting and number-to-words.
 *
 * SCOPE
 * -----
 * These helpers only convert between *representations* of a number. They
 * deliberately contain no payroll, tax or jurisdiction rules — those depend
 * on employer type, place of supply and slab tables that the product has not
 * specified. See `docs/FINANCIAL_VALIDATION.md` for what is validated and
 * what is explicitly left to a business decision.
 */

/**
 * Parse a user-entered monetary value into a number.
 *
 * Accepts the shapes people actually type into a business form:
 *   "45,000"  "₹ 45,000"  "Rs. 45000"  "1,00,000"  "45,000.50"
 *   "45000"   "(1,200)"   "-1200"       "45 000"    "₹1,00,000.75"
 *
 * Returns null when the value is not a number — including the empty string
 * and ordinary prose ("As per contract"). Callers must treat null as
 * "unverifiable", never as zero: silently reading a blank as 0 would let an
 * incomplete document pass a consistency check.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  let s = raw.trim();
  if (!s) return null;

// Strip leading/trailing currency symbols and codes first, so a value
  // like "₹ (1,200.50)" still reaches the accounting-negatives check.
  s = s.replace(/^(?:rs\.?|inr|₹)\s*/i, '');
  s = s.replace(/\s*(?:rs\.?|inr|₹|only|-?)$/i, '');

  // Accounting negatives: (1,200) means -1200.
  let negative = false;
  const paren = /^\((.*)\)$/.exec(s.trim());
  if (paren) {
    negative = true;
    s = paren[1].trim();
  }

  s = s.replace(/[\s   ]/g, '');

  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/^\+/, '');

  // Only digits, grouping separators and at most one decimal point.
  if (!/^\d{1,3}(?:[,\d]*)(?:\.\d+)?$/.test(s) && !/^\d+(?:\.\d+)?$/.test(s)) {
    return null;
  }
  const cleaned = s.replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** True when the value is a parseable monetary figure. */
export function isAmount(raw: unknown): boolean {
  return parseAmount(raw) !== null;
}

/**
 * Apply Indian digit grouping: the last three digits, then a pair every two
 * digits. 12345678 -> 1,23,45,678 (not the Western 12,345,678).
 */
function indianGroup(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${last3}`;
}

/**
 * Format a number using the Indian digit grouping (1,00,000 rather than
 * 100,000). Non-finite input returns an empty string rather than "NaN".
 */
export function formatIndianAmount(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [wholeRaw, frac] = fixed.split('.');
  return `${negative ? '-' : ''}${indianGroup(wholeRaw)}${frac ? `.${frac}` : ''}`;
}

/**
 * Format for display inside a document: grouping, no forced decimals, and a
 * negative sign rather than accounting parentheses.
 */
export function formatIndianDisplay(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value)
    ? formatIndianAmount(value, 0)
    : formatIndianAmount(value, 2);
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t}-${o}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(twoDigits(r));
  return parts.join(' ');
}

/**
 * Spell an amount in the Indian numbering system (lakh / crore), which is
 * what Indian invoice and payslip templates expect in a "Total in words"
 * field.
 *
 * Handles integers and two-decimal amounts, e.g. 1,23,456.78 →
 * "one lakh twenty-three thousand four hundred fifty-six rupees and seventy-eight paise only".
 */
export function amountToIndianWords(value: number): string {
  if (!Number.isFinite(value)) return '';

  const negative = value < 0;
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 100) / 100;
  const whole = Math.floor(rounded);
  const paise = Math.round((rounded - whole) * 100);

  if (whole === 0 && paise === 0) {
    return `${negative ? 'minus ' : ''}zero rupees only`;
  }

  // Indian grouping: crore = 10^7, lakh = 10^5, thousand = 10^3.
  const CRORE = 10_000_000;
  const LAKH = 100_000;
  const THOUSAND = 1_000;

  const crore = Math.floor(whole / CRORE);
  const afterCrore = whole % CRORE;
  const lakh = Math.floor(afterCrore / LAKH);
  const afterLakh = afterCrore % LAKH;
  const thousand = Math.floor(afterLakh / THOUSAND);
  const remainder = afterLakh % THOUSAND;

  const parts: string[] = [];
  if (negative) parts.push('minus');
  if (crore) parts.push(`${threeDigits(crore)} crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} thousand`);
  if (remainder) parts.push(threeDigits(remainder));

  let out = parts.join(' ').trim();
  const rupeeWord = whole === 1 && paise === 0 ? 'rupee' : 'rupees';
  out += ` ${rupeeWord}`;
  if (paise) out += ` and ${twoDigits(paise)} paise`;
  return `${out} only`;
}

/** Filler words that carry no numeric meaning and may legitimately be omitted. */
const WORDS_FILLER = new Set(['rupees', 'rupee', 'rs', 'only', 'and', 'paise', 'paisa', 'wonly', 'inr']);

/**
 * Reduce an amount-in-words phrase to just its numeric tokens, so
 * "Sixty-Five Thousand Only" and "sixty-five thousand rupees only" compare
 * equal. Templates are inconsistent about filler, and that is a formatting
 * difference, not a contradiction.
 */
function numericTokens(phrase: string): string {
  return phrase
    .toLowerCase()
    // Hyphens separate words ("sixty-five"), so they must become spaces
    // rather than vanish, or "sixty five" and "sixty-five" would differ.
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !WORDS_FILLER.has(t))
    .join(' ');
}

/**
 * Compare a numeric amount against an "amount in words" string.
 *
 * Returns true only when the words spell the same value. This catches a
 * document whose prose contradicts its own figures — an integrity problem,
 * not a formatting preference.
 *
 * Returns false when the words contain no recognisable number at all; a
 * caller that wants to treat that as "unverifiable" should check separately.
 */
export function wordsMatchAmount(words: string, amount: number): boolean {
  if (!words || !Number.isFinite(amount)) return false;
  const spoken = numericTokens(words);
  if (!spoken) return false;
  return numericTokens(amountToIndianWords(amount)) === spoken;
}