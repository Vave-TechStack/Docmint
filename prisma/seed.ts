/**
 * DocMint - Sample Template Seed Script
 * 
 * This seed script populates the database with professionally designed
 * sample templates for all document categories. Run with:
 * npx tsx prisma/seed.ts
 * 
 * Or after configuring package.json: npx prisma db seed
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

// ─── Load .env file manually for standalone execution ───
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;
function createPrismaClient(): PrismaClient {
  if (connectionString) {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
  }
  // Fallback - shouldn't happen with valid .env
  throw new Error('DATABASE_URL not found in environment or .env file');
}

const prisma = createPrismaClient();

// ─── Helper: create a template with consistent structure ───
function makeVariables(placeholders: string[]) {
  return placeholders.map((key) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
    const lower = key.toLowerCase();
    const type =
      lower.includes('date') || lower.includes('joining') ? 'date' :
      lower.includes('email') ? 'email' :
      lower.includes('salary') || lower.includes('amount') || lower.includes('total') || lower.includes('ctc') ? 'number' :
      lower.includes('address') || lower.includes('description') || lower.includes('note') || lower.includes('terms') ? 'textarea' :
      lower.includes('image') || lower.includes('logo') || lower.includes('photo') ? 'image' :
      lower.includes('signature') || lower.includes('sign') ? 'signature' :
      'text';
    const optional = ['image', 'photo', 'logo', 'seal', 'watermark', 'optional'];
    const required = !optional.some((o) => lower.includes(o));
    return { key, label, type, required, placeholder: `Enter ${label}`, defaultValue: '', options: [] };
  });
}

// ─── Template HTML Content ───

const TEMPLATES = [
  // ═══════════════════════════════════════════════
  // HR DOCUMENTS
  // ═══════════════════════════════════════════════
  {
    name: 'Professional Offer Letter',
    description: 'Standard offer letter for new employees with company branding and all essential terms including probation period, compensation, and joining instructions.',
    documentCategory: 'HR Documents',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyAddress', 'CompanyLogo', 'EmployeeName', 'Designation', 'Department', 'JoiningDate', 'Salary', 'CTC', 'Location', 'Manager', 'HRName', 'HRSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 0; line-height: 1.6; }
  .header { text-align: center; border-bottom: 3px solid #1a56db; padding-bottom: 20px; margin-bottom: 25px; }
  .header img { max-height: 80px; margin-bottom: 10px; }
  .header h1 { font-size: 22px; color: #1a56db; margin: 5px 0; font-weight: 600; }
  .header p { font-size: 13px; color: #666; margin: 2px 0; }
  .ref { text-align: right; font-size: 12px; color: #999; margin-bottom: 20px; }
  .subject { text-align: center; font-size: 16px; font-weight: 600; color: #1a56db; margin: 20px 0; text-transform: uppercase; letter-spacing: 1px; }
  .salutation { font-size: 14px; margin-bottom: 15px; }
  .content { font-size: 14px; text-align: justify; }
  .content p { margin-bottom: 10px; }
  .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .details-table td { padding: 10px 15px; border: 1px solid #e0e0e0; font-size: 14px; }
  .details-table td:first-child { font-weight: 600; background: #f8f9fa; width: 140px; color: #555; }
  .terms { margin: 20px 0; padding: 15px 20px; background: #f8f9fa; border-left: 4px solid #1a56db; border-radius: 4px; }
  .terms h3 { font-size: 14px; color: #1a56db; margin: 0 0 10px 0; }
  .terms p, .terms li { font-size: 13px; color: #555; margin-bottom: 5px; }
  .terms ol { padding-left: 20px; margin: 0; }
  .signature-section { margin-top: 35px; }
  .signature-section table { width: 100%; }
  .signature-section td { width: 50%; vertical-align: top; }
  .signature-section .sign-line { margin-top: 10px; }
  .signature-section .sign-line img { max-height: 50px; display: block; margin-bottom: 5px; }
  .signature-section .sign-name { font-weight: 600; font-size: 14px; }
  .signature-section .sign-designation { font-size: 12px; color: #666; }
  .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; text-align: center; }
  hr { border: none; border-top: 1px dashed #ddd; margin: 20px 0; }
</style></head>
<body>
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Company Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>{{CompanyName}}</h1>
    <p>{{CompanyAddress}}</p>
  </div>
  <div class="ref">Date: <strong>{{CurrentDate}}</strong></div>
  <div class="ref">Ref: OFF/{{CurrentYear}}/{{EmployeeName:EMP001}}</div>

  <div class="subject">Subject: Offer of Employment</div>

  <div class="salutation">Dear <strong>{{EmployeeName}}</strong>,</div>

  <div class="content">
    <p>We are pleased to offer you the position of <strong>{{Designation}}</strong> in the <strong>{{Department}}</strong> department at <strong>{{CompanyName}}</strong>. After reviewing your qualifications and experience, we are confident that you will be a valuable addition to our team.</p>

    <p>Your employment will be based at our <strong>{{Location}}</strong> office. Please find below the key terms and conditions of your employment:</p>

    <table class="details-table">
      <tr><td>Position</td><td>{{Designation}}</td></tr>
      <tr><td>Department</td><td>{{Department}}</td></tr>
      <tr><td>Date of Joining</td><td>{{JoiningDate}}</td></tr>
      <tr><td>Reporting To</td><td>{{Manager}}</td></tr>
      <tr><td>Location</td><td>{{Location}}</td></tr>
      <tr><td>Annual CTC</td><td><strong>₹ {{CTC}}</strong></td></tr>
      <tr><td>Monthly Salary</td><td><strong>₹ {{Salary}}</strong></td></tr>
    </table>

    <div class="terms">
      <h3>Terms &amp; Conditions</h3>
      <ol>
        <li><strong>Probation Period:</strong> You will be on probation for a period of 6 months from the date of joining, extendable at the discretion of the management.</li>
        <li><strong>Confirmation:</strong> Upon successful completion of probation, your employment will be confirmed based on performance review.</li>
        <li><strong>Notice Period:</strong> A notice period of 30 days is required from either party for termination of employment.</li>
        <li><strong>Confidentiality:</strong> You agree to maintain strict confidentiality of all company information and trade secrets.</li>
        <li><strong>Company Policies:</strong> You will adhere to all company policies, rules, and regulations as amended from time to time.</li>
        <li><strong>Background Verification:</strong> This offer is subject to satisfactory background verification and reference checks.</li>
      </ol>
    </div>

    <p>Please confirm your acceptance of this offer by signing the duplicate copy of this letter and returning it to HR on or before your joining date.</p>

    <p>We look forward to welcoming you to {{CompanyName}} and wish you a successful career with us.</p>
  </div>

  <div class="signature-section">
    <table>
      <tr>
        <td>
          <p><strong>Yours sincerely,</strong></p>
          <div class="sign-line">
            <img src="{{HRSignature}}" alt="Signature" style="display:{{HRSignature:none}};" onerror="this.style.display='none'">
          </div>
          <div class="sign-name">{{HRName}}</div>
          <div class="sign-designation">Human Resources</div>
          <div class="sign-designation">{{CompanyName}}</div>
        </td>
        <td style="text-align: right;">
          <p><strong>Employee Acceptance:</strong></p>
          <div style="margin-top: 30px;">
            <hr style="width: 200px; margin-left: auto;">
          </div>
          <div class="sign-name">{{EmployeeName}}</div>
          <div class="sign-designation">Date: _______________</div>
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p>{{CompanyName}} | {{CompanyAddress}}</p>
    <p>This is a computer-generated document and does not require a physical signature.</p>
  </div>
</body>
</html>`
  },
  {
    name: 'Experience Letter',
    description: 'Professional experience/ service certificate for employees leaving the organization with details of tenure, roles, and performance.',
    documentCategory: 'HR Documents',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'Designation', 'Department', 'JoiningDate', 'RelievingDate', 'LastWorkingDay', 'TotalExperience', 'Skills', 'HRName', 'HRSignature', 'CurrentDate', 'EmployeePhoto'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #333; margin: 0; padding: 40px; line-height: 1.7; }
  .border-frame { border: 2px solid #1a56db; padding: 30px; position: relative; }
  .header { text-align: center; border-bottom: 2px solid #1a56db; padding-bottom: 15px; margin-bottom: 20px; position: relative; }
  .header img { max-height: 70px; }
  .header h1 { font-size: 20px; color: #1a56db; margin: 8px 0 3px; font-weight: 700; letter-spacing: 1px; }
  .header .subtitle { font-size: 13px; color: #666; letter-spacing: 3px; text-transform: uppercase; }
  .cert-title { text-align: center; font-size: 18px; font-weight: 700; color: #1a56db; margin: 25px 0; border: 1px solid #1a56db; display: inline-block; padding: 8px 30px; position: relative; left: 50%; transform: translateX(-50%); letter-spacing: 2px; }
  .employee-photo { float: right; width: 90px; height: 110px; border: 1px solid #ddd; margin: 0 0 15px 15px; object-fit: cover; display: {{EmployeePhoto:block}}; }
  .content { font-size: 14px; text-align: justify; }
  .content p { margin-bottom: 12px; text-indent: 30px; }
  .detail-row { margin: 5px 0; font-size: 14px; }
  .detail-row strong { display: inline-block; width: 160px; color: #555; }
  .skills { margin: 15px 0; padding: 10px 15px; background: #f0f4ff; border-radius: 4px; }
  .skills strong { color: #1a56db; }
  .appreciation { margin: 20px 0; padding: 12px 18px; background: #fffbf0; border-left: 4px solid #f59e0b; font-style: italic; font-size: 13px; color: #666; }
  .signature-section { margin-top: 35px; }
  .signature-section td { width: 50%; vertical-align: top; }
  .signature-section .sign-line { margin-top: 15px; border-top: 1px solid #333; width: 200px; padding-top: 8px; }
  .signature-section .sign-name { font-weight: 600; font-size: 14px; margin-top: 5px; }
  .signature-section .sign-designation { font-size: 12px; color: #666; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 11px; color: #999; text-align: center; }
  .watermark-text { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; color: rgba(26, 86, 219, 0.04); font-weight: bold; pointer-events: none; z-index: -1; }
</style></head>
<body>
  <div class="border-frame">
    <div class="watermark-text">EXPERIENCE</div>
    <div class="header">
      <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
      <h1>{{CompanyName}}</h1>
      <div class="subtitle">Service &amp; Experience Certificate</div>
    </div>

    <div class="cert-title">CERTIFICATE OF EXPERIENCE</div>

    <div class="content">
      <img src="{{EmployeePhoto}}" class="employee-photo" onerror="this.style.display='none'">
      <p>This is to certify that <strong>Mr./Ms. {{EmployeeName}}</strong> was employed with <strong>{{CompanyName}}</strong> from <strong>{{JoiningDate}}</strong> to <strong>{{RelievingDate}}</strong>.</p>

      <p>During their tenure, {{EmployeeName}} served in the capacity of <strong>{{Designation}}</strong> within the <strong>{{Department}}</strong> department. Throughout their association with us, they conducted themselves with sincerity, dedication, and professionalism.</p>

      <div class="detail-row"><strong>Employee Name</strong> : {{EmployeeName}}</div>
      <div class="detail-row"><strong>Designation</strong> : {{Designation}}</div>
      <div class="detail-row"><strong>Department</strong> : {{Department}}</div>
      <div class="detail-row"><strong>Date of Joining</strong> : {{JoiningDate}}</div>
      <div class="detail-row"><strong>Date of Relieving</strong> : {{RelievingDate}}</div>
      <div class="detail-row"><strong>Last Working Day</strong> : {{LastWorkingDay}}</div>
      <div class="detail-row"><strong>Total Experience</strong> : {{TotalExperience}}</div>

      <div class="skills"><strong>Key Skills:</strong> {{Skills}}</div>

      <p>{{EmployeeName}} demonstrated exceptional skills in their role and contributed significantly to the organization's growth. They have been a valuable member of our team and we appreciate their contributions.</p>

      <div class="appreciation">
        We wish {{EmployeeName}} the very best in all their future endeavors and recommend them for any future roles they may pursue.
      </div>

      <p style="margin-top: 25px;">We convey our best wishes for their future professional and personal growth.</p>
    </div>

    <div class="signature-section">
      <table>
        <tr>
          <td>
            <div class="sign-line">
              <img src="{{HRSignature}}" alt="Signature" style="max-height: 40px; display: block; margin-bottom: 5px; display:{{HRSignature:none}};" onerror="this.style.display='none'">
              <div class="sign-name">{{HRName}}</div>
              <div class="sign-designation">Human Resources</div>
              <div class="sign-designation">{{CompanyName}}</div>
            </div>
          </td>
          <td style="text-align: right;">
            <div class="sign-line" style="margin-left: auto;">
              <div class="sign-name">Authorized Signatory</div>
              <div class="sign-designation">{{CompanyName}}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <p>{{CompanyName}} | {{CompanyAddress}}</p>
      <p>Certificate No: EXP/{{CurrentYear}}/{{EmployeeName:000}} | Date: {{CurrentDate}}</p>
    </div>
  </div>
</body>
</html>`
  },
  {
    name: 'Appointment Letter',
    description: 'Formal appointment letter for confirmed employees with detailed terms of employment, compensation structure, and company policies.',
    documentCategory: 'HR Documents',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'Designation', 'Department', 'AppointmentDate', 'Salary', 'CTC', 'Location', 'WorkingDays', 'WorkingHours', 'LeavePolicy', 'NoticePeriod', 'Manager', 'HRName', 'HRSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 35px; line-height: 1.6; }
  .header { border-bottom: 3px solid #1a56db; padding-bottom: 12px; margin-bottom: 20px; }
  .header table { width: 100%; }
  .header td { vertical-align: middle; }
  .header img { max-height: 70px; }
  .header h1 { font-size: 20px; color: #1a56db; margin: 0; font-weight: 600; }
  .header .company-info { font-size: 11px; color: #888; margin-top: 2px; }
  .ref-section { text-align: right; font-size: 12px; color: #666; }
  .subject { font-size: 15px; font-weight: 700; color: #1a56db; margin: 20px 0 15px; text-align: center; }
  .salutation { margin-bottom: 12px; font-size: 14px; }
  .content { font-size: 14px; }
  .content p { margin-bottom: 8px; }
  .section-title { font-size: 14px; font-weight: 700; color: #1a56db; margin: 18px 0 10px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; }
  .table-compact { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .table-compact td { padding: 6px 12px; border: 1px solid #e8e8e8; font-size: 13px; }
  .table-compact td:first-child { font-weight: 600; background: #f5f7ff; width: 150px; color: #555; }
  ul, ol { font-size: 13px; color: #555; margin: 5px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .signature { margin-top: 30px; }
  .signature td { width: 50%; vertical-align: top; }
  .signature img { max-height: 45px; display: block; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; text-align: center; }
</style></head>
<body>
  <div class="header">
    <table>
      <tr>
        <td>
          <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
        </td>
        <td style="text-align: right;">
          <h1>{{CompanyName}}</h1>
          <div class="company-info">{{CompanyAddress}}</div>
        </td>
      </tr>
    </table>
  </div>

  <div class="ref-section">Date: {{CurrentDate}}<br>Ref: APPT/{{CurrentYear}}/{{EmployeeName:000}}</div>

  <div class="subject">LETTER OF APPOINTMENT</div>

  <div class="salutation">Dear <strong>{{EmployeeName}}</strong>,</div>

  <div class="content">
    <p>We are pleased to confirm your appointment with <strong>{{CompanyName}}</strong> as <strong>{{Designation}}</strong> in the <strong>{{Department}}</strong> department, effective <strong>{{AppointmentDate}}</strong>.</p>

    <div class="section-title">Terms of Employment</div>
    <table class="table-compact">
      <tr><td>Designation</td><td>{{Designation}}</td></tr>
      <tr><td>Department</td><td>{{Department}}</td></tr>
      <tr><td>Location</td><td>{{Location}}</td></tr>
      <tr><td>Reporting To</td><td>{{Manager}}</td></tr>
      <tr><td>Working Days</td><td>{{WorkingDays}}</td></tr>
      <tr><td>Working Hours</td><td>{{WorkingHours}}</td></tr>
      <tr><td>Notice Period</td><td>{{NoticePeriod}}</td></tr>
    </table>

    <div class="section-title">Compensation</div>
    <table class="table-compact">
      <tr><td>Annual CTC</td><td><strong>₹ {{CTC}}</strong></td></tr>
      <tr><td>Monthly Salary</td><td><strong>₹ {{Salary}}</strong></td></tr>
    </table>

    <div class="section-title">Leave Policy</div>
    <p>{{LeavePolicy}}</p>

    <div class="section-title">General Terms</div>
    <ol>
      <li>You shall abide by all rules, regulations, and policies of the company.</li>
      <li>You shall maintain strict confidentiality of all company information.</li>
      <li>You shall not engage in any other employment or business during your tenure.</li>
      <li>The company reserves the right to amend terms and conditions as deemed necessary.</li>
      <li>This appointment is subject to the terms mentioned in the Employee Handbook.</li>
    </ol>

    <p>We welcome you to the {{CompanyName}} family and look forward to a mutually rewarding association.</p>
  </div>

  <div class="signature">
    <table>
      <tr>
        <td>
          <p><strong>For {{CompanyName}}</strong></p>
          <img src="{{HRSignature}}" alt="Signature" style="display:{{HRSignature:none}};" onerror="this.style.display='none'">
          <p><strong>{{HRName}}</strong><br>Human Resources<br>{{CompanyName}}</p>
        </td>
        <td style="text-align: right;">
          <p><strong>Accepted By:</strong></p>
          <br><br>
          <p><strong>{{EmployeeName}}</strong><br>Date: _______________</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">{{CompanyName}} | {{CompanyAddress}} | Confidential</div>
</body>
</html>`
  },
  {
    name: 'Relieving Letter',
    description: 'Official relieving letter confirming no dues and releasing the employee from their obligations upon resignation or separation.',
    documentCategory: 'HR Documents',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'EmployeeName', 'Designation', 'Department', 'JoiningDate', 'RelievingDate', 'Reason', 'HRName', 'HRSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; color: #333; margin: 0; padding: 40px; }
  .container { max-width: 700px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
  .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
  .header img { max-height: 65px; }
  .header h1 { font-size: 18px; color: #2563eb; margin: 5px 0; }
  .title { text-align: center; font-size: 17px; font-weight: bold; margin: 15px 0; color: #2563eb; letter-spacing: 1px; }
  .content { font-size: 14px; line-height: 1.8; }
  .content p { margin-bottom: 10px; }
  .footer-sign { margin-top: 35px; }
  .footer-sign .sign-line { margin-top: 40px; border-top: 1px solid #333; width: 180px; padding-top: 8px; }
  .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>{{CompanyName}}</h1>
  </div>
  <div style="text-align:right;font-size:12px;color:#888;">Date: {{CurrentDate}}</div>
  <div class="title">RELIEVING LETTER</div>
  <div class="content">
    <p>This is to certify that <strong>Mr./Ms. {{EmployeeName}}</strong> who was employed with us as <strong>{{Designation}}</strong> in the <strong>{{Department}}</strong> department from <strong>{{JoiningDate}}</strong> to <strong>{{RelievingDate}}</strong>, has been relieved from their duties effective {{RelievingDate}}.</p>
    <p>Reason for leaving: {{Reason}}</p>
    <p>The employee has cleared all dues and obligations with the company. All company property including documents, ID card, laptop, and access cards have been returned.</p>
    <div style="text-align:center;margin:20px 0;"><span class="badge">✓ NO DUES CLEARED</span></div>
    <p>We thank {{EmployeeName}} for their contributions during their tenure and wish them success in their future endeavors.</p>
  </div>
  <div class="footer-sign">
    <strong>For {{CompanyName}}</strong>
    <div class="sign-line"><img src="{{HRSignature}}" alt="Signature" style="max-height:35px;display:block;margin-bottom:3px;display:{{HRSignature:none}};" onerror="this.style.display='none'"><strong>{{HRName}}</strong><br><span style="font-size:12px;color:#888;">Human Resources</span></div>
  </div>
  <div style="margin-top:20px;padding-top:10px;border-top:1px dashed #ccc;font-size:11px;color:#999;text-align:center;">This is a computer-generated document. No physical signature required.</div>
</div>
</body>
</html>`
  },
  {
    name: 'Promotion Letter',
    description: 'Formal promotion letter announcing career advancement with new designation, revised compensation, and effective date.',
    documentCategory: 'HR Documents',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'EmployeeName', 'OldDesignation', 'NewDesignation', 'Department', 'EffectiveDate', 'OldSalary', 'NewSalary', 'IncrementAmount', 'Reason', 'Manager', 'CEOName', 'CEOSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Helvetica', Arial, sans-serif; color: #333; margin: 0; padding: 35px; line-height: 1.6; }
  .header { text-align: center; padding: 15px; background: linear-gradient(135deg, #1e3a5f, #2563eb); color: white; border-radius: 8px 8px 0 0; margin: -35px -35px 25px -35px; }
  .header img { max-height: 55px; filter: brightness(0) invert(1); margin-bottom: 5px; display:{{CompanyLogo:none}}; }
  .header h1 { font-size: 18px; margin: 5px 0 2px; }
  .header p { font-size: 12px; opacity: 0.8; }
  .content { background: white; padding: 0 10px; }
  .title { font-size: 16px; font-weight: bold; color: #2563eb; text-align: center; margin: 20px 0; letter-spacing: 2px; }
  .congrats { font-size: 24px; text-align: center; margin: 10px 0; }
  .content p { font-size: 14px; margin-bottom: 10px; }
  .details { background: #f0f4ff; border-radius: 8px; padding: 15px; margin: 15px 0; }
  .details h3 { font-size: 13px; color: #2563eb; margin: 0 0 10px; }
  .details table { width: 100%; font-size: 13px; }
  .details td { padding: 5px 8px; }
  .details td:first-child { color: #666; width: 140px; }
  .highlight { color: #059669; font-weight: bold; font-size: 15px; }
  .footer { margin-top: 30px; }
  .footer img { max-height: 40px; }
</style></head>
<body>
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" onerror="this.style.display='none'">
    <h1>{{CompanyName}}</h1>
    <p>Career Growth &amp; Recognition</p>
  </div>
  <div class="congrats">🎉 Congratulations!</div>
  <div class="title">PROMOTION LETTER</div>
  <div class="content">
    <p>Dear <strong>{{EmployeeName}}</strong>,</p>
    <p>We are delighted to announce your promotion! Based on your exceptional performance, dedication, and contributions to <strong>{{CompanyName}}</strong>, you have been promoted effective <strong>{{EffectiveDate}}</strong>.</p>
    <div class="details">
      <h3>Promotion Details</h3>
      <table>
        <tr><td>Previous Designation</td><td>{{OldDesignation}}</td></tr>
        <tr><td>New Designation</td><td><strong>{{NewDesignation}}</strong></td></tr>
        <tr><td>Department</td><td>{{Department}}</td></tr>
        <tr><td>Previous Salary</td><td>₹ {{OldSalary}}</td></tr>
        <tr><td>New Salary</td><td><span class="highlight">₹ {{NewSalary}}</span></td></tr>
        <tr><td>Increment</td><td><span class="highlight">+ ₹ {{IncrementAmount}}</span></td></tr>
        <tr><td>Reporting To</td><td>{{Manager}}</td></tr>
        <tr><td>Effective Date</td><td>{{EffectiveDate}}</td></tr>
      </table>
    </div>
    <p>{{Reason}}</p>
    <p>We are confident that you will continue to excel in your new role and contribute to the growth of {{CompanyName}}.</p>
  </div>
  <div class="footer">
    <p><strong>Warm regards,</strong></p>
    <img src="{{CEOSignature}}" alt="Signature" style="display:{{CEOSignature:none}};" onerror="this.style.display='none'">
    <p><strong>{{CEOName}}</strong><br>Chief Executive Officer<br>{{CompanyName}}</p>
  </div>
  <div style="margin-top:25px;padding-top:10px;border-top:1px dashed #ccc;font-size:11px;color:#999;text-align:center;">Date: {{CurrentDate}} | Document Confidential</div>
</body>
</html>`
  },
  {
    name: 'Employee Payslip',
    description: 'Clean monthly salary slip for employees with a modern earnings & deductions breakdown, bank details, and net pay summary.',
    documentCategory: 'HR Documents',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'EmployeeID', 'Designation', 'Department', 'PAN', 'BankName', 'BankAccount', 'UAN', 'PayPeriod', 'PayDate', 'Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'SpecialAllowance', 'GrossEarnings', 'PF', 'ESI', 'ProfessionalTax', 'IncomeTax', 'TotalDeductions', 'NetPay', 'NetPayWords'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  /* A4 + print-friendly payslip. Table-based layout on purpose: jsPDF renders
     this HTML through html2canvas 1.4.1, which handles tables reliably but
     mis-renders flex/grid. All colors set to print with exact color adjust. */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 12px;
    color: #1f2937;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .payslip {
    width: 100%;
    max-width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #fff;
    padding: 12mm 11mm 8mm;
  }
  table { border-collapse: collapse; width: 100%; }

  /* Header */
  .hdr td { vertical-align: middle; padding: 0; }
  .hdr-company { font-size: 19px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.3px; }
  .hdr-addr { font-size: 10.5px; color: #6b7280; margin-top: 2px; line-height: 1.45; }
  .hdr-logo { text-align: right; }
  .hdr-logo img { max-height: 52px; max-width: 130px; }
  .hdr-title {
    background: #1d4ed8; color: #fff; text-align: center;
    font-size: 12px; font-weight: 700; letter-spacing: 3px;
    text-transform: uppercase; padding: 7px 0; margin-top: 10px;
  }

  /* Pay period strip */
  .meta { margin-top: 10px; border: 1px solid #e5e7eb; background: #f8fafc; }
  .meta td { padding: 7px 10px; font-size: 11px; color: #374151; width: 50%; }
  .meta td + td { border-left: 1px solid #e5e7eb; }
  .meta .lbl { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; }

  /* Employee details */
  .emp { margin-top: 10px; }
  .emp td { padding: 6px 8px; font-size: 11.5px; border: 1px solid #e5e7eb; width: 50%; vertical-align: top; }
  .emp .lbl { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 1px; }

  /* Earnings / Deductions columns */
  .cols { margin-top: 12px; }
  .cols > tbody > tr > td { width: 50%; vertical-align: top; padding: 0; }
  .cols > tbody > tr > td:first-child { padding-right: 5px; }
  .cols > tbody > tr > td:last-child { padding-left: 5px; }
  .section { border: 1px solid #e5e7eb; }
  .section-head { background: #1d4ed8; color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 6px 10px; }
  .items td { padding: 5px 10px; font-size: 11.5px; border-bottom: 1px solid #f3f4f6; }
  .items td:last-child { text-align: right; font-weight: 600; color: #111827; }
  .items tr:last-child td { border-bottom: none; }
  .items tr.total td { background: #eff6ff; font-weight: 700; color: #1d4ed8; border-top: 2px solid #1d4ed8; }

  /* Net pay */
  .net { margin-top: 12px; background: #059669; color: #fff; }
  .net td { padding: 9px 14px; vertical-align: middle; }
  .net-label { font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .net-label small { display: block; font-size: 9.5px; font-weight: 400; text-transform: none; letter-spacing: 0; opacity: 0.9; margin-top: 2px; }
  .net-amount { text-align: right; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }

  /* Bank + footer */
  .bank { margin-top: 10px; font-size: 10.5px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 7px; }
  .footer { margin-top: 8px; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 6px; }

  @media print {
    html, body { background: #fff !important; }
    .payslip { max-width: none; min-height: 0; padding: 0; }
  }
</style></head>
<body>
<div class="payslip">
  <!-- Header -->
  <table class="hdr">
    <tr>
      <td>
        <div class="hdr-company">{{CompanyName}}</div>
        <div class="hdr-addr">{{CompanyAddress}}</div>
      </td>
      <td class="hdr-logo">
        <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
      </td>
    </tr>
  </table>
  <div class="hdr-title">Salary Slip</div>

  <!-- Pay period -->
  <table class="meta">
    <tr>
      <td><span class="lbl">Pay Period</span>{{PayPeriod}}</td>
      <td><span class="lbl">Pay Date</span>{{PayDate}}</td>
    </tr>
  </table>

  <!-- Employee details -->
  <table class="emp">
    <tr>
      <td><span class="lbl">Employee Name</span>{{EmployeeName}}</td>
      <td><span class="lbl">Employee ID</span>{{EmployeeID}}</td>
    </tr>
    <tr>
      <td><span class="lbl">Designation</span>{{Designation}}</td>
      <td><span class="lbl">Department</span>{{Department}}</td>
    </tr>
    <tr>
      <td><span class="lbl">PAN</span>{{PAN}}</td>
      <td><span class="lbl">UAN</span>{{UAN}}</td>
    </tr>
  </table>

  <!-- Earnings / Deductions -->
  <table class="cols">
    <tr>
      <td>
        <div class="section">
          <div class="section-head">Earnings</div>
          <table class="items">
            <tr><td>Basic Salary</td><td>₹ {{Basic}}</td></tr>
            <tr><td>Dearness Allowance</td><td>₹ {{DA}}</td></tr>
            <tr><td>House Rent Allowance</td><td>₹ {{HRA}}</td></tr>
            <tr><td>Conveyance Allowance</td><td>₹ {{Conveyance}}</td></tr>
            <tr><td>Medical Allowance</td><td>₹ {{Medical}}</td></tr>
            <tr><td>Special Allowance</td><td>₹ {{SpecialAllowance}}</td></tr>
            <tr class="total"><td>Gross Earnings</td><td>₹ {{GrossEarnings}}</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="section">
          <div class="section-head">Deductions</div>
          <table class="items">
            <tr><td>Provident Fund</td><td>₹ {{PF}}</td></tr>
            <tr><td>ESI</td><td>₹ {{ESI}}</td></tr>
            <tr><td>Professional Tax</td><td>₹ {{ProfessionalTax}}</td></tr>
            <tr><td>Income Tax</td><td>₹ {{IncomeTax}}</td></tr>
            <tr class="total"><td>Total Deductions</td><td>₹ {{TotalDeductions}}</td></tr>
          </table>
        </div>
      </td>
    </tr>
  </table>

  <!-- Net pay -->
  <table class="net">
    <tr>
      <td>
        <div class="net-label">Net Pay<small>Rupees {{NetPayWords}} only</small></div>
      </td>
      <td class="net-amount">₹ {{NetPay}}</td>
    </tr>
  </table>

  <div class="bank"><strong>Bank:</strong> {{BankName}} &nbsp;|&nbsp; <strong>A/c No:</strong> {{BankAccount}}</div>
  <div class="footer">This is a computer-generated payslip | {{CompanyName}} | For any discrepancies, contact HR</div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // PAYROLL
  // ═══════════════════════════════════════════════
  {
    name: 'Monthly Payslip',
    description: 'Professional monthly salary slip with detailed earnings and deductions breakdown, ready for printing.',
    documentCategory: 'Payroll',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'EmployeeID', 'Designation', 'Department', 'PAN', 'BankName', 'BankAccount', 'UAN', 'PayPeriod', 'PayDate', 'Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'SpecialAllowance', 'GrossEarnings', 'PF', 'ESI', 'ProfessionalTax', 'IncomeTax', 'TotalDeductions', 'NetPay', 'NetPayWords'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Courier New', monospace; color: #222; margin: 0; padding: 25px; font-size: 12px; }
  .payslip { max-width: 750px; margin: 0 auto; border: 2px solid #333; }
  .header { text-align: center; padding: 12px; border-bottom: 2px solid #333; background: #f8f8f8; }
  .header img { max-height: 50px; }
  .header h1 { font-size: 16px; margin: 3px 0; text-transform: uppercase; letter-spacing: 2px; }
  .header p { font-size: 10px; color: #555; margin: 0; }
  .meta { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #ccc; background: #f8f8f8; font-size: 11px; }
  .meta div { flex: 1; }
  .meta strong { display: inline-block; width: 80px; }
  .section-title { font-weight: bold; font-size: 12px; padding: 6px 12px; background: #1a56db; color: white; text-transform: uppercase; letter-spacing: 1px; }
  .earnings-table { width: 100%; border-collapse: collapse; }
  .earnings-table td { padding: 5px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
  .earnings-table td:last-child { text-align: right; }
  .earnings-table tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: bold; background: #e8f0fe; }
  .grand-total { font-size: 14px; font-weight: bold; color: #059669; }
  .net-pay { text-align: center; padding: 12px; background: #dcfce7; border-top: 2px solid #059669; font-size: 18px; font-weight: bold; color: #059669; letter-spacing: 1px; }
  .net-pay small { display: block; font-size: 11px; color: #666; font-weight: normal; margin-top: 3px; }
  .footer { text-align: center; padding: 8px; font-size: 9px; color: #999; border-top: 1px solid #ddd; }
  .employee-details { padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 5px 20px; font-size: 11px; border-bottom: 1px solid #ddd; }
  .employee-details span strong { display: inline-block; width: 90px; }
</style></head>
<body>
<div class="payslip">
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>{{CompanyName}}</h1>
    <p>{{CompanyAddress}}</p>
  </div>

  <div class="meta">
    <div><strong>Pay Period:</strong> {{PayPeriod}}</div>
    <div><strong>Pay Date:</strong> {{PayDate}}</div>
    <div><strong>PAN:</strong> {{PAN}}</div>
  </div>

  <div class="employee-details">
    <span><strong>Employee Name:</strong> {{EmployeeName}}</span>
    <span><strong>Employee ID:</strong> {{EmployeeID}}</span>
    <span><strong>Designation:</strong> {{Designation}}</span>
    <span><strong>Department:</strong> {{Department}}</span>
    <span><strong>UAN:</strong> {{UAN}}</span>
    <span><strong>Bank:</strong> {{BankName}}</span>
    <span><strong>A/c No:</strong> {{BankAccount}}</span>
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td width="50%" valign="top" style="border-right:1px solid #ddd;">
        <div class="section-title">Earnings</div>
        <table class="earnings-table" width="100%">
          <tr><td>Basic Salary</td><td>₹ {{Basic}}</td></tr>
          <tr><td>Dearness Allowance</td><td>₹ {{DA}}</td></tr>
          <tr><td>House Rent Allowance</td><td>₹ {{HRA}}</td></tr>
          <tr><td>Conveyance Allowance</td><td>₹ {{Conveyance}}</td></tr>
          <tr><td>Medical Allowance</td><td>₹ {{Medical}}</td></tr>
          <tr><td>Special Allowance</td><td>₹ {{SpecialAllowance}}</td></tr>
          <tr class="total-row"><td>Gross Earnings</td><td>₹ {{GrossEarnings}}</td></tr>
        </table>
      </td>
      <td width="50%" valign="top">
        <div class="section-title">Deductions</div>
        <table class="earnings-table" width="100%">
          <tr><td>Provident Fund</td><td>₹ {{PF}}</td></tr>
          <tr><td>ESI</td><td>₹ {{ESI}}</td></tr>
          <tr><td>Professional Tax</td><td>₹ {{ProfessionalTax}}</td></tr>
          <tr><td>Income Tax</td><td>₹ {{IncomeTax}}</td></tr>
          <tr class="total-row"><td>Total Deductions</td><td>₹ {{TotalDeductions}}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <div class="net-pay">
    NET PAY: ₹ {{NetPay}}
    <small>Rupees {{NetPayWords}} only</small>
  </div>

  <div class="footer">
    <p>This is a computer-generated payslip | {{CompanyName}} | For any discrepancies, contact HR</p>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Salary Revision Letter',
    description: 'Formal salary revision letter with details of compensation changes, effective date, and revised CTC structure.',
    documentCategory: 'Payroll',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'EmployeeName', 'Designation', 'OldCTC', 'NewCTC', 'IncrementAmount', 'IncrementPercentage', 'EffectiveDate', 'Reason', 'Manager', 'HRName', 'HRSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 35px; line-height: 1.6; }
  .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 15px; }
  .header img { max-height: 65px; }
  .header h1 { color: #059669; font-size: 20px; margin: 5px 0; }
  .title { text-align: center; font-size: 16px; font-weight: bold; color: #059669; margin: 20px 0; letter-spacing: 1px; }
  .content p { font-size: 14px; }
  .salary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center; }
  .salary-box .old { font-size: 16px; color: #888; text-decoration: line-through; }
  .salary-box .arrow { font-size: 20px; color: #059669; margin: 5px 0; }
  .salary-box .new { font-size: 22px; color: #059669; font-weight: bold; }
  .salary-box .detail { font-size: 13px; color: #666; margin-top: 5px; }
  .footer { margin-top: 30px; }
  .footer img { max-height: 40px; }
</style></head>
<body>
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>{{CompanyName}}</h1>
  </div>
  <div style="text-align:right;font-size:12px;color:#888;">Date: {{CurrentDate}}</div>
  <div class="title">SALARY REVISION LETTER</div>
  <div class="content">
    <p>Dear <strong>{{EmployeeName}}</strong>,</p>
    <p>We are pleased to inform you that based on your performance and contributions, your compensation has been revised. The new salary structure will be effective from <strong>{{EffectiveDate}}</strong>.</p>
    <div class="salary-box">
      <div class="old">₹ {{OldCTC}}</div>
      <div class="arrow">↓ ↑</div>
      <div class="new">₹ {{NewCTC}}</div>
      <div class="detail">Increment: ₹ {{IncrementAmount}} ({{IncrementPercentage}}% increase)</div>
    </div>
    <p>{{Reason}}</p>
    <p>The revised salary will be reflected in your payslip starting from the next payroll cycle. Please find the detailed CTC breakup attached.</p>
  </div>
  <div class="footer">
    <strong>For {{CompanyName}}</strong><br>
    <img src="{{HRSignature}}" alt="Signature" style="display:{{HRSignature:none}};" onerror="this.style.display='none'">
    <p><strong>{{HRName}}</strong><br>Human Resources</p>
    <p style="font-size:12px;color:#888;margin-top:20px;">Accepted by: _______________ | Date: _______________</p>
  </div>
  <div style="margin-top:20px;text-align:center;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:10px;">{{CompanyName}} | Confidential</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // FINANCE
  // ═══════════════════════════════════════════════
  {
    name: 'GST Invoice',
    description: 'Professional GST-compliant tax invoice with company details, buyer info, itemized billing, and tax breakdown.',
    documentCategory: 'Finance',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'CompanyWebsite', 'GST', 'PAN', 'CIN', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'BuyerName', 'BuyerAddress', 'BuyerGST', 'BuyerState', 'BuyerStateCode', 'ItemsTable', 'Subtotal', 'CGST', 'SGST', 'IGST', 'TotalTax', 'GrandTotal', 'TotalInWords', 'BankName', 'BankAccount', 'BankIfsc', 'AuthorizedSignature', 'TermsConditions'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 30px; color: #222; font-size: 12px; }
  .invoice { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 25px; background: white; }
  .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #1a56db; padding-bottom: 15px; margin-bottom: 15px; }
  .header-left img { max-height: 60px; }
  .header-left h1 { font-size: 18px; color: #1a56db; margin: 3px 0; }
  .header-left p { font-size: 11px; color: #555; margin: 1px 0; }
  .header-right { text-align: right; }
  .header-right .invoice-title { font-size: 22px; font-weight: bold; color: #1a56db; letter-spacing: 2px; }
  .header-right .invoice-no { font-size: 14px; font-weight: bold; margin-top: 3px; }
  .gst-badge { display: inline-block; background: #1a56db; color: white; padding: 2px 10px; font-size: 10px; border-radius: 3px; font-weight: bold; letter-spacing: 1px; }
  .parties { display: flex; justify-content: space-between; margin: 15px 0; }
  .parties div { width: 48%; }
  .parties h3 { font-size: 11px; color: #1a56db; text-transform: uppercase; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; margin: 0 0 5px 0; }
  .parties p { font-size: 11px; margin: 2px 0; color: #555; }
  .parties .name { font-weight: bold; color: #222; font-size: 12px; }
  table.items { width: 100%; border-collapse: collapse; margin: 15px 0; }
  table.items th { background: #1a56db; color: white; padding: 8px 10px; font-size: 11px; text-align: left; }
  table.items td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
  table.items tr:nth-child(even) td { background: #f8f9fa; }
  table.items .amt { text-align: right; }
  .totals { margin-left: auto; width: 300px; }
  .totals table { width: 100%; }
  .totals td { padding: 4px 10px; font-size: 12px; }
  .totals td:last-child { text-align: right; }
  .totals .grand-row td { font-weight: bold; font-size: 14px; color: #1a56db; border-top: 2px solid #1a56db; padding-top: 8px; }
  .tax-breakup { width: 300px; margin-left: auto; margin-top: 5px; border-collapse: collapse; }
  .tax-breakup td { padding: 3px 10px; font-size: 11px; }
  .tax-breakup td:last-child { text-align: right; }
  .amount-words { margin: 15px 0; font-size: 12px; font-weight: bold; }
  .footer { margin-top: 25px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; }
  .footer .terms { font-size: 10px; color: #666; width: 60%; }
  .footer .sign { text-align: right; width: 35%; }
  .footer .sign img { max-height: 40px; }
  .footer .sign p { font-size: 11px; margin: 2px 0; }
</style></head>
<body>
<div class="invoice">
  <div class="header">
    <div class="header-left">
      <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
      <h1>{{CompanyName}}</h1>
      <p>{{CompanyAddress}}</p>
      <p>Email: {{CompanyEmail}} | Phone: {{CompanyPhone}}</p>
      <p>Website: {{CompanyWebsite}}</p>
    </div>
    <div class="header-right">
      <div class="invoice-title">TAX INVOICE</div>
      <div class="invoice-no">{{InvoiceNumber}}</div>
      <div style="margin-top:5px;"><span class="gst-badge">GST</span></div>
    </div>
  </div>

  <div class="parties">
    <div>
      <h3>Seller (Supplier)</h3>
      <p class="name">{{CompanyName}}</p>
      <p>{{CompanyAddress}}</p>
      <p><strong>GSTIN:</strong> {{GST}}</p>
      <p><strong>PAN:</strong> {{PAN}}</p>
      <p><strong>CIN:</strong> {{CIN}}</p>
    </div>
    <div>
      <h3>Buyer (Recipient)</h3>
      <p class="name">{{BuyerName}}</p>
      <p>{{BuyerAddress}}</p>
      <p><strong>GSTIN:</strong> {{BuyerGST}}</p>
      <p><strong>State:</strong> {{BuyerState}} ({{BuyerStateCode}})</p>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:10px;">
    <span><strong>Invoice Date:</strong> {{InvoiceDate}}</span>
    <span><strong>Due Date:</strong> {{DueDate}}</span>
  </div>

  <table class="items">
    <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th class="amt">Amount</th></tr></thead>
    <tbody>{{ItemsTable}}</tbody>
  </table>

  <div class="tax-breakup">
    <table>
      <tr><td>CGST @ 9%</td><td>₹ {{CGST}}</td></tr>
      <tr><td>SGST @ 9%</td><td>₹ {{SGST}}</td></tr>
      <tr><td>IGST @ 18%</td><td>₹ {{IGST}}</td></tr>
    </table>
  </div>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td>₹ {{Subtotal}}</td></tr>
      <tr><td>Total Tax</td><td>₹ {{TotalTax}}</td></tr>
      <tr class="grand-row"><td>Grand Total</td><td>₹ {{GrandTotal}}</td></tr>
    </table>
  </div>

  <div class="amount-words">Amount in Words: {{TotalInWords}}</div>

  <div style="font-size:11px;color:#555;margin:10px 0;"><strong>Bank Details:</strong> {{BankName}} | A/c: {{BankAccount}} | IFSC: {{BankIfsc}}</div>

  <div class="footer">
    <div class="terms">
      <strong>Terms &amp; Conditions:</strong>
      <p>{{TermsConditions}}</p>
    </div>
    <div class="sign">
      <p><strong>For {{CompanyName}}</strong></p>
      <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
      <p>Authorized Signatory</p>
    </div>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Business Quotation',
    description: 'Professional quotation/proposal for products or services with company details, pricing, and terms.',
    documentCategory: 'Finance',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'CompanyWebsite', 'GST', 'QuotationNumber', 'QuotationDate', 'ValidUntil', 'ClientName', 'ClientAddress', 'ClientEmail', 'ItemsTable', 'Subtotal', 'Discount', 'TaxPercentage', 'TaxAmount', 'GrandTotal', 'TotalInWords', 'PaymentTerms', 'DeliveryTerms', 'AuthorizedSignature', 'TermsConditions'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 30px; color: #222; }
  .quote { max-width: 800px; margin: 0 auto; border: 1px solid #e0e0e0; padding: 30px; }
  .header { border-bottom: 3px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; position: relative; }
  .header h1 { font-size: 22px; color: #f59e0b; margin: 0; letter-spacing: 1px; }
  .header .sub { font-size: 11px; color: #888; }
  .ribbon { position: absolute; top: 0; right: 0; background: #f59e0b; color: white; padding: 5px 15px; font-size: 11px; font-weight: bold; border-radius: 0 0 0 8px; letter-spacing: 2px; }
  .info-row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 12px; color: #555; }
  .info-row strong { color: #333; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #f59e0b; color: white; padding: 8px 12px; font-size: 12px; text-align: left; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
  .amount { text-align: right; }
  .total-table { margin-left: auto; width: 300px; }
  .total-table td:last-child { text-align: right; }
  .grand { font-weight: bold; font-size: 16px; color: #f59e0b; border-top: 2px solid #f59e0b; }
  .words { font-size: 12px; font-weight: bold; margin: 15px 0; color: #555; }
  .terms { display: flex; justify-content: space-between; margin-top: 25px; border-top: 1px solid #ddd; padding-top: 15px; }
  .terms div { width: 48%; font-size: 11px; color: #666; }
  .sign { text-align: right; }
  .sign img { max-height: 45px; }
  .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 10px; }
</style></head>
<body>
<div class="quote">
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" style="max-height:50px;display:block;margin-bottom:5px;display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>QUOTATION</h1>
    <div class="sub">{{CompanyName}} | {{CompanyAddress}}</div>
    <div class="ribbon">QUOTE</div>
  </div>

  <div class="info-row">
    <span><strong>Quote #:</strong> {{QuotationNumber}}</span>
    <span><strong>Date:</strong> {{QuotationDate}}</span>
    <span><strong>Valid Until:</strong> {{ValidUntil}}</span>
  </div>

  <div style="background:#fef9ef;padding:12px;border-radius:6px;margin:10px 0;">
    <strong style="color:#92400e;">Client:</strong> {{ClientName}}<br>
    <span style="font-size:12px;color:#666;">{{ClientAddress}} | {{ClientEmail}}</span>
  </div>

  <table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th class="amount">Total</th></tr></thead><tbody>{{ItemsTable}}</tbody></table>

  <table class="total-table">
    <tr><td>Subtotal</td><td>₹ {{Subtotal}}</td></tr>
    <tr><td>Discount</td><td>₹ {{Discount}}</td></tr>
    <tr><td>Tax ({{TaxPercentage}}%)</td><td>₹ {{TaxAmount}}</td></tr>
    <tr class="grand"><td>Grand Total</td><td>₹ {{GrandTotal}}</td></tr>
  </table>

  <div class="words">Amount in Words: {{TotalInWords}}</div>

  <div class="terms">
    <div>
      <strong>Payment Terms:</strong> {{PaymentTerms}}<br><br>
      <strong>Delivery Terms:</strong> {{DeliveryTerms}}<br><br>
      <strong>Terms &amp; Conditions:</strong><br>{{TermsConditions}}
    </div>
    <div class="sign">
      <strong>For {{CompanyName}}</strong><br>
      <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};margin-top:30px;" onerror="this.style.display='none'">
      <p style="margin:2px 0;">Authorized Signatory</p>
    </div>
  </div>
  <div class="footer">{{CompanyName}} | {{CompanyEmail}} | {{CompanyPhone}} | GST: {{GST}}</div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // LEGAL
  // ═══════════════════════════════════════════════
  {
    name: 'Non-Disclosure Agreement (NDA)',
    description: 'Standard mutual non-disclosure agreement for protecting confidential business information between parties.',
    documentCategory: 'Legal',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'PartyAName', 'PartyAAddress', 'PartyBName', 'PartyBAddress', 'EffectiveDate', 'TermYears', 'Jurisdiction', 'AuthorizedSignature', 'NDA_Signature_PartyB', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; color: #222; margin: 0; padding: 35px; line-height: 1.8; font-size: 13px; }
  h1 { text-align: center; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
  .subtitle { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 25px; letter-spacing: 1px; }
  .party-line { text-align: center; font-size: 14px; margin: 10px 0 25px; }
  .party-line strong { text-decoration: underline; }
  .section { margin: 18px 0; }
  .section h3 { font-size: 14px; font-weight: bold; margin: 0 0 8px; }
  .section p { margin: 5px 0; text-align: justify; }
  .section ol { padding-left: 25px; }
  .section ol li { margin-bottom: 6px; }
  .clause { margin: 12px 0; }
  .clause strong { font-size: 13px; }
  .witness { display: flex; justify-content: space-between; margin-top: 40px; }
  .witness div { width: 45%; }
  .witness .line { border-top: 1px solid #333; width: 200px; margin-top: 40px; padding-top: 5px; }
  .witness img { max-height: 40px; display: block; }
  .footer { text-align: center; font-size: 11px; color: #888; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
</style></head>
<body>
  <h1>NON-DISCLOSURE AGREEMENT</h1>
  <div class="subtitle">(Mutual NDA)</div>

  <p style="text-align:center;font-size:13px;">This Non-Disclosure Agreement (the "Agreement") is entered into on <strong>{{EffectiveDate}}</strong></p>

  <div class="party-line">
    BETWEEN <strong>{{PartyAName}}</strong>, having its registered office at {{PartyAAddress}} (hereinafter referred to as "<strong>Disclosing Party</strong>")<br>
    AND <strong>{{PartyBName}}</strong>, having its registered office at {{PartyBAddress}} (hereinafter referred to as "<strong>Receiving Party</strong>")
  </div>

  <p style="text-align:center;font-style:italic;color:#555;">(Each referred to individually as a "Party" and collectively as the "Parties")</p>

  <div class="section">
    <h3>WHEREAS:</h3>
    <p>The Parties wish to explore a potential business relationship and may disclose certain confidential information to each other. The Parties agree that the confidentiality of such information must be protected as set forth below.</p>
  </div>

  <div class="section">
    <h3>NOW, THEREFORE, the Parties agree as follows:</h3>
    <ol type="1">
      <li><strong>Definition of Confidential Information:</strong> "Confidential Information" means any information, technical data, or know-how disclosed by one Party to the other, including but not limited to business plans, financial data, customer lists, trade secrets, product designs, and marketing strategies.</li>
      <li><strong>Obligations of Receiving Party:</strong> The Receiving Party shall: (a) maintain all Confidential Information in strict confidence; (b) not disclose such information to any third party without prior written consent; (c) use the information solely for the purpose of evaluating the business relationship.</li>
      <li><strong>Exclusions:</strong> Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was known to the Receiving Party prior to disclosure; (c) is independently developed without use of the Confidential Information.</li>
      <li><strong>Term:</strong> This Agreement shall remain in effect for a period of <strong>{{TermYears}} years</strong> from the Effective Date.</li>
      <li><strong>Return of Information:</strong> Upon request, the Receiving Party shall return or destroy all Confidential Information and certify such action in writing.</li>
      <li><strong>Governing Law:</strong> This Agreement shall be governed by the laws of <strong>{{Jurisdiction}}</strong>.</li>
      <li><strong>Remedies:</strong> The Parties acknowledge that monetary damages may be insufficient for breach and that injunctive relief may be sought.</li>
    </ol>
  </div>

  <div class="witness">
    <div>
      <strong>For {{PartyAName}}</strong><br>
      <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
      <div class="line">Authorized Signatory</div>
      <p style="font-size:11px;color:#555;margin-top:3px;">Date: _______________</p>
    </div>
    <div style="text-align:right;">
      <strong>For {{PartyBName}}</strong><br>
      <img src="{{NDA_Signature_PartyB}}" alt="Signature" style="display:{{NDA_Signature_PartyB:none}};margin-left:auto;" onerror="this.style.display='none'">
      <div class="line" style="margin-left:auto;">Authorized Signatory</div>
      <p style="font-size:11px;color:#555;margin-top:3px;">Date: _______________</p>
    </div>
  </div>

  <div class="footer">{{CompanyName}} | Confidential</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // BUSINESS
  // ═══════════════════════════════════════════════
  {
    name: 'Business Proposal',
    description: 'Professional business proposal with executive summary, scope of work, timeline, pricing, and next steps.',
    documentCategory: 'Business',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'ProposalTitle', 'ClientName', 'ClientCompany', 'ExecutiveSummary', 'ScopeOfWork', 'ProjectTimeline', 'ProjectCost', 'PaymentTerms', 'TeamMembers', 'AuthorizedSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 0; line-height: 1.6; }
  .cover { text-align: center; padding: 60px 40px; background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; page-break-after: always; }
  .cover h1 { font-size: 32px; margin: 20px 0 10px; font-weight: 700; letter-spacing: 1px; }
  .cover h2 { font-size: 20px; font-weight: 400; opacity: 0.9; margin: 0; }
  .cover .meta { margin-top: 40px; font-size: 14px; opacity: 0.7; }
  .cover .logo { max-height: 70px; filter: brightness(0) invert(1); margin-bottom: 15px; display:{{CompanyLogo:none}}; }
  .page { padding: 40px; max-width: 800px; margin: 0 auto; }
  .page h2 { color: #1e3a5f; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-top: 30px; font-size: 18px; }
  .page h3 { color: #2563eb; font-size: 15px; margin: 15px 0 8px; }
  .page p { font-size: 13px; margin-bottom: 10px; color: #444; }
  .summary-box { background: #f0f4ff; border-left: 4px solid #2563eb; padding: 15px 20px; margin: 15px 0; border-radius: 0 8px 8px 0; }
  .details-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  .details-table td { padding: 8px 12px; border: 1px solid #e0e0e0; font-size: 13px; }
  .details-table td:first-child { font-weight: 600; background: #f8f9fa; width: 140px; }
  .cost { font-size: 24px; font-weight: bold; color: #059669; text-align: center; padding: 15px; background: #f0fdf4; border-radius: 8px; margin: 15px 0; }
  .signature { margin-top: 30px; text-align: right; }
  .signature img { max-height: 45px; }
  .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
</style></head>
<body>
  <div class="cover">
    <img src="{{CompanyLogo}}" class="logo" onerror="this.style.display='none'">
    <h1>Business Proposal</h1>
    <h2>{{ProposalTitle}}</h2>
    <div class="meta">
      <p>Prepared for: <strong>{{ClientCompany}}</strong></p>
      <p>Presented by: <strong>{{CompanyName}}</strong></p>
      <p>Date: {{CurrentDate}}</p>
    </div>
  </div>

  <div class="page">
    <h2>Executive Summary</h2>
    <div class="summary-box">{{ExecutiveSummary}}</div>

    <h2>About {{CompanyName}}</h2>
    <p>{{CompanyName}} is a trusted provider of professional business solutions. With our expertise and experience, we deliver exceptional value to our clients. Our team of dedicated professionals ensures quality outcomes and client satisfaction.</p>

    <h2>Scope of Work</h2>
    <p>{{ScopeOfWork}}</p>

    <h2>Project Timeline</h2>
    <p>{{ProjectTimeline}}</p>

    <h2>Investment</h2>
    <div class="cost">₹ {{ProjectCost}}</div>
    <div style="text-align:center;font-size:12px;color:#666;">{{PaymentTerms}}</div>

    <h2>Our Team</h2>
    <p>{{TeamMembers}}</p>

    <h2>Next Steps</h2>
    <p>We look forward to partnering with {{ClientCompany}} on this exciting project. Please review the proposal and let us know if you have any questions. We are available for a follow-up meeting at your convenience.</p>

    <div class="signature">
      <p><strong>Warm regards,</strong></p>
      <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
      <p><strong>{{CompanyName}}</strong></p>
      <p style="font-size:12px;color:#888;">{{CompanyEmail}} | {{CompanyAddress}}</p>
    </div>
    <div class="footer">PROPOSAL #{{ProposalTitle:PROP}}{{CurrentYear}} | Validity: 30 days</div>
  </div>
</body>
</html>`
  },
  {
    name: 'Meeting Minutes',
    description: 'Professional meeting minutes template with agenda, discussion points, action items, and attendee tracking.',
    documentCategory: 'Business',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'MeetingTitle', 'MeetingDate', 'MeetingTime', 'MeetingLocation', 'Chairperson', 'Attendees', 'Agenda', 'DiscussionPoints', 'Decisions', 'ActionItemsTable', 'NextMeeting', 'MinutesBy', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Calibri', Arial, sans-serif; color: #333; margin: 0; padding: 35px; line-height: 1.6; }
  h1 { font-size: 22px; color: #1e3a5f; margin: 0 0 3px; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; }
  .header img { max-height: 55px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 25px; margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 6px; font-size: 13px; }
  .meta-grid strong { color: #555; }
  .section { margin: 18px 0; }
  .section h2 { font-size: 15px; color: #1e3a5f; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; margin: 0 0 10px; }
  .section p, .section li { font-size: 13px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #1e3a5f; color: white; padding: 7px 10px; font-size: 12px; text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
  .status-pending { color: #f59e0b; }
  .status-complete { color: #059669; }
  .footer { margin-top: 30px; display: flex; justify-content: space-between; border-top: 1px solid #ddd; padding-top: 12px; font-size: 12px; }
  .signature-line { border-top: 1px solid #333; width: 200px; margin-top: 30px; padding-top: 5px; font-size: 12px; }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>Meeting Minutes</h1>
      <div class="subtitle">{{MeetingTitle}}</div>
    </div>
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
  </div>

  <div class="meta-grid">
    <div><strong>Date:</strong> {{MeetingDate}}</div>
    <div><strong>Time:</strong> {{MeetingTime}}</div>
    <div><strong>Location:</strong> {{MeetingLocation}}</div>
    <div><strong>Chairperson:</strong> {{Chairperson}}</div>
    <div><strong>Attendees:</strong> {{Attendees}}</div>
    <div><strong>Minutes By:</strong> {{MinutesBy}}</div>
  </div>

  <div class="section">
    <h2>Agenda</h2>
    <p>{{Agenda}}</p>
  </div>

  <div class="section">
    <h2>Discussion Points</h2>
    <p>{{DiscussionPoints}}</p>
  </div>

  <div class="section">
    <h2>Decisions Made</h2>
    <p>{{Decisions}}</p>
  </div>

  <div class="section">
    <h2>Action Items</h2>
    <table><thead><tr><th>#</th><th>Task</th><th>Owner</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{{ActionItemsTable}}</tbody></table>
  </div>

  <div class="section">
    <h2>Next Meeting</h2>
    <p>{{NextMeeting}}</p>
  </div>

  <div class="footer">
    <div>
      <strong>Prepared by:</strong><br>
      <div class="signature-line">{{MinutesBy}}</div>
    </div>
    <div style="text-align:right;">
      <strong>Approved by:</strong><br>
      <div class="signature-line" style="margin-left:auto;">{{Chairperson}}</div>
    </div>
  </div>
  <div style="text-align:center;font-size:10px;color:#bbb;margin-top:10px;">{{CompanyName}} | Confidential | {{CurrentDate}}</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // RESUME BUILDER
  // ═══════════════════════════════════════════════
  {
    name: 'Professional Resume (ATS-Friendly)',
    description: 'Clean, ATS-optimized professional resume template with sections for experience, education, skills, and achievements.',
    documentCategory: 'Resume Builder',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['EmployeePhoto', 'FullName', 'Email', 'Phone', 'Address', 'LinkedIn', 'Portfolio', 'ProfessionalSummary', 'WorkExperience', 'Education', 'Skills', 'Certifications', 'Languages', 'Achievements', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', 'Helvetica', sans-serif; color: #333; margin: 0; padding: 0; line-height: 1.5; }
  .resume { max-width: 800px; margin: 0 auto; padding: 40px; }
  .header { border-bottom: 3px solid #1a56db; padding-bottom: 15px; margin-bottom: 20px; }
  .header .photo { float: right; width: 100px; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #eee; display:{{EmployeePhoto:block}}; }
  .header h1 { font-size: 28px; color: #1a56db; margin: 0; font-weight: 700; }
  .header .contact { font-size: 12px; color: #555; margin-top: 5px; }
  .header .contact span { margin-right: 15px; }
  .section { margin: 15px 0; }
  .section h2 { font-size: 16px; color: #1a56db; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; }
  .section p { font-size: 12px; margin: 3px 0; color: #444; }
  .job { margin: 10px 0; }
  .job .title { font-weight: bold; font-size: 13px; }
  .job .company { color: #1a56db; font-size: 12px; }
  .job .date { float: right; font-size: 11px; color: #888; }
  .job ul { margin: 3px 0; padding-left: 18px; }
  .job ul li { font-size: 12px; color: #444; margin-bottom: 2px; }
  .skill-tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .skill-tags span { background: #e8effa; color: #1a56db; padding: 2px 8px; border-radius: 3px; font-size: 11px; }
  .edu { margin: 8px 0; }
  .edu .degree { font-weight: bold; font-size: 13px; }
  .edu .institution { font-size: 12px; color: #555; }
  .edu .year { float: right; font-size: 11px; color: #888; }
  .two-col { display: flex; gap: 30px; }
  .two-col > div { flex: 1; }
</style></head>
<body>
<div class="resume">
  <div class="header">
    <img src="{{EmployeePhoto}}" class="photo" onerror="this.style.display='none'">
    <h1>{{FullName}}</h1>
    <div class="contact">
      <span>📧 {{Email}}</span>
      <span>📞 {{Phone}}</span>
      <span>📍 {{Address}}</span>
    </div>
    <div class="contact" style="margin-top:3px;">
      <span>🔗 {{LinkedIn}}</span>
      <span>🌐 {{Portfolio}}</span>
    </div>
  </div>

  <div class="section">
    <h2>Professional Summary</h2>
    <p>{{ProfessionalSummary}}</p>
  </div>

  <div class="section">
    <h2>Work Experience</h2>
    <div class="job">{{WorkExperience}}</div>
  </div>

  <div class="two-col">
    <div>
      <div class="section">
        <h2>Education</h2>
        <div class="edu">{{Education}}</div>
      </div>
      <div class="section">
        <h2>Certifications</h2>
        <p>{{Certifications}}</p>
      </div>
    </div>
    <div>
      <div class="section">
        <h2>Skills</h2>
        <div class="skill-tags">{{Skills}}</div>
      </div>
      <div class="section">
        <h2>Languages</h2>
        <p>{{Languages}}</p>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Achievements</h2>
    <p>{{Achievements}}</p>
  </div>

  <div style="text-align:center;font-size:10px;color:#bbb;border-top:1px solid #eee;padding-top:8px;margin-top:15px;">Resume - {{FullName}} | Updated: {{CurrentDate}}</div>
</div>
</body>
</html>`
  },
  {
    name: 'Cover Letter',
    description: 'Professional cover letter template with proper formatting for job applications, with placeholders for personalization.',
    documentCategory: 'Resume Builder',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['FullName', 'Email', 'Phone', 'Address', 'CurrentDate', 'HiringManagerName', 'CompanyName', 'CompanyAddress', 'Position', 'JobSource', 'CoverBody', 'Signature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; color: #222; margin: 0; padding: 50px; line-height: 2; font-size: 13px; }
  .letter { max-width: 650px; margin: 0 auto; }
  .sender { margin-bottom: 20px; }
  .sender p { margin: 0; }
  .date { margin-bottom: 25px; }
  .recipient { margin-bottom: 25px; }
  .recipient p { margin: 0; }
  .salutation { margin-bottom: 15px; }
  .body p { margin-bottom: 12px; text-align: justify; }
  .closing { margin-top: 25px; }
  .closing p { margin: 0; }
  .signature { margin-top: 30px; }
  .signature img { max-height: 50px; display: block; }
  .enclosure { margin-top: 15px; font-size: 12px; color: #666; }
  hr { border: none; border-top: 1px solid #ddd; margin: 30px 0 15px; }
</style></head>
<body>
<div class="letter">
  <div class="sender">
    <p><strong>{{FullName}}</strong></p>
    <p>{{Address}}</p>
    <p>{{Email}} | {{Phone}}</p>
  </div>

  <div class="date">{{CurrentDate}}</div>

  <div class="recipient">
    <p><strong>{{HiringManagerName}}</strong></p>
    <p>{{CompanyName}}</p>
    <p>{{CompanyAddress}}</p>
  </div>

  <div class="salutation">Dear <strong>{{HiringManagerName}}</strong>,</div>

  <div class="body">
    <p>I am writing to express my strong interest in the <strong>{{Position}}</strong> position at <strong>{{CompanyName}}</strong>, as advertised on {{JobSource}}. With my background and skills, I am confident that I would be a valuable addition to your team.</p>
    <p>{{CoverBody}}</p>
    <p>I am eager to discuss how my experience and qualifications align with the needs of {{CompanyName}}. Thank you for reviewing my application. I look forward to the opportunity to speak with you about how I can contribute to the continued success of your organization.</p>
  </div>

  <div class="closing">
    <p>Sincerely,</p>
  </div>
  <div class="signature">
    <img src="{{Signature}}" alt="Signature" style="display:{{Signature:none}};" onerror="this.style.display='none'">
    <p><strong>{{FullName}}</strong></p>
  </div>
  <div class="enclosure">Enclosure: Resume</div>
  <hr>
  <div style="text-align:center;font-size:10px;color:#bbb;">Cover Letter - {{FullName}} | {{CurrentDate}}</div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // EDUCATION
  // ═══════════════════════════════════════════════
  {
    name: 'Bonafide Certificate',
    description: 'Official bonafide certificate for students confirming their enrollment at the institution.',
    documentCategory: 'Education',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['InstitutionName', 'InstitutionLogo', 'InstitutionAddress', 'StudentName', 'StudentClass', 'StudentRollNo', 'AcademicYear', 'Purpose', 'IssuedDate', 'PrincipalName', 'PrincipalSignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Georgia', serif; color: #222; margin: 0; padding: 40px; }
  .container { max-width: 650px; margin: 0 auto; border: 3px solid #1e3a5f; padding: 35px; position: relative; }
  .header { text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 15px; margin-bottom: 20px; }
  .header img { max-height: 60px; }
  .header h1 { font-size: 20px; color: #1e3a5f; margin: 8px 0 3px; letter-spacing: 1px; }
  .header p { font-size: 11px; color: #555; margin: 0; }
  .title { text-align: center; font-size: 18px; font-weight: bold; color: #1e3a5f; margin: 20px 0; letter-spacing: 3px; text-transform: uppercase; }
  .content { font-size: 14px; line-height: 2; }
  .content p { text-indent: 30px; margin-bottom: 8px; }
  .seal { position: absolute; bottom: 30px; right: 30px; width: 100px; height: 100px; opacity: 0.1; }
  .footer { margin-top: 35px; display: flex; justify-content: space-between; }
  .footer .sign { text-align: right; }
  .footer .sign .line { border-top: 1px solid #333; width: 200px; margin-top: 35px; padding-top: 5px; }
  .footer .sign img { max-height: 40px; display: block; margin-left: auto; }
  .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 60px; color: rgba(30,58,95,0.04); font-weight: bold; pointer-events: none; z-index: 0; }
  .badge { text-align: center; margin: 15px 0; }
  .badge span { background: #1e3a5f; color: white; padding: 4px 15px; font-size: 11px; letter-spacing: 2px; }
</style></head>
<body>
<div class="container">
  <div class="watermark">BONAFIDE</div>
  <div class="header">
    <img src="{{InstitutionLogo}}" alt="Logo" style="display:{{InstitutionLogo:none}};" onerror="this.style.display='none'">
    <h1>{{InstitutionName}}</h1>
    <p>{{InstitutionAddress}}</p>
  </div>
  <div class="badge"><span>CERTIFICATE</span></div>
  <div class="title">Bonafide Certificate</div>
  <div class="content">
    <p>This is to certify that <strong>Mr./Ms. {{StudentName}}</strong> is a bonafide student of <strong>{{InstitutionName}}</strong>.</p>
    <p>He/She is studying in <strong>{{StudentClass}}</strong> bearing Roll No. <strong>{{StudentRollNo}}</strong> during the academic year <strong>{{AcademicYear}}</strong>.</p>
    <p>This certificate is issued for the purpose of <strong>{{Purpose}}</strong>.</p>
  </div>
  <div class="footer">
    <div><strong>Date:</strong> {{IssuedDate}}</div>
    <div class="sign">
      <img src="{{PrincipalSignature}}" alt="Signature" style="display:{{PrincipalSignature:none}};" onerror="this.style.display='none'">
      <div class="line"><strong>{{PrincipalName}}</strong><br><span style="font-size:11px;color:#555;">Principal</span></div>
    </div>
  </div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // MEDICAL
  // ═══════════════════════════════════════════════
  {
    name: 'Medical Certificate',
    description: 'Professional medical certificate for doctors to certify patient consultation, diagnosis, and recommended rest period.',
    documentCategory: 'Medical',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['DoctorName', 'DoctorQualification', 'ClinicName', 'ClinicAddress', 'ClinicLogo', 'PatientName', 'PatientAge', 'PatientGender', 'Diagnosis', 'Advice', 'SickDays', 'FromDate', 'ToDate', 'MedicineDetails', 'DoctorSignature', 'IssuedDate', 'RegistrationNo'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; color: #333; margin: 0; padding: 30px; }
  .cert { max-width: 700px; margin: 0 auto; border: 2px solid #059669; padding: 25px; }
  .header { text-align: center; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 15px; }
  .header img { max-height: 55px; }
  .header h1 { color: #059669; font-size: 20px; margin: 5px 0; }
  .header p { font-size: 11px; color: #666; margin: 0; }
  .title { text-align: center; font-size: 16px; font-weight: bold; color: #059669; margin: 15px 0; letter-spacing: 2px; }
  .content table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .content td { padding: 6px 10px; border: 1px solid #e0e0e0; font-size: 13px; }
  .content td:first-child { font-weight: 600; background: #f0fdf4; width: 130px; color: #333; }
  .prescription { margin: 15px 0; padding: 12px; background: #fffbeb; border-left: 4px solid #f59e0b; font-size: 13px; font-family: 'Courier New', monospace; min-height: 60px; }
  .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 12px; }
  .footer .sign { text-align: right; }
  .footer .sign img { max-height: 40px; }
  .footer .reg { color: #666; font-size: 11px; }
  .stamp { position: absolute; bottom: 30px; right: 30px; opacity: 0.08; font-size: 40px; font-weight: bold; color: #059669; transform: rotate(-20deg); }
</style></head>
<body>
<div class="cert" style="position:relative;">
  <div class="stamp">MEDICAL</div>
  <div class="header">
    <img src="{{ClinicLogo}}" alt="Logo" style="display:{{ClinicLogo:none}};" onerror="this.style.display='none'">
    <h1>{{ClinicName}}</h1>
    <p>{{ClinicAddress}} | Reg. No: {{RegistrationNo}}</p>
  </div>
  <div class="title">MEDICAL CERTIFICATE</div>
  <div class="content">
    <table>
      <tr><td>Patient Name</td><td><strong>{{PatientName}}</strong></td></tr>
      <tr><td>Age</td><td>{{PatientAge}} Years</td></tr>
      <tr><td>Gender</td><td>{{PatientGender}}</td></tr>
      <tr><td>Date of Examination</td><td>{{IssuedDate}}</td></tr>
      <tr><td>Diagnosis</td><td>{{Diagnosis}}</td></tr>
      <tr><td>Advice</td><td>{{Advice}}</td></tr>
      <tr><td>Sick Leave</td><td><strong>{{SickDays}} days</strong> ({{FromDate}} to {{ToDate}})</td></tr>
    </table>
    <div class="prescription">
      <strong>Rx:</strong> {{MedicineDetails}}
    </div>
  </div>
  <div class="footer">
    <div>
      <strong>Date:</strong> {{IssuedDate}}<br>
      <span class="reg">Reg. No: {{RegistrationNo}}</span>
    </div>
    <div class="sign">
      <img src="{{DoctorSignature}}" alt="Signature" style="display:{{DoctorSignature:none}};" onerror="this.style.display='none'">
      <div><strong>Dr. {{DoctorName}}</strong></div>
      <div style="font-size:11px;color:#555;">{{DoctorQualification}}</div>
    </div>
  </div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // GENERAL
  // ═══════════════════════════════════════════════
  {
    name: 'Professional Letterhead',
    description: 'Elegant business letterhead with company branding, ready for official correspondence and communication.',
    documentCategory: 'General',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanySeal', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'CompanyWebsite', 'GST', 'PAN', 'CIN', 'MSME', 'CurrentDate', 'LetterBody', 'AuthorizedSignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; margin: 0; padding: 0; }
  .letter { max-width: 800px; margin: 0 auto; min-height: 1000px; position: relative; }
  .letterhead { padding: 25px 35px; border-bottom: 3px solid #1a56db; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: start; }
  .letterhead .left { flex: 1; }
  .letterhead .left img { max-height: 70px; margin-bottom: 5px; }
  .letterhead .left h1 { font-size: 22px; color: #1a56db; margin: 3px 0; font-weight: 700; }
  .letterhead .left .tagline { font-size: 11px; color: #888; letter-spacing: 2px; text-transform: uppercase; }
  .letterhead .right { text-align: right; font-size: 11px; color: #555; }
  .letterhead .right img { max-height: 60px; }
  .contact-bar { display: flex; justify-content: center; gap: 25px; padding: 8px 35px; background: #f8f9fa; font-size: 11px; color: #555; border-bottom: 1px solid #e0e0e0; }
  .contact-bar span { display: flex; align-items: center; gap: 5px; }
  .body { padding: 0 35px; font-size: 13px; line-height: 1.8; }
  .body p { margin-bottom: 12px; }
  .date-line { text-align: right; font-size: 13px; margin-bottom: 20px; color: #666; }
  .footer-bar { position: absolute; bottom: 0; left: 0; right: 0; border-top: 3px solid #1a56db; background: #f8f9fa; padding: 12px 35px; font-size: 10px; color: #888; text-align: center; }
  .footer-bar .details { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 3px; font-size: 9px; color: #aaa; }
  .seal-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.04; pointer-events: none; }
  .seal-watermark img { max-width: 300px; }
</style></head>
<body>
<div class="letter">
  <div class="seal-watermark"><img src="{{CompanySeal}}" alt="" style="width:250px;"></div>
  <div class="letterhead">
    <div class="left">
      <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
      <h1>{{CompanyName}}</h1>
      <div class="tagline">Official Communication</div>
    </div>
    <div class="right">
      <img src="{{CompanySeal}}" alt="Seal" style="display:{{CompanySeal:none}};" onerror="this.style.display='none'">
    </div>
  </div>
  <div class="contact-bar">
    <span>📍 {{CompanyAddress}}</span>
    <span>📧 {{CompanyEmail}}</span>
    <span>📞 {{CompanyPhone}}</span>
    <span>🌐 {{CompanyWebsite}}</span>
  </div>
  <div class="body">
    <div class="date-line">{{CurrentDate}}</div>
    <p>{{LetterBody}}</p>
  </div>
  <div style="padding:0 35px;margin-top:30px;">
    <p><strong>For {{CompanyName}}</strong></p>
    <img src="{{AuthorizedSignature}}" alt="Signature" style="max-height:45px;display:block;margin:5px 0;display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
    <p style="font-size:12px;color:#555;">Authorized Signatory</p>
  </div>
  <div class="footer-bar">
    <div>{{CompanyName}} - Where Professional Documents Matter</div>
    <div class="details">
      <span>GST: {{GST}}</span>
      <span>PAN: {{PAN}}</span>
      <span>CIN: {{CIN}}</span>
      <span>MSME: {{MSME}}</span>
    </div>
  </div>
</div>
</body>
</html>`
  },
  // ═══════════════════════════════════════════════
  // MARKETING
  // ═══════════════════════════════════════════════
  {
    name: 'Social Media Post (LinkedIn/Instagram)',
    description: 'Professional social media post template for LinkedIn and Instagram with company branding, headline, engaging body, and clear call-to-action for marketing campaigns.',
    documentCategory: 'Marketing',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'PostHeadline', 'PostBody', 'CallToAction', 'ImageUrl', 'Hashtags', 'AuthorName', 'PostDate', 'LinkUrl'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
  .post { max-width: 550px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .post-header { display: flex; align-items: center; padding: 16px; border-bottom: 1px solid #f0f0f0; }
  .post-header img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; margin-right: 12px; display: {{CompanyLogo:block}}; }
  .post-header .author { font-weight: 600; font-size: 14px; color: #1a1a1a; }
  .post-header .date { font-size: 12px; color: #888; margin-top: 2px; }
  .post-header .brand { font-size: 12px; color: #2563eb; font-weight: 500; }
  .post-image { width: 100%; max-height: 300px; object-fit: cover; display: {{ImageUrl:block}}; }
  .post-body { padding: 16px; }
  .post-body h2 { font-size: 18px; color: #1a1a1a; margin: 0 0 10px; font-weight: 700; }
  .post-body p { font-size: 14px; color: #333; line-height: 1.6; margin: 0 0 12px; }
  .cta { display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; margin: 8px 0; }
  .hashtags { padding: 0 16px 16px; font-size: 12px; color: #2563eb; line-height: 1.8; }
  .footer-bar { padding: 12px 16px; background: #f8f9fa; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; }
</style></head>
<body>
<div class="post">
  <div class="post-header">
    <img src="{{CompanyLogo}}" onerror="this.style.display='none'">
    <div>
      <div class="author">{{AuthorName}}</div>
      <div class="brand">{{CompanyName}}</div>
      <div class="date">{{PostDate}}</div>
    </div>
  </div>
  <img src="{{ImageUrl}}" class="post-image" onerror="this.style.display='none'">
  <div class="post-body">
    <h2>{{PostHeadline}}</h2>
    <p>{{PostBody}}</p>
    <a href="{{LinkUrl}}" class="cta">{{CallToAction}}</a>
  </div>
  <div class="hashtags">{{Hashtags}}</div>
  <div class="footer-bar">{{CompanyName}} | Marketing Post</div>
</div>
</body>
</html>`
  },
  {
    name: 'Email Campaign Template',
    description: 'Professional email marketing campaign template with header, engaging content, promotional sections, and clear call-to-action buttons for business communications.',
    documentCategory: 'Marketing',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmailSubject', 'Greeting', 'EmailBody', 'PromoHeadline', 'PromoDescription', 'PromoCode', 'DiscountPercentage', 'CTA_Text', 'CTA_Link', 'FooterText', 'UnsubscribeLink'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', Helvetica, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
  .email { max-width: 600px; margin: 0 auto; background: white; }
  .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); padding: 30px 25px; text-align: center; }
  .header img { max-height: 50px; margin-bottom: 10px; display: {{CompanyLogo:block}}; }
  .header h1 { color: white; font-size: 24px; margin: 10px 0 5px; }
  .header p { color: rgba(255,255,255,0.8); font-size: 13px; margin: 0; }
  .preheader { font-size: 11px; color: #999; padding: 8px 25px; text-align: center; background: #f8f8f8; border-bottom: 1px solid #eee; }
  .body { padding: 25px; line-height: 1.7; }
  .body h2 { font-size: 20px; color: #1e3a5f; margin: 20px 0 10px; }
  .body p { font-size: 14px; color: #444; margin: 0 0 12px; }
  .promo-box { background: #fef9ef; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
  .promo-box .code { font-size: 28px; font-weight: bold; color: #92400e; letter-spacing: 3px; margin: 10px 0; }
  .promo-box .discount { font-size: 36px; color: #059669; font-weight: 800; }
  .btn { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600; margin: 10px 0; }
  .divider { border: none; border-top: 1px solid #eee; margin: 25px 0; }
  .footer { padding: 20px 25px; font-size: 11px; color: #999; text-align: center; background: #f8f9fa; }
  .footer a { color: #888; }
</style></head>
<body>
<div class="email">
  <div class="preheader">{{EmailSubject}}</div>
  <div class="header">
    <img src="{{CompanyLogo}}" onerror="this.style.display='none'">
    <h1>{{CompanyName}}</h1>
    <p>Stay connected with the latest updates</p>
  </div>
  <div class="body">
    <p><strong>{{Greeting}}</strong></p>
    <p>{{EmailBody}}</p>
    <div class="promo-box">
      <div class="discount">{{DiscountPercentage}}% OFF</div>
      <h3 style="margin:10px 0 5px;">{{PromoHeadline}}</h3>
      <p style="font-size:13px;color:#666;">{{PromoDescription}}</p>
      <div class="code">{{PromoCode}}</div>
      <a href="{{CTA_Link}}" class="btn">{{CTA_Text}}</a>
    </div>
    <hr class="divider">
    <p style="font-size:12px;color:#666;">{{FooterText}}</p>
  </div>
  <div class="footer">
    <p>{{CompanyName}} | {{CompanyAddress}}</p>
    <p><a href="{{UnsubscribeLink}}">Unsubscribe</a> from these emails</p>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Product Brochure / Flyer',
    description: 'Professional product brochure or flyer template with hero section, features grid, pricing table, and contact information for marketing materials.',
    documentCategory: 'Marketing',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail', 'CompanyWebsite', 'BrochureTitle', 'BrochureSubtitle', 'HeroImage', 'Feature1_Icon', 'Feature1_Title', 'Feature1_Desc', 'Feature2_Icon', 'Feature2_Title', 'Feature2_Desc', 'Feature3_Icon', 'Feature3_Title', 'Feature3_Desc', 'Feature4_Icon', 'Feature4_Title', 'Feature4_Desc', 'PricingHeadline', 'PriceAmount', 'PricePeriod', 'PriceDetails', 'CTAText'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #333; }
  .brochure { max-width: 800px; margin: 0 auto; }
  .hero { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 50px 40px; text-align: center; }
  .hero img { max-height: 60px; margin-bottom: 15px; display: {{CompanyLogo:block}}; margin: 0 auto 15px; }
  .hero h1 { font-size: 32px; margin: 0 0 10px; font-weight: 800; }
  .hero .subtitle { font-size: 18px; opacity: 0.9; margin: 0 0 20px; }
  .hero-img { max-width: 100%; border-radius: 12px; margin-top: 20px; display: {{HeroImage:block}}; }
  .features { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 40px; }
  .feature { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 12px; }
  .feature-icon { font-size: 40px; margin-bottom: 10px; display: {{Feature1_Icon:block}; }
  .feature h3 { font-size: 16px; color: #1e3a5f; margin: 0 0 8px; }
  .feature p { font-size: 13px; color: #666; margin: 0; line-height: 1.5; }
  .pricing { background: #f0f4ff; padding: 40px; text-align: center; }
  .pricing h2 { font-size: 22px; color: #1e3a5f; margin: 0 0 20px; }
  .price-card { display: inline-block; background: white; border-radius: 16px; padding: 30px 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .price { font-size: 48px; font-weight: 800; color: #2563eb; }
  .price small { font-size: 16px; color: #888; }
  .price-details { font-size: 14px; color: #666; margin: 10px 0 20px; }
  .cta-btn { display: inline-block; padding: 14px 36px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; }
  .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
</style></head>
<body>
<div class="brochure">
  <div class="hero">
    <img src="{{CompanyLogo}}" onerror="this.style.display='none'">
    <h1>{{BrochureTitle}}</h1>
    <p class="subtitle">{{BrochureSubtitle}}</p>
    <img src="{{HeroImage}}" class="hero-img" onerror="this.style.display='none'">
  </div>
  <div class="features">
    <div class="feature">
      <div class="feature-icon">{{Feature1_Icon}}</div>
      <h3>{{Feature1_Title}}</h3>
      <p>{{Feature1_Desc}}</p>
    </div>
    <div class="feature">
      <div class="feature-icon">{{Feature2_Icon}}</div>
      <h3>{{Feature2_Title}}</h3>
      <p>{{Feature2_Desc}}</p>
    </div>
    <div class="feature">
      <div class="feature-icon">{{Feature3_Icon}}</div>
      <h3>{{Feature3_Title}}</h3>
      <p>{{Feature3_Desc}}</p>
    </div>
    <div class="feature">
      <div class="feature-icon">{{Feature4_Icon}}</div>
      <h3>{{Feature4_Title}}</h3>
      <p>{{Feature4_Desc}}</p>
    </div>
  </div>
  <div class="pricing">
    <h2>{{PricingHeadline}}</h2>
    <div class="price-card">
      <div class="price">₹ {{PriceAmount}} <small>/ {{PricePeriod}}</small></div>
      <div class="price-details">{{PriceDetails}}</div>
      <a href="#" class="cta-btn">{{CTAText}}</a>
    </div>
  </div>
  <div class="footer">
    <p>{{CompanyName}} | {{CompanyAddress}} | {{CompanyPhone}} | {{CompanyEmail}} | {{CompanyWebsite}}</p>
  </div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // MANUFACTURING
  // ═══════════════════════════════════════════════
  {
    name: 'Work Order',
    description: 'Professional manufacturing work order template with job details, production instructions, materials list, timeline, and quality checkpoints.',
    documentCategory: 'Manufacturing',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'WorkOrderNumber', 'WorkOrderDate', 'DueDate', 'CustomerName', 'CustomerPO', 'ProductName', 'ProductCode', 'Quantity', 'Unit', 'Priority', 'Instructions', 'MaterialsTable', 'Checkpoints', 'Supervisor', 'Inspector', 'AuthorizedSignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 30px; color: #222; font-size: 13px; }
  .wo { max-width: 800px; margin: 0 auto; border: 2px solid #b45309; padding: 25px; }
  .header { display: flex; justify-content: space-between; border-bottom: 3px solid #b45309; padding-bottom: 12px; margin-bottom: 15px; }
  .header h1 { font-size: 20px; color: #b45309; margin: 0; text-transform: uppercase; letter-spacing: 2px; }
  .header .meta { text-align: right; font-size: 12px; color: #666; }
  .header img { max-height: 50px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; background: #fffbeb; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 12px; }
  .info-grid strong { color: #b45309; }
  .section { margin: 15px 0; }
  .section h3 { font-size: 14px; color: #b45309; border-bottom: 1px solid #fde68a; padding-bottom: 5px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { background: #b45309; color: white; padding: 6px 10px; font-size: 12px; text-align: left; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
  .instructions { padding: 12px; background: #f9f9f9; border-left: 4px solid #b45309; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  .priority-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-weight: bold; font-size: 11px; }
  .priority-high { background: #fef2f2; color: #dc2626; }
  .priority-medium { background: #fffbeb; color: #d97706; }
  .priority-low { background: #f0fdf4; color: #16a34a; }
  .footer { margin-top: 25px; display: flex; justify-content: space-between; border-top: 2px solid #b45309; padding-top: 15px; font-size: 12px; }
  .sign-line { border-top: 1px solid #333; width: 180px; margin-top: 35px; padding-top: 5px; }
  .sign-line img { max-height: 40px; display: block; }
</style></head>
<body>
<div class="wo">
  <div class="header">
    <div>
      <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
      <h1>Work Order</h1>
    </div>
    <div class="meta">
      <div><strong>WO #:</strong> {{WorkOrderNumber}}</div>
      <div><strong>Date:</strong> {{WorkOrderDate}}</div>
      <div><strong>Due Date:</strong> {{DueDate}}</div>
    </div>
  </div>

  <div class="info-grid">
    <div><strong>Customer:</strong> {{CustomerName}}</div>
    <div><strong>PO Reference:</strong> {{CustomerPO}}</div>
    <div><strong>Product:</strong> {{ProductName}} ({{ProductCode}})</div>
    <div><strong>Quantity:</strong> {{Quantity}} {{Unit}}</div>
    <div><strong>Priority:</strong> <span class="priority-badge priority-{{Priority:medium}}">{{Priority}}</span></div>
    <div><strong>Supervisor:</strong> {{Supervisor}}</div>
  </div>

  <div class="section">
    <h3>Production Instructions</h3>
    <div class="instructions">{{Instructions}}</div>
  </div>

  <div class="section">
    <h3>Materials Required</h3>
    <table><thead><tr><th>#</th><th>Material</th><th>Specification</th><th>Qty</th><th>Unit</th><th>Issued</th></tr></thead><tbody>{{MaterialsTable}}</tbody></table>
  </div>

  <div class="section">
    <h3>Quality Checkpoints</h3>
    <p style="font-size:12px;color:#555;">{{Checkpoints}}</p>
  </div>

  <div class="footer">
    <div>
      <div class="sign-line"><strong>{{Supervisor}}</strong><br><span style="font-size:11px;color:#888;">Supervisor</span></div>
    </div>
    <div style="text-align:right;">
      <div class="sign-line" style="margin-left:auto;">
        <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
        <strong>Authorized Signatory</strong>
      </div>
    </div>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Quality Inspection Report',
    description: 'Professional quality inspection report template for manufacturing with inspection parameters, test results, defect tracking, and sign-off by quality team.',
    documentCategory: 'Manufacturing',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'ReportNumber', 'InspectionDate', 'ProductName', 'BatchNumber', 'LotSize', 'SampleSize', 'InspectorName', 'InspectorID', 'InspectionMethod', 'ParametersTable', 'DefectsFound', 'DefectRate', 'Result', 'Remarks', 'InspectorSignature', 'QAManager', 'QASignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 30px; font-size: 13px; }
  .report { max-width: 800px; margin: 0 auto; border: 2px solid #0369a1; padding: 25px; }
  .header { text-align: center; border-bottom: 3px solid #0369a1; padding-bottom: 12px; margin-bottom: 15px; }
  .header img { max-height: 55px; }
  .header h1 { font-size: 20px; color: #0369a1; margin: 5px 0; letter-spacing: 2px; }
  .header .sub { font-size: 12px; color: #666; }
  .meta { display: flex; flex-wrap: wrap; gap: 10px 20px; padding: 12px; background: #f0f9ff; border-radius: 6px; margin-bottom: 15px; font-size: 12px; }
  .meta span { flex: 1; min-width: 200px; }
  .meta strong { color: #0369a1; }
  table.params { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.params th { background: #0369a1; color: white; padding: 6px 10px; font-size: 12px; text-align: left; }
  table.params td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
  table.params tr:nth-child(even) td { background: #f8fafc; }
  .result-pass { display: inline-block; background: #dcfce7; color: #166534; padding: 4px 16px; border-radius: 4px; font-weight: bold; font-size: 14px; }
  .result-fail { display: inline-block; background: #fef2f2; color: #dc2626; padding: 4px 16px; border-radius: 4px; font-weight: bold; font-size: 14px; }
  .defects { margin: 12px 0; padding: 10px; background: #fffbeb; border-left: 4px solid #f59e0b; }
  .remarks { margin: 12px 0; padding: 10px; background: #f0fdf4; border-left: 4px solid #22c55e; }
  .section-title { font-size: 13px; font-weight: bold; color: #0369a1; margin: 15px 0 8px; border-bottom: 1px solid #bae6fd; padding-bottom: 4px; }
  .footer { margin-top: 25px; display: flex; justify-content: space-between; border-top: 2px solid #0369a1; padding-top: 12px; font-size: 12px; }
  .footer .sign { border-top: 1px solid #333; width: 180px; margin-top: 30px; padding-top: 5px; }
  .footer .sign img { max-height: 35px; display: block; }
</style></head>
<body>
<div class="report">
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>Quality Inspection Report</h1>
    <div class="sub">{{CompanyName}} | {{CompanyAddress}}</div>
  </div>

  <div class="meta">
    <span><strong>Report #:</strong> {{ReportNumber}}</span>
    <span><strong>Date:</strong> {{InspectionDate}}</span>
    <span><strong>Product:</strong> {{ProductName}}</span>
    <span><strong>Batch/Lot:</strong> {{BatchNumber}}</span>
    <span><strong>Lot Size:</strong> {{LotSize}}</span>
    <span><strong>Sample Size:</strong> {{SampleSize}}</span>
    <span><strong>Inspector:</strong> {{InspectorName}} ({{InspectorID}})</span>
    <span><strong>Method:</strong> {{InspectionMethod}}</span>
  </div>

  <div class="section-title">Inspection Parameters &amp; Results</div>
  <table class="params">
    <thead><tr><th>#</th><th>Parameter</th><th>Specification</th><th>Measured Value</th><th>Status</th></tr></thead>
    <tbody>{{ParametersTable}}</tbody>
  </table>

  <div class="defects">
    <strong>Defects Found:</strong> {{DefectsFound}}<br>
    <strong>Defect Rate:</strong> {{DefectRate}}%
  </div>

  <div style="text-align:center;margin:15px 0;">
    <span class="result-{{Result:pass}}">{{Result}}</span>
  </div>

  <div class="remarks">
    <strong>Remarks:</strong> {{Remarks}}
  </div>

  <div class="footer">
    <div>
      <strong>Inspected by:</strong>
      <div class="sign">
        <img src="{{InspectorSignature}}" alt="Signature" style="display:{{InspectorSignature:none}};" onerror="this.style.display='none'">
        {{InspectorName}}
      </div>
    </div>
    <div style="text-align:right;">
      <strong>Approved by:</strong>
      <div class="sign" style="margin-left:auto;">
        <img src="{{QASignature}}" alt="Signature" style="display:{{QASignature:none}};" onerror="this.style.display='none'">
        {{QAManager}}
      </div>
    </div>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Material Requisition Form',
    description: 'Standard material requisition / indent form for manufacturing with item details, quantities, purpose, and approval chain.',
    documentCategory: 'Manufacturing',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'RequisitionNumber', 'RequisitionDate', 'Department', 'RequiredDate', 'RequestedBy', 'Purpose', 'ItemsTable', 'TotalItems', 'TotalValue', 'Remarks', 'DepartmentHead', 'DeptSignature', 'StoreKeeper', 'StoreSignature', 'AuthorizedBy', 'AuthorizedSignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 25px; color: #333; font-size: 13px; }
  .form { max-width: 750px; margin: 0 auto; border: 2px solid #1a56db; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a56db; padding-bottom: 10px; margin-bottom: 15px; }
  .header h1 { font-size: 18px; color: #1a56db; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
  .header img { max-height: 50px; }
  .meta { background: #eff6ff; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 12px; }
  .meta strong { color: #1a56db; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #1a56db; color: white; padding: 6px 10px; font-size: 11px; text-align: left; }
  td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
  td.amt { text-align: right; }
  .total-row td { font-weight: bold; background: #eff6ff; }
  .approval { display: flex; justify-content: space-between; margin-top: 25px; border-top: 2px solid #1a56db; padding-top: 15px; }
  .approval div { width: 30%; text-align: center; }
  .approval .line { border-top: 1px solid #333; width: 150px; margin: 35px auto 5px; padding-top: 5px; font-size: 11px; }
  .approval .line img { max-height: 35px; display: block; margin: 0 auto; }
  .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #aaa; }
</style></head>
<body>
<div class="form">
  <div class="header">
    <div>
      <h1>Material Requisition</h1>
    </div>
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
  </div>

  <div class="meta">
    <span><strong>MR #:</strong> {{RequisitionNumber}}</span>
    <span><strong>Date:</strong> {{RequisitionDate}}</span>
    <span><strong>Department:</strong> {{Department}}</span>
    <span><strong>Required By:</strong> {{RequiredDate}}</span>
    <span><strong>Requested By:</strong> {{RequestedBy}}</span>
  </div>

  <p><strong>Purpose:</strong> {{Purpose}}</p>

  <table>
    <thead><tr><th>#</th><th>Item Description</th><th>Specification</th><th>Qty</th><th>Unit</th><th class="amt">Estimated Cost</th></tr></thead>
    <tbody>{{ItemsTable}}</tbody>
    <tr class="total-row"><td colspan="4"></td><td>Total Items: {{TotalItems}}</td><td class="amt">₹ {{TotalValue}}</td></tr>
  </table>

  <p><strong>Remarks:</strong> {{Remarks}}</p>

  <div class="approval">
    <div>
      <strong>Requested By</strong>
      <div class="line">
        <img src="{{DeptSignature}}" alt="Signature" style="display:{{DeptSignature:none}};" onerror="this.style.display='none'">
        {{DepartmentHead}}
      </div>
    </div>
    <div>
      <strong>Store Keeper</strong>
      <div class="line">
        <img src="{{StoreSignature}}" alt="Signature" style="display:{{StoreSignature:none}};" onerror="this.style.display='none'">
        {{StoreKeeper}}
      </div>
    </div>
    <div>
      <strong>Authorized By</strong>
      <div class="line">
        <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
        {{AuthorizedBy}}
      </div>
    </div>
  </div>
  <div class="footer">{{CompanyName}} | This is a computer-generated document</div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // REAL ESTATE
  // ═══════════════════════════════════════════════
  {
    name: 'Rental / Lease Agreement',
    description: 'Comprehensive rental and lease agreement template for residential or commercial properties with terms, rent details, security deposit, and maintenance clauses.',
    documentCategory: 'Real Estate',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'PropertyAddress', 'PropertyType', 'OwnerName', 'OwnerAddress', 'TenantName', 'TenantAddress', 'TenantPhone', 'TenantEmail', 'LeaseStartDate', 'LeaseEndDate', 'LeaseDuration', 'RentAmount', 'RentDueDate', 'SecurityDeposit', 'MaintenanceCharges', 'NoticePeriod', 'LatePenalty', 'UtilityIncluded', 'ParkingDetails', 'PetPolicy', 'SpecialClauses', 'OwnerSignature', 'TenantSignature', 'WitnessName', 'WitnessSignature', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; color: #222; margin: 0; padding: 35px; line-height: 1.8; font-size: 13px; }
  h1 { text-align: center; font-size: 22px; color: #1e3a5f; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
  .subtitle { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 20px; color: #555; }
  .party-block { text-align: center; margin: 15px 0 25px; font-size: 13px; }
  .party-block strong { text-decoration: underline; }
  .section { margin: 15px 0; }
  .section h3 { font-size: 14px; color: #1e3a5f; margin: 0 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .section p, .section li { text-align: justify; font-size: 13px; }
  .section ol { padding-left: 25px; }
  .section ol li { margin-bottom: 5px; }
  .details-box { background: #f8f9fa; border: 1px solid #e0e0e0; padding: 12px 15px; border-radius: 6px; margin: 10px 0; }
  .details-box table { width: 100%; font-size: 13px; }
  .details-box td { padding: 4px 8px; }
  .details-box td:first-child { font-weight: 600; width: 180px; color: #555; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .signatures div { width: 45%; }
  .signatures .line { border-top: 1px solid #333; width: 200px; margin-top: 40px; padding-top: 5px; }
  .signatures .line img { max-height: 40px; display: block; margin-bottom: 3px; }
  .footer { text-align: center; font-size: 11px; color: #888; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
  .stamp { position: absolute; opacity: 0.05; font-size: 60px; font-weight: bold; color: #1e3a5f; transform: rotate(-20deg); top: 50%; left: 40%; pointer-events: none; }
</style></head>
<body style="position:relative;">
<div class="stamp">LEASE</div>
  <h1>Rental / Lease Agreement</h1>
  <p style="text-align:center;">This Agreement is made and entered into on <strong>{{CurrentDate}}</strong></p>

  <div class="party-block">
    BETWEEN <strong>{{OwnerName}}</strong>, residing at {{OwnerAddress}} (hereinafter referred to as the "<strong>Landlord</strong>")<br>
    AND <strong>{{TenantName}}</strong>, residing at {{TenantAddress}}, Phone: {{TenantPhone}}, Email: {{TenantEmail}} (hereinafter referred to as the "<strong>Tenant</strong>")
  </div>

  <div class="section">
    <h3>1. Property Details</h3>
    <div class="details-box">
      <table>
        <tr><td>Property Address</td><td>{{PropertyAddress}}</td></tr>
        <tr><td>Property Type</td><td>{{PropertyType}}</td></tr>
        <tr><td>Lease Period</td><td>{{LeaseDuration}} ({{LeaseStartDate}} to {{LeaseEndDate}})</td></tr>
      </table>
    </div>
  </div>

  <div class="section">
    <h3>2. Rent &amp; Financial Terms</h3>
    <div class="details-box">
      <table>
        <tr><td>Monthly Rent</td><td><strong>₹ {{RentAmount}}</strong></td></tr>
        <tr><td>Rent Due Date</td><td>{{RentDueDate}} of each month</td></tr>
        <tr><td>Security Deposit</td><td>₹ {{SecurityDeposit}}</td></tr>
        <tr><td>Maintenance Charges</td><td>₹ {{MaintenanceCharges}}</td></tr>
        <tr><td>Late Payment Penalty</td><td>{{LatePenalty}}</td></tr>
        <tr><td>Utilities Included</td><td>{{UtilityIncluded}}</td></tr>
      </table>
    </div>
  </div>

  <div class="section">
    <h3>3. Terms &amp; Conditions</h3>
    <ol>
      <li>The Tenant shall pay the rent on or before the due date each month without fail.</li>
      <li>The Tenant shall use the premises only for residential/commercial purposes as agreed.</li>
      <li>The Tenant shall not sublet or assign the premises to any third party without written consent.</li>
      <li>The Landlord shall be responsible for major repairs and structural maintenance.</li>
      <li>The Tenant shall be responsible for day-to-day maintenance and minor repairs up to ₹ 500.</li>
      <li>Notice period for termination shall be <strong>{{NoticePeriod}}</strong> on either side.</li>
      <li>Parking: {{ParkingDetails}}</li>
      <li>Pets: {{PetPolicy}}</li>
      <li>The security deposit shall be refunded within 30 days of vacating, subject to deductions for damages.</li>
    </ol>
  </div>

  <div class="section">
    <h3>4. Special Clauses</h3>
    <p>{{SpecialClauses}}</p>
  </div>

  <div class="signatures">
    <div>
      <strong>Landlord</strong>
      <div class="line">
        <img src="{{OwnerSignature}}" alt="Signature" style="display:{{OwnerSignature:none}};" onerror="this.style.display='none'">
        {{OwnerName}}
      </div>
    </div>
    <div style="text-align:right;">
      <strong>Tenant</strong>
      <div class="line" style="margin-left:auto;">
        <img src="{{TenantSignature}}" alt="Signature" style="display:{{TenantSignature:none}};" onerror="this.style.display='none'">
        {{TenantName}}
      </div>
    </div>
  </div>

  <div style="text-align:center;margin-top:15px;">
    <strong>Witness:</strong> {{WitnessName}}
    <div style="border-top:1px solid #333;width:200px;margin:30px auto 5px;">
      <img src="{{WitnessSignature}}" alt="Signature" style="max-height:35px;display:{{WitnessSignature:none}};" onerror="this.style.display='none'">
    </div>
  </div>

  <div class="footer">{{CompanyName}} | This document is legally binding | {{CurrentDate}}</div>
</body>
</html>`
  },
  {
    name: 'Property Quotation',
    description: 'Professional property quotation template for real estate agents with property details, pricing breakdown, payment schedule, and terms for buyers.',
    documentCategory: 'Real Estate',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail', 'QuotationNumber', 'QuotationDate', 'ValidUntil', 'ClientName', 'ClientContact', 'PropertyName', 'PropertyAddress', 'PropertyType', 'PropertySize', 'Configuration', 'BasePrice', 'FloorRise', 'CarParking', 'RegistrationCharges', 'GST_Amount', 'TotalCost', 'BookingAmount', 'PaymentSchedule', 'PossessionDate', 'AdditionalCharges', 'TermsAndConditions', 'AgentName', 'AgentSignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 30px; color: #222; }
  .quote { max-width: 800px; margin: 0 auto; border: 2px solid #0369a1; padding: 25px; }
  .header { border-bottom: 3px solid #0369a1; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; }
  .header h1 { font-size: 20px; color: #0369a1; margin: 0; letter-spacing: 2px; }
  .header img { max-height: 50px; }
  .badge { background: #0369a1; color: white; padding: 2px 10px; font-size: 10px; letter-spacing: 1px; }
  .meta { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin: 10px 0; }
  .property-details { background: #f0f9ff; border-radius: 8px; padding: 12px 15px; margin: 12px 0; }
  .property-details table { width: 100%; font-size: 13px; }
  .property-details td { padding: 4px 8px; }
  .property-details td:first-child { font-weight: 600; color: #555; width: 140px; }
  .cost-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .cost-table td { padding: 6px 12px; border-bottom: 1px solid #e0e0e0; font-size: 13px; }
  .cost-table td:last-child { text-align: right; }
  .cost-table .total { font-weight: bold; font-size: 18px; color: #059669; border-top: 2px solid #059669; }
  .payment-schedule { margin: 12px 0; padding: 10px; background: #fffbeb; border-left: 4px solid #f59e0b; font-size: 13px; }
  .terms { margin: 12px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 12px; line-height: 1.6; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; border-top: 2px solid #0369a1; padding-top: 12px; font-size: 12px; }
  .footer .sign { text-align: right; }
  .footer .sign img { max-height: 40px; }
  .footer .sign .line { border-top: 1px solid #333; width: 180px; margin-top: 30px; padding-top: 5px; margin-left: auto; }
</style></head>
<body>
<div class="quote">
  <div class="header">
    <div>
      <h1>Property Quotation</h1>
      <div class="badge">REAL ESTATE</div>
    </div>
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
  </div>

  <div class="meta">
    <span><strong>Quote #:</strong> {{QuotationNumber}}</span>
    <span><strong>Date:</strong> {{QuotationDate}}</span>
    <span><strong>Valid Until:</strong> {{ValidUntil}}</span>
  </div>

  <div style="font-size:13px;padding:6px 0;">
    <strong>Client:</strong> {{ClientName}} | {{ClientContact}}
  </div>

  <h3 style="color:#0369a1;margin:15px 0 8px;">{{PropertyName}}</h3>

  <div class="property-details">
    <table>
      <tr><td>Address</td><td>{{PropertyAddress}}</td></tr>
      <tr><td>Type</td><td>{{PropertyType}}</td></tr>
      <tr><td>Size</td><td>{{PropertySize}}</td></tr>
      <tr><td>Configuration</td><td>{{Configuration}}</td></tr>
      <tr><td>Possession</td><td>{{PossessionDate}}</td></tr>
    </table>
  </div>

  <h3 style="color:#0369a1;font-size:14px;margin:12px 0 8px;">Price Breakdown</h3>
  <table class="cost-table">
    <tr><td>Base Price</td><td>₹ {{BasePrice}}</td></tr>
    <tr><td>Floor Rise / Premium</td><td>₹ {{FloorRise}}</td></tr>
    <tr><td>Car Parking</td><td>₹ {{CarParking}}</td></tr>
    <tr><td>Registration &amp; Stamp Duty</td><td>₹ {{RegistrationCharges}}</td></tr>
    <tr><td>GST</td><td>₹ {{GST_Amount}}</td></tr>
    <tr><td>Additional Charges</td><td>₹ {{AdditionalCharges}}</td></tr>
    <tr class="total"><td>Total Cost</td><td>₹ {{TotalCost}}</td></tr>
  </table>

  <div class="payment-schedule">
    <strong>Booking Amount:</strong> ₹ {{BookingAmount}}<br>
    <strong>Payment Schedule:</strong> {{PaymentSchedule}}
  </div>

  <div class="terms">
    <strong>Terms &amp; Conditions:</strong><br>
    {{TermsAndConditions}}
  </div>

  <div class="footer">
    <div><strong>{{CompanyName}}</strong><br>{{CompanyAddress}}<br>{{CompanyPhone}} | {{CompanyEmail}}</div>
    <div class="sign">
      <strong>For {{CompanyName}}</strong>
      <div class="line">
        <img src="{{AgentSignature}}" alt="Signature" style="display:{{AgentSignature:none}};" onerror="this.style.display='none'">
        {{AgentName}}
      </div>
    </div>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Possession Letter',
    description: 'Official possession/handover letter for real estate properties with property details, possession date, checklist, and acknowledgment by the buyer.',
    documentCategory: 'Real Estate',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'BuilderName', 'BuyerName', 'BuyerAddress', 'PropertyName', 'PropertyAddress', 'UnitNumber', 'ProjectName', 'PossessionDate', 'HandoverDate', 'CarpetArea', 'SuperArea', 'ParkingSlots', 'Amenities', 'DefectList', 'MaintenancePeriod', 'SocietyDetails', 'KeysCount', 'MeterReading', 'OutstandingDues', 'BuilderSignature', 'BuyerSignature', 'WitnessName', 'CurrentDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Arial', sans-serif; margin: 0; padding: 30px; color: #222; font-size: 13px; }
  .letter { max-width: 750px; margin: 0 auto; border: 2px solid #059669; padding: 25px; }
  .header { text-align: center; border-bottom: 2px solid #059669; padding-bottom: 12px; }
  .header img { max-height: 55px; }
  .header h1 { font-size: 20px; color: #059669; margin: 5px 0; letter-spacing: 1px; }
  .title { text-align: center; font-size: 16px; font-weight: bold; color: #059669; margin: 18px 0; letter-spacing: 2px; text-transform: uppercase; }
  .info-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .info-table td { padding: 6px 12px; border: 1px solid #e0e0e0; font-size: 13px; }
  .info-table td:first-child { font-weight: 600; background: #f0fdf4; width: 140px; }
  .section { margin: 12px 0; }
  .section h3 { font-size: 14px; color: #059669; margin: 0 0 6px; }
  .section p { margin: 4px 0; }
  .checklist { columns: 2; padding: 10px; background: #f0fdf4; border-radius: 6px; }
  .checklist span { display: block; font-size: 12px; margin: 3px 0; }
  .signatures { display: flex; justify-content: space-between; margin-top: 30px; border-top: 2px solid #059669; padding-top: 15px; }
  .signatures .line { border-top: 1px solid #333; width: 180px; margin-top: 35px; padding-top: 5px; font-size: 12px; }
  .signatures .line img { max-height: 35px; display: block; }
  .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #aaa; }
</style></head>
<body>
<div class="letter">
  <div class="header">
    <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
    <h1>{{BuilderName}}</h1>
    <p>{{CompanyAddress}}</p>
  </div>

  <div class="title">Possession / Handover Letter</div>

  <p style="font-size:13px;">Date: {{CurrentDate}}</p>

  <p>Dear <strong>{{BuyerName}}</strong>,</p>
  <p>We are pleased to inform you that the property mentioned below is ready for possession. Please find the details and handover checklist below.</p>

  <table class="info-table">
    <tr><td>Project</td><td>{{ProjectName}}</td></tr>
    <tr><td>Property Name</td><td>{{PropertyName}}</td></tr>
    <tr><td>Unit / Flat No.</td><td>{{UnitNumber}}</td></tr>
    <tr><td>Property Address</td><td>{{PropertyAddress}}</td></tr>
    <tr><td>Buyer Name</td><td>{{BuyerName}}</td></tr>
    <tr><td>Carpet Area</td><td>{{CarpetArea}} sq.ft.</td></tr>
    <tr><td>Super Built-up Area</td><td>{{SuperArea}} sq.ft.</td></tr>
    <tr><td>Parking Slots</td><td>{{ParkingSlots}}</td></tr>
    <tr><td>Possession Date</td><td><strong>{{PossessionDate}}</strong></td></tr>
    <tr><td>Handover Date</td><td>{{HandoverDate}}</td></tr>
  </table>

  <div class="section">
    <h3>Handover Checklist</h3>
    <div class="checklist">
      <span>✓ Keys handed over: {{KeysCount}} sets</span>
      <span>✓ Electricity meter reading: {{MeterReading}}</span>
      <span>✓ Amenities as per brochure: {{Amenities}}</span>
      <span>✓ Society details: {{SocietyDetails}}</span>
      <span>✓ Outstanding dues: {{OutstandingDues}}</span>
      <span>✓ Defect liability period: {{MaintenancePeriod}}</span>
    </div>
  </div>

  <div class="section">
    <h3>Defects / Observations (if any)</h3>
    <p>{{DefectList}}</p>
  </div>

  <p style="font-size:12px;color:#555;">I/We acknowledge receipt of possession of the above property and confirm that the property has been inspected and found satisfactory.</p>

  <div class="signatures">
    <div><strong>For {{BuilderName}}</strong>
      <div class="line">
        <img src="{{BuilderSignature}}" alt="Signature" style="display:{{BuilderSignature:none}};" onerror="this.style.display='none'">
        Authorized Signatory
      </div>
    </div>
    <div style="text-align:right;"><strong>Received by</strong>
      <div class="line" style="margin-left:auto;">
        <img src="{{BuyerSignature}}" alt="Signature" style="display:{{BuyerSignature:none}};" onerror="this.style.display='none'">
        {{BuyerName}}
      </div>
    </div>
  </div>

  <div style="text-align:center;margin-top:10px;font-size:12px;color:#666;">
    Witness: {{WitnessName}}
  </div>
  <div class="footer">{{BuilderName}} | {{CompanyAddress}}</div>
</div>
</body>
</html>`
  },

  // ═══════════════════════════════════════════════
  // CERTIFICATES
  // ═══════════════════════════════════════════════
  {
    name: 'Internship Certificate',
    description: 'Professional internship completion certificate with intern details, duration, project description, and skills acquired during the internship program.',
    documentCategory: 'Certificates',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['InstitutionName', 'CompanyLogo', 'CompanyName', 'CompanyAddress', 'InternName', 'InternDepartment', 'InternProject', 'InternshipStart', 'InternshipEnd', 'InternshipDuration', 'SkillsAcquired', 'SupervisorName', 'SupervisorDesignation', 'SupervisorSignature', 'CeoName', 'CeoSignature', 'CertificateNumber', 'IssueDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  @page { margin: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; margin: 0; padding: 0; color: #222; }
  .certificate { max-width: 800px; margin: 40px auto; border: 8px solid #1a56db; padding: 0; position: relative; background: white; }
  .cert-border { border: 3px solid #93c5fd; margin: 15px; padding: 30px; position: relative; }
  .watermark-bg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 100px; color: rgba(26,86,219,0.03); font-weight: bold; letter-spacing: 10px; pointer-events: none; }
  .header { text-align: center; margin-bottom: 20px; }
  .header img { max-height: 60px; margin-bottom: 8px; }
  .header h1 { font-size: 16px; color: #1a56db; margin: 0; letter-spacing: 3px; text-transform: uppercase; }
  .gold-line { width: 200px; height: 2px; background: linear-gradient(90deg, transparent, #d97706, transparent); margin: 10px auto; }
  .cert-title { text-align: center; font-size: 28px; color: #1a56db; letter-spacing: 4px; font-weight: 700; margin: 15px 0; text-transform: uppercase; }
  .ribbon { text-align: center; margin: 10px 0; }
  .ribbon span { background: linear-gradient(135deg, #1a56db, #2563eb); color: white; padding: 5px 25px; font-size: 11px; letter-spacing: 3px; }
  .content { text-align: center; padding: 10px 20px; }
  .content .name { font-size: 24px; font-weight: bold; color: #1a56db; margin: 5px 0; font-family: 'Georgia', serif; }
  .content p { font-size: 14px; line-height: 1.8; margin: 8px 0; color: #444; }
  .content .project { font-style: italic; color: #1a56db; font-weight: 600; }
  .skills-line { margin: 10px auto; padding: 8px 15px; background: #f0f4ff; border-radius: 4px; display: inline-block; font-size: 13px; color: #1a56db; }
  .footer { display: flex; justify-content: space-between; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e0e0e0; }
  .footer .seal { text-align: left; font-size: 12px; color: #666; }
  .footer .seal .stamp-box { width: 100px; height: 100px; border: 2px dashed #1a56db; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #1a56db; text-align: center; }
  .footer .sign { text-align: right; }
  .footer .sign img { max-height: 40px; display: block; margin-left: auto; }
  .footer .sign .line { border-top: 1px solid #333; width: 200px; margin-top: 35px; padding-top: 5px; margin-left: auto; }
  .cert-no { text-align: center; font-size: 10px; color: #999; margin-top: 10px; }
</style></head>
<body>
<div class="certificate">
  <div class="cert-border">
    <div class="watermark-bg">INTERNSHIP</div>
    <div class="header">
      <img src="{{CompanyLogo}}" alt="Logo" style="display:{{CompanyLogo:none}};" onerror="this.style.display='none'">
      <h1>{{InstitutionName}}</h1>
      <div class="gold-line"></div>
    </div>

    <div class="ribbon"><span>CERTIFICATE OF INTERNSHIP</span></div>

    <div class="content">
      <p>This is proudly presented to</p>
      <div class="name">{{InternName}}</div>
      <div class="gold-line"></div>
      <p>For successfully completing the internship program in <strong>{{InternDepartment}}</strong></p>
      <p>from <strong>{{InternshipStart}}</strong> to <strong>{{InternshipEnd}}</strong></p>
      <p>({{InternshipDuration}})</p>

      <p>During the internship, {{InternName}} worked on the project</p>
      <p class="project">"{{InternProject}}"</p>

      <p class="skills-line">Skills Acquired: {{SkillsAcquired}}</p>

      <p>We appreciate {{InternName}}'s dedication, enthusiasm, and contribution during the internship period. We wish them all the best in their future endeavors.</p>
    </div>

    <div class="footer">
      <div class="seal">
        <div class="stamp-box">
          <div>{{CompanyName}}<br>SEAL</div>
        </div>
      </div>
      <div class="sign">
        <img src="{{CeoSignature}}" alt="Signature" style="display:{{CeoSignature:none}};" onerror="this.style.display='none'">
        <div class="line">
          <strong>{{CeoName}}</strong><br>
          <span style="font-size:11px;color:#888;">Chief Executive Officer</span>
        </div>
      </div>
    </div>

    <div class="cert-no">Certificate No: {{CertificateNumber}} | Issue Date: {{IssueDate}}</div>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Training Completion Certificate',
    description: 'Professional training completion certificate with participant details, training program name, duration, topics covered, and assessment results.',
    documentCategory: 'Certificates',
    visibility: 'PUBLIC' as const,
    isPremium: false,
    isDefault: true,
    placeholders: ['OrganizationName', 'OrganizationLogo', 'OrganizationAddress', 'ParticipantName', 'TrainingProgram', 'TrainingProvider', 'TrainingDuration', 'StartDate', 'EndDate', 'TopicsCovered', 'AssessmentScore', 'Grade', 'TrainerName', 'TrainerDesignation', 'CoordinatorName', 'CertificateNumber', 'IssueDate', 'AuthorizedSignature'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Calibri', 'Arial', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
  .cert { max-width: 780px; margin: 40px auto; background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .cert-inner { padding: 40px; border: 1px solid #e0e0e0; }
  .top-border { height: 8px; background: linear-gradient(90deg, #2563eb, #7c3aed, #2563eb); }
  .header { text-align: center; margin-bottom: 20px; }
  .header img { max-height: 55px; margin-bottom: 8px; }
  .header h1 { font-size: 18px; color: #333; margin: 0; text-transform: uppercase; letter-spacing: 2px; }
  .title-icon { font-size: 40px; text-align: center; margin: 15px 0; }
  .title { text-align: center; font-size: 26px; font-weight: 700; color: #2563eb; margin: 5px 0; letter-spacing: 2px; }
  .subtitle { text-align: center; font-size: 14px; color: #666; }
  .content { text-align: center; padding: 15px 20px; line-height: 1.8; }
  .content .pname { font-size: 28px; font-weight: bold; color: #1e3a5f; margin: 8px 0; }
  .content p { font-size: 14px; color: #444; margin: 8px 0; }
  .details-box { background: #f0f4ff; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: left; }
  .details-box table { width: 100%; font-size: 13px; }
  .details-box td { padding: 3px 8px; }
  .details-box td:first-child { font-weight: 600; width: 130px; color: #555; }
  .score { display: inline-block; background: #2563eb; color: white; padding: 5px 20px; border-radius: 20px; font-size: 14px; font-weight: bold; margin: 5px; }
  .grade { display: inline-block; background: #059669; color: white; padding: 5px 20px; border-radius: 20px; font-size: 14px; font-weight: bold; margin: 5px; }
  .footer { display: flex; justify-content: space-between; margin-top: 20px; border-top: 1px solid #e0e0e0; padding-top: 15px; }
  .footer .sign { text-align: right; }
  .footer .sign img { max-height: 40px; }
  .footer .sign .line { border-top: 1px solid #333; width: 180px; margin-top: 30px; padding-top: 5px; margin-left: auto; font-size: 12px; }
  .cert-footer { text-align: center; font-size: 10px; color: #999; margin-top: 10px; }
</style></head>
<body>
<div class="cert">
  <div class="top-border"></div>
  <div class="cert-inner">
    <div class="header">
      <img src="{{OrganizationLogo}}" alt="Logo" style="display:{{OrganizationLogo:none}};" onerror="this.style.display='none'">
      <h1>{{OrganizationName}}</h1>
    </div>

    <div class="title-icon">🎓</div>
    <div class="title">CERTIFICATE OF TRAINING</div>
    <div class="subtitle">This is to certify that</div>

    <div class="content">
      <div class="pname">{{ParticipantName}}</div>
      <p>has successfully completed the training program</p>
      <p style="font-size:18px;font-weight:600;color:#2563eb;">"{{TrainingProgram}}"</p>
      <p>conducted by <strong>{{TrainingProvider}}</strong></p>

      <div class="details-box">
        <table>
          <tr><td>Duration</td><td>{{TrainingDuration}} ({{StartDate}} to {{EndDate}})</td></tr>
          <tr><td>Topics Covered</td><td>{{TopicsCovered}}</td></tr>
          <tr><td>Trainer</td><td>{{TrainerName}} ({{TrainerDesignation}})</td></tr>
          <tr><td>Coordinator</td><td>{{CoordinatorName}}</td></tr>
        </table>
      </div>

      <div>
        <span class="score">Score: {{AssessmentScore}}%</span>
        <span class="grade">Grade: {{Grade}}</span>
      </div>

      <p style="margin-top:10px;">We commend {{ParticipantName}} for their dedication and active participation throughout the training program.</p>
    </div>

    <div class="footer">
      <div>
        <strong>Coordinator</strong>
        <p style="font-size:12px;color:#666;margin:2px 0;">{{CoordinatorName}}</p>
      </div>
      <div class="sign">
        <strong>Authorized Signatory</strong>
        <div class="line">
          <img src="{{AuthorizedSignature}}" alt="Signature" style="display:{{AuthorizedSignature:none}};" onerror="this.style.display='none'">
          {{TrainerName}}
        </div>
      </div>
    </div>

    <div class="cert-footer">Certificate #{{CertificateNumber}} | Issued: {{IssueDate}} | {{OrganizationName}}</div>
  </div>
</div>
</body>
</html>`
  },
  {
    name: 'Achievement / Award Certificate',
    description: 'Elegant achievement and award certificate for recognizing outstanding performance, excellence, and contributions in professional settings.',
    documentCategory: 'Certificates',
    visibility: 'PUBLIC' as const,
    isPremium: true,
    isDefault: true,
    placeholders: ['OrganizationName', 'OrganizationLogo', 'AwardTitle', 'RecipientName', 'RecipientDesignation', 'AchievementDescription', 'AwardDate', 'PresenterName', 'PresenterDesignation', 'PresenterSignature', 'CeoName', 'CeoSignature', 'CertificateNumber', 'IssueDate'],
    htmlTemplate: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Georgia', 'Times New Roman', serif; margin: 0; padding: 0; background: #faf8f5; }
  .cert { max-width: 750px; margin: 40px auto; background: white; position: relative; }
  .gold-frame { border: 10px solid; border-image: linear-gradient(135deg, #d97706, #f59e0b, #d97706) 1; padding: 5px; }
  .inner { padding: 35px; text-align: center; position: relative; }
  .bg-pattern { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle at 25% 25%, rgba(217,119,6,0.03) 0%, transparent 50%); pointer-events: none; }
  .header { margin-bottom: 15px; }
  .header img { max-height: 55px; margin-bottom: 5px; }
  .header h1 { font-size: 16px; color: #92400e; margin: 0; letter-spacing: 3px; text-transform: uppercase; }
  .star-divider { font-size: 24px; color: #d97706; margin: 8px 0; letter-spacing: 10px; }
  .medal { font-size: 48px; margin: 10px 0; }
  .title { font-size: 30px; font-weight: bold; color: #92400e; letter-spacing: 3px; margin: 5px 0; text-transform: uppercase; }
  .ribbon-line { width: 250px; height: 3px; background: linear-gradient(90deg, transparent, #d97706, transparent); margin: 10px auto; }
  .presented { font-size: 13px; color: #666; font-style: italic; margin: 10px 0; }
  .recipient { font-size: 32px; font-weight: bold; color: #1e3a5f; margin: 8px 0; font-family: 'Georgia', serif; letter-spacing: 1px; }
  .for-text { font-size: 13px; color: #555; line-height: 1.7; max-width: 500px; margin: 10px auto; }
  .achievement { font-size: 16px; color: #92400e; font-style: italic; font-weight: 600; margin: 10px 0; padding: 8px 20px; border: 1px dashed #d97706; display: inline-block; }
  .footer { display: flex; justify-content: space-between; margin-top: 25px; border-top: 2px solid #f59e0b; padding-top: 15px; }
  .footer .left { text-align: left; font-size: 12px; }
  .footer .right { text-align: right; }
  .footer .right img { max-height: 40px; display: block; margin-left: auto; }
  .footer .right .line { border-top: 1px solid #333; width: 190px; margin-top: 30px; padding-top: 5px; margin-left: auto; font-size: 12px; }
  .cert-no { font-size: 10px; color: #aaa; margin-top: 10px; }
</style></head>
<body>
<div class="cert">
  <div class="gold-frame">
    <div class="inner">
      <div class="bg-pattern"></div>
      <div class="header">
        <img src="{{OrganizationLogo}}" alt="Logo" style="display:{{OrganizationLogo:none}};" onerror="this.style.display='none'">
        <h1>{{OrganizationName}}</h1>
      </div>

      <div class="star-divider">✦ ✦ ✦</div>
      <div class="medal">🏆</div>
      <div class="title">{{AwardTitle}}</div>
      <div class="ribbon-line"></div>

      <div class="presented">Proudly Presented To</div>
      <div class="recipient">{{RecipientName}}</div>
      <div class="ribbon-line"></div>

      <div class="for-text">
        <p>In recognition of outstanding performance and exceptional dedication, we are honored to present this award to <strong>{{RecipientName}}</strong> for the role of <strong>{{RecipientDesignation}}</strong>.</p>
      </div>

      <div class="achievement">{{AchievementDescription}}</div>

      <div class="for-text">
        <p>Your hard work, commitment, and contributions have made a significant impact. We appreciate your efforts and look forward to your continued success.</p>
        <p>Date: {{AwardDate}}</p>
      </div>

      <div class="footer">
        <div class="left">
          <strong>Presented by</strong>
          <p style="margin:3px 0;font-size:13px;">{{PresenterName}}</p>
          <p style="font-size:11px;color:#666;">{{PresenterDesignation}}</p>
        </div>
        <div class="right">
          <strong>Authorized Signature</strong>
          <div class="line">
            <img src="{{CeoSignature}}" alt="Signature" style="display:{{CeoSignature:none}};" onerror="this.style.display='none'">
            {{CeoName}}
          </div>
        </div>
      </div>

      <div class="cert-no">Certificate #{{CertificateNumber}} | Issued: {{IssueDate}} | {{OrganizationName}}</div>
    </div>
  </div>
</div>
</body>
</html>`
  },
];

// ─── Main Seed Function ───
async function main() {
  console.log('🌱 DocMint - Seeding sample templates...\n');

  let created = 0;
  let skipped = 0;

  for (const tmpl of TEMPLATES) {
    // Check if template already exists by name
    const existing = await prisma.template.findFirst({
      where: { name: tmpl.name, isDefault: true },
    });

    if (existing) {
      // Only sync the isPremium flag (and reactivate if disabled) — NOT content
      // fields, so re-running the seed applies premium toggles without
      // clobbering admin edits to default templates' HTML/placeholders.
      // Set SEED_SYNC_HTML=1 to also refresh content fields (e.g. after
      // redesigning a seeded template's HTML).
      const refreshHtml = process.env.SEED_SYNC_HTML === '1';
      await prisma.template.update({
        where: { id: existing.id },
        data: {
          isPremium: tmpl.isPremium,
          isActive: true,
          ...(refreshHtml
            ? {
                description: tmpl.description,
                htmlTemplate: tmpl.htmlTemplate,
                placeholders: tmpl.placeholders,
                variables: makeVariables(tmpl.placeholders) as Prisma.InputJsonValue,
                documentCategory: tmpl.documentCategory,
              }
            : {}),
        },
      });
      console.log(`  ↻  Synced: "${tmpl.name}" (${tmpl.documentCategory})${tmpl.isPremium ? ' [PREMIUM]' : ''}${refreshHtml ? ' [HTML]' : ''}`);
      skipped++;
      continue;
    }

    const variables = makeVariables(tmpl.placeholders);

    await prisma.template.create({
      data: {
        name: tmpl.name,
        slug: tmpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        description: tmpl.description,
        htmlTemplate: tmpl.htmlTemplate,
        variables: variables as Prisma.InputJsonValue,
        placeholders: tmpl.placeholders,
        documentCategory: tmpl.documentCategory,
        visibility: tmpl.visibility,
        isPremium: tmpl.isPremium,
        isDefault: tmpl.isDefault,
        isActive: true,
        usageCount: 0,
        version: 1,
      },
    });

    console.log(`  ✅ Created: "${tmpl.name}" (${tmpl.documentCategory})`);
    created++;
  }

  console.log(`\n📊 Summary: ${created} created, ${skipped} synced`);
  console.log('✨ Seed complete!\n');
}

main()
  .catch((e: unknown) => {
    const err = e as { code?: string; message?: string };
    if (err.code === 'ECONNREFUSED') {
      console.error('\n❌ Could not connect to PostgreSQL. Please ensure your database is running:');
      console.error('   • Start PostgreSQL: pg_ctl start  (or brew services start postgresql on macOS)');
      console.error(`   • Connection: ${process.env.DATABASE_URL}`);
      console.error('   • Then run: npm run db:seed\n');
    } else {
      console.error('❌ Seed failed:', err.message || e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
