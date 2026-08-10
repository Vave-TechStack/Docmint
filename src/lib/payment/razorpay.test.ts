import { describe, it, expect } from 'vitest';
import { PaymentService } from './razorpay';
import { INSTANT_DOWNLOAD_PRICE } from '@/lib/utils/constants';

describe('PaymentService.resolveInstantAmount', () => {
  it('enforces a floor of at least 900 paise (₹9) for any client-supplied amount', () => {
    expect(PaymentService.resolveInstantAmount(1)).toBe(900); // ₹0.01
    expect(PaymentService.resolveInstantAmount(0)).toBe(900);
    expect(PaymentService.resolveInstantAmount(-50)).toBe(900);
    expect(PaymentService.resolveInstantAmount(899)).toBe(900); // just below ₹9
    expect(PaymentService.resolveInstantAmount(Number.NaN)).toBe(900);
    // A tampered client could send a numeric string from the JSON body
    expect(PaymentService.resolveInstantAmount('0' as unknown as number)).toBe(900);
  });

  it('falls back to the published price (INR → paise) when no amount is supplied', () => {
    expect(PaymentService.resolveInstantAmount(undefined)).toBe(INSTANT_DOWNLOAD_PRICE * 100);
    expect(PaymentService.resolveInstantAmount(null as unknown as number)).toBe(
      INSTANT_DOWNLOAD_PRICE * 100
    );
  });

  it('passes through amounts at or above the minimum unchanged', () => {
    expect(PaymentService.resolveInstantAmount(900)).toBe(900);
    expect(PaymentService.resolveInstantAmount(5000)).toBe(5000);
  });

  it('keeps the minimum in sync with the published price constant', () => {
    expect(PaymentService.MIN_INSTANT_AMOUNT).toBe(INSTANT_DOWNLOAD_PRICE * 100);
  });
});
