import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  isAmount,
  formatIndianAmount,
  formatIndianDisplay,
  amountToIndianWords,
  wordsMatchAmount,
} from './amounts';
import { validateFinancials, describeFinancialErrors } from './validation';

/**
 * These tests exist because the audit found the generation pipeline echoing
 * whatever the user typed: a payslip whose earnings did not add up to its
 * stated gross was produced without complaint.
 */

describe('parseAmount', () => {
  it('parses the shapes people type into business forms', () => {
    expect(parseAmount('45,000')).toBe(45000);
    expect(parseAmount('₹ 45,000')).toBe(45000);
    expect(parseAmount('Rs. 45000')).toBe(45000);
    expect(parseAmount('INR 45000')).toBe(45000);
    expect(parseAmount('45000')).toBe(45000);
    expect(parseAmount('45,000.50')).toBe(45000.5);
    expect(parseAmount('45 000')).toBe(45000);
    expect(parseAmount('  45000  ')).toBe(45000);
  });

  it('parses Indian digit grouping', () => {
    expect(parseAmount('1,00,000')).toBe(100000);
    expect(parseAmount('12,34,567')).toBe(1234567);
    expect(parseAmount('₹1,00,000.75')).toBe(100000.75);
  });

  it('parses negatives including accounting parentheses', () => {
    expect(parseAmount('-1200')).toBe(-1200);
    expect(parseAmount('(1,200)')).toBe(-1200);
    expect(parseAmount('₹ (1,200.50)')).toBe(-1200.5);
  });

  it('returns null for prose and blanks rather than coercing to zero', () => {
    // Coercing a blank or prose to 0 would let an incomplete document pass
    // a consistency check, which is worse than skipping the check.
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('As per contract')).toBeNull();
    expect(parseAmount('12abc')).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount({})).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
  });

  it('rejects malformed numbers', () => {
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount('1,2,3,4.5.6')).toBeNull();
    expect(parseAmount('12 34 56')).toBe(123456);
  });

  it('accepts a finite number directly', () => {
    expect(parseAmount(1234.5)).toBe(1234.5);
    expect(isAmount('x')).toBe(false);
    expect(isAmount('1,000')).toBe(true);
  });
});

describe('Indian formatting', () => {
  it('groups digits the Indian way', () => {
    expect(formatIndianAmount(100000, 0)).toBe('1,00,000');
    expect(formatIndianAmount(12345678, 0)).toBe('1,23,45,678');
    expect(formatIndianAmount(45000, 2)).toBe('45,000.00');
    expect(formatIndianAmount(-1200, 0)).toBe('-1,200');
  });

  it('drops trailing zeros for display', () => {
    expect(formatIndianDisplay(45000)).toBe('45,000');
    expect(formatIndianDisplay(45000.5)).toBe('45,000.50');
  });
});

describe('amountToIndianWords', () => {
  it('spells amounts using lakh and crore', () => {
    expect(amountToIndianWords(45)).toBe('forty-five rupees only');
    expect(amountToIndianWords(100)).toBe('one hundred rupees only');
    expect(amountToIndianWords(100000)).toBe('one lakh rupees only');
    expect(amountToIndianWords(123456)).toBe(
      'one lakh twenty-three thousand four hundred fifty-six rupees only'
    );
    expect(amountToIndianWords(10000000)).toBe('one crore rupees only');
    expect(amountToIndianWords(12345678)).toBe(
      'one crore twenty-three lakh forty-five thousand six hundred seventy-eight rupees only'
    );
  });

  it('handles decimals and zero', () => {
    expect(amountToIndianWords(0)).toBe('zero rupees only');
    expect(amountToIndianWords(123456.78)).toBe(
      'one lakh twenty-three thousand four hundred fifty-six rupees and seventy-eight paise only'
    );
    expect(amountToIndianWords(1)).toBe('one rupee only');
  });
});

