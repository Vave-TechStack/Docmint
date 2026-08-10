import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/engine/template-engine', () => ({
  TemplateEngine: { getById: vi.fn() },
}));

import { TemplateEngine } from '@/lib/engine/template-engine';
import {
  inferType,
  querySampleTemplates,
  findSampleById,
  generatePlaceholderHtml,
  getSampleHtmlContent,
  sampleToTemplateData,
  resolveTemplateWithFallback,
  sampleTemplates,
  type SampleTemplate,
} from './sample-templates';

// ─── inferType ────────────────────────────────────────────

describe('inferType', () => {
  it('should return "date" for keys containing "date" or "joining"', () => {
    expect(inferType('JoiningDate')).toBe('date');
    expect(inferType('CurrentDate')).toBe('date');
    expect(inferType('EffectiveDate')).toBe('date');
    expect(inferType('LeaseStartDate')).toBe('date');
  });

  it('should return "email" for keys containing "email"', () => {
    expect(inferType('Email')).toBe('email');
    expect(inferType('CompanyEmail')).toBe('email');
    expect(inferType('ClientEmail')).toBe('email');
  });

  it('should return "number" for keys containing salary, amount, total, etc.', () => {
    expect(inferType('Salary')).toBe('number');
    expect(inferType('RentAmount')).toBe('number');
    expect(inferType('GrandTotal')).toBe('number');
    expect(inferType('CTC')).toBe('number');
    expect(inferType('PriceAmount')).toBe('number');
    expect(inferType('TotalCost')).toBe('number');
  });

  it('should return "textarea" for keys containing address, description, note, or terms', () => {
    expect(inferType('CompanyAddress')).toBe('textarea');
    expect(inferType('Description')).toBe('textarea');
    expect(inferType('TermsConditions')).toBe('textarea');
    expect(inferType('AdditionalNotes')).toBe('textarea');
    // 'LetterBody' contains 'body' which doesn't match any textarea keyword
    expect(inferType('LetterBody')).toBe('text');
  });

  it('should return "image" for keys containing photo, logo, image, or seal', () => {
    expect(inferType('EmployeePhoto')).toBe('image');
    expect(inferType('CompanyLogo')).toBe('image');
    expect(inferType('HeroImage')).toBe('image');
    expect(inferType('CompanySeal')).toBe('image');
  });

  it('should return "signature" for keys containing signature or a standalone sign word', () => {
    expect(inferType('AuthorizedSignature')).toBe('signature');
    expect(inferType('HRSignature')).toBe('signature');
    // A standalone "Sign" word (AuthorizedSign, DigitalSign) is a signature field
    expect(inferType('AuthorizedSign')).toBe('signature');
    expect(inferType('DigitalSign')).toBe('signature');
    // Keys with 'designation' contain 'sign' as a SUBSTRING only — they are text
    expect(inferType('RecipientDesignation')).toBe('text');
    expect(inferType('TrainerDesignation')).toBe('text');
    expect(inferType('SupervisorDesignation')).toBe('text');
    expect(inferType('PresenterDesignation')).toBe('text');
  });

  it('should return "select" for keys containing gender, type, status, or department', () => {
    expect(inferType('Gender')).toBe('select');
    expect(inferType('DocumentType')).toBe('select');
    expect(inferType('Status')).toBe('select');
    expect(inferType('Department')).toBe('select');
  });

  it('should return "text" for unknown keys', () => {
    expect(inferType('EmployeeName')).toBe('text');
    expect(inferType('CompanyName')).toBe('text');
    expect(inferType('PAN')).toBe('text');
    expect(inferType('Manager')).toBe('text');
  });

  it('should be case-insensitive', () => {
    expect(inferType('COMPANYLOGO')).toBe('image');
    expect(inferType('AUTHORIZEDSIGNATURE')).toBe('signature');
  });
});

// ─── sampleTemplates ──────────────────────────────────────

