/**
 * Pure pagination algorithm for the document editor.
 *
 * The editor renders its content as a flow of top-level blocks. When the
 * accumulated block heights exceed one page budget, a page break must be
 * inserted before the overflowing block so a new page starts automatically.
 * Auto-inserted breaks that are no longer needed (content shrank so the two
 * chunks around a break fit on one page) are removed again — manual breaks are
 * never touched.
 */

export interface PaginationBlock {
  /** Rendered height of the block (px, offsetHeight). */
  height: number;
  /** True when the block is a page-break element. */
  isBreak: boolean;
  /** True when the break was auto-inserted (data-auto="true"). Manual breaks are respected. */
  auto: boolean;
}

export interface PaginationResult {
  /** Index of the block a page break must be inserted before, or null. */
  insertBeforeIndex: number | null;
  /** Indices of auto-inserted breaks that should be removed. */
  removableBreakIndices: number[];
}

export interface PageInfo {
  /** 1-based current page the cursor is on. */
  current: number;
  /** Total number of pages (breaks + 1). */
  total: number;
}

/**
 * Determine the current page from the document's page-break positions and
 * the cursor (selection) position, plus the total page count.
 *
 * Pages are delimited by page breaks: with N breaks there are N+1 pages. The
 * cursor sits on page K when exactly K-1 breaks come before it. A break at
 * position `pos` counts as "before the cursor" when the cursor is strictly
 * after it (breaks are atom leaf nodes, so the cursor can never land inside
 * one). `breakPositions` must be sorted ascending (ProseMirror's descendants
 * walk yields document order).
 */
export function computePageInfo(breakPositions: number[], cursorPos: number): PageInfo {
  const total = breakPositions.length + 1;
  let current = 1;
  for (const pos of breakPositions) {
    if (pos < cursorPos) current += 1;
  }
  // Safety: the cursor can never be before the first position, but clamp anyway.
  return { current: Math.min(Math.max(current, 1), total), total };
}

export function computePagination(
  blocks: PaginationBlock[],
  budget: number
): PaginationResult {
  // ── Pass 1: first block that overflows the page budget ──
  let y = 0;
  let insertBeforeIndex: number | null = null;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.isBreak) {
      y = 0;
      continue;
    }
    if (y + block.height > budget) {
      // A single block taller than a full page can't be split — mark the page
      // full and let the NEXT block start a new page.
      if (y === 0 && block.height > budget) {
        y = block.height;
        continue;
      }
      insertBeforeIndex = i;
      break;
    }
    y += block.height;
  }

  // ── Pass 2: drop auto breaks whose neighbouring chunks now fit one page ──
  const removableBreakIndices: number[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block.isBreak || !block.auto) continue;

    let prevHeight = 0;
    for (let j = i - 1; j >= 0 && !blocks[j].isBreak; j -= 1) {
      prevHeight += blocks[j].height;
    }
    let nextHeight = 0;
    for (let j = i + 1; j < blocks.length && !blocks[j].isBreak; j += 1) {
      nextHeight += blocks[j].height;
    }
    if (prevHeight + nextHeight <= budget) {
      removableBreakIndices.push(i);
    }
  }

  return { insertBeforeIndex, removableBreakIndices };
}
