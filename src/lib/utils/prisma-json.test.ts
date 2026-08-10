import { describe, it, expect } from 'vitest';
import { toJson } from './prisma-json';

describe('toJson', () => {
  it('should cast a string value', () => {
    const result = toJson('hello');
    expect(result).toBe('hello');
  });

  it('should cast a number value', () => {
    const result = toJson(42);
    expect(result).toBe(42);
  });

  it('should cast a boolean value', () => {
    expect(toJson(true)).toBe(true);
    expect(toJson(false)).toBe(false);
  });

  it('should cast a null value', () => {
    expect(toJson(null)).toBeNull();
  });

  it('should cast a plain object', () => {
    const obj = { name: 'Acme Corp', employees: 150 };
    const result = toJson(obj);
    expect(result).toEqual(obj);
  });

  it('should cast a nested object', () => {
    const obj = { company: { name: 'Acme', address: { city: 'Bangalore' } } };
    const result = toJson(obj);
    expect(result).toEqual(obj);
  });

  it('should cast an array', () => {
    const arr = [1, 2, 3];
    expect(toJson(arr)).toEqual(arr);
  });

  it('should cast an array of objects', () => {
    const items = [{ id: 1, name: 'Item A' }, { id: 2, name: 'Item B' }];
    expect(toJson(items)).toEqual(items);
  });

  it('should cast a mixed nested structure', () => {
    const data = {
      title: 'Invoice',
      amount: 1500,
      paid: true,
      tags: ['urgent', 'q1-2024'],
      metadata: {
        createdBy: 'admin',
        version: 2,
      },
    };
    expect(toJson(data)).toEqual(data);
  });

  it('should cast undefined', () => {
    expect(toJson(undefined)).toBeUndefined();
  });

  it('should cast an empty object', () => {
    expect(toJson({})).toEqual({});
  });

  it('should cast an empty array', () => {
    expect(toJson([])).toEqual([]);
  });

  it('should cast a date object (type-wise, passes through unchanged)', () => {
    const date = new Date('2024-01-15');
    const result = toJson(date);
    expect(result).toBe(date);
  });

  it('should return the same reference for objects', () => {
    const obj = { key: 'value' };
    const result = toJson(obj);
    // toJson is a simple cast — it returns the same reference
    expect(result).toBe(obj);
  });
});
