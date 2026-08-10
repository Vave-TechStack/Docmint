/**
 * DocMint - Sample Templates Fallback Data
 * 
 * Used by /api/templates when the database is unavailable.
 * Mirrors the templates defined in prisma/seed.ts but without HTML content
 * to keep the bundle small. Includes all 30 templates across 12 categories.
 */

import type { TemplateData } from '@/types';
import { getTemplateThumbnail } from '@/lib/utils/image-placeholders';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { isImageFieldKey, inferImageSubtype } from '@/lib/utils/image-upload';

// ─── Helper: infer variable types from placeholder names ───
// Only image-eligible keys (logo/sign/stamp/header/…) become image/signature
// types — word-boundary safe, so "Designation" stays text.
export function inferType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.includes('date') || lower.includes('joining')) return 'date';
  if (lower.includes('email')) return 'email';
  if (lower.includes('salary') || lower.includes('amount') || lower.includes('total') || lower.includes('ctc') || lower.includes('price') || lower.includes('cost')) return 'number';
  const imageSubtype = inferImageSubtype(key);
  if (imageSubtype) return imageSubtype;
  if (lower.includes('address') || lower.includes('description') || lower.includes('note') || lower.includes('terms')) return 'textarea';
  if (lower.includes('gender') || lower.includes('type') || lower.includes('status') || lower.includes('department')) return 'select';
  return 'text';
}

export interface SampleTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  documentCategory: string;
  visibility: string;
  isPremium: boolean;
  usageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  thumbnail: string;
  placeholders: string[];
  variableCount: number;
  category: { name: string; icon: string } | null;
  user: { name: string } | null;
  htmlTemplate?: string;
}

// Templates sold as one-time ₹9 instant downloads are PUBLIC + isPremium=false.
// Premium templates require an active subscription to download (admin can toggle).
// These names must stay in sync with the same set in prisma/seed.ts / seed-temp.ts.
const PREMIUM_TEMPLATE_NAMES = [
  'GST Invoice',
  'Non-Disclosure Agreement (NDA)',
  'Business Proposal',
  'Property Quotation',
  'Medical Certificate',
  'Internship Certificate',
  'Achievement / Award Certificate',
  'Monthly Payslip',
];

const CATEGORY_ICONS: Record<string, string> = {
  'HR Documents': 'Users',
  'Payroll': 'Banknote',
  'Finance': 'DollarSign',
  'Legal': 'Scale',
  'Business': 'Briefcase',
  'Marketing': 'Megaphone',
  'Resume Builder': 'FileText',
  'Education': 'GraduationCap',
  'Medical': 'Stethoscope',
  'Manufacturing': 'Factory',
  'Real Estate': 'Building2',
  'Certificates': 'Award',
  'General': 'File',
};