describe('wordsMatchAmount', () => {
  it('matches regardless of filler words the template may omit', () => {
    expect(wordsMatchAmount('Sixty-Five Thousand One Hundred Thirty-Six Only', 65136)).toBe(true);
    expect(wordsMatchAmount('sixty five thousand one hundred thirty six only', 65136)).toBe(true);
    expect(wordsMatchAmount('Sixty-Five Thousand One Hundred Thirty-Six Rupees Only', 65136)).toBe(true);
  });

  it('rejects words that contradict the figure', () => {
    // This is the integrity failure the audit found: prose disagreeing with
    // the number printed beside it.
    expect(wordsMatchAmount('Sixty-Five Thousand One Hundred Only', 65136)).toBe(false);
    expect(wordsMatchAmount('Seventy Thousand Only', 65136)).toBe(false);
  });

  it('rejects prose that contains no number at all', () => {
    expect(wordsMatchAmount('not a number', 65136)).toBe(false);
    expect(wordsMatchAmount('', 65136)).toBe(false);
  });
});

describe('validateFinancials — payslip arithmetic identities', () => {
  const consistentPayslip = {
    Basic: '45,000',
    DA: '8,000',
    HRA: '18,000',
    Conveyance: '1,600',
    Medical: '1,250',
    SpecialAllowance: '6,150',
    GrossEarnings: '80,000',
    PF: '5,400',
    ESI: '1,264',
    ProfessionalTax: '200',
    IncomeTax: '8,000',
    TotalDeductions: '14,864',
    NetPay: '65,136',
    NetPayWords: 'Sixty-Five Thousand One Hundred Thirty-Six Only',
  };

  it('accepts a payslip whose figures add up', () => {
    const r = validateFinancials({ values: consistentPayslip });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects a gross that does not equal the sum of the earnings lines', () => {
    // The exact case from the audit: 45,000 + 18,000 against a stated 80,000.
    const r = validateFinancials({
      values: { ...consistentPayslip, GrossEarnings: '99,999' },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.rule)).toContain('identity:gross=sum(earnings)');
    expect(describeFinancialErrors(r.errors)).toMatch(/earnings lines add up/i);
  });

  it('rejects deductions that do not equal the sum of the deduction lines', () => {
    const r = validateFinancials({
      values: { ...consistentPayslip, TotalDeductions: '1' },
    });
    expect(r.errors.map((e) => e.rule)).toContain('identity:deductions=sum(deductions)');
  });

  it('rejects a net pay that is not gross minus deductions', () => {
    const r = validateFinancials({
      values: { ...consistentPayslip, NetPay: '74,600' },
    });
    expect(r.errors.map((e) => e.rule)).toContain('identity:net=gross-deductions');
  });

  it('rejects amount-in-words that contradicts net pay', () => {
    const r = validateFinancials({
      values: { ...consistentPayslip, NetPayWords: 'Eighty Thousand Only' },
    });
    expect(r.errors.map((e) => e.rule)).toContain('consistency:words-vs-amount');
  });

  it('accepts a blank optional earning as zero', () => {
    const r = validateFinancials({
      values: { ...consistentPayslip, Conveyance: '', Medical: '' },
    });
    expect(r.errors).toEqual([]);
  });

  it('rejects a negative gross or net', () => {
    expect(validateFinancials({ values: { ...consistentPayslip, GrossEarnings: '-1' } }).errors.map((e) => e.rule))
      .toContain('range:negative');
  });

  it('rejects an absurdly large amount', () => {
    const r = validateFinancials({ values: { ...consistentPayslip, Basic: '9,99,99,99,99,99,999' } });
    expect(r.errors.map((e) => e.rule)).toContain('range:too-large');
  });

  it('warns without blocking when a money field holds prose', () => {
    const r = validateFinancials({
      values: { ...consistentPayslip, Basic: 'As per contract' },
    });
    // The identity cannot be evaluated, so it must not be reported as wrong.
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.rule)).toContain('format:not-a-number');
  });

  it('does not evaluate a rule whose members are missing', () => {
    const r = validateFinancials({ values: { GrossEarnings: '80,000', NetPay: '65,136' } });
    expect(r.errors).toEqual([]);
  });

  it('does not treat non-monetary fields as amounts', () => {
    const r = validateFinancials({
      values: { EmployeeName: 'Rahul Sharma', PAN: 'ABCDE1234F', GST: '29ABCDE1234F1Z5', PayDate: '31-Jul-2026' },
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.rule === 'format:not-a-number')).toEqual([]);
  });
});

