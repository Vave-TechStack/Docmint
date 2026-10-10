import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { toJson } from '@/lib/utils/prisma-json';
import { inferImageSubtype } from '@/lib/utils/image-upload';
import { hasActivePremiumSubscription } from '@/lib/subscription';
import type { TemplateData, TemplateVariable, TemplateVisibility } from '@/types';
import { DocumentEngine } from './document-engine';

/**
 * Explicit allowlists for the user-controlled list parameters. `sortBy` in
 * particular must never be interpolated into an `orderBy` object without
 * validation, since it becomes a column name.
 */
const TEMPLATE_VISIBILITIES = [
  'PUBLIC',
  'PRIVATE',
  'ORGANIZATION',
  'PREMIUM',
  'AI',
] as const;

const TEMPLATE_SORT_FIELDS = [
  'name',
  'createdAt',
  'updatedAt',
  'usageCount',
  'isPremium',
  'documentCategory',
] as const;

/**
 * DocMint Template Engine
 * Manages templates, variable detection, and template import/export.
 */
export class TemplateEngine {
  static async create(
    input: {
      name: string;
      description?: string;
      content?: Record<string, unknown>;
      htmlTemplate?: string;
      variables?: TemplateVariable[];
      category: string;
      visibility?: 'PUBLIC' | 'PRIVATE' | 'ORGANIZATION' | 'PREMIUM' | 'AI';
      isPremium?: boolean;
    },
    tenantId: string | null,
    userId: string | null
  ): Promise<TemplateData> {
    const placeholders = input.htmlTemplate
      ? DocumentEngine.extractPlaceholders(input.htmlTemplate)
      : [];

    // Use user-defined variables if provided, otherwise auto-detect from placeholders
    const variables = input.variables && input.variables.length > 0
      ? input.variables
      : placeholders.map((key) => ({
          key,
          label: this.placeholderToLabel(key),
          type: this.inferVariableType(key),
          required: this.isRequiredPlaceholder(key),
        }));

    // If user provided variables, also ensure all detected placeholders are included
    if (input.variables && input.variables.length > 0) {
      const definedKeys = new Set(input.variables.map(v => v.key));
      for (const key of placeholders) {
        if (!definedKeys.has(key)) {
          variables.push({
            key,
            label: this.placeholderToLabel(key),
            type: this.inferVariableType(key),
            required: this.isRequiredPlaceholder(key),
          });
        }
      }
    }

    const template = await prisma.template.create({
      data: {
        organizationId: tenantId,
        userId,
        name: input.name,
        slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        description: input.description,
        content: toJson(input.content || {}),
        htmlTemplate: input.htmlTemplate,
        variables: toJson(variables),
        placeholders,
        documentCategory: input.category,
        visibility: input.visibility || 'PRIVATE',
        isPremium: input.isPremium || false,
        version: 1,
      },
    });

    return template as unknown as TemplateData;
  }

  static async update(
    id: string,
    input: Partial<{
      name: string;
      description: string;
      content: Record<string, unknown>;
      htmlTemplate: string;
      variables: TemplateVariable[];
      category: string;
      visibility: 'PUBLIC' | 'PRIVATE' | 'ORGANIZATION' | 'PREMIUM' | 'AI';
      isPremium: boolean;
      isActive: boolean;
      thumbnail: string;
    }>,
    tenantId: string
  ): Promise<TemplateData> {
    const existing = await prisma.template.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!existing) throw new Error('Template not found');

    let variables: TemplateVariable[] = input.variables && input.variables.length > 0
      ? input.variables
      : (existing.variables as unknown as TemplateVariable[]) || [];
    let placeholders = existing.placeholders;

    // If htmlTemplate changed, re-detect placeholders and merge with user variables
    if (input.htmlTemplate && input.htmlTemplate !== existing.htmlTemplate) {
      const detectedPlaceholders = DocumentEngine.extractPlaceholders(input.htmlTemplate);
      placeholders = detectedPlaceholders;

      // If no user variables provided, auto-generate
      if (!input.variables || input.variables.length === 0) {
        variables = detectedPlaceholders.map((key) => ({
          key,
          label: this.placeholderToLabel(key),
          type: this.inferVariableType(key),
          required: this.isRequiredPlaceholder(key),
        }));
      } else {
        // Ensure all detected placeholders are included in user variables
        const definedKeys = new Set(input.variables.map(v => v.key));
        for (const key of detectedPlaceholders) {
          if (!definedKeys.has(key)) {
            variables.push({
              key,
              label: this.placeholderToLabel(key),
              type: this.inferVariableType(key),
              required: this.isRequiredPlaceholder(key),
            });
          }
        }
      }
    }