// ─── Template Definitions (metadata only) ───
// Each entry: [name, description, category, placeholders[]]
const SAMPLE_TEMPLATES: [string, string, string, string[]][] = [
  // ═══ HR Documents (5 + Employee Payslip appended at the end = 6) ═══
  ['Professional Offer Letter', 'Standard offer letter for new employees with company branding and all essential terms including probation period, compensation, and joining instructions.', 'HR Documents', ['CompanyName', 'CompanyAddress', 'CompanyLogo', 'EmployeeName', 'Designation', 'Department', 'JoiningDate', 'Salary', 'CTC', 'Location', 'Manager', 'HRName', 'HRSignature', 'CurrentDate']],
  ['Experience Letter', 'Professional experience/service certificate for employees leaving the organization with details of tenure, roles, and performance.', 'HR Documents', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'Designation', 'Department', 'JoiningDate', 'RelievingDate', 'LastWorkingDay', 'TotalExperience', 'Skills', 'HRName', 'HRSignature', 'CurrentDate', 'EmployeePhoto']],
  ['Appointment Letter', 'Formal appointment letter for confirmed employees with detailed terms of employment, compensation structure, and company policies.', 'HR Documents', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'Designation', 'Department', 'AppointmentDate', 'Salary', 'CTC', 'Location', 'WorkingDays', 'WorkingHours', 'LeavePolicy', 'NoticePeriod', 'Manager', 'HRName', 'HRSignature', 'CurrentDate']],
  ['Relieving Letter', 'Official relieving letter confirming no dues and releasing the employee from their obligations upon resignation or separation.', 'HR Documents', ['CompanyName', 'CompanyLogo', 'EmployeeName', 'Designation', 'Department', 'JoiningDate', 'RelievingDate', 'Reason', 'HRName', 'HRSignature', 'CurrentDate']],
  ['Promotion Letter', 'Formal promotion letter announcing career advancement with new designation, revised compensation, and effective date.', 'HR Documents', ['CompanyName', 'CompanyLogo', 'EmployeeName', 'OldDesignation', 'NewDesignation', 'Department', 'EffectiveDate', 'OldSalary', 'NewSalary', 'IncrementAmount', 'Reason', 'Manager', 'CEOName', 'CEOSignature', 'CurrentDate']],

  // ═══ Payroll (2) ═══
  ['Monthly Payslip', 'Professional monthly salary slip with detailed earnings and deductions breakdown, ready for printing.', 'Payroll', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'EmployeeID', 'Designation', 'Department', 'PAN', 'BankName', 'BankAccount', 'UAN', 'PayPeriod', 'PayDate', 'Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'SpecialAllowance', 'GrossEarnings', 'PF', 'ESI', 'ProfessionalTax', 'IncomeTax', 'TotalDeductions', 'NetPay', 'NetPayWords']],
  ['Salary Revision Letter', 'Formal salary revision letter with details of compensation changes, effective date, and revised CTC structure.', 'Payroll', ['CompanyName', 'CompanyLogo', 'EmployeeName', 'Designation', 'OldCTC', 'NewCTC', 'IncrementAmount', 'IncrementPercentage', 'EffectiveDate', 'Reason', 'Manager', 'HRName', 'HRSignature', 'CurrentDate']],

  // ═══ Finance (2) ═══
  ['GST Invoice', 'Professional GST-compliant tax invoice with company details, buyer info, itemized billing, and tax breakdown.', 'Finance', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'CompanyWebsite', 'GST', 'PAN', 'CIN', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'BuyerName', 'BuyerAddress', 'BuyerGST', 'BuyerState', 'BuyerStateCode', 'ItemsTable', 'Subtotal', 'CGST', 'SGST', 'IGST', 'TotalTax', 'GrandTotal', 'TotalInWords', 'BankName', 'BankAccount', 'BankIfsc', 'AuthorizedSignature', 'TermsConditions']],
  ['Business Quotation', 'Professional quotation/proposal for products or services with company details, pricing, and terms.', 'Finance', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'CompanyWebsite', 'GST', 'QuotationNumber', 'QuotationDate', 'ValidUntil', 'ClientName', 'ClientAddress', 'ClientEmail', 'ItemsTable', 'Subtotal', 'Discount', 'TaxPercentage', 'TaxAmount', 'GrandTotal', 'TotalInWords', 'PaymentTerms', 'DeliveryTerms', 'AuthorizedSignature', 'TermsConditions']],

  // ═══ Legal (1) ═══
  ['Non-Disclosure Agreement (NDA)', 'Standard mutual non-disclosure agreement for protecting confidential business information between parties.', 'Legal', ['CompanyName', 'CompanyLogo', 'PartyAName', 'PartyAAddress', 'PartyBName', 'PartyBAddress', 'EffectiveDate', 'TermYears', 'Jurisdiction', 'AuthorizedSignature', 'NDA_Signature_PartyB', 'CurrentDate']],

  // ═══ Business (2) ═══
  ['Business Proposal', 'Professional business proposal with executive summary, scope of work, timeline, pricing, and next steps.', 'Business', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'ProposalTitle', 'ClientName', 'ClientCompany', 'ExecutiveSummary', 'ScopeOfWork', 'ProjectTimeline', 'ProjectCost', 'PaymentTerms', 'TeamMembers', 'AuthorizedSignature', 'CurrentDate']],
  ['Meeting Minutes', 'Professional meeting minutes template with agenda, discussion points, action items, and attendee tracking.', 'Business', ['CompanyName', 'CompanyLogo', 'MeetingTitle', 'MeetingDate', 'MeetingTime', 'MeetingLocation', 'Chairperson', 'Attendees', 'Agenda', 'DiscussionPoints', 'Decisions', 'ActionItemsTable', 'NextMeeting', 'MinutesBy', 'CurrentDate']],

  // ═══ Marketing (3) ═══
  ['Social Media Post (LinkedIn/Instagram)', 'Professional social media post template for LinkedIn and Instagram with company branding, headline, engaging body, and clear call-to-action.', 'Marketing', ['CompanyName', 'CompanyLogo', 'PostHeadline', 'PostBody', 'CallToAction', 'ImageUrl', 'Hashtags', 'AuthorName', 'PostDate', 'LinkUrl']],
  ['Email Campaign Template', 'Professional email marketing campaign template with header, engaging content, promotional sections, and clear call-to-action buttons.', 'Marketing', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmailSubject', 'Greeting', 'EmailBody', 'PromoHeadline', 'PromoDescription', 'PromoCode', 'DiscountPercentage', 'CTA_Text', 'CTA_Link', 'FooterText', 'UnsubscribeLink']],
  ['Product Brochure / Flyer', 'Professional product brochure or flyer template with hero section, features grid, pricing table, and contact information.', 'Marketing', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail', 'CompanyWebsite', 'BrochureTitle', 'BrochureSubtitle', 'HeroImage', 'Feature1_Title', 'Feature1_Desc', 'Feature2_Title', 'Feature2_Desc', 'Feature3_Title', 'Feature3_Desc', 'Feature4_Title', 'Feature4_Desc', 'PricingHeadline', 'PriceAmount', 'PricePeriod', 'PriceDetails', 'CTAText']],

  // ═══ Resume Builder (2) ═══
  ['Professional Resume (ATS-Friendly)', 'Clean, ATS-optimized professional resume template with sections for experience, education, skills, and achievements.', 'Resume Builder', ['EmployeePhoto', 'FullName', 'Email', 'Phone', 'Address', 'LinkedIn', 'Portfolio', 'ProfessionalSummary', 'WorkExperience', 'Education', 'Skills', 'Certifications', 'Languages', 'Achievements', 'CurrentDate']],
  ['Cover Letter', 'Professional cover letter template with proper formatting for job applications, with placeholders for personalization.', 'Resume Builder', ['FullName', 'Email', 'Phone', 'Address', 'CurrentDate', 'HiringManagerName', 'CompanyName', 'CompanyAddress', 'Position', 'JobSource', 'CoverBody', 'Signature']],

  // ═══ Education (1) ═══
  ['Bonafide Certificate', 'Official bonafide certificate for students confirming their enrollment at the institution.', 'Education', ['InstitutionName', 'InstitutionLogo', 'InstitutionAddress', 'StudentName', 'StudentClass', 'StudentRollNo', 'AcademicYear', 'Purpose', 'IssuedDate', 'PrincipalName', 'PrincipalSignature']],

  // ═══ Medical (1) ═══
  ['Medical Certificate', 'Professional medical certificate for doctors to certify patient consultation, diagnosis, and recommended rest period.', 'Medical', ['DoctorName', 'DoctorQualification', 'ClinicName', 'ClinicAddress', 'ClinicLogo', 'PatientName', 'PatientAge', 'PatientGender', 'Diagnosis', 'Advice', 'SickDays', 'FromDate', 'ToDate', 'MedicineDetails', 'DoctorSignature', 'IssuedDate', 'RegistrationNo']],

  // ═══ Manufacturing (3) ═══
  ['Work Order', 'Professional manufacturing work order template with job details, production instructions, materials list, timeline, and quality checkpoints.', 'Manufacturing', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'WorkOrderNumber', 'WorkOrderDate', 'DueDate', 'CustomerName', 'CustomerPO', 'ProductName', 'ProductCode', 'Quantity', 'Unit', 'Priority', 'Instructions', 'MaterialsTable', 'Checkpoints', 'Supervisor', 'Inspector', 'AuthorizedSignature']],
  ['Quality Inspection Report', 'Professional quality inspection report for manufacturing with inspection parameters, test results, defect tracking, and sign-off.', 'Manufacturing', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'ReportNumber', 'InspectionDate', 'ProductName', 'BatchNumber', 'LotSize', 'SampleSize', 'InspectorName', 'InspectorID', 'InspectionMethod', 'ParametersTable', 'DefectsFound', 'DefectRate', 'Result', 'Remarks', 'InspectorSignature', 'QAManager', 'QASignature']],
  ['Material Requisition Form', 'Standard material requisition/indent form for manufacturing with item details, quantities, purpose, and approval chain.', 'Manufacturing', ['CompanyName', 'CompanyLogo', 'RequisitionNumber', 'RequisitionDate', 'Department', 'RequiredDate', 'RequestedBy', 'Purpose', 'ItemsTable', 'TotalItems', 'TotalValue', 'Remarks', 'DepartmentHead', 'DeptSignature', 'StoreKeeper', 'StoreSignature', 'AuthorizedBy', 'AuthorizedSignature']],

  // ═══ Real Estate (3) ═══
  ['Rental / Lease Agreement', 'Comprehensive rental and lease agreement template for residential or commercial properties with terms, rent details, security deposit, and maintenance clauses.', 'Real Estate', ['CompanyName', 'CompanyLogo', 'PropertyAddress', 'PropertyType', 'OwnerName', 'OwnerAddress', 'TenantName', 'TenantAddress', 'TenantPhone', 'TenantEmail', 'LeaseStartDate', 'LeaseEndDate', 'LeaseDuration', 'RentAmount', 'RentDueDate', 'SecurityDeposit', 'MaintenanceCharges', 'NoticePeriod', 'LatePenalty', 'UtilityIncluded', 'ParkingDetails', 'PetPolicy', 'SpecialClauses', 'OwnerSignature', 'TenantSignature', 'WitnessName', 'WitnessSignature', 'CurrentDate']],
  ['Property Quotation', 'Professional property quotation template for real estate agents with property details, pricing breakdown, payment schedule, and terms.', 'Real Estate', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail', 'QuotationNumber', 'QuotationDate', 'ValidUntil', 'ClientName', 'ClientContact', 'PropertyName', 'PropertyAddress', 'PropertyType', 'PropertySize', 'Configuration', 'BasePrice', 'FloorRise', 'CarParking', 'RegistrationCharges', 'GST_Amount', 'TotalCost', 'BookingAmount', 'PaymentSchedule', 'PossessionDate', 'AdditionalCharges', 'TermsAndConditions', 'AgentName', 'AgentSignature']],
  ['Possession Letter', 'Official possession/handover letter for real estate properties with property details, possession date, checklist, and acknowledgment by the buyer.', 'Real Estate', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'BuilderName', 'BuyerName', 'BuyerAddress', 'PropertyName', 'PropertyAddress', 'UnitNumber', 'ProjectName', 'PossessionDate', 'HandoverDate', 'CarpetArea', 'SuperArea', 'ParkingSlots', 'Amenities', 'DefectList', 'MaintenancePeriod', 'SocietyDetails', 'KeysCount', 'MeterReading', 'OutstandingDues', 'BuilderSignature', 'BuyerSignature', 'WitnessName', 'CurrentDate']],

  // ═══ Certificates (3) ═══
  ['Internship Certificate', 'Professional internship completion certificate with intern details, duration, project description, and skills acquired.', 'Certificates', ['InstitutionName', 'CompanyLogo', 'CompanyName', 'CompanyAddress', 'InternName', 'InternDepartment', 'InternProject', 'InternshipStart', 'InternshipEnd', 'InternshipDuration', 'SkillsAcquired', 'SupervisorName', 'SupervisorDesignation', 'SupervisorSignature', 'CeoName', 'CeoSignature', 'CertificateNumber', 'IssueDate']],
  ['Training Completion Certificate', 'Professional training completion certificate with participant details, training program name, duration, topics covered, and assessment results.', 'Certificates', ['OrganizationName', 'OrganizationLogo', 'OrganizationAddress', 'ParticipantName', 'TrainingProgram', 'TrainingProvider', 'TrainingDuration', 'StartDate', 'EndDate', 'TopicsCovered', 'AssessmentScore', 'Grade', 'TrainerName', 'TrainerDesignation', 'CoordinatorName', 'CertificateNumber', 'IssueDate', 'AuthorizedSignature']],
  ['Achievement / Award Certificate', 'Elegant achievement and award certificate for recognizing outstanding performance, excellence, and contributions in professional settings.', 'Certificates', ['OrganizationName', 'OrganizationLogo', 'AwardTitle', 'RecipientName', 'RecipientDesignation', 'AchievementDescription', 'AwardDate', 'PresenterName', 'PresenterDesignation', 'PresenterSignature', 'CeoName', 'CeoSignature', 'CertificateNumber', 'IssueDate']],

  // ═══ General (1) ═══
  ['Professional Letterhead', 'Elegant business letterhead with company branding, ready for official correspondence and communication.', 'General', ['CompanyName', 'CompanyLogo', 'CompanySeal', 'CompanyAddress', 'CompanyEmail', 'CompanyPhone', 'CompanyWebsite', 'GST', 'PAN', 'CIN', 'MSME', 'CurrentDate', 'LetterBody', 'AuthorizedSignature']],

  // ═══ HR Documents (6) — grouped at the end so existing sample ids stay stable ═══
  ['Employee Payslip', 'Clean monthly salary slip for employees with a modern earnings & deductions breakdown, bank details, and net pay summary.', 'HR Documents', ['CompanyName', 'CompanyLogo', 'CompanyAddress', 'EmployeeName', 'EmployeeID', 'Designation', 'Department', 'PAN', 'BankName', 'BankAccount', 'UAN', 'PayPeriod', 'PayDate', 'Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'SpecialAllowance', 'GrossEarnings', 'PF', 'ESI', 'ProfessionalTax', 'IncomeTax', 'TotalDeductions', 'NetPay', 'NetPayWords']],
];

// ─── Build the full sample template list with generated IDs ───
function buildSampleTemplates(): SampleTemplate[] {
  return SAMPLE_TEMPLATES.map(([name, desc, cat, placeholders], index) => {
    const id = `sample-${String(index + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();
    // Stagger creation dates so sorting works
    const created = new Date(Date.now() - (SAMPLE_TEMPLATES.length - index) * 86400000).toISOString();
    return {
      id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: desc,
      documentCategory: cat,
      visibility: 'PUBLIC',
      usageCount: Math.floor(Math.random() * 500) + 10,
      isPremium: PREMIUM_TEMPLATE_NAMES.includes(name),
      version: 1,
      createdAt: created,
      updatedAt: now,
      thumbnail: getTemplateThumbnail(name, cat),
      placeholders,
      variableCount: placeholders.length,
      category: { name: cat, icon: CATEGORY_ICONS[cat] || 'File' },
      user: null,
    };
  });
}

export const sampleTemplates: SampleTemplate[] = buildSampleTemplates();

// ─── Query helpers matching the TemplateEngine.list() signature ───
export interface FallbackQueryOptions {
  documentCategory?: string;
  visibility?: string;
  isPremium?: boolean;
  search?: string;
  slug?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function querySampleTemplates(options: FallbackQueryOptions) {
  let filtered = [...sampleTemplates];

  // Apply filters
  if (options.slug) {
    filtered = filtered.filter((t) => t.slug === options.slug);
  }
  if (options.documentCategory) {
    filtered = filtered.filter((t) => t.documentCategory === options.documentCategory);
  }
  if (options.visibility) {
    filtered = filtered.filter((t) => t.visibility === options.visibility);
  }
  if (options.isPremium !== undefined) {
    filtered = filtered.filter((t) => t.isPremium === options.isPremium);
  }
  if (options.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }

  // Sort
  const sortField = (options.sortBy || 'usageCount') as keyof SampleTemplate;
  const sortOrder = options.sortOrder || 'desc';
  filtered.sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === 'string') {
      return sortOrder === 'asc' ? aVal.localeCompare(String(bVal)) : String(bVal).localeCompare(aVal);
    }
    const aNum = typeof aVal === 'number' ? aVal : 0;
    const bNum = typeof bVal === 'number' ? bVal : 0;
    return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
  });

  // Paginate
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);

  return { data, total, page, pageSize, totalPages };
}

export function findSampleById(id: string): SampleTemplate | undefined {
  return sampleTemplates.find((t) => t.id === id);
}

/**
 * Generate a presentable HTML template from a list of placeholders.
 * Used as fallback when the database is unavailable and sample templates
 * have no stored HTML content. Creates a professional-looking document
 * with a structured table view of all placeholders.
 */
/**
 * Helper to check if a placeholder key is company-related.
 */
function isCompanyKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('company') || lower === 'gst' || lower === 'pan' || lower === 'cin' || lower === 'msme';
}

/**
 * Generate a presentable HTML template from a list of placeholders.
 * Used as fallback when the database is unavailable and sample templates
 * have no stored HTML content. Creates a professional-looking document
 * with a structured table view of all placeholders.
 */
export function generatePlaceholderHtml(placeholders: string[], name: string): string {
  const safeName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hasCurrentDate = placeholders.some(k => k.toLowerCase() === 'currentdate');
  
  // Filter placeholders into company vs document-specific
  const companyKeys = placeholders.filter(k => isCompanyKey(k));
  const docKeys = placeholders.filter(k => !isCompanyKey(k) && k.toLowerCase() !== 'currentdate');
  
  // Render a table row for a given key
  const renderRow = (key: string, opts?: { compact?: boolean }) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    const isImage = isImageFieldKey(key);
    const pad = opts?.compact ? '8px 12px' : '10px 14px';
    const w = opts?.compact ? '160px' : '200px';
    return `<tr><td style="padding:${pad};border:1px solid #e5e7eb;font-weight:600;color:#374151;background:#f9fafb;white-space:nowrap;width:${w}">${label}</td><td style="padding:${pad};border:1px solid #e5e7eb;color:#6b7280">${isImage ? `<img src="{{${key}}}" alt="${label}" style="max-height:36px;border-radius:4px" />` : `{{${key}}}`}</td></tr>`;
  };

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px">
  <!-- Header -->
  <div style="text-align:center;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #2563eb">
    ${companyKeys.some(k => k.toLowerCase().includes('logo')) ? '{{' + companyKeys.find(k => k.toLowerCase().includes('logo')) + '}}' : ''}
    <h1 style="font-size:22px;color:#111827;margin:12px 0 4px">${safeName}</h1>
    <p style="font-size:13px;color:#6b7280">Generated from template placeholders</p>
  </div>
  
  <!-- Company Info -->
  ${companyKeys.length > 0 ? `
  <div style="margin-bottom:24px">
    <h2 style="font-size:15px;color:#374151;margin-bottom:10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Company Information</h2>
    <table style="width:100%;border-collapse:collapse">
      ${companyKeys.map(k => renderRow(k, { compact: true })).join('\n')}
    </table>
  </div>` : ''}
  
  <!-- Document Details -->
  ${docKeys.length > 0 ? `
  <div style="margin-bottom:24px">
    <h2 style="font-size:15px;color:#374151;margin-bottom:10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Document Details</h2>
    <table style="width:100%;border-collapse:collapse">
      ${docKeys.map(k => renderRow(k)).join('\n')}
    </table>
  </div>` : ''}
  
  <!-- Footer -->
  <div style="margin-top:32px;padding-top:16px;border-top:2px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af">
    <p>This document was generated using the <strong>${safeName}</strong> template.</p>
    ${hasCurrentDate ? '<p style="margin-top:4px">{{CurrentDate}}</p>' : ''}
  </div>
</div>`;
}

/**
 * Payslip-specific fallback HTML — mirrors the A4, table-based design seeded
 * for "Employee Payslip" in prisma/seed.ts. Tables are used instead of
 * flex/grid because jsPDF renders this HTML through html2canvas 1.4.1, which
 * handles tables reliably but mis-renders flex/grid. Placeholders render as
 * values when filled, or as editable-looking {{Placeholder}} tokens when not.
 */
export function generatePayslipHtml(placeholders: string[]): string {
  const has = (k: string) => placeholders.some((p) => p.toLowerCase() === k.toLowerCase());
  const v = (k: string) => (has(k) ? `{{${k}}}` : '');
  const img = (k: string) =>
    has(k)
      ? `<img src="{{${k}}}" alt="Logo" style="max-height:52px;max-width:130px;display:{{${k}:none}};" onerror="this.style.display='none'" />`
      : '';
  const row = (label: string, key: string) =>
    `<tr><td>${label}</td><td>${v(key)}</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
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
  .payslip { width: 100%; max-width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm 11mm 8mm; }
  table { border-collapse: collapse; width: 100%; }
  .hdr td { vertical-align: middle; padding: 0; }
  .hdr-company { font-size: 19px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.3px; }
  .hdr-addr { font-size: 10.5px; color: #6b7280; margin-top: 2px; line-height: 1.45; }
  .hdr-logo { text-align: right; }
  .hdr-title { background: #1d4ed8; color: #fff; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; padding: 7px 0; margin-top: 10px; }
  .meta { margin-top: 10px; border: 1px solid #e5e7eb; background: #f8fafc; }
  .meta td { padding: 7px 10px; font-size: 11px; color: #374151; width: 50%; }
  .meta td + td { border-left: 1px solid #e5e7eb; }
  .meta .lbl, .emp .lbl { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; }
  .emp { margin-top: 10px; }
  .emp td { padding: 6px 8px; font-size: 11.5px; border: 1px solid #e5e7eb; width: 50%; vertical-align: top; }
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
  .net { margin-top: 12px; background: #059669; color: #fff; }
  .net td { padding: 9px 14px; vertical-align: middle; }
  .net-label { font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .net-label small { display: block; font-size: 9.5px; font-weight: 400; text-transform: none; letter-spacing: 0; opacity: 0.9; margin-top: 2px; }
  .net-amount { text-align: right; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
  .bank { margin-top: 10px; font-size: 10.5px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 7px; }
  .footer { margin-top: 8px; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 6px; }
  @media print { html, body { background: #fff !important; } .payslip { max-width: none; min-height: 0; padding: 0; } }
</style></head>
<body>
<div class="payslip">
  <table class="hdr">
    <tr>
      <td>
        <div class="hdr-company">${v('CompanyName')}</div>
        <div class="hdr-addr">${v('CompanyAddress')}</div>
      </td>
      <td class="hdr-logo">${img('CompanyLogo')}</td>
    </tr>
  </table>
  <div class="hdr-title">Salary Slip</div>

  <table class="meta">
    <tr>
      <td><span class="lbl">Pay Period</span>${v('PayPeriod')}</td>
      <td><span class="lbl">Pay Date</span>${v('PayDate')}</td>
    </tr>
  </table>

  <table class="emp">
    <tr>
      <td><span class="lbl">Employee Name</span>${v('EmployeeName')}</td>
      <td><span class="lbl">Employee ID</span>${v('EmployeeID')}</td>
    </tr>
    <tr>
      <td><span class="lbl">Designation</span>${v('Designation')}</td>
      <td><span class="lbl">Department</span>${v('Department')}</td>
    </tr>
    <tr>
      <td><span class="lbl">PAN</span>${v('PAN')}</td>
      <td><span class="lbl">UAN</span>${v('UAN')}</td>
    </tr>
  </table>

  <table class="cols">
    <tr>
      <td>
        <div class="section">
          <div class="section-head">Earnings</div>
          <table class="items">
            ${row('Basic Salary', 'Basic')}
            ${row('Dearness Allowance', 'DA')}
            ${row('House Rent Allowance', 'HRA')}
            ${row('Conveyance Allowance', 'Conveyance')}
            ${row('Medical Allowance', 'Medical')}
            ${row('Special Allowance', 'SpecialAllowance')}
            <tr class="total"><td>Gross Earnings</td><td>${v('GrossEarnings')}</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="section">
          <div class="section-head">Deductions</div>
          <table class="items">
            ${row('Provident Fund', 'PF')}
            ${row('ESI', 'ESI')}
            ${row('Professional Tax', 'ProfessionalTax')}
            ${row('Income Tax', 'IncomeTax')}
            <tr class="total"><td>Total Deductions</td><td>${v('TotalDeductions')}</td></tr>
          </table>
        </div>
      </td>
    </tr>
  </table>

  <table class="net">
    <tr>
      <td><div class="net-label">Net Pay<small>Rupees ${v('NetPayWords')} only</small></div></td>
      <td class="net-amount">${v('NetPay')}</td>
    </tr>
  </table>

  <div class="bank"><strong>Bank:</strong> ${v('BankName')} &nbsp;|&nbsp; <strong>A/c No:</strong> ${v('BankAccount')}</div>
  <div class="footer">This is a computer-generated payslip | ${v('CompanyName')} | For any discrepancies, contact HR</div>
</div>
</body>
</html>`;
}

export function getSampleHtmlContent(template: SampleTemplate): string {
  if (template.placeholders.length === 0) return '';
  // Payslip gets its own A4 table layout (mirrors the seeded design) so the
  // DB-down fallback still renders a proper salary slip instead of the generic
  // placeholder table.
  if (template.name === 'Employee Payslip') {
    return generatePayslipHtml(template.placeholders);
  }
  return generatePlaceholderHtml(template.placeholders, template.name);
}

/**
 * Convert a static sample template into a full TemplateData object with
 * generated HTML content and typed variables.
 *
 * Used by API routes (template detail GET, paid instant download, template
 * download) so fallback/sample templates work end-to-end — including after
 * a payment — even when the database has no row for the template.
 */
/**
 * Resolve a template by id — DB first, falling back to static sample data when
 * the DB has no row (or is unavailable).
 *
 * The /api/templates list API already falls back to samples, so every consumer
 * that renders a template (paid instant download, template download, Sample
 * PDF/DOCX buttons) MUST resolve the same template or users hit a 404 after
 * payment. This single source keeps those paths from drifting again.
 */
export async function resolveTemplateWithFallback(
  id: string,
  tenantId?: string | null
): Promise<TemplateData | null> {
  try {
    const template = await TemplateEngine.getById(id, tenantId);
    if (template && template.htmlTemplate) return template;
  } catch (dbError) {
    console.warn('DB unavailable, using sample template fallback:', (dbError as Error)?.message);
  }

  const sample = findSampleById(id);
  if (sample) return sampleToTemplateData(sample);
  return null;
}

export function sampleToTemplateData(sample: SampleTemplate): TemplateData {
  const optional = ['photo', 'image', 'logo', 'seal', 'watermark', 'optional'];
  const variables = sample.placeholders.map((key: string) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
    return {
      key,
      label,
      type: inferType(key),
      required: !optional.some((o) => key.toLowerCase().includes(o)),
      placeholder: `Enter ${label}`,
      defaultValue: '',
      options: [],
    };
  });

  return {
    id: sample.id,
    name: sample.name,
    slug: sample.slug,
    description: sample.description,
    thumbnail: sample.thumbnail,
    content: {},
    htmlTemplate: getSampleHtmlContent(sample),
    variables: variables as TemplateData['variables'],
    documentCategory: sample.documentCategory,
    visibility: sample.visibility as TemplateData['visibility'],
    isPremium: sample.isPremium,
    isDefault: true,
    usageCount: sample.usageCount,
    version: sample.version,
    createdAt: sample.createdAt,
    updatedAt: sample.updatedAt,
  };
}
