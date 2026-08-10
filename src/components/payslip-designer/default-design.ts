import { createElementFromPalette, uid } from './element-factory';
import { A4_HEIGHT_PX, A4_WIDTH_PX, PALETTE_LOOKUP } from './palette';
import type { DesignerDocument, DesignerElement } from './types';

function el(componentId: string, x: number, y: number, width?: number, height?: number): DesignerElement {
  const component = PALETTE_LOOKUP[componentId];
  const element = createElementFromPalette(component, x, y, 0);
  element.zIndex = y; // natural stacking by vertical position
  if (width) element.width = width;
  if (height) element.height = height;
  return element;
}

/**
 * Three-page starter payslip:
 *   Page 1 — full salary slip (header, employee details, earnings/deductions,
 *            net pay, payment details, footer).
 *   Page 2 — attendance summary + notes (extra page, deletable).
 *   Page 3 — blank canvas (extra page, deletable).
 */
export function createDefaultDesign(name = 'Untitled Payslip'): DesignerDocument {
  const pageSettings = {
    width: A4_WIDTH_PX,
    height: A4_HEIGHT_PX,
    marginTop: 40,
    marginBottom: 40,
    marginLeft: 48,
    marginRight: 48,
    backgroundColor: '#ffffff',
    headerElements: [] as DesignerElement[],
    footerElements: [] as DesignerElement[],
  };

  // ── Page 1: Salary Slip ──
  const p1: DesignerElement[] = [
    // Header: logo + company name/address
    el('company-logo', 48, 44, 150, 48),
    el('company-name', 210, 42, 440, 32),
    el('company-address', 210, 76, 440, 36),
    el('divider-bold', 48, 122, 698, 3),

    el('text-heading', 48, 138, 698, 30),
    el('text-subheading', 48, 168, 698, 24),

    // Pay period strip
    el('pay-period', 48, 208, 240, 24),
    el('pay-date', 540, 208, 206, 24),
    el('divider-thin', 48, 238, 698, 1),

    // Employee details (two columns)
    el('employee-name', 48, 254, 340, 24),
    el('employee-id', 406, 254, 340, 24),
    el('designation', 48, 284, 340, 24),
    el('department', 406, 284, 340, 24),
    el('joining-date', 48, 314, 340, 24),
    el('pan', 406, 314, 340, 24),

    // Earnings + Deductions tables side by side
    el('table-earnings', 48, 356, 342, 200),
    el('table-deductions', 404, 356, 342, 200),

    // Net pay banner
    el('shape-rect', 48, 576, 698, 56),
    el('net-salary', 60, 586, 300, 38),
    el('salary-in-words', 380, 594, 356, 28),

    // Payment details
    el('text-subheading', 48, 660, 698, 22),
    el('bank-name', 48, 690, 330, 22),
    el('account-number', 406, 690, 340, 22),
    el('ifsc', 48, 718, 330, 22),
    el('transaction-id', 406, 718, 340, 22),

    // Footer
    el('divider-thin', 48, 1030, 698, 1),
    el('footer-text', 48, 1042, 400, 18),
    el('page-number', 620, 1042, 126, 18),
  ];

  // Override the net-pay banner styles for a green payout look
  const netBanner = p1.find((e) => e.type === 'shape' && e.y === 576);
  if (netBanner) {
    netBanner.backgroundColor = '#059669';
    netBanner.borderWidth = 0;
  }
  const netPay = p1.find((e) => e.type === 'text' && e.text === '{{NetSalary}}');
  if (netPay) {
    netPay.color = '#ffffff';
    netPay.fontSize = 22;
    netPay.fontWeight = 800;
  }
  const words = p1.find((e) => e.type === 'text' && e.text === '{{SalaryInWords}}');
  if (words) {
    words.color = '#ffffff';
    words.fontSize = 10;
  }

  // ── Page 2: Attendance + Notes ──
  const p2: DesignerElement[] = [
    el('text-heading', 48, 48, 698, 28),
    el('table-attendance', 48, 96, 360, 120),
    el('text-subheading', 48, 250, 698, 22),
    el('text-paragraph', 48, 280, 698, 90),
    el('divider-thin', 48, 1030, 698, 1),
    el('footer-text', 48, 1042, 400, 18),
  ];
  if (p2[0]) (p2[0] as DesignerElement).text = 'ATTENDANCE SUMMARY';

  // ── Page 3: Blank ──
  const p3: DesignerElement[] = [];

  return {
    version: 1,
    name,
    pages: [
      { id: uid('page'), name: 'Salary Slip', settings: { ...pageSettings }, elements: p1 },
      { id: uid('page'), name: 'Attendance', settings: { ...pageSettings }, elements: p2 },
      { id: uid('page'), name: 'Blank', settings: { ...pageSettings }, elements: p3 },
    ],
  };
}

/** Fresh empty document (single blank page) for New Template. */
export function createEmptyDesign(name = 'Untitled Payslip'): DesignerDocument {
  return {
    version: 1,
    name,
    pages: [
      {
        id: uid('page'),
        name: 'Page 1',
        settings: {
          width: A4_WIDTH_PX,
          height: A4_HEIGHT_PX,
          marginTop: 40,
          marginBottom: 40,
          marginLeft: 48,
          marginRight: 48,
          backgroundColor: '#ffffff',
          headerElements: [],
          footerElements: [],
        },
        elements: [],
      },
    ],
  };
}