describe('sampleTemplates', () => {
  it('should have the correct number of sample templates', () => {
    // 6 HR + 2 Payroll + 2 Finance + 1 Legal + 2 Business
    // + 3 Marketing + 2 Resume + 1 Education + 1 Medical
    // + 3 Manufacturing + 3 Real Estate + 3 Certificates + 1 General
    expect(sampleTemplates.length).toBe(30);
  });

  it('should have unique IDs', () => {
    const ids = sampleTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have unique slugs', () => {
    const slugs = sampleTemplates.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('should have all required fields', () => {
    for (const t of sampleTemplates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.slug).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.documentCategory).toBeTruthy();
      expect(t.visibility).toBe('PUBLIC');
      expect(typeof t.isPremium).toBe('boolean');
      expect(typeof t.usageCount).toBe('number');
      expect(t.version).toBe(1);
      expect(t.createdAt).toBeTruthy();
      expect(t.updatedAt).toBeTruthy();
      expect(Array.isArray(t.placeholders)).toBe(true);
      expect(typeof t.variableCount).toBe('number');
      expect(t.variableCount).toBe(t.placeholders.length);
    }
  });

  it('should have templates across multiple categories', () => {
    const categories = new Set(sampleTemplates.map((t) => t.documentCategory));
    expect(categories.size).toBeGreaterThanOrEqual(10);
    expect(categories.has('HR Documents')).toBe(true);
    expect(categories.has('Finance')).toBe(true);
    expect(categories.has('Certificates')).toBe(true);
    expect(categories.has('General')).toBe(true);
  });

  it('should have variable counts proportional to placeholder array', () => {
    for (const t of sampleTemplates) {
      expect(t.variableCount).toBe(t.placeholders.length);
    }
  });
});

// ─── querySampleTemplates ─────────────────────────────────

