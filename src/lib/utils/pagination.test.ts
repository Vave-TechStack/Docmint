import { describe, it, expect } from 'vitest';
import { computePagination, computePageInfo } from './pagination';
import type { PaginationBlock } from './pagination';

const budget = 1000;
const text = (height: number): PaginationBlock => ({ height, isBreak: false, auto: false });
const autoBreak = (): PaginationBlock => ({ height: 0, isBreak: true, auto: true });
const manualBreak = (): PaginationBlock => ({ height: 0, isBreak: true, auto: false });

describe('computePagination — insertion', () => {
  it('does nothing when content fits a page', () => {
    const result = computePagination([text(300), text(400), text(200)], budget);
    expect(result.insertBeforeIndex).toBeNull();
    expect(result.removableBreakIndices).toEqual([]);
  });

  it('inserts a break before the first overflowing block', () => {
    const result = computePagination([text(500), text(400), text(300), text(100)], budget);
    // 500+400 = 900 fits; +300 overflows → break before index 2
    expect(result.insertBeforeIndex).toBe(2);
  });

  it('does not insert a second break right after an existing break', () => {
    const result = computePagination([text(500), text(500), autoBreak(), text(600), text(600)], budget);
    // page 1 = 1000 exactly; page 2 = 600+600 overflow → break before index 4
    expect(result.insertBeforeIndex).toBe(4);
  });

  it('breaks before a block that overflows mid-page', () => {
    const result = computePagination([text(500), text(2000), text(200)], budget);
    // 500 fits; the 2000px block overflows mid-page → break before it (index 1)
    expect(result.insertBeforeIndex).toBe(1);
  });

  it('skips a first-on-page block taller than the page, breaks before the next block', () => {
    const result = computePagination([text(2000), text(300)], budget);
    // 2000 alone exceeds the budget and sits at y=0 → can't be split, consume it
    // and break before the NEXT block
    expect(result.insertBeforeIndex).toBe(1);
  });
});

describe('computePagination — removal', () => {
  it('removes an auto break when both chunks now fit one page', () => {
    const result = computePagination([text(300), text(200), autoBreak(), text(400)], budget);
    // 500 + 400 = 900 <= 1000 → break redundant
    expect(result.removableBreakIndices).toEqual([2]);
  });

  it('keeps an auto break when the chunks still need two pages', () => {
    const result = computePagination([text(700), autoBreak(), text(400)], budget);
    // 700 + 400 = 1100 > 1000 → keep
    expect(result.removableBreakIndices).toEqual([]);
  });

  it('never removes manual breaks', () => {
    const result = computePagination([text(300), manualBreak(), text(200)], budget);
    expect(result.removableBreakIndices).toEqual([]);
  });

  it('removes only the redundant break among several', () => {
    const result = computePagination(
      [text(700), autoBreak(), text(200), autoBreak(), text(100)],
      budget
    );
    // chunk1(700)+chunk2(200)=900<=1000 → break@1 removable; chunk2(200)+chunk3(100) also fits
    expect(result.removableBreakIndices).toEqual([1, 3]);
  });
});

describe('computePageInfo', () => {
  it('reports page 1 of 1 with no breaks', () => {
    expect(computePageInfo([], 50)).toEqual({ current: 1, total: 1 });
  });

  it('counts pages as breaks + 1', () => {
    expect(computePageInfo([100, 200], 50).total).toBe(3);
  });

  it('places the cursor on the correct page before/after a break', () => {
    // Break at 100: cursor at 50 → page 1; at 100 (just after) → page 2
    expect(computePageInfo([100], 50).current).toBe(1);
    expect(computePageInfo([100], 101).current).toBe(2);
  });

  it('handles multiple breaks and a cursor on the last page', () => {
    expect(computePageInfo([50, 150, 250], 300)).toEqual({ current: 4, total: 4 });
  });

  it('places the cursor mid-document between two breaks', () => {
    expect(computePageInfo([50, 150, 250], 200)).toEqual({ current: 3, total: 4 });
  });

  it('clamps the current page into range', () => {
    // Cursor before the first break should still be page 1
    expect(computePageInfo([10, 20], 0)).toEqual({ current: 1, total: 3 });
  });
});

describe('computePagination — combined', () => {
  it('handles insertion and removal in the same pass', () => {
    const result = computePagination(
      [text(200), text(200), autoBreak(), text(200), manualBreak(), text(700), text(400)],
      budget
    );
    // walk: 200+200=400, break, 200, manual break, 700 → 1100 overflow at index 6
    // removal: autoBreak@2 prev=400 next=200 → 600<=1000 → redundant
    expect(result.insertBeforeIndex).toBe(6);
    expect(result.removableBreakIndices).toEqual([2]);
  });
});
