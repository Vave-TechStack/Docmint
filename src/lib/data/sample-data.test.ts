import { describe, it, expect } from 'vitest';
import { generateSampleVariables } from './sample-data';

describe('generateSampleVariables', () => {
  it('should return empty object for empty placeholders array', () => {
    const result = generateSampleVariables([]);
    expect(result).toEqual({});
  });

  it('should generate a company name value', () => {
    const result = generateSampleVariables(['CompanyName']);
    expect(result.CompanyName).toBe('Acme Corporation Pvt. Ltd.');
  });

  it('should generate a company logo placeholder value', () => {
    const result = generateSampleVariables(['CompanyLogo']);
    expect(result.CompanyLogo).toContain('data:image/svg+xml;base64');
  });

  it('should generate a seal placeholder', () => {
    const result = generateSampleVariables(['CompanySeal']);
    expect(result.CompanySeal).toContain('data:image/svg+xml;base64');
  });

  it('should generate an employee photo placeholder', () => {
    const result = generateSampleVariables(['EmployeePhoto']);
    expect(result.EmployeePhoto).toContain('data:image/svg+xml;base64');
  });

  it('should generate a signature placeholder for keys containing "signature"', () => {
    const result = generateSampleVariables(['AuthorizedSignature']);
    expect(result.AuthorizedSignature).toContain('data:image/svg+xml;base64');
  });

  it('should generate an employee name', () => {
    const result = generateSampleVariables(['EmployeeName']);
    expect(result.EmployeeName).toBe('Rahul Sharma');
  });

  it('should generate a salary value', () => {
    const result = generateSampleVariables(['Salary']);
    expect(result.Salary).toBe('75,000');
  });

  it('should generate a CTC value', () => {
    const result = generateSampleVariables(['CTC']);
    expect(result.CTC).toBe('12,00,000');
  });

  it('should generate current date', () => {
    const result = generateSampleVariables(['CurrentDate']);
    const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(result.CurrentDate).toBe(today);
  });

  it('should generate a PAN number', () => {
    const result = generateSampleVariables(['PAN']);
    expect(result.PAN).toBe('AABCP1234D');
  });

  it('should generate a GST number', () => {
    const result = generateSampleVariables(['GST']);
    expect(result.GST).toBe('29AABCP1234D1Z5');
  });

  it('should generate a bank account number', () => {
    const result = generateSampleVariables(['BankAccount']);
    expect(result.BankAccount).toBe('12345678901');
  });

  it('should generate a document number like invoice', () => {
    const result = generateSampleVariables(['InvoiceNumber']);
    expect(result.InvoiceNumber).toBe('INV-2024-0042');
  });

  it('should generate a quotation number', () => {
    const result = generateSampleVariables(['QuotationNumber']);
    expect(result.QuotationNumber).toBe('QTN-2024-0089');
  });

  it('should generate a joining date', () => {
    const result = generateSampleVariables(['JoiningDate']);
    expect(result.JoiningDate).toBe('15 January 2024');
  });

  it('should generate a relieving date', () => {
    const result = generateSampleVariables(['RelievingDate']);
    expect(result.RelievingDate).toBe('14 January 2026');
  });

  it('should generate a valid-until date', () => {
    const result = generateSampleVariables(['ValidUntil']);
    expect(result.ValidUntil).toBe('31 March 2024');
  });

  it('should generate invoice date (contains "invoicedate")', () => {
    const result = generateSampleVariables(['InvoiceDate']);
    expect(result.InvoiceDate).toBe('01 March 2024');
  });

  it('should generate due date (contains "duedate")', () => {
    const result = generateSampleVariables(['DueDate']);
    expect(result.DueDate).toBe('15 March 2024');
  });

  it('should generate an address', () => {
    const result = generateSampleVariables(['CompanyAddress']);
    expect(result.CompanyAddress).toContain('Bangalore');
  });

  it('should generate an email', () => {
    const result = generateSampleVariables(['CompanyEmail']);
    expect(result.CompanyEmail).toContain('@');
  });

  it('should generate a phone number', () => {
    const result = generateSampleVariables(['CompanyPhone']);
    expect(result.CompanyPhone).toBe('+91 80 4567 8900');
  });

  it('should generate a website', () => {
    const result = generateSampleVariables(['CompanyWebsite']);
    expect(result.CompanyWebsite).toBe('www.acmecorp.com');
  });

  it('should generate a designation', () => {
    const result = generateSampleVariables(['Designation']);
    expect(result.Designation).toBe('Senior Software Engineer');
  });

  it('should generate a department', () => {
    const result = generateSampleVariables(['Department']);
    expect(result.Department).toBe('Engineering');
  });

  it('should generate an employee ID', () => {
    const result = generateSampleVariables(['EmployeeID']);
    expect(result.EmployeeID).toBe('EMP-2024-0427');
  });

  it('should generate a manager name', () => {
    const result = generateSampleVariables(['Manager']);
    expect(result.Manager).toBe('Vikram Patel');
  });

  it('should generate an increment amount', () => {
    const result = generateSampleVariables(['IncrementAmount']);
    expect(result.IncrementAmount).toBe('3,00,000');
  });

  it('should generate HRA amount', () => {
    const result = generateSampleVariables(['HRA']);
    expect(result.HRA).toBe('15,000');
  });

  it('should generate net pay', () => {
    const result = generateSampleVariables(['NetPay']);
    expect(result.NetPay).toBe('65,000');
  });

  it('should generate net pay in words', () => {
    const result = generateSampleVariables(['NetPayWords']);
    expect(result.NetPayWords).toBe('Sixty-Five Thousand Only');
  });

  it('should generate total in words', () => {
    const result = generateSampleVariables(['TotalInWords']);
    expect(result.TotalInWords).toBe('One Lakh Eighteen Thousand Only');
  });

  it('should generate subtotal', () => {
    const result = generateSampleVariables(['Subtotal']);
    expect(result.Subtotal).toBe('1,00,000');
  });

  it('should generate grand total', () => {
    const result = generateSampleVariables(['GrandTotal']);
    expect(result.GrandTotal).toBe('1,18,000');
  });

  it('should generate CGST', () => {
    const result = generateSampleVariables(['CGST']);
    expect(result.CGST).toBe('9,000');
  });

  it('should generate SGST', () => {
    const result = generateSampleVariables(['SGST']);
    expect(result.SGST).toBe('9,000');
  });

  it('should generate discount', () => {
    const result = generateSampleVariables(['Discount']);
    expect(result.Discount).toBe('5,000');
  });

  it('should generate buyer/client names', () => {
    const result = generateSampleVariables(['BuyerName', 'ClientName']);
    expect(result.BuyerName).toBe('TechSolutions India Ltd.');
    expect(result.ClientName).toBe('TechSolutions India Ltd.');
  });

  it('should generate buyer address', () => {
    const result = generateSampleVariables(['BuyerAddress']);
    expect(result.BuyerAddress).toContain('Whitefield');
  });

  it('should generate buyer GST', () => {
    const result = generateSampleVariables(['BuyerGST']);
    expect(result.BuyerGST).toBe('29ABCDE1234F1Z6');
  });

  it('should generate buyer state', () => {
    const result = generateSampleVariables(['BuyerState']);
    expect(result.BuyerState).toBe('Karnataka');
  });

  it('should generate an invoice number for keys containing "invoicenumber"', () => {
    const result = generateSampleVariables(['invoiceNumber']);
    expect(result.invoiceNumber).toBe('INV-2024-0042');
  });

  it('should handle case-insensitive matching for keys like "salary" vs "Salary"', () => {
    const result = generateSampleVariables(['salary']);
    expect(result.salary).toBe('75,000');
  });

  it('should generate values for all placeholder types at once', () => {
    const keys = [
      'CompanyName',
      'CompanyAddress',
      'CompanyLogo',
      'EmployeeName',
      'Designation',
      'Salary',
      'InvoiceNumber',
      'AuthorizedSignature',
      'TermsConditions',
    ];
    const result = generateSampleVariables(keys);
    expect(result.CompanyName).toBe('Acme Corporation Pvt. Ltd.');
    expect(result.CompanyAddress).toContain('Bangalore');
    expect(result.CompanyLogo).toContain('data:image/');
    expect(result.EmployeeName).toBe('Rahul Sharma');
    expect(result.Designation).toBe('Senior Software Engineer');
    expect(result.Salary).toBe('75,000');
    expect(result.InvoiceNumber).toBe('INV-2024-0042');
    expect(result.AuthorizedSignature).toContain('data:image/');
  });

  it('should return a fallback value in brackets for unknown keys', () => {
    const result = generateSampleVariables(['UnknownKey']);
    expect(result.UnknownKey).toBe('[UnknownKey]');
  });

  it('should generate education-related values', () => {
    const result = generateSampleVariables([
      'InstitutionName',
      'StudentName',
      'StudentClass',
      'AcademicYear',
    ]);
    expect(result.InstitutionName).toBe("St. Xavier's College");
    expect(result.StudentName).toBe('Aditya Verma');
    expect(result.StudentClass).toBe('Class XII - Science');
    expect(result.AcademicYear).toBe('2024-2025');
  });

  it('should generate medical-related values', () => {
    const result = generateSampleVariables([
      'DoctorName',
      'PatientName',
      'Diagnosis',
      'MedicineDetails',
    ]);
    expect(result.DoctorName).toBe('Dr. Meera Reddy');
    expect(result.PatientName).toBe('Suresh Kumar');
    expect(result.Diagnosis).toBe('Acute Bronchitis with mild fever');
    expect(result.MedicineDetails).toContain('Amoxicillin');
  });

  it('should generate a professional summary for resumes', () => {
    const result = generateSampleVariables(['ProfessionalSummary']);
    expect(result.ProfessionalSummary).toContain('Experienced software engineer');
  });

  it('should generate work experience for resumes', () => {
    const result = generateSampleVariables(['WorkExperience']);
    expect(result.WorkExperience).toContain('Senior Software Engineer');
    expect(result.WorkExperience).toContain('Acme Corp');
  });

  it('should generate skills', () => {
    const result = generateSampleVariables(['Skills']);
    expect(result.Skills).toContain('JavaScript');
    expect(result.Skills).toContain('TypeScript');
  });

  it('should generate email campaign values', () => {
    const result = generateSampleVariables(['EmailSubject', 'PromoCode', 'Greeting']);
    expect(result.EmailSubject).toContain('Exclusive Offer');
    expect(result.PromoCode).toBe('PREMIUM20');
    expect(result.Greeting).toBe('Dear Customer,');
  });

  it('should generate real estate values', () => {
    const result = generateSampleVariables([
      'PropertyAddress',
      'PropertyType',
      'RentAmount',
      'SecurityDeposit',
    ]);
    expect(result.PropertyAddress).toContain('Electronic City');
    expect(result.PropertyType).toBe('2 BHK Premium Apartment');
    expect(result.RentAmount).toBe('35,000');
    expect(result.SecurityDeposit).toBe('1,05,000');
  });

  it('should generate certificate values', () => {
    const result = generateSampleVariables([
      'AwardTitle',
      'RecipientName',
      'TrainingProgram',
      'AssessmentScore',
    ]);
    expect(result.AwardTitle).toBe('Outstanding Achievement Award 2024');
    expect(result.RecipientName).toBe('Rahul Sharma');
    expect(result.TrainingProgram).toBe('Advanced Cloud Architecture & DevOps');
    expect(result.AssessmentScore).toBe('92%');
  });

  it('should generate manufacturing values', () => {
    const result = generateSampleVariables([
      'ProductName',
      'Quantity',
      'BatchNumber',
      'InspectorName',
    ]);
    expect(result.ProductName).toBe('Industrial Grade Bearing Assembly');
    expect(result.Quantity).toBe('500');
    expect(result.BatchNumber).toBe('BATCH-2024-02-156');
    expect(result.InspectorName).toBe('Quality Inspector - Ramesh Gupta');
  });

  it('should generate NDA/legal values', () => {
    const result = generateSampleVariables([
      'PartyAName',
      'PartyBName',
      'Jurisdiction',
      'TermYears',
    ]);
    expect(result.PartyAName).toBe('Acme Corporation Pvt. Ltd.');
    expect(result.PartyBName).toBe('TechSolutions India Ltd.');
    expect(result.Jurisdiction).toBe('Bangalore, Karnataka');
    expect(result.TermYears).toBe('5');
  });

  it('should generate marketing/social media values', () => {
    const result = generateSampleVariables([
      'PostHeadline',
      'CallToAction',
      'Hashtags',
    ]);
    expect(result.PostHeadline).toContain('Introducing');
    expect(result.CallToAction).toContain('Get Started Free');
    expect(result.Hashtags).toContain('#ProductLaunch');
  });

  it('should generate letterhead body', () => {
    const result = generateSampleVariables(['LetterBody']);
    expect(result.LetterBody).toContain('registered business entity');
  });

  it('should generate training-related values', () => {
    const result = generateSampleVariables(['Grade', 'TrainerName']);
    expect(result.Grade).toBe('A+');
    expect(result.TrainerName).toBe('John Mathews');
  });

  // ─── Additional Branch Coverage ───

  it('should generate hero image and image URL values', () => {
    const result = generateSampleVariables(['HeroImage', 'ImageUrl']);
    expect(result.HeroImage).toContain('data:image/');
    expect(result.ImageUrl).toContain('data:image/');
  });

  it('should generate logo for institution and clinic via includes() fallback', () => {
    const result = generateSampleVariables(['InstitutionLogo', 'ClinicLogo']);
    expect(result.InstitutionLogo).toContain('data:image/');
    expect(result.ClinicLogo).toContain('data:image/');
  });

  it('should generate employee location, HR name, CEO name, supervisor', () => {
    const result = generateSampleVariables(['Location', 'HRName', 'CEOName', 'Supervisor']);
    expect(result.Location).toBe('Bangalore');
    expect(result.HRName).toBe('Priya Singh');
    expect(result.CEOName).toBe('Arun Kumar');
    expect(result.Supervisor).toBe('Ravi Deshmukh');
  });

  it('should generate additional date fields', () => {
    const result = generateSampleVariables([
      'EffectiveDate',
      'AppointmentDate',
      'LastWorkingDay',
      'QuotationDate',
      'PayPeriod',
      'PayDate',
      'StartDate',
      'EndDate',
      'IssueDate',
      'PossessionDate',
      'HandoverDate',
    ]);
    expect(result.EffectiveDate).toBe('01 March 2024');
    expect(result.AppointmentDate).toBe('15 January 2024');
    expect(result.LastWorkingDay).toBe('14 January 2026');
    expect(result.QuotationDate).toBe('01 March 2024');
    expect(result.PayPeriod).toBe('February 2024');
    expect(result.PayDate).toBe('28 February 2024');
    expect(result.StartDate).toBe('01 January 2024');
    expect(result.EndDate).toBe('31 December 2024');
    expect(result.IssueDate).toBe('01 March 2024');
    expect(result.PossessionDate).toBe('15 June 2024');
    expect(result.HandoverDate).toBe('15 June 2024');
  });

  it('should generate additional financial fields', () => {
    const result = generateSampleVariables([
      'OldCTC', 'NewCTC', 'OldSalary', 'NewSalary',
      'Basic', 'DA', 'Conveyance', 'Medical', 'SpecialAllowance', 'GrossEarnings',
      'PF', 'ESI', 'ProfessionalTax', 'IncomeTax', 'TotalDeductions',
    ]);
    expect(result.OldCTC).toBe('9,00,000');
    expect(result.NewCTC).toBe('12,00,000');
    expect(result.Basic).toBe('30,000');
    expect(result.DA).toBe('5,000');
    expect(result.Conveyance).toBe('3,200');
    expect(result.GrossEarnings).toBe('75,000');
    expect(result.PF).toBe('3,600');
    expect(result.IncomeTax).toBe('5,000');
    expect(result.TotalDeductions).toBe('10,000');
  });

  it('should generate document numbers via includes()', () => {
    const result = generateSampleVariables([
      'WorkOrderNumber', 'ReportNumber', 'RequisitionNumber', 'CertificateNumber',
    ]);
    expect(result.WorkOrderNumber).toBe('WO-2024-0156');
    expect(result.ReportNumber).toBe('QC-2024-0234');
    expect(result.RequisitionNumber).toBe('MRN-2024-0078');
    expect(result.CertificateNumber).toBe('CERT-2024-0312');
  });

  it('should generate identification and bank fields', () => {
    const result = generateSampleVariables(['CIN', 'BankName', 'BankIFSC', 'UAN']);
    expect(result.CIN).toBe('U72200KA2024PTC123456');
    expect(result.BankName).toBe('State Bank of India');
    expect(result.BankIFSC).toBe('SBIN0001234');
    expect(result.UAN).toBe('101234567890');
  });

  it('should generate client contact fields', () => {
    const result = generateSampleVariables(['ClientEmail', 'ClientContact', 'ClientCompany', 'BuyerStateCode']);
    expect(result.ClientEmail).toBe('purchasing@techsolutions.in');
    expect(result.ClientContact).toBe('+91 98765 43210');
    expect(result.ClientCompany).toBe('TechSolutions India Ltd.');
    expect(result.BuyerStateCode).toBe('29');
  });

  it('should generate meeting-related values', () => {
    const result = generateSampleVariables([
      'MeetingTitle', 'MeetingDate', 'MeetingTime', 'MeetingLocation',
      'Chairperson', 'Attendees', 'Agenda', 'NextMeeting',
    ]);
    expect(result.MeetingTitle).toContain('Roadmap');
    expect(result.MeetingDate).toBe('15 January 2024');
    expect(result.MeetingTime).toBe('10:00 AM - 11:30 AM');
    expect(result.MeetingLocation).toBe('Conference Room A');
    expect(result.Chairperson).toBe('Arun Kumar (CEO)');
    expect(result.Attendees).toContain('Rahul');
    expect(result.Agenda).toContain('Q1 2024');
    expect(result.NextMeeting).toContain('February');
  });

  it('should generate proposal values', () => {
    const result = generateSampleVariables([
      'ProposalTitle', 'ScopeOfWork', 'ProjectTimeline', 'ProjectCost', 'PaymentTerms', 'DeliveryTerms', 'TeamMembers',
    ]);
    expect(result.ProposalTitle).toContain('Digital Transformation');
    expect(result.ScopeOfWork).toContain('Infrastructure assessment');
    expect(result.ProjectTimeline).toContain('Phase 1');
    expect(result.ProjectCost).toContain('25,00,000');
    expect(result.PaymentTerms).toContain('30% advance');
    expect(result.DeliveryTerms).toContain('25 weeks');
    expect(result.TeamMembers).toContain('Project Manager');
  });

  it('should generate brochure values', () => {
    const result = generateSampleVariables([
      'BrochureTitle', 'Feature1_Title', 'Feature2_Desc', 'PriceAmount', 'PricePeriod',
    ]);
    expect(result.BrochureTitle).toContain('Empower Your Business');
    expect(result.Feature1_Title).toBe('Smart Automation');
    expect(result.Feature2_Desc).toContain('dashboards');
    expect(result.PriceAmount).toBe('₹2,990');
    expect(result.PricePeriod).toBe('/year');
  });

  it('should generate working condition values', () => {
    const result = generateSampleVariables(['WorkingDays', 'WorkingHours', 'LeavePolicy', 'NoticePeriod']);
    expect(result.WorkingDays).toContain('Monday');
    expect(result.WorkingHours).toContain('9:00 AM');
    expect(result.LeavePolicy).toContain('18 casual leaves');
    expect(result.NoticePeriod).toBe('30 days');
  });

  it('should generate cover letter values', () => {
    const result = generateSampleVariables(['HiringManagerName', 'Position', 'JobSource', 'CoverBody']);
    expect(result.HiringManagerName).toBe('Ms. Ananya Gupta');
    expect(result.Position).toBe('Senior Software Engineer');
    expect(result.JobSource).toBe('LinkedIn');
    expect(result.CoverBody).toContain('strong interest');
  });

  it('should generate marketing post body and author', () => {
    const result = generateSampleVariables(['PostBody', 'AuthorName', 'PostDate', 'LinkUrl']);
    expect(result.PostBody).toContain('completely redesigned platform');
    expect(result.AuthorName).toBe('Rahul Sharma');
    expect(result.PostDate).toBe('15 January 2024');
    expect(result.LinkUrl).toContain('acmecorp.com');
  });

  it('should generate email campaign body fields', () => {
    const result = generateSampleVariables(['EmailBody', 'PromoHeadline', 'CtaText', 'UnsubscribeLink']);
    expect(result.EmailBody).toContain('exclusive opportunity');
    expect(result.PromoHeadline).toBe('Limited Time Offer!');
    expect(result.CtaText).toBe('Claim Your Discount');
    expect(result.UnsubscribeLink).toContain('acmecorp.com/unsubscribe');
  });

  it('should generate instructions value', () => {
    const result = generateSampleVariables(['Instructions']);
    expect(result.Instructions).toContain('1. Inspect all incoming materials');
  });

  it('should generate witness and supervisor values', () => {
    const result = generateSampleVariables(['WitnessName', 'SupervisorName']);
    expect(result.WitnessName).toBe('Rajesh Khanna');
    expect(result.SupervisorName).toBe('Ravi Deshmukh');
  });

  it('should generate total experience and skills acquired', () => {
    const result = generateSampleVariables(['TotalExperience', 'SkillsAcquired']);
    expect(result.TotalExperience).toBe('2 Years 0 Months');
    expect(result.SkillsAcquired).toContain('Full-stack');
  });

  it('should return text values for *designation keys (not hijacked by includes("sign"))', () => {
    const result = generateSampleVariables([
      'RecipientDesignation',
      'TrainerDesignation',
      'SupervisorDesignation',
      'PresenterDesignation',
    ]);
    expect(result.RecipientDesignation).toBe('Senior Software Engineer');
    expect(result.TrainerDesignation).toBe('Senior AWS Trainer');
    expect(result.SupervisorDesignation).toBe('Senior Project Manager');
    expect(result.PresenterDesignation).toBe('Chief Executive Officer');
  });

  it('should generate education institution address and principal name', () => {
    const result = generateSampleVariables(['InstitutionAddress', 'StudentRollNo', 'PrincipalName']);
    expect(result.InstitutionAddress).toContain('Ahmedabad');
    expect(result.StudentRollNo).toBe('2024-0078');
    expect(result.PrincipalName).toBe('Dr. Suresh Iyer');
  });

  it('should generate additional medical fields', () => {
    const result = generateSampleVariables(['DoctorQualification', 'ClinicName', 'PatientAge', 'Advice', 'SickDays', 'FromDate', 'RegistrationNo']);
    expect(result.DoctorQualification).toContain('MBBS');
    expect(result.ClinicName).toBe('City Care Medical Center');
    expect(result.PatientAge).toBe('35');
    expect(result.Advice).toContain('bed rest');
    expect(result.SickDays).toBe('3');
    expect(result.FromDate).toBe('01 March 2024');
    expect(result.RegistrationNo).toBe('KMC-56789');
  });

  it('should generate real estate additional fields', () => {
    const result = generateSampleVariables(['PropertyName', 'PropertySize', 'Configuration', 'OwnerName', 'TenantName']);
    expect(result.PropertyName).toBe('Green Valley Residency');
    expect(result.PropertySize).toContain('sq.ft');
    expect(result.Configuration).toContain('Bedrooms');
    expect(result.OwnerName).toBe('Green Valley Developers Pvt. Ltd., 789, Construction House, Bangalore - 560078');
    expect(result.TenantName).toBe('Rahul Sharma');
  });

  it('should generate NDA additional fields', () => {
    const result = generateSampleVariables(['PartyAAddress', 'NDASignaturePartyB']);
    expect(result.PartyAAddress).toContain('Business Park');
    expect(result.NDASignaturePartyB).toContain('data:image/');
  });

  it('should generate manufacturing additional fields', () => {
    const result = generateSampleVariables(['ProductCode', 'Unit', 'LotSize', 'SampleSize']);
    expect(result.ProductCode).toBe('BRG-2024-001');
    expect(result.Unit).toBe('Pieces');
    expect(result.LotSize).toBe('1,000');
    expect(result.SampleSize).toBe('50');
  });

  it('should return customer PO number (not company name) for CustomerPO', () => {
    const result = generateSampleVariables(['CustomerPO']);
    expect(result.CustomerPO).toBe('MPL-2024-0042');
  });

  it('should generate resume additional fields', () => {
    const result = generateSampleVariables(['FullName', 'Phone', 'LinkedIn', 'Portfolio', 'Education', 'Certifications', 'Languages', 'Achievements']);
    expect(result.FullName).toBe('Rahul Sharma');
    expect(result.Phone).toBe('+91 98765 43210');
    expect(result.LinkedIn).toContain('linkedin.com');
    expect(result.Portfolio).toContain('rahulsharma.dev');
    expect(result.Education).toContain('B.Tech');
    expect(result.Certifications).toContain('AWS');
    expect(result.Languages).toContain('English');
    expect(result.Achievements).toContain('Best Employee');
  });

  // ─── More Branch Coverage ───

  it('should generate total tax and IGST', () => {
    const result = generateSampleVariables(['TotalTax', 'IGST']);
    expect(result.TotalTax).toBe('18,000');
    expect(result.IGST).toBe('18,000');
  });

  it('should generate patient gender and to-date', () => {
    const result = generateSampleVariables(['PatientGender', 'ToDate']);
    expect(result.PatientGender).toBe('Male');
    expect(result.ToDate).toBe('03 March 2024');
  });

  it('should generate meeting discussion points and decisions', () => {
    const result = generateSampleVariables(['DiscussionPoints', 'Decisions']);
    expect(result.DiscussionPoints).toContain('Q4 revenue exceeded targets');
    expect(result.Decisions).toContain('Launch customer portal by March 2024');
  });

  it('should generate email promo description', () => {
    const result = generateSampleVariables(['PromoDescription']);
    expect(result.PromoDescription).toContain('Get 20% off on all annual premium plans');
  });

  it('should generate brochure pricing headline and subtitle', () => {
    const result = generateSampleVariables(['PricingHeadline', 'BrochureSubtitle']);
    expect(result.PricingHeadline).toBe('Simple, Transparent Pricing');
    expect(result.BrochureSubtitle).toContain('Transform your workflow');
  });

  it('should generate executive summary', () => {
    const result = generateSampleVariables(['ExecutiveSummary']);
    expect(result.ExecutiveSummary).toContain('digital transformation strategy');
  });

  it('should generate manufacturing inspection method', () => {
    const result = generateSampleVariables(['InspectionMethod']);
    expect(result.InspectionMethod).toContain('Visual Inspection');
    expect(result.InspectionMethod).toContain('Load Testing');
  });

  it('should generate award date and presenter name', () => {
    const result = generateSampleVariables(['AwardDate', 'PresenterName']);
    expect(result.AwardDate).toBe('15 January 2024');
    expect(result.PresenterName).toBe('Arun Kumar (CEO)');
  });

  // ─── Final Branch Coverage ───

  it('should generate salary percentage and tax fields', () => {
    const result = generateSampleVariables(['IncrementPercentage', 'TaxPercentage', 'TaxAmount', 'BasePrice']);
    expect(result.IncrementPercentage).toBe('33');
    expect(result.TaxPercentage).toBe('18');
    expect(result.TaxAmount).toBe('17,100');
    expect(result.BasePrice).toBe('75,00,000');
  });

  it('should generate total cost, booking amount, and registration charges via includes', () => {
    const result = generateSampleVariables(['TotalCost', 'BookingAmount', 'RegistrationCharges']);
    expect(result.TotalCost).toBe('82,50,000');
    expect(result.BookingAmount).toBe('5,00,000');
    expect(result.RegistrationCharges).toBe('1,50,000');
  });

  it('should generate email discount percentage, CTA link, and footer text', () => {
    const result = generateSampleVariables(['DiscountPercentage', 'Cta_Link', 'FooterText']);
    expect(result.DiscountPercentage).toBe('20');
    expect(result.Cta_Link).toBe('https://acmecorp.com/upgrade');
    expect(result.FooterText).toContain('unsubscribe');
  });

  it('should generate action items table', () => {
    const result = generateSampleVariables(['ActionItemsTable']);
    expect(result.ActionItemsTable).toContain('Finalize Q1 roadmap');
    expect(result.ActionItemsTable).toContain('Vikram Patel');
    expect(result.ActionItemsTable).toContain('Cloud migration proposal');
  });

  it('should generate remaining brochure fields', () => {
    const result = generateSampleVariables(['Feature3_Title', 'Feature3_Desc', 'Feature4_Title', 'Feature4_Desc', 'PriceDetails']);
    expect(result.Feature3_Title).toBe('Seamless Integration');
    expect(result.Feature3_Desc).toContain('100+ integrations');
    expect(result.Feature4_Title).toBe('Enterprise Security');
    expect(result.Feature4_Desc).toContain('SOC 2 compliance');
    expect(result.PriceDetails).toContain('priority support');
  });

  it('should generate real estate tenant contact and lease details', () => {
    const result = generateSampleVariables(['TenantAddress', 'TenantPhone', 'TenantEmail', 'MaintenanceCharges', 'LeaseDuration', 'LatePenalty']);
    expect(result.TenantAddress).toContain('Indiranagar');
    expect(result.TenantPhone).toBe('+91 98765 43210');
    expect(result.TenantEmail).toBe('rahul.sharma@email.com');
    expect(result.MaintenanceCharges).toBe('3,500');
    expect(result.LeaseDuration).toBe('11 months');
    expect(result.LatePenalty).toContain('2% per month');
  });

  it('should generate real estate utility, parking, pet, and special clauses', () => {
    const result = generateSampleVariables(['UtilityIncluded', 'ParkingDetails', 'PetPolicy', 'SpecialClauses']);
    expect(result.UtilityIncluded).toContain('Water');
    expect(result.ParkingDetails).toContain('covered car parking');
    expect(result.PetPolicy).toContain('Pets allowed');
    expect(result.SpecialClauses).toContain('sublet');
  });

  it('should generate manufacturing priority, requested by, and purpose', () => {
    const result = generateSampleVariables(['Priority', 'RequestedBy', 'Purpose']);
    expect(result.Priority).toBe('High');
    expect(result.RequestedBy).toBe('Production Manager - Suresh Kumar');
    expect(result.Purpose).toContain('Monthly production requirement');
  });

  it('should generate manufacturing parameters table', () => {
    const result = generateSampleVariables(['Parameters']);
    expect(result.Parameters).toContain('Diameter');
    expect(result.Parameters).toContain('HRC 60');
    expect(result.Parameters).toContain('Load Capacity');
  });

  it('should generate certificate achievement, training provider, duration, and topics', () => {
    const result = generateSampleVariables(['AchievementDescription', 'TrainingProvider', 'TrainingDuration', 'TopicsCovered']);
    expect(result.AchievementDescription).toContain('customer portal');
    expect(result.TrainingProvider).toBe('AWS Training & Certification');
    expect(result.TrainingDuration).toBe('5 Days (40 Hours)');
    expect(result.TopicsCovered).toContain('Microservices Design Patterns');
  });

  it('should generate clinic address and NDA party B address', () => {
    const result = generateSampleVariables(['ClinicAddress', 'PartyBAddress']);
    expect(result.ClinicAddress).toContain('Jubilee Hills');
    expect(result.PartyBAddress).toContain('Whitefield');
  });
});