    // Build update data, explicitly mapping category to documentCategory
    const updateData: Prisma.TemplateUpdateInput = {
      version: existing.version + 1,
      variables: toJson(variables),
      placeholders,
    };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.content !== undefined) updateData.content = toJson(input.content);
    if (input.htmlTemplate !== undefined) updateData.htmlTemplate = input.htmlTemplate;
    if (input.category !== undefined) updateData.documentCategory = input.category; // Map category → documentCategory
    if (input.visibility !== undefined) updateData.visibility = input.visibility;
    if (input.isPremium !== undefined) updateData.isPremium = input.isPremium;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.thumbnail !== undefined) updateData.thumbnail = input.thumbnail;

    const template = await prisma.template.update({
      where: { id },
      data: updateData,
    });

    await prisma.templateVersion.create({
      data: {
        templateId: id,
        version: existing.version + 1,
        content: toJson(input.content || {}),
        htmlTemplate: input.htmlTemplate || existing.htmlTemplate,
        variables: toJson(variables),
        changeNote: 'Updated',
      },
    });

    return template as unknown as TemplateData;
  }

  /**
   * Fetch a template by id, scoped to what `tenantId` is allowed to see.
   *
   * SECURITY: this used to build `where = { id }` and only add a visibility
   * filter *when a tenantId was supplied*. Every caller on the public instant
   * path (`/api/instant/preview`, `/api/instant/download`, `/api/instant/sample`)
   * omitted it, so an unauthenticated request could read any template row by
   * id — including `PRIVATE` (the schema default) and `ORGANIZATION` templates
   * belonging to another tenant, and their full `htmlTemplate` source.
   *
   * The rule is now fail-closed:
   *  - with a tenantId: the tenant's own templates (any visibility) plus the
   *    shared `PUBLIC`/`PREMIUM` ones;
   *  - without a tenantId (anonymous): only `PUBLIC` templates. `PRIVATE` and
   *    `ORGANIZATION` are other tenants' data and `PREMIUM`/`AI` are gated
   *    content whose HTML must not leave the paid/authenticated paths.
   *
   * `isActive` is always enforced — a deactivated template must not be
   * downloadable through a direct id request.
   */
  static async getById(id: string, tenantId?: string | null): Promise<TemplateData | null> {
    const orClauses: Record<string, unknown>[] = tenantId
      ? [
          { organizationId: tenantId },
          { visibility: { in: ['PUBLIC', 'PREMIUM'] } },
        ]
      : [
          // Anonymous: the public catalogue only.
          { visibility: 'PUBLIC' },
        ];

    const template = await prisma.template.findFirst({
      where: { id, isActive: true, OR: orClauses },
    });
    return template as unknown as TemplateData | null;
  }

  static async list(options: {
    documentCategory?: string;
    visibility?: string;
    isPremium?: boolean;
    search?: string;
    slug?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const conditions: Record<string, unknown>[] = [{ isActive: true }];

    if (options.documentCategory) {
      conditions.push({ documentCategory: options.documentCategory });
    }

    /**
     * `visibility` and `sortBy` arrive straight from the query string.
     *
     * - `visibility` was previously asserted with `as TemplateVisibility`, which
     *   silenced the compiler without validating anything: any unrecognised
     *   value reached Prisma and raised an enum error (opaque 500).
     * - `sortBy` was used directly as an `orderBy` key, so any arbitrary
     *   string was forwarded as a column name.
     *
     * Both are now checked against explicit allowlists; unknown values are
     * ignored, which is the same behaviour as omitting the filter.
     */
    if (options.visibility && TEMPLATE_VISIBILITIES.includes(options.visibility as TemplateVisibility)) {
      conditions.push({ visibility: options.visibility as TemplateVisibility });
    }

    if (options.isPremium !== undefined) {
      conditions.push({ isPremium: options.isPremium });
    }
    if (options.slug) {
      conditions.push({ slug: options.slug });
    }
    if (options.search) {
      conditions.push({
        OR: [
          { name: { contains: options.search, mode: 'insensitive' as const } },
          { description: { contains: options.search, mode: 'insensitive' as const } },
        ],
      });
    }

    const where: Record<string, unknown> = {};
    if (conditions.length > 1 || options.tenantId) {
      // Start with the base conditions (isActive, category, search, etc.) joined by AND
      const allClauses: Record<string, unknown>[] = conditions;
      
      // For tenant access: show own templates OR public/premium templates
      if (options.tenantId) {
        allClauses.push({
          OR: [
            { organizationId: options.tenantId },
            { visibility: 'PUBLIC' },
            { visibility: 'PREMIUM' },
          ],
        });
      }
      
      where.AND = allClauses;
    } else if (conditions.length === 1) {
      Object.assign(where, conditions[0]);
    }


    // Clamp rather than trust: an unbounded pageSize turns one request into a
    // full-table scan, and a negative/absurd page produced `NaN` skips.
    const page = Number.isFinite(options.page) && (options.page ?? 0) >= 1 ? Math.floor(options.page as number) : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize ?? 0) >= 1
        ? Math.min(100, Math.floor(options.pageSize as number))
        : 20;

    const sortBy = TEMPLATE_SORT_FIELDS.includes(options.sortBy as (typeof TEMPLATE_SORT_FIELDS)[number])
      ? (options.sortBy as string)
      : 'usageCount';

    const [data, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: { [sortBy]: options.sortOrder || 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { name: true, icon: true } },
          user: { select: { name: true, image: true } },
        },
      }),
      prisma.template.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Whether a caller may see/render premium template content (htmlTemplate,
   * placeholders, content): admins manage templates; everyone else needs an
   * active Premium subscription on their organization.
   */
  static async canAccessPremiumContent(session: {
    user?: { role?: string | null; organizationId?: string | null } | null;
  } | null): Promise<boolean> {
    if (!session?.user) return false;
    if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') return true;
    return hasActivePremiumSubscription(session.user.organizationId);
  }

  /**
   * Strip the paywalled fields (htmlTemplate, placeholders, content, variables)
   * from a premium template when the caller has no premium access. Metadata
   * (name, description, thumbnail, isPremium, …) is kept so the UI can render
   * a lock card instead of the editor.
   */
  static async sanitizeTemplateForCaller<T extends Record<string, unknown>>(
    template: T,
    session: {
      user?: { role?: string | null; organizationId?: string | null } | null;
    } | null
  ): Promise<T> {
    if (!template.isPremium) return template;
    if (await this.canAccessPremiumContent(session)) return template;

    const sanitized = { ...template };
    delete sanitized.htmlTemplate;
    delete sanitized.placeholders;
    delete sanitized.content;
    delete sanitized.variables;
    return sanitized;
  }

  static async delete(id: string, tenantId: string): Promise<void> {
    await prisma.template.delete({
      where: { id, organizationId: tenantId },
    });
  }

  static async duplicate(id: string, tenantId: string, userId: string): Promise<TemplateData> {
    const original = await prisma.template.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!original) throw new Error('Template not found');

    return this.create(
      {
        name: `${original.name} (Copy)`,
        description: original.description || undefined,
        content: original.content as Record<string, unknown>,
        htmlTemplate: original.htmlTemplate || undefined,
        category: original.documentCategory,
        visibility: original.visibility,
        isPremium: false,
      },
      tenantId,
      userId
    );
  }

  static async trackUsage(id: string): Promise<void> {
    await prisma.template.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  static placeholderToLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
  }

  static inferVariableType(key: string): TemplateVariable['type'] {
    const lower = key.toLowerCase();
    if (lower.includes('date') || lower.includes('joining') || lower.includes('created')) return 'date';
    if (lower.includes('email')) return 'email';
    if (lower.includes('salary') || lower.includes('amount') || lower.includes('price') || lower.includes('total')) return 'number';
    // Only image-eligible fields (logo/sign/stamp/header/…) may be image or
    // signature type — word-safe, so "Designation" stays text.
    const imageSubtype = inferImageSubtype(key);
    if (imageSubtype) return imageSubtype;
    if (lower.includes('address') || lower.includes('description') || lower.includes('note') || lower.includes('terms')) return 'textarea';
    if (lower.includes('gender') || lower.includes('type') || lower.includes('status') || lower.includes('department')) return 'select';
    return 'text';
  }

  static isRequiredPlaceholder(key: string): boolean {
    const optional = ['photo', 'image', 'optional', 'seal', 'watermark'];
    return !optional.some((o) => key.toLowerCase().includes(o));
  }

  static async getCategories() {
    const categories = await prisma.template.groupBy({
      by: ['documentCategory'],
      _count: true,
      where: { isActive: true },
    });

    return categories.map((c) => ({
      name: c.documentCategory,
      count: c._count,
    }));
  }
}
