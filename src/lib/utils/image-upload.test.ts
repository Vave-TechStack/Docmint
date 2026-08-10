import { describe, it, expect } from 'vitest';
import {
  isImageFieldKey,
  validateImageVariables,
  validateVariableDefaultImages,
} from './image-upload';

// Tiny 1x1 PNG — well under the 5MB limit.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('isImageFieldKey', () => {
  it('accepts logo / signature / seal / stamp / header / photo / image fields', () => {
    expect(isImageFieldKey('CompanyLogo')).toBe(true);
    expect(isImageFieldKey('HRSignature')).toBe(true);
    expect(isImageFieldKey('AuthorizedSign')).toBe(true);
    expect(isImageFieldKey('CompanySeal')).toBe(true);
    expect(isImageFieldKey('CompanyStamp')).toBe(true);
    expect(isImageFieldKey('HeaderText')).toBe(true);
    expect(isImageFieldKey('EmployeePhoto')).toBe(true);
    expect(isImageFieldKey('HeroImage')).toBe(true);
    expect(isImageFieldKey('BannerImageUrl')).toBe(true);
  });

  it('rejects text fields — "sign" must not match Designation / AssignedTo', () => {
    expect(isImageFieldKey('Designation')).toBe(false);
    expect(isImageFieldKey('SupervisorDesignation')).toBe(false);
    expect(isImageFieldKey('AssignedTo')).toBe(false);
    expect(isImageFieldKey('EmployeeName')).toBe(false);
    expect(isImageFieldKey('Salary')).toBe(false);
    expect(isImageFieldKey('CompanyAddress')).toBe(false);
    expect(isImageFieldKey('BankAccount')).toBe(false);
    expect(isImageFieldKey('GrossEarnings')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isImageFieldKey('companylogo')).toBe(true);
    expect(isImageFieldKey('DESIGNATION')).toBe(false);
  });
});

describe('validateImageVariables (key-aware)', () => {
  it('allows image data URLs on image-eligible keys', () => {
    expect(validateImageVariables({ CompanyLogo: TINY_PNG })).toBeNull();
    expect(validateImageVariables({ HRSignature: TINY_PNG, EmployeeName: 'Ravi' })).toBeNull();
  });

  it('rejects image data URLs on non-image fields', () => {
    const error = validateImageVariables({ Designation: TINY_PNG });
    expect(error).toMatch(/only allowed for logo, signature, seal, stamp and header/);
  });

  it('lets plain text pass through on any key', () => {
    expect(validateImageVariables({ Designation: 'Software Engineer' })).toBeNull();
    expect(validateImageVariables({ Salary: '50000', Note: 'hello' })).toBeNull();
  });

  it('still enforces the size limit', () => {
    const huge = `data:image/png;base64,${'A'.repeat(8 * 1024 * 1024)}`;
    expect(validateImageVariables({ CompanyLogo: huge })).toMatch(/under .*MB/);
  });
});

describe('validateVariableDefaultImages (key-aware)', () => {
  it('allows image defaults on image-eligible variables', () => {
    expect(
      validateVariableDefaultImages([{ key: 'CompanyLogo', type: 'image', defaultValue: TINY_PNG }])
    ).toBeNull();
  });

  it('rejects image defaults on non-image variables', () => {
    const error = validateVariableDefaultImages([
      { key: 'Designation', type: 'text', defaultValue: TINY_PNG },
    ]);
    expect(error).toMatch(/only allowed for logo, signature, seal, stamp and header/);
  });

  it('ignores non-image defaults', () => {
    expect(
      validateVariableDefaultImages([{ key: 'Designation', defaultValue: 'Engineer' }])
    ).toBeNull();
  });
});
