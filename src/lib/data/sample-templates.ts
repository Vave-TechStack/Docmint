/**
 * DocMint - Sample Templates Fallback Data
 * 
 * Used by /api/templates when the database is unavailable.
 * Mirrors the templates defined in prisma/seed.ts but without HTML content
 * to keep the bundle small. Includes all 30 templates across 12 categories.
 */

// ─── Helper: infer variable types from placeholder names ───
export function inferType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.includes('date') || lower.includes('joining')) return 'date';
  if (lower.includes('email')) return 'email';
  if (lower.includes('salary') || lower.includes('amount') || lower.includes('total') || lower.includes('ctc') || lower.includes('price') || lower.includes('cost')) return 'number';
  if (lower.includes('address') || lower.includes('description') || lower.includes('note') || lower.includes('terms')) return 'textarea';
  if (lower.includes('photo') || lower.includes('logo') || lower.includes('image') || lower.includes('seal')) return 'image';
  if (lower.includes('signature') || lower.includes('sign')) return 'signature';
  if (lower.includes('gender') || lower.includes('type') || lower.includes('status') || lower.includes('department')) return 'select';
  return 'text';
}

function placeholderToLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function makeVariables(placeholders: string[]) {
  const optional = ['photo', 'image', 'logo', 'seal', 'watermark', 'optional'];
  return placeholders.map((key) => ({
    key,
    label: placeholderToLabel(key),
    type: inferType(key),
    required: !optional.some((o) => key.toLowerCase().includes(o)),
    placeholder: `Enter ${placeholderToLabel(key)}`,
    defaultValue: '',
    options: [] as string[],
  }));
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
  placeholders: string[];
  variableCount: number;
  category: { name: string; icon: string } | null;
  user: { name: string } | null;
}

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
  // ═══ HR Documents (5) ═══
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
      isPremium: false,
      usageCount: Math.floor(Math.random() * 500) + 10,
      version: 1,
      createdAt: created,
      updatedAt: now,
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
  const sortField = options.sortBy || 'usageCount';
  const sortOrder = options.sortOrder || 'desc';
  filtered.sort((a: any, b: any) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    if (typeof aVal === 'string') {
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
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
