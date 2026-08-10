import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    template: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    templateVersion: {
      create: vi.fn(),
    },
  },
}));

vi.mock('./document-engine', () => ({
  DocumentEngine: {
    extractPlaceholders: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { TemplateEngine } from './template-engine';
import { prisma } from '@/lib/prisma';
import { DocumentEngine } from './document-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockTemplate = {
  id: 'tmpl-1',
  organizationId: 'org-1',
  userId: 'user-1',
  name: 'Test Template',
  slug: 'test-template',
  description: 'A test template',
  content: {},
  htmlTemplate: '<p>{{CompanyName}}</p>',
  variables: [],
  placeholders: ['CompanyName'],
  documentCategory: 'HR Documents',
  visibility: 'PUBLIC',
  isPremium: false,
  isActive: true,
  isDefault: false,
  usageCount: 0,
  version: 1,
  thumbnail: null,
  category: null,
  user: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockCreateInput = {
  name: 'New Template',
  description: 'Description',
  category: 'General',
  htmlTemplate: '<p>{{Name}}</p>',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    it('should create a template with auto-detected placeholders', async () => {
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['CompanyName', 'CompanyLogo']);
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      const result = await TemplateEngine.create(
        {
          name: 'New Template',
          description: 'A template',
          category: 'HR Documents',
          htmlTemplate: '<p>{{CompanyName}}</p><img src="{{CompanyLogo}}"/>',
        },
        'org-1',
        'user-1'
      );

      expect(DocumentEngine.extractPlaceholders).toHaveBeenCalledWith(
        '<p>{{CompanyName}}</p><img src="{{CompanyLogo}}"/>'
      );
      expect(prisma.template.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          name: 'New Template',
          slug: 'new-template',
          description: 'A template',
          documentCategory: 'HR Documents',
          visibility: 'PRIVATE',
          isPremium: false,
          version: 1,
          placeholders: ['CompanyName', 'CompanyLogo'],
          htmlTemplate: '<p>{{CompanyName}}</p><img src="{{CompanyLogo}}"/>',
        }),
      });
      expect(result).toEqual(mockTemplate);
    });

    it('should use user-defined variables when provided', async () => {
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['Name']);
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      const variables = [{ key: 'Name', label: 'Full Name', type: 'text' as const }];

      await TemplateEngine.create(
        { ...mockCreateInput, variables },
        'org-1',
        'user-1'
      );

      const createCall = (prisma.template.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.variables).toEqual(variables);
    });

    it('should merge detected placeholders with user-defined variables', async () => {
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['Name', 'Email', 'Phone']);
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      const variables = [{ key: 'Name', label: 'Full Name', type: 'text' as const }];

      await TemplateEngine.create(
        { ...mockCreateInput, variables },
        'org-1',
        'user-1'
      );

      const createCall = (prisma.template.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const savedVars = createCall.data.variables;
      expect(savedVars).toHaveLength(3);
      expect(savedVars[0].key).toBe('Name'); // user-defined first
      expect(savedVars.some((v: { key: string }) => v.key === 'Email')).toBe(true); // auto-added
      expect(savedVars.some((v: { key: string }) => v.key === 'Phone')).toBe(true); // auto-added
    });

    it('should use default visibility PRIVATE and isPremium false', async () => {
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      await TemplateEngine.create(
        { name: 'Minimal', category: 'General' },
        'org-1',
        null
      );

      const createCall = (prisma.template.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.visibility).toBe('PRIVATE');
      expect(createCall.data.isPremium).toBe(false);
    });

    it('should generate slug from name', async () => {
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      await TemplateEngine.create(
        { name: 'My Cool Template! With #Special Chars', category: 'General' },
        'org-1',
        'user-1'
      );

      const createCall = (prisma.template.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.slug).toBe('my-cool-template-with-special-chars');
    });

    it('should not call extractPlaceholders when htmlTemplate is not provided', async () => {
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      await TemplateEngine.create(
        { name: 'No Html', category: 'General' },
        'org-1',
        'user-1'
      );

      expect(DocumentEngine.extractPlaceholders).not.toHaveBeenCalled();
      const createCall = (prisma.template.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.placeholders).toEqual([]);
      expect(createCall.data.variables).toEqual([]);
      expect(createCall.data.htmlTemplate).toBeUndefined();
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update an existing template', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);
      (prisma.template.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockTemplate, version: 2 });
      (prisma.templateVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await TemplateEngine.update(
        'tmpl-1',
        { name: 'Updated Name', description: 'Updated desc' },
        'org-1'
      );

      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', organizationId: 'org-1' },
      });
      expect(result.version).toBe(2);
      expect(prisma.templateVersion.create).toHaveBeenCalled();
    });

    it('should throw when template is not found', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        TemplateEngine.update('non-existent', { name: 'New' }, 'org-1')
      ).rejects.toThrow('Template not found');
    });

    it('should re-detect placeholders when htmlTemplate changes', async () => {
      const existing = {
        ...mockTemplate,
        htmlTemplate: '<p>Old</p>',
        placeholders: ['Old'],
        variables: [{ key: 'Old', label: 'Old', type: 'text' as const }],
      };
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['NewPlaceholder']);
      (prisma.template.update as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (prisma.templateVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await TemplateEngine.update(
        'tmpl-1',
        { htmlTemplate: '<p>{{NewPlaceholder}}</p>' },
        'org-1'
      );

      expect(DocumentEngine.extractPlaceholders).toHaveBeenCalledWith('<p>{{NewPlaceholder}}</p>');
    });

    it('should merge detected placeholders with variables when htmlTemplate changes and user variables exist', async () => {
      const existing = {
        ...mockTemplate,
        htmlTemplate: '<p>Old</p>',
        placeholders: ['Old'],
        variables: [{ key: 'Name', label: 'Name', type: 'text' as const }],
      };
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['Name', 'Email']);
      (prisma.template.update as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (prisma.templateVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await TemplateEngine.update(
        'tmpl-1',
        {
          htmlTemplate: '<p>{{Name}} {{Email}}</p>',
          variables: [{ key: 'Name', label: 'Full Name', type: 'text' as const }],
        },
        'org-1'
      );

      const updateCall = (prisma.template.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const savedVars = JSON.parse(JSON.stringify(updateCall.data.variables));
      expect(savedVars).toHaveLength(2);
      expect(savedVars[0].key).toBe('Name');
      expect(savedVars[1].key).toBe('Email');
    });

    it('should auto-generate variables from detected placeholders when no user variables provided', async () => {
      const existing = {
        ...mockTemplate,
        htmlTemplate: '<p>Old</p>',
        placeholders: ['Old'],
        variables: [],
      };
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['Name', 'Email']);
      (prisma.template.update as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (prisma.templateVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await TemplateEngine.update(
        'tmpl-1',
        { htmlTemplate: '<p>{{Name}} {{Email}}</p>' },
        'org-1'
      );

      expect(DocumentEngine.extractPlaceholders).toHaveBeenCalledWith('<p>{{Name}} {{Email}}</p>');
      const updateCall = (prisma.template.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data.variables).toHaveLength(2);
      expect(updateCall.data.variables[0].key).toBe('Name');
      expect(updateCall.data.variables[0].label).toBe('Name');
      expect(updateCall.data.variables[1].key).toBe('Email');
      expect(updateCall.data.placeholders).toEqual(['Name', 'Email']);
    });

    it('should map category to documentCategory in update data', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);
      (prisma.template.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);
      (prisma.templateVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await TemplateEngine.update(
        'tmpl-1',
        { category: 'Finance' },
        'org-1'
      );

      const updateCall = (prisma.template.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data.documentCategory).toBe('Finance');
    });
  });

  // ─── getById ─────────────────────────────────────────────

  describe('getById', () => {
    it('should return template when found with tenant ID', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      const result = await TemplateEngine.getById('tmpl-1', 'org-1');

      expect(result).toEqual(mockTemplate);
      const where = (prisma.template.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(where.id).toBe('tmpl-1');
      expect(where.OR).toBeDefined();
      expect(where.OR).toContainEqual({ organizationId: 'org-1' });
      expect(where.OR).toContainEqual({ visibility: 'PUBLIC' });
      expect(where.OR).toContainEqual({ visibility: 'PREMIUM' });
    });

    it('should return template when found without tenant ID', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      const result = await TemplateEngine.getById('tmpl-1');

      expect(result).toEqual(mockTemplate);
      const where = (prisma.template.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(where.id).toBe('tmpl-1');
      expect(where.OR).toBeUndefined();
    });

    it('should return null when template is not found', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await TemplateEngine.getById('non-existent', 'org-1');

      expect(result).toBeNull();
    });
  });

  // ─── list ────────────────────────────────────────────────

  describe('list', () => {
    const mockTemplates = [
      { ...mockTemplate, id: 't1', name: 'Template A' },
      { ...mockTemplate, id: 't2', name: 'Template B' },
    ];

    it('should return all active templates with pagination', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      const result = await TemplateEngine.list({});

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by documentCategory', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      await TemplateEngine.list({ documentCategory: 'HR Documents' });

      const where = (prisma.template.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      const clauses = where.AND || [where];
      expect(clauses.some((c: Record<string, unknown>) => c.documentCategory === 'HR Documents')).toBe(true);
    });

    it('should filter by search term', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      await TemplateEngine.list({ search: 'offer' });

      const where = (prisma.template.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      // The search creates an OR clause within conditions
      expect(where).toBeDefined();
    });

    it('should apply tenant access OR clause when tenantId is provided', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      await TemplateEngine.list({ tenantId: 'org-1' });

      const where = (prisma.template.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      // When tenantId is present, it pushes a visibility OR clause
      expect(where.AND || where).toBeDefined();
    });

    it('should filter by slug', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockTemplates[0]]);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await TemplateEngine.list({ slug: 'test-template' });

      const where = (prisma.template.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      const clauses = where.AND || [where];
      expect(clauses.some((c: Record<string, unknown>) => c.slug === 'test-template')).toBe(true);
    });

    it('should paginate correctly', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);

      await TemplateEngine.list({ page: 3, pageSize: 5 });

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it('should sort by the specified field', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      await TemplateEngine.list({ sortBy: 'name', sortOrder: 'asc' });

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } })
      );
    });

    it('should include category and user relations', async () => {
      (prisma.template.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplates);
      (prisma.template.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      await TemplateEngine.list({});

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            category: { select: { name: true, icon: true } },
            user: { select: { name: true, image: true } },
          },
        })
      );
    });
  });

  // ─── delete ──────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a template', async () => {
      (prisma.template.delete as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      await TemplateEngine.delete('tmpl-1', 'org-1');

      expect(prisma.template.delete).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', organizationId: 'org-1' },
      });
    });
  });

  // ─── duplicate ───────────────────────────────────────────

  describe('duplicate', () => {
    it('should duplicate an existing template with "(Copy)" suffix', async () => {
      const original = {
        ...mockTemplate,
        name: 'Original Template',
        htmlTemplate: '<p>Content</p>',
        placeholders: ['Name'],
        documentCategory: 'General',
      };
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(original);
      (DocumentEngine.extractPlaceholders as ReturnType<typeof vi.fn>).mockReturnValue(['Name']);
      (prisma.template.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      await TemplateEngine.duplicate('tmpl-1', 'org-1', 'user-2');

      expect(prisma.template.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Original Template (Copy)',
          organizationId: 'org-1',
          userId: 'user-2',
          isPremium: false,
        }),
      });
    });

    it('should throw when original template is not found', async () => {
      (prisma.template.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        TemplateEngine.duplicate('non-existent', 'org-1', 'user-1')
      ).rejects.toThrow('Template not found');
    });
  });

  // ─── trackUsage ──────────────────────────────────────────

  describe('trackUsage', () => {
    it('should increment usage count', async () => {
      (prisma.template.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockTemplate);

      await TemplateEngine.trackUsage('tmpl-1');

      expect(prisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tmpl-1' },
        data: { usageCount: { increment: 1 } },
      });
    });
  });

  // ─── placeholderToLabel ──────────────────────────────────

  describe('placeholderToLabel', () => {
    it('should convert camelCase to Title Case', () => {
      expect(TemplateEngine.placeholderToLabel('companyName')).toBe('Company Name');
      expect(TemplateEngine.placeholderToLabel('EmployeeSalary')).toBe('Employee Salary');
      expect(TemplateEngine.placeholderToLabel('CEO')).toBe('C E O');
      expect(TemplateEngine.placeholderToLabel('simple')).toBe('Simple');
    });
  });

  // ─── inferVariableType ───────────────────────────────────

  describe('inferVariableType', () => {
    it('should return "date" for date-related keys', () => {
      expect(TemplateEngine.inferVariableType('JoiningDate')).toBe('date');
      expect(TemplateEngine.inferVariableType('EffectiveDate')).toBe('date');
      expect(TemplateEngine.inferVariableType('DateOfBirth')).toBe('date');
      expect(TemplateEngine.inferVariableType('CreatedAt')).toBe('date');
    });

    it('should return "email" for email keys', () => {
      expect(TemplateEngine.inferVariableType('Email')).toBe('email');
      expect(TemplateEngine.inferVariableType('CompanyEmail')).toBe('email');
    });

    it('should return "number" for numeric keys', () => {
      expect(TemplateEngine.inferVariableType('Salary')).toBe('number');
      expect(TemplateEngine.inferVariableType('Amount')).toBe('number');
      expect(TemplateEngine.inferVariableType('TotalPrice')).toBe('number');
    });

    it('should return "image" for image keys', () => {
      expect(TemplateEngine.inferVariableType('Photo')).toBe('image');
      expect(TemplateEngine.inferVariableType('Logo')).toBe('image');
      expect(TemplateEngine.inferVariableType('CompanySeal')).toBe('image');
    });

    it('should return "signature" for signature keys', () => {
      expect(TemplateEngine.inferVariableType('Signature')).toBe('signature');
      expect(TemplateEngine.inferVariableType('AuthorizedSign')).toBe('signature');
    });

    it('should return "textarea" for long-text keys', () => {
      expect(TemplateEngine.inferVariableType('Address')).toBe('textarea');
      expect(TemplateEngine.inferVariableType('Description')).toBe('textarea');
      expect(TemplateEngine.inferVariableType('TermsConditions')).toBe('textarea');
    });

    it('should return "select" for selection keys', () => {
      expect(TemplateEngine.inferVariableType('Gender')).toBe('select');
      expect(TemplateEngine.inferVariableType('DocumentType')).toBe('select');
      expect(TemplateEngine.inferVariableType('Status')).toBe('select');
      expect(TemplateEngine.inferVariableType('Department')).toBe('select');
    });

    it('should return "text" for unknown keys', () => {
      expect(TemplateEngine.inferVariableType('Name')).toBe('text');
      expect(TemplateEngine.inferVariableType('PAN')).toBe('text');
      expect(TemplateEngine.inferVariableType('CustomField')).toBe('text');
    });
  });

  // ─── isRequiredPlaceholder ───────────────────────────────

  describe('isRequiredPlaceholder', () => {
    it('should return false for keys containing optional keywords', () => {
      expect(TemplateEngine.isRequiredPlaceholder('EmployeePhoto')).toBe(false);
      expect(TemplateEngine.isRequiredPlaceholder('HeroImage')).toBe(false);
      expect(TemplateEngine.isRequiredPlaceholder('CompanySeal')).toBe(false);
      expect(TemplateEngine.isRequiredPlaceholder('Watermark')).toBe(false);
    });

    it('should return true for keys without optional keywords', () => {
      expect(TemplateEngine.isRequiredPlaceholder('EmployeeName')).toBe(true);
      expect(TemplateEngine.isRequiredPlaceholder('Salary')).toBe(true);
      expect(TemplateEngine.isRequiredPlaceholder('CompanyName')).toBe(true);
      expect(TemplateEngine.isRequiredPlaceholder('CompanyLogo')).toBe(true);
    });

    it('should be case-insensitive with optional keywords', () => {
      expect(TemplateEngine.isRequiredPlaceholder('EMPLOYEEPHOTO')).toBe(false);
      expect(TemplateEngine.isRequiredPlaceholder('COMPANYSEAL')).toBe(false);
    });
  });

  // ─── getCategories ───────────────────────────────────────

  describe('getCategories', () => {
    it('should return grouped categories with counts', async () => {
      (prisma.template.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
        { documentCategory: 'HR Documents', _count: 5 },
        { documentCategory: 'Finance', _count: 3 },
      ]);

      const result = await TemplateEngine.getCategories();

      expect(result).toEqual([
        { name: 'HR Documents', count: 5 },
        { name: 'Finance', count: 3 },
      ]);
      expect(prisma.template.groupBy).toHaveBeenCalledWith({
        by: ['documentCategory'],
        _count: true,
        where: { isActive: true },
      });
    });

    it('should return empty array when no categories exist', async () => {
      (prisma.template.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await TemplateEngine.getCategories();

      expect(result).toEqual([]);
    });
  });
});
