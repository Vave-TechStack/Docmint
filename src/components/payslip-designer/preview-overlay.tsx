'use client';

import React from 'react';
import { X } from 'lucide-react';
import { exportDesignHtml } from './export-html';
import { useDesigner } from './store-context';

/** Demo values so the preview shows realistic sample data. */
export const SAMPLE_VALUES: Record<string, string> = {
  CompanyLogo: 'https://placehold.co/160x48/1d4ed8/ffffff?text=ACME',
  CompanyName: 'Acme Solutions Pvt. Ltd.',
  CompanyAddress: '12, Business Park, MG Road, Bengaluru – 560001',
  CompanyEmail: 'hr@acme.in',
  CompanyPhone: '+91 98765 43210',
  CompanyWebsite: 'www.acme.in',
  GST: '29AAACA1234A1Z5',
  PAN: 'AAACA1234F',
  CIN: 'U72900KA2020PTC123456',
  EmployeeName: 'Rahul Sharma',
  EmployeeID: 'EMP-1042',
  EmployeeCode: 'A-1042',
  Designation: 'Senior Software Engineer',
  Department: 'Engineering',
  JoiningDate: '12 Mar 2022',
  WorkingDays: '26',
  PresentDays: '25',
  LeaveDays: '1',
  LOP: '0',
  Overtime: '8',
  BasicSalary: '45,000',
  HRA: '18,000',
  DA: '0',
  MedicalAllowance: '1,250',
  SpecialAllowance: '5,750',
  Bonus: '0',
  GrossSalary: '70,000',
  PF: '5,400',
  ESI: '1,190',
  ProfessionalTax: '200',
  IncomeTax: '2,210',
  TotalDeductions: '9,000',
  NetSalary: '61,000',
  SalaryInWords: 'Sixty One Thousand Rupees Only',
  BankName: 'State Bank of India',
  BankAccount: '****3210',
  BankIfsc: 'SBIN0001234',
  PayDate: '31 Jul 2026',
  PayPeriod: 'July 2026',
  TransactionId: 'TX-778899',
  AuthorizedSignature: 'https://placehold.co/140x44/e5e7eb/374151?text=Signature',
  HRSignature: 'https://placehold.co/140x44/e5e7eb/374151?text=HR',
};

export function PreviewOverlay({ onClose }: { onClose: () => void }) {
  const { document } = useDesigner();
  const html = React.useMemo(() => exportDesignHtml(document, SAMPLE_VALUES), [document]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/70 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200">
        <div>
          <p className="text-sm font-semibold text-gray-900">Preview — {document.name}</p>
          <p className="text-[10px] text-gray-400">Sample data shown; bound variables will use real values in exports.</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
        >
          <X className="w-3.5 h-3.5" /> Close
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <iframe
          title="Payslip preview"
          srcDoc={html}
          className="mx-auto bg-white shadow-2xl"
          style={{ width: 820, height: 1140, border: 'none', transform: 'scale(0.9)', transformOrigin: 'top center' }}
        />
      </div>
    </div>
  );
}
