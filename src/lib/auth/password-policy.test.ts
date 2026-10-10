import { describe, expect, it } from 'vitest';
import {
  exceedsBcryptPasswordLimit,
  MAX_PASSWORD_BYTES,
  passwordValidationError,
} from './password-policy';

describe('bcrypt password policy', () => {
  it('accepts normal ASCII credentials and rejects fewer than eight characters', () => {
    expect(passwordValidationError('password')).toBeNull();
    expect(passwordValidationError('short')).toMatch(/at least 8 characters/);
  });

  it('accepts exactly 72 ASCII bytes and rejects 73', () => {
    expect(new TextEncoder().encode('a'.repeat(MAX_PASSWORD_BYTES)).byteLength).toBe(72);
    expect(passwordValidationError('a'.repeat(72))).toBeNull();
    expect(passwordValidationError('a'.repeat(73))).toMatch(/72 UTF-8 bytes/);
  });

  it('measures multibyte Unicode in UTF-8 bytes', () => {
    const withinLimit = '😀'.repeat(18);
    const overLimit = '😀'.repeat(19);

    expect(new TextEncoder().encode(withinLimit).byteLength).toBe(72);
    expect(passwordValidationError(withinLimit)).toBeNull();
    expect(exceedsBcryptPasswordLimit(withinLimit)).toBe(false);
    expect(new TextEncoder().encode(overLimit).byteLength).toBe(76);
    expect(passwordValidationError(overLimit)).toMatch(/72 UTF-8 bytes/);
    expect(exceedsBcryptPasswordLimit(overLimit)).toBe(true);
  });
});
