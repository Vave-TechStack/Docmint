import type {
  DesignerVariable,
  PaletteCategory,
  PaletteComponent,
} from './types';

/**
 * Left-sidebar component library — 17 categories of draggable components.
 * Each component carries its default size and, where applicable, the
 * {{Variable}} it is bound to (resolved at render/export time).
 */

export const DESIGNER_VARIABLES: DesignerVariable[] = [
  // Company
  { key: 'CompanyLogo', label: 'Company Logo', group: 'Company' },
  { key: 'CompanyName', label: 'Company Name', group: 'Company' },
  { key: 'CompanyAddress', label: 'Company Address', group: 'Company' },
  { key: 'CompanyEmail', label: 'Company Email', group: 'Company' },
  { key: 'CompanyPhone', label: 'Company Phone', group: 'Company' },
  { key: 'CompanyWebsite', label: 'Company Website', group: 'Company' },
  { key: 'GST', label: 'GST Number', group: 'Company' },
  { key: 'PAN', label: 'PAN Number', group: 'Company' },
  { key: 'CIN', label: 'CIN Number', group: 'Company' },
  // Employee
  { key: 'EmployeeName', label: 'Employee Name', group: 'Employee' },
  { key: 'EmployeeID', label: 'Employee ID', group: 'Employee' },
  { key: 'EmployeeCode', label: 'Employee Code', group: 'Employee' },
  { key: 'Designation', label: 'Designation', group: 'Employee' },
  { key: 'Department', label: 'Department', group: 'Employee' },
  { key: 'JoiningDate', label: 'Joining Date', group: 'Employee' },
  { key: 'EmployeePhoto', label: 'Employee Photo', group: 'Employee' },
  // Attendance
  { key: 'WorkingDays', label: 'Working Days', group: 'Attendance' },
  { key: 'PresentDays', label: 'Present Days', group: 'Attendance' },
  { key: 'LeaveDays', label: 'Leave Days', group: 'Attendance' },
  { key: 'LOP', label: 'Loss of Pay', group: 'Attendance' },
  { key: 'Overtime', label: 'Overtime', group: 'Attendance' },
  // Salary
  { key: 'BasicSalary', label: 'Basic Salary', group: 'Salary' },
  { key: 'HRA', label: 'House Rent Allowance', group: 'Salary' },
  { key: 'DA', label: 'Dearness Allowance', group: 'Salary' },
  { key: 'MedicalAllowance', label: 'Medical Allowance', group: 'Salary' },
  { key: 'SpecialAllowance', label: 'Special Allowance', group: 'Salary' },
  { key: 'Bonus', label: 'Bonus', group: 'Salary' },
  { key: 'GrossSalary', label: 'Gross Salary', group: 'Salary' },
  { key: 'PF', label: 'Provident Fund', group: 'Salary' },
  { key: 'ESI', label: 'ESI', group: 'Salary' },
  { key: 'ProfessionalTax', label: 'Professional Tax', group: 'Salary' },
  { key: 'IncomeTax', label: 'Income Tax', group: 'Salary' },
  { key: 'TotalDeductions', label: 'Total Deductions', group: 'Salary' },
  { key: 'NetSalary', label: 'Net Salary', group: 'Salary' },
  { key: 'SalaryInWords', label: 'Salary in Words', group: 'Salary' },
  // Payment
  { key: 'BankName', label: 'Bank Name', group: 'Payment' },
  { key: 'BankAccount', label: 'Account Number', group: 'Payment' },
  { key: 'BankIfsc', label: 'IFSC Code', group: 'Payment' },
  { key: 'PayDate', label: 'Payment Date', group: 'Payment' },
  { key: 'PayPeriod', label: 'Pay Period', group: 'Payment' },
  { key: 'TransactionId', label: 'Transaction ID', group: 'Payment' },
];

export const VARIABLE_GROUPS = [
  'Company',
  'Employee',
  'Attendance',
  'Salary',
  'Payment',
] as const;

// ─── Component factory helpers ───

export function makePaletteComponent(partial: Partial<PaletteComponent>): PaletteComponent {
  const { width = 180, height = 28, ...rest } = partial;
  return { width, height, ...rest } as PaletteComponent;
}

type PaletteOpts = Partial<PaletteComponent>;
type TextOpts = Omit<PaletteOpts, 'id' | 'label' | 'type' | 'variable'>;

const text = (id: string, label: string, variableOrOpts?: string | TextOpts, opts?: TextOpts): PaletteComponent => {
  const variable = typeof variableOrOpts === 'string' ? variableOrOpts : undefined;
  const finalOpts = (typeof variableOrOpts === 'string' ? opts : variableOrOpts) ?? {};
  return makePaletteComponent({ id, label, type: 'text', variable, ...finalOpts });
};

