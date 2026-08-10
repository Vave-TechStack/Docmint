import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  // ── Basic Usage ──

  it('should return an empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('should return a single class as-is', () => {
    expect(cn('text-red-500')).toBe('text-red-500');
  });

  it('should join multiple classes with a space', () => {
    expect(cn('text-red-500', 'bg-blue-100')).toBe('text-red-500 bg-blue-100');
  });

  it('should join three or more classes', () => {
    expect(cn('px-4', 'py-2', 'rounded-lg', 'font-medium')).toBe(
      'px-4 py-2 rounded-lg font-medium',
    );
  });

  // ── Conditional Classes (Object syntax) ──

  it('should include classes with truthy conditions', () => {
    expect(cn('base', { active: true })).toBe('base active');
  });

  it('should exclude classes with falsey conditions', () => {
    expect(cn('base', { hidden: false })).toBe('base');
    expect(cn('base', { hidden: null })).toBe('base');
    expect(cn('base', { hidden: undefined })).toBe('base');
    expect(cn('base', { hidden: 0 })).toBe('base');
  });

  it('should handle multiple conditional objects', () => {
    expect(cn('btn', { 'is-primary': true, 'is-disabled': false, 'is-large': true })).toBe(
      'btn is-primary is-large',
    );
  });

  it('should handle mixed string and conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('px-4', 'py-2', { 'bg-blue-500': isActive }, { 'opacity-50': isDisabled })).toBe(
      'px-4 py-2 bg-blue-500',
    );
  });

  // ── Tailwind Conflict Resolution (twMerge) ──

  it('should resolve conflicting Tailwind classes — later wins for same property', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });

  it('should resolve padding conflicts', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });

  it('should resolve margin conflicts', () => {
    expect(cn('m-2', 'm-4')).toBe('m-4');
  });

  it('should resolve color conflicts', () => {
    expect(cn('text-red-500', 'text-blue-600')).toBe('text-blue-600');
  });

  it('should resolve background color conflicts', () => {
    expect(cn('bg-red-100', 'bg-blue-200')).toBe('bg-blue-200');
  });

  it('should resolve width conflicts', () => {
    expect(cn('w-full', 'w-1/2')).toBe('w-1/2');
  });

  it('should resolve flex conflicts', () => {
    expect(cn('flex-row', 'flex-col')).toBe('flex-col');
  });

  it('should resolve border conflicts', () => {
    expect(cn('border-2', 'border-4')).toBe('border-4');
  });

  it('should resolve rounded conflicts', () => {
    expect(cn('rounded-md', 'rounded-full')).toBe('rounded-full');
  });

  it('should keep non-conflicting classes from both sides', () => {
    expect(cn('text-red-500', 'bg-blue-100', 'p-4')).toBe('text-red-500 bg-blue-100 p-4');
  });

  // ── Array Syntax ──

  it('should handle arrays of classes', () => {
    expect(cn(['text-sm', 'font-medium'])).toBe('text-sm font-medium');
  });

  it('should handle nested arrays', () => {
    expect(cn('base', ['first', ['second', 'third']])).toBe('base first second third');
  });

  it('should handle arrays with conditionals', () => {
    const items = ['item-1', 'item-2'];
    expect(cn('list', items)).toBe('list item-1 item-2');
  });

  // ── Mixed Syntax ──

  it('should handle strings, objects, and arrays together', () => {
    expect(
      cn(
        'flex',
        { 'items-center': true, 'justify-center': true },
        ['gap-2', 'p-4'],
        { 'bg-gray-100': false },
      ),
    ).toBe('flex items-center justify-center gap-2 p-4');
  });

  // ── Falsey Values ──

  it('should filter out null values', () => {
    expect(cn('text-sm', null, 'font-medium')).toBe('text-sm font-medium');
  });

  it('should filter out undefined values', () => {
    expect(cn('text-sm', undefined, 'font-medium')).toBe('text-sm font-medium');
  });

  it('should filter out false values', () => {
    expect(cn('text-sm', false, 'font-medium')).toBe('text-sm font-medium');
  });

  it('should filter out false, null, undefined, 0, and empty string', () => {
    // clsx filters out 0 as a direct argument (along with other falsey values)
    expect(cn('base', null, undefined, false, 0, '', 'valid')).toBe('base valid');
  });

  // ── Common Tailwind Patterns ──

  it('should merge common button classes correctly', () => {
    expect(cn(
      'inline-flex items-center justify-center rounded-md text-sm font-medium',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'bg-primary text-primary-foreground hover:bg-primary/90',
      'h-10 px-4 py-2',
      'h-9 px-3', // override only h-* and px-*, py-* stays since no conflict
    )).toBe(
      'inline-flex items-center justify-center rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 py-2 h-9 px-3',
    );
  });

  it('should merge card classes correctly', () => {
    expect(cn(
      'rounded-xl border bg-card text-card-foreground shadow-sm',
      'p-6',
      'p-4', // override
    )).toBe('rounded-xl border bg-card text-card-foreground shadow-sm p-4');
  });

  it('should merge input classes correctly', () => {
    expect(cn(
      'flex h-10 w-full rounded-md border border-input',
      'bg-background px-3 py-2 text-sm',
      'ring-offset-background file:border-0 file:bg-transparent',
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'h-9', // override h-10 — twMerge places survivor at the override's position
    )).toBe(
      'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-9',
    );
  });

  // ── Edge Cases ──

  it('should handle variant-based class overrides', () => {
    const variant: string = 'destructive';
    expect(cn(
      'bg-primary text-primary-foreground hover:bg-primary/90',
      variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      variant === 'outline' && 'border border-input bg-background',
    )).toBe('bg-destructive text-destructive-foreground hover:bg-destructive/90');
  });

  it('should handle size-based class overrides', () => {
    const size: string = 'sm';
    expect(cn(
      'h-10 px-4 py-2',
      size === 'sm' && 'h-9 rounded-md px-3',
      size === 'lg' && 'h-11 rounded-md px-8',
    )).toBe('py-2 h-9 rounded-md px-3');
  });

  it('should handle complex state-driven classes', () => {
    const state = { loading: true, error: false, success: true };
    expect(cn(
      'btn',
      { 'opacity-50 pointer-events-none': state.loading },
      { 'border-red-500': state.error },
      { 'border-green-500': state.success },
    )).toBe('btn opacity-50 pointer-events-none border-green-500');
  });

  it('should handle empty string in array', () => {
    expect(cn(['', 'valid'])).toBe('valid');
  });

  it('should handle class with arbitrary values', () => {
    expect(cn('w-[200px]', 'h-[100px]')).toBe('w-[200px] h-[100px]');
  });

  it('should handle Tailwind arbitrary value conflicts', () => {
    expect(cn('w-[200px]', 'w-[300px]')).toBe('w-[300px]');
  });
});
