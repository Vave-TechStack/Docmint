import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const t = await prisma.template.findFirst({ where: { name: 'Employee Payslip' } });
if (!t) { console.log('NOT FOUND'); process.exit(1); }
let html = t.htmlTemplate;
const sample = {
  CompanyName: 'Acme Solutions Pvt Ltd', CompanyAddress: '12 MG Road, Bengaluru 560001',
  EmployeeName: 'Rahul Sharma', EmployeeID: 'EMP-1042', Designation: 'Senior Software Engineer', Department: 'Engineering',
  PAN: 'ABCDE1234F', UAN: '101234567890', PayPeriod: 'July 2026', PayDate: '31-Jul-2026',
  Basic: '45,000', DA: '8,000', HRA: '18,000', Conveyance: '1,600', Medical: '1,250', SpecialAllowance: '6,150',
  GrossEarnings: '80,000', PF: '5,400', ESI: '1,264', ProfessionalTax: '200', IncomeTax: '8,000', TotalDeductions: '14,864',
  NetPay: '65,136', NetPayWords: 'Sixty-Five Thousand One Hundred Thirty-Six Only',
  BankName: 'HDFC Bank', BankAccount: '50200012345678',
};
html = html.replace(/\{\{([\w.-]+):([^}]+)\}\}/g, (m, k, fb) => sample[k] || fb);
html = html.replace(/\{\{([\w.-]+)\}\}/g, (m, k) => sample[k] || '');
fs.writeFileSync('payslip-render.html', html);
console.log('WROTE payslip-render.html', html.length, 'chars');
await prisma.$disconnect();