const image = (id: string, label: string, variableOrOpts?: string | TextOpts, opts?: TextOpts): PaletteComponent => {
  const variable = typeof variableOrOpts === 'string' ? variableOrOpts : undefined;
  const finalOpts = (typeof variableOrOpts === 'string' ? opts : variableOrOpts) ?? {};
  const { width = 120, height = 40, ...rest } = finalOpts;
  return makePaletteComponent({ id, label, type: 'image', variable, ...rest, width, height });
};

const table = (id: string, label: string): PaletteComponent =>
  makePaletteComponent({ id, label, type: 'table', width: 360, height: 160 });

export const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    id: 'company',
    label: 'Company',
    components: [
      image('company-logo', 'Company Logo', 'CompanyLogo'),
      text('company-name', 'Company Name', 'CompanyName', { defaultText: '{{CompanyName}}', fontSize: 18, fontWeight: 700, height: 30 }),
      text('company-address', 'Company Address', 'CompanyAddress', { defaultText: '{{CompanyAddress}}', height: 40 }),
      text('company-email', 'Company Email', 'CompanyEmail'),
      text('company-phone', 'Company Phone', 'CompanyPhone'),
      text('company-website', 'Company Website', 'CompanyWebsite'),
      text('gst', 'GST Number', 'GST'),
      text('pan', 'PAN Number', 'PAN'),
      text('cin', 'CIN Number', 'CIN'),
    ],
  },
  {
    id: 'employee',
    label: 'Employee',
    components: [
      text('employee-name', 'Employee Name', 'EmployeeName', { defaultText: '{{EmployeeName}}', fontSize: 14, fontWeight: 600 }),
      text('employee-id', 'Employee ID', 'EmployeeID'),
      text('employee-code', 'Employee Code', 'EmployeeCode'),
      text('department', 'Department', 'Department'),
      text('designation', 'Designation', 'Designation'),
      text('joining-date', 'Joining Date', 'JoiningDate'),
      image('employee-photo', 'Employee Photo', 'EmployeePhoto', { width: 70, height: 84 }),
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    components: [
      text('working-days', 'Working Days', 'WorkingDays'),
      text('present-days', 'Present Days', 'PresentDays'),
      text('leave-days', 'Leave Days', 'LeaveDays'),
      text('lop', 'Loss of Pay', 'LOP'),
      text('overtime', 'Overtime', 'Overtime'),
    ],
  },
  {
    id: 'earnings',
    label: 'Earnings',
    components: [
      text('basic', 'Basic Salary', 'BasicSalary'),
      text('hra', 'HRA', 'HRA'),
      text('da', 'Dearness Allowance', 'DA'),
      text('medical-allowance', 'Medical Allowance', 'MedicalAllowance'),
      text('special-allowance', 'Special Allowance', 'SpecialAllowance'),
      text('bonus', 'Bonus', 'Bonus'),
      text('gross', 'Gross Salary', 'GrossSalary', { defaultText: '{{GrossSalary}}', fontWeight: 700 }),
      table('earnings-table', 'Earnings Table'),
    ],
  },
  {
    id: 'deductions',
    label: 'Deductions',
    components: [
      text('pf', 'Provident Fund', 'PF'),
      text('esi', 'ESI', 'ESI'),
      text('professional-tax', 'Professional Tax', 'ProfessionalTax'),
      text('income-tax', 'Income Tax', 'IncomeTax'),
      text('total-deductions', 'Total Deductions', 'TotalDeductions', { defaultText: '{{TotalDeductions}}', fontWeight: 700 }),
      table('deductions-table', 'Deductions Table'),
    ],
  },
  {
    id: 'salary-summary',
    label: 'Salary Summary',
    components: [
      text('net-salary', 'Net Salary', 'NetSalary', { defaultText: '{{NetSalary}}', fontSize: 20, fontWeight: 800 }),
      text('salary-in-words', 'Salary in Words', 'SalaryInWords', { height: 40 }),
      table('summary-table', 'Salary Summary Table'),
    ],
  },
  {
    id: 'payment',
    label: 'Payment Details',
    components: [
      text('bank-name', 'Bank Name', 'BankName'),
      text('account-number', 'Account Number', 'BankAccount'),
      text('ifsc', 'IFSC Code', 'BankIfsc'),
      text('pay-date', 'Payment Date', 'PayDate'),
      text('pay-period', 'Pay Period', 'PayPeriod'),
      text('transaction-id', 'Transaction ID', 'TransactionId'),
    ],
  },
  {
    id: 'footer',
    label: 'Footer',
    components: [
      text('footer-text', 'Footer Text', { defaultText: 'This is a computer-generated payslip', fontSize: 9, color: '#6b7280', height: 20 }),
      text('page-number', 'Page Number', { defaultText: 'Page 1 of 1', fontSize: 9, color: '#9ca3af', height: 18 }),
      text('disclaimer', 'Disclaimer', { defaultText: 'For any discrepancies, contact HR', fontSize: 9, color: '#9ca3af', height: 20 }),
    ],
  },
  {
    id: 'tables',
    label: 'Tables',
    components: [
      table('table-earnings', 'Earnings Table'),
      table('table-deductions', 'Deductions Table'),
      table('table-attendance', 'Attendance Table'),
      table('table-summary', 'Salary Summary Table'),
      table('table-generic', 'Generic Table'),
    ],
  },
  {
    id: 'text',
    label: 'Text',
    components: [
      text('text-heading', 'Heading', { defaultText: 'SALARY SLIP', fontSize: 16, fontWeight: 700, letterSpacing: 2, textAlign: 'center', height: 26 }),
      text('text-subheading', 'Subheading', { defaultText: 'Monthly Salary Statement', fontSize: 12, fontWeight: 600, textAlign: 'center', height: 22 }),
      text('text-paragraph', 'Paragraph', { defaultText: 'Text content…', height: 60 }),
      text('text-label', 'Label', { defaultText: 'Label:', fontWeight: 600 }),
    ],
  },
  {
    id: 'images',
    label: 'Images',
    components: [
      image('img-company-logo', 'Company Logo', 'CompanyLogo'),
      image('img-employee-photo', 'Employee Photo', 'EmployeePhoto'),
      image('img-seal', 'Company Seal', 'CompanySeal'),
      image('img-upload', 'Uploaded Image', { imageSrc: '', width: 120, height: 80 }),
    ],
  },
  {
    id: 'qr',
    label: 'QR Code',
    components: [
      makePaletteComponent({ id: 'qr-upi', label: 'UPI QR', type: 'qr', width: 90, height: 90, qrValue: 'upi://pay?pa=company@upi' }),
      makePaletteComponent({ id: 'qr-transaction', label: 'Transaction QR', type: 'qr', width: 90, height: 90, qrValue: 'https://docmint.app' }),
    ],
  },
  {
    id: 'signature',
    label: 'Signature',
    components: [
      image('sig-authorized', 'Authorized Signature', 'AuthorizedSignature', { width: 120, height: 44 }),
      image('sig-hr', 'HR Signature', 'HRSignature', { width: 120, height: 44 }),
      image('sig-director', 'Director Signature', 'DirectorSignature', { width: 120, height: 44 }),
      image('sig-finance', 'Finance Signature', 'FinanceSignature', { width: 120, height: 44 }),
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    components: [
      makePaletteComponent({ id: 'shape-rect', label: 'Rectangle', type: 'shape', shape: 'rect', width: 160, height: 60, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd' }),
      makePaletteComponent({ id: 'shape-circle', label: 'Circle', type: 'shape', shape: 'circle', width: 80, height: 80, backgroundColor: '#eff6ff' }),
    ],
  },
  {
    id: 'lines',
    label: 'Lines',
    components: [
      makePaletteComponent({ id: 'line-horizontal', label: 'Horizontal Line', type: 'line', width: 200, height: 2, lineStyle: 'solid', backgroundColor: '#d1d5db' }),
      makePaletteComponent({ id: 'line-dashed', label: 'Dashed Line', type: 'line', width: 200, height: 2, lineStyle: 'dashed', backgroundColor: '#9ca3af' }),
    ],
  },
  {
    id: 'dividers',
    label: 'Divider',
    components: [
      makePaletteComponent({ id: 'divider-thin', label: 'Thin Divider', type: 'divider', width: 300, height: 1, backgroundColor: '#e5e7eb' }),
      makePaletteComponent({ id: 'divider-bold', label: 'Bold Divider', type: 'divider', width: 300, height: 3, backgroundColor: '#2563eb' }),
      makePaletteComponent({ id: 'divider-dashed', label: 'Dashed Divider', type: 'divider', width: 300, height: 2, lineStyle: 'dashed', backgroundColor: '#d1d5db' }),
    ],
  },
  {
    id: 'icons',
    label: 'Icons',
    components: [
      makePaletteComponent({ id: 'icon-bank', label: 'Bank Icon', type: 'icon', iconName: 'Landmark', width: 24, height: 24, color: '#2563eb' }),
      makePaletteComponent({ id: 'icon-calendar', label: 'Calendar Icon', type: 'icon', iconName: 'CalendarDays', width: 24, height: 24, color: '#6b7280' }),
      makePaletteComponent({ id: 'icon-user', label: 'User Icon', type: 'icon', iconName: 'User', width: 24, height: 24, color: '#6b7280' }),
      makePaletteComponent({ id: 'icon-building', label: 'Building Icon', type: 'icon', iconName: 'Building2', width: 24, height: 24, color: '#6b7280' }),
    ],
  },
];

export const PALETTE_LOOKUP: Record<string, PaletteComponent> = Object.fromEntries(
  PALETTE_CATEGORIES.flatMap((c) => c.components.map((p) => [p.id, p]))
);

/** Default A4 portrait page size in px at 96dpi. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