describe('validateFinancials — GST invoice identities', () => {
  const invoice = {
    Subtotal: '70,000',
    CGST: '6,300',
    SGST: '6,300',
    IGST: '0',
    TotalTax: '12,600',
    GrandTotal: '82,600',
    TotalInWords: 'Eighty-Two Thousand Six Hundred Rupees Only',
  };

  it('accepts a consistent invoice', () => {
    const r = validateFinancials({ values: invoice });
    expect(r.errors).toEqual([]);
  });

  it('rejects a total tax that is not the sum of CGST, SGST and IGST', () => {
    const r = validateFinancials({ values: { ...invoice, TotalTax: '99' } });
    expect(r.errors.map((e) => e.rule)).toContain('identity:tax=sum(components)');
  });

  it('rejects a grand total that is not subtotal plus tax', () => {
    const r = validateFinancials({ values: { ...invoice, GrandTotal: '1,00,000' } });
    expect(r.errors.map((e) => e.rule)).toContain('identity:grandtotal=subtotal+tax');
  });

  it('rejects amount-in-words that contradicts the grand total', () => {
    const r = validateFinancials({
      values: { ...invoice, TotalInWords: 'Seventy Thousand Rupees Only' },
    });
    expect(r.errors.map((e) => e.rule)).toContain('consistency:words-vs-amount');
  });
});

describe('validateFinancials — quotation identities', () => {
  it('rejects a grand total that ignores the stated tax percentage', () => {
    const r = validateFinancials({
      values: {
        Subtotal: '100,000',
        Discount: '0',
        TaxPercentage: '18',
        TaxAmount: '1,000',
        GrandTotal: '101,000',
      },
    });
    expect(r.errors.map((e) => e.rule)).toContain('identity:taxamount=percentage-of-subtotal');
  });

  it('accepts a quotation that applies discount then tax correctly', () => {
    const r = validateFinancials({
      values: {
        Subtotal: '100,000',
        Discount: '10,000',
        TaxPercentage: '18',
        TaxAmount: '16,200',
        GrandTotal: '106,200',
      },
    });
    expect(r.errors).toEqual([]);
  });
});

describe('validateFinancials — property quotation identity', () => {
  it('rejects a total cost that omits a component line', () => {
    const r = validateFinancials({
      values: {
        BasePrice: '50,00,000',
        FloorRise: '5,00,000',
        CarParking: '3,00,000',
        RegistrationCharges: '3,00,000',
        GST_Amount: '0',
        AdditionalCharges: '0',
        TotalCost: '50,00,000',
      },
    });
    expect(r.errors.map((e) => e.rule)).toContain('identity:totalcost=sum(components)');
  });
});

describe('validateFinancials — does not invent statutory rules', () => {
  it('accepts any PF/ESI/tax figures that are internally consistent', () => {
    // Rates depend on employer type and jurisdiction, which the product has
    // not specified. The validator must not second-guess the amounts, only
    // the arithmetic.
    const r = validateFinancials({
      values: {
        Basic: '10,000',
        DA: '0',
        HRA: '0',
        Conveyance: '0',
        Medical: '0',
        SpecialAllowance: '0',
        GrossEarnings: '10,000',
        PF: '1',          // implausibly low, but not this module's business
        ESI: '0',
        ProfessionalTax: '200',
        IncomeTax: '0',
        TotalDeductions: '201',
        NetPay: '9,799',
      },
    });
    expect(r.errors).toEqual([]);
  });
});