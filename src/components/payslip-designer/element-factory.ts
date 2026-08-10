import type { DesignerElement, PaletteComponent } from './types';

let idCounter = 0;
export function uid(prefix = 'el'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/**
 * Build a default table payload for the payslip tables (earnings/deductions/
 * attendance/summary). Rows map to the standard {{Variable}} keys so the
 * design works with the document engine's placeholder resolution.
 */
const DEFAULT_TABLES: Record<string, { columns: number; rows: number; totalRow: boolean; cells: string[][] }> = {
  'table-earnings': {
    columns: 2,
    rows: 7,
    totalRow: true,
    cells: [
      ['Earnings', 'Amount'],
      ['Basic Salary', '{{BasicSalary}}'],
      ['House Rent Allowance', '{{HRA}}'],
      ['Dearness Allowance', '{{DA}}'],
      ['Medical Allowance', '{{MedicalAllowance}}'],
      ['Special Allowance', '{{SpecialAllowance}}'],
      ['Bonus', '{{Bonus}}'],
      ['Gross Earnings', '{{GrossSalary}}'],
    ],
  },
  'table-deductions': {
    columns: 2,
    rows: 5,
    totalRow: true,
    cells: [
      ['Deductions', 'Amount'],
      ['Provident Fund', '{{PF}}'],
      ['ESI', '{{ESI}}'],
      ['Professional Tax', '{{ProfessionalTax}}'],
      ['Income Tax', '{{IncomeTax}}'],
      ['Total Deductions', '{{TotalDeductions}}'],
    ],
  },
  'table-attendance': {
    columns: 3,
    rows: 2,
    totalRow: false,
    cells: [
      ['Working Days', 'Present Days', 'Leave Days'],
      ['{{WorkingDays}}', '{{PresentDays}}', '{{LeaveDays}}'],
    ],
  },
  'table-summary': {
    columns: 2,
    rows: 3,
    totalRow: true,
    cells: [
      ['Summary', 'Amount'],
      ['Gross Earnings', '{{GrossSalary}}'],
      ['Total Deductions', '{{TotalDeductions}}'],
      ['Net Pay', '{{NetSalary}}'],
    ],
  },
  'table-generic': {
    columns: 2,
    rows: 3,
    totalRow: false,
    cells: [
      ['Item', 'Value'],
      ['', ''],
      ['', ''],
    ],
  },
};

/** Build a DesignerElement from a palette component, positioned at x/y. */
export function createElementFromPalette(
  component: PaletteComponent,
  x: number,
  y: number,
  zIndex: number
): DesignerElement {
  const base: DesignerElement = {
    id: uid(),
    type: component.type,
    name: component.label,
    x,
    y,
    width: component.width,
    height: component.height,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    visible: true,
    fontFamily: 'Inter',
    fontSize: component.fontSize ?? 11,
    fontWeight: component.fontWeight ?? 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: component.textAlign ?? 'left',
    color: component.color ?? '#1f2937',
    lineHeight: 1.3,
    letterSpacing: component.letterSpacing ?? 0,
    backgroundColor: component.backgroundColor,
    borderRadius: 0,
    borderWidth: component.borderWidth ?? 0,
    borderColor: component.borderColor ?? '#d1d5db',
    shadow: 'none',
    align: 'middle',
  };

  switch (component.type) {
    case 'text': {
      const variable = component.variable;
      return {
        ...base,
        text: variable ? `{{${variable}}}` : component.defaultText || component.label,
        binding: variable ? { kind: 'variable', key: variable } : { kind: 'plain' },
        height: Math.max(component.height, 20),
      };
    }
    case 'image':
      return {
        ...base,
        imageSrc: component.imageSrc ?? (component.variable ? `{{${component.variable}}}` : ''),
        binding: component.variable ? { kind: 'variable', key: component.variable } : { kind: 'plain' },
        backgroundColor: undefined,
      };
    case 'table': {
      const def = DEFAULT_TABLES[component.id] ?? DEFAULT_TABLES['table-generic'];
      const isTotalRow = (r: number) => def.totalRow && r === def.cells.length - 1;
      return {
        ...base,
        width: component.width,
        height: Math.max(component.height, def.cells.length * 22 + 24),
        fontSize: 10,
        table: {
          columns: def.columns,
          rows: def.cells.length,
          headerRow: true,
          totalRow: def.totalRow,
          totalColumn: def.columns - 1,
          cellPadding: 4,
          borders: true,
          currency: true,
          cells: def.cells.map((row, r) =>
            row.map((content, c) => ({
              id: uid('cell'),
              content,
              isHeader: r === 0,
              isTotal: isTotalRow(r) && c === def.columns - 1,
            }))
          ),
        },
      };
    }
    case 'qr':
      return { ...base, qrValue: component.qrValue };
    case 'signature':
      return { ...base, imageSrc: component.variable ? `{{${component.variable}}}` : '' };
    case 'shape':
      return { ...base, shape: component.shape ?? 'rect', backgroundColor: component.backgroundColor ?? '#eff6ff' };
    case 'line':
    case 'divider':
      return {
        ...base,
        lineStyle: component.lineStyle ?? 'solid',
        backgroundColor: component.backgroundColor ?? '#d1d5db',
        height: component.height ?? 2,
      };
    case 'icon':
      return { ...base, iconName: component.iconName ?? 'Building2' };
    default:
      return base;
  }
}