describe('querySampleTemplates', () => {
  it('should return all templates with no filters', () => {
    const result = querySampleTemplates({ pageSize: 50 });
    expect(result.data.length).toBe(sampleTemplates.length);
    expect(result.total).toBe(sampleTemplates.length);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it('should filter by slug', () => {
    const result = querySampleTemplates({ slug: 'professional-offer-letter' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('Professional Offer Letter');
    expect(result.total).toBe(1);
  });

  it('should return empty for non-existent slug', () => {
    const result = querySampleTemplates({ slug: 'non-existent-slug' });
    expect(result.data.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should filter by document category', () => {
    const result = querySampleTemplates({ documentCategory: 'HR Documents' });
    expect(result.data.length).toBe(6);
    expect(result.total).toBe(6);
    for (const t of result.data) {
      expect(t.documentCategory).toBe('HR Documents');
    }
  });

  it('should filter by visibility', () => {
    const result = querySampleTemplates({ visibility: 'PUBLIC', pageSize: 50 });
    expect(result.data.length).toBe(sampleTemplates.length);
  });

  it('should filter by isPremium', () => {
    const all = querySampleTemplates({ pageSize: 50 });
    const premium = all.data.filter((t) => t.isPremium);
    const instant = querySampleTemplates({ isPremium: false, pageSize: 50 });
    expect(premium.length).toBeGreaterThan(0);
    expect(instant.data.length).toBe(all.data.length - premium.length);
    for (const t of instant.data) expect(t.isPremium).toBe(false);
  });

  it('should mark the expected premium set', () => {
    const premium = querySampleTemplates({ isPremium: true, pageSize: 50 });
    const names = premium.data.map((t) => t.name).sort();
    expect(names).toEqual([
      'Achievement / Award Certificate',
      'Business Proposal',
      'GST Invoice',
      'Internship Certificate',
      'Medical Certificate',
      'Monthly Payslip',
      'Non-Disclosure Agreement (NDA)',
      'Property Quotation',
    ]);
  });

  it('should filter by search term (name)', () => {
    const result = querySampleTemplates({ search: 'resume' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    for (const t of result.data) {
      const matchesName = t.name.toLowerCase().includes('resume');
      const matchesDesc = t.description.toLowerCase().includes('resume');
      expect(matchesName || matchesDesc).toBe(true);
    }
  });

  it('should filter by search term (description)', () => {
    const result = querySampleTemplates({ search: 'offer' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should sort by usageCount descending by default', () => {
    const result = querySampleTemplates({});
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1].usageCount).toBeGreaterThanOrEqual(result.data[i].usageCount);
    }
  });

  it('should sort by name ascending', () => {
    const result = querySampleTemplates({ sortBy: 'name', sortOrder: 'asc' });
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1].name.localeCompare(result.data[i].name)).toBeLessThanOrEqual(0);
    }
  });

  it('should sort by name descending', () => {
    const result = querySampleTemplates({ sortBy: 'name', sortOrder: 'desc' });
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1].name.localeCompare(result.data[i].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should paginate results', () => {
    const page1 = querySampleTemplates({ page: 1, pageSize: 5 });
    expect(page1.data.length).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(Math.ceil(sampleTemplates.length / 5));

    const page2 = querySampleTemplates({ page: 2, pageSize: 5 });
    expect(page2.data.length).toBe(5);
    expect(page2.page).toBe(2);

    // Ensure pages don't overlap
    const page1Ids = new Set(page1.data.map((t) => t.id));
    const page2Ids = new Set(page2.data.map((t) => t.id));
    for (const id of page1Ids) {
      expect(page2Ids.has(id)).toBe(false);
    }
  });

  it('should handle the last page correctly', () => {
    const pageSize = 10;
    const totalPages = Math.ceil(sampleTemplates.length / pageSize);
    const lastPage = querySampleTemplates({ page: totalPages, pageSize });
    expect(lastPage.data.length).toBeGreaterThan(0);
    expect(lastPage.data.length).toBeLessThanOrEqual(pageSize);
  });

  it('should return empty data for a page beyond the total', () => {
    const totalPages = Math.ceil(sampleTemplates.length / 10);
    const result = querySampleTemplates({ page: totalPages + 1, pageSize: 10 });
    expect(result.data.length).toBe(0);
  });

  it('should apply multiple filters together', () => {
    const result = querySampleTemplates({
      documentCategory: 'Real Estate',
      search: 'agreement',
    });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    for (const t of result.data) {
      expect(t.documentCategory).toBe('Real Estate');
    }
  });
});

// ─── findSampleById ───────────────────────────────────────

describe('findSampleById', () => {
  it('should find a template by its ID', () => {
    const template = findSampleById('sample-001');
    expect(template).toBeDefined();
    expect(template?.name).toBe('Professional Offer Letter');
    expect(template?.id).toBe('sample-001');
  });

  it('should return undefined for non-existent ID', () => {
    const template = findSampleById('non-existent');
    expect(template).toBeUndefined();
  });

  it('should find the last template', () => {
    const lastId = `sample-${String(sampleTemplates.length).padStart(3, '0')}`;
    const template = findSampleById(lastId);
    expect(template).toBeDefined();
    expect(template?.name).toBe('Employee Payslip');
  });
});

// ─── generatePlaceholderHtml ──────────────────────────────

describe('generatePlaceholderHtml', () => {
  it('should generate HTML that contains the template name', () => {
    const html = generatePlaceholderHtml(['CompanyName'], 'My Template');
    expect(html).toContain('My Template');
  });

  it('should escape HTML in the template name', () => {
    const html = generatePlaceholderHtml([], '<script>alert("xss")</script>');
    expect(html).toContain('&lt;');
    expect(html).not.toContain('<script>');
  });

  it('should include company info section when company keys are present', () => {
    const html = generatePlaceholderHtml(['CompanyName', 'CompanyAddress'], 'Test');
    expect(html).toContain('Company Information');
    expect(html).toContain('{{CompanyName}}');
    expect(html).toContain('{{CompanyAddress}}');
  });

  it('should not include company info section when no company keys are present', () => {
    const html = generatePlaceholderHtml(['EmployeeName', 'Salary'], 'Test');
    expect(html).not.toContain('Company Information');
  });

  it('should include document details section for non-company keys', () => {
    const html = generatePlaceholderHtml(['EmployeeName', 'Salary'], 'Test');
    expect(html).toContain('Document Details');
    expect(html).toContain('{{EmployeeName}}');
    expect(html).toContain('{{Salary}}');
  });

  it('should include CurrentDate in footer when placeholder contains CurrentDate', () => {
    const html = generatePlaceholderHtml(['CurrentDate'], 'Test');
    expect(html).toContain('{{CurrentDate}}');
  });

  it('should not include CurrentDate in footer when placeholder does not contain it', () => {
    const html = generatePlaceholderHtml(['EmployeeName'], 'Test');
    expect(html).not.toContain('{{CurrentDate}}');
  });

  it('should render image placeholders as img tags', () => {
    const html = generatePlaceholderHtml(['CompanyLogo'], 'Test');
    expect(html).toContain('<img');
    expect(html).toContain('{{CompanyLogo}}');
  });

  it('should treat GST, PAN, CIN, MSME as company keys', () => {
    const html = generatePlaceholderHtml(['GST', 'PAN', 'CIN', 'MSME'], 'Test');
    expect(html).toContain('Company Information');
  });

  it('should generate a valid HTML structure', () => {
    const html = generatePlaceholderHtml(
      ['CompanyName', 'CompanyLogo', 'EmployeeName', 'Salary', 'CurrentDate'],
      'Test Document'
    );
    expect(html).toContain('<div');
    expect(html).toContain('</div>');
    expect(html).toContain('>Test Document<');
    expect(html).toContain('Company Information');
    expect(html).toContain('Document Details');
    expect(html).toContain('This document was generated using the');
  });
});

// ─── sampleToTemplateData ─────────────────────────────────

describe('sampleToTemplateData', () => {
  it('should build a full TemplateData with generated HTML and typed variables', () => {
    const sample: SampleTemplate = {
      id: 'sample-001',
      name: 'Offer Letter',
      slug: 'offer-letter',
      description: 'Test',
      documentCategory: 'HR Documents',
      visibility: 'PUBLIC',
      isPremium: false,
      usageCount: 10,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: 'thumb-data-uri',
      placeholders: ['CompanyName', 'EmployeePhoto', 'JoiningDate', 'Salary'],
      variableCount: 4,
      category: { name: 'HR Documents', icon: 'Users' },
      user: null,
    };

    const data = sampleToTemplateData(sample);

    expect(data.id).toBe('sample-001');
    expect(data.thumbnail).toBe('thumb-data-uri');
    expect(data.isDefault).toBe(true);
    expect(data.content).toEqual({});
    expect(data.htmlTemplate).toContain('Offer Letter');
    expect(data.variables).toHaveLength(4);
    expect(data.variables.map((v) => v.type)).toEqual(['text', 'image', 'date', 'number']);
    // Optional image placeholder is not required
    const photo = data.variables.find((v) => v.key === 'EmployeePhoto');
    expect(photo?.required).toBe(false);
    const name = data.variables.find((v) => v.key === 'CompanyName');
    expect(name?.required).toBe(true);
  });

  it('should carry the generated thumbnail from every sample template', () => {
    expect(sampleTemplates.length).toBeGreaterThan(0);
    for (const t of sampleTemplates) {
      expect(t.thumbnail).toMatch(/^data:image\/svg\+xml;base64,/);
    }
  });
});

// ─── resolveTemplateWithFallback ──────────────────────────

describe('resolveTemplateWithFallback', () => {
  const getByIdMock = TemplateEngine.getById as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getByIdMock.mockReset();
  });

  it('should return the DB template when found', async () => {
    getByIdMock.mockResolvedValue({ id: 'db-1', htmlTemplate: '<p>Hi</p>' });
    const result = await resolveTemplateWithFallback('db-1');
    expect(result?.id).toBe('db-1');
    expect(getByIdMock).toHaveBeenCalledWith('db-1', undefined);
  });

  it('should fall back to the sample template when the DB has no row', async () => {
    getByIdMock.mockResolvedValue(null);
    const result = await resolveTemplateWithFallback('sample-001');
    expect(result?.id).toBe('sample-001');
    expect(result?.htmlTemplate).toContain('Offer Letter');
    expect(result?.thumbnail).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('should fall back to the sample template when the DB errors', async () => {
    getByIdMock.mockRejectedValue(new Error('db down'));
    const result = await resolveTemplateWithFallback('sample-001');
    expect(result?.id).toBe('sample-001');
    expect(result?.htmlTemplate).toContain('Offer Letter');
  });

  it('should return null when neither DB nor samples have the id', async () => {
    getByIdMock.mockResolvedValue(null);
    const result = await resolveTemplateWithFallback('does-not-exist');
    expect(result).toBeNull();
  });
});

// ─── getSampleHtmlContent ─────────────────────────────────

describe('getSampleHtmlContent', () => {
  it('should generate HTML content for a template with placeholders', () => {
    const template: SampleTemplate = {
      id: 'test-001',
      name: 'Test Template',
      slug: 'test-template',
      description: 'A test template',
      documentCategory: 'General',
      visibility: 'PUBLIC',
      isPremium: false,
      usageCount: 0,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: 'test-thumbnail',
      placeholders: ['CompanyName', 'EmployeeName'],
      variableCount: 2,
      category: { name: 'General', icon: 'File' },
      user: null,
    };
    const html = getSampleHtmlContent(template);
    expect(html).toContain('Test Template');
    expect(html).toContain('{{CompanyName}}');
    expect(html).toContain('{{EmployeeName}}');
  });

  it('should return empty string for template with no placeholders', () => {
    const template: SampleTemplate = {
      id: 'test-002',
      name: 'Empty Template',
      slug: 'empty-template',
      description: 'No placeholders',
      documentCategory: 'General',
      visibility: 'PUBLIC',
      isPremium: false,
      usageCount: 0,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: 'test-thumbnail',
      placeholders: [],
      variableCount: 0,
      category: { name: 'General', icon: 'File' },
      user: null,
    };
    const html = getSampleHtmlContent(template);
    expect(html).toBe('');
  });
});

// ─── Edge Cases ────────────────────────────────────────────

describe('querySampleTemplates edge cases', () => {
  it('should handle empty search string like no filter', () => {
    const all = querySampleTemplates({});
    const searched = querySampleTemplates({ search: '' });
    expect(searched.data.length).toBe(all.data.length);
  });

  it('should handle combined category + premium filter', () => {
    // Marketing templates are non-premium instant, so filtering should work
    const result = querySampleTemplates({
      documentCategory: 'Marketing',
      isPremium: false,
    });
    expect(result.data.length).toBe(3);
    for (const t of result.data) {
      expect(t.documentCategory).toBe('Marketing');
      expect(t.isPremium).toBe(false);
    }
  });

  it('should handle slug with special characters in the name', () => {
    const result = querySampleTemplates({ slug: 'non-disclosure-agreement-nda' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('Non-Disclosure Agreement (NDA)');
  });

  it('should sort correctly by createdAt', () => {
    const asc = querySampleTemplates({ sortBy: 'createdAt', sortOrder: 'asc', pageSize: 50 });
    const desc = querySampleTemplates({ sortBy: 'createdAt', sortOrder: 'desc', pageSize: 50 });
    expect(asc.data[0].id).toBe('sample-001');
    const lastId = `sample-${String(sampleTemplates.length).padStart(3, '0')}`;
    expect(desc.data[0].id).toBe(lastId);
  });
});
